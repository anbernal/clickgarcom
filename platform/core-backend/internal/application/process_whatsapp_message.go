package application

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type ProcessWhatsAppMessageUseCase struct {
	inboxRepo        inbox.Repository
	tenantRepo       tenant.Repository
	handleMsgUseCase *HandleWhatsAppMessageUseCase
	logger           *zap.Logger
}

type NativeStatusSender interface {
	MarkAsRead(ctx context.Context, messageID string) error
	SendTypingIndicator(ctx context.Context, messageID string) error
}

func NewProcessWhatsAppMessageUseCase(
	inboxRepo inbox.Repository,
	tenantRepo tenant.Repository,
	handleMsgUseCase *HandleWhatsAppMessageUseCase,
	logger *zap.Logger,
) *ProcessWhatsAppMessageUseCase {
	return &ProcessWhatsAppMessageUseCase{
		inboxRepo:        inboxRepo,
		tenantRepo:       tenantRepo,
		handleMsgUseCase: handleMsgUseCase,
		logger:           logger,
	}
}

type WhatsAppWebhookPayload struct {
	Entry []struct {
		Changes []struct {
			Value struct {
				MessagingProduct string `json:"messaging_product"`
				Metadata         struct {
					DisplayPhoneNumber string `json:"display_phone_number"`
					PhoneNumberID      string `json:"phone_number_id"`
				} `json:"metadata"`
				Messages []WhatsAppInboundMessage `json:"messages,omitempty"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

type WhatsAppInboundMessage struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Text      struct {
		Body string `json:"body"`
	} `json:"text,omitempty"`
	Interactive struct {
		Type        string `json:"type"`
		ButtonReply struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"button_reply"`
		ListReply struct {
			ID          string `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
		} `json:"list_reply"`
	} `json:"interactive,omitempty"`
}

func (uc *ProcessWhatsAppMessageUseCase) Execute(ctx context.Context, inboxID uuid.UUID) error {
	// 1. Buscar evento do inbox
	event, err := uc.inboxRepo.FindByID(ctx, inboxID)
	if err != nil {
		return fmt.Errorf("failed to find inbox event: %w", err)
	}

	// 2. Verificar se já foi processado (idempotência)
	if event.Processed {
		uc.logger.Debug("event already processed",
			zap.String("inbox_id", inboxID.String()),
		)
		return nil
	}

	// 3. Parse do payload
	uc.logger.Debug("raw payload from db", zap.String("payload", string(event.Payload)))

	var payload WhatsAppWebhookPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		uc.inboxRepo.MarkAsFailed(ctx, inboxID, fmt.Sprintf("invalid payload: %v", err))
		return fmt.Errorf("failed to parse payload: %w", err)
	}

	// 4. Extrair informações
	if len(payload.Entry) == 0 || len(payload.Entry[0].Changes) == 0 {
		uc.logger.Debug("no changes in webhook")
		uc.inboxRepo.MarkAsProcessed(ctx, inboxID)
		return nil
	}

	value := payload.Entry[0].Changes[0].Value
	displayPhoneNumber := value.Metadata.DisplayPhoneNumber

	// 5. Identificar tenant pelo número do WhatsApp
	tenant, err := uc.tenantRepo.FindByWhatsAppNumber(ctx, displayPhoneNumber)
	if err != nil {
		uc.inboxRepo.MarkAsFailed(ctx, inboxID, fmt.Sprintf("tenant not found: %v", err))
		return fmt.Errorf("tenant not found for number %s: %w", displayPhoneNumber, err)
	}

	uc.logger.Info("processing whatsapp message",
		zap.String("tenant_id", tenant.ID.String()),
		zap.String("tenant_name", tenant.Name),
		zap.Bool("is_open", tenant.IsOpen),
	)

	// Intercept if tenant is closed
	if !tenant.IsOpen {
		uc.logger.Info("tenant is closed, rejecting message",
			zap.String("tenant_id", tenant.ID.String()),
			zap.String("custom_closed_msg", tenant.Settings.Messages.RestaurantClosed),
		)
		if len(value.Messages) > 0 {
			for _, msg := range value.Messages {
				userText := extractSupportedInput(msg)
				if userText != "" {
					uc.sendNativeReadAndTyping(ctx, msg)
					if handled, handleErr := uc.tryHandleClosedTenantOpenTab(ctx, tenant, msg.From, userText); handled {
						if handleErr != nil {
							uc.logger.Warn("failed to handle closed-tenant open-tab flow",
								zap.Error(handleErr),
								zap.String("tenant_id", tenant.ID.String()),
								zap.String("to", msg.From),
							)
						} else {
							continue
						}
					}
					closedResponse := uc.buildClosedTenantResponse(ctx, tenant, msg.From, userText)
					if err := uc.handleMsgUseCase.sendTenantMessage(ctx, msg.From, tenant.ID, closedResponse); err != nil {
						uc.logger.Warn("failed to send closed-tenant response",
							zap.Error(err),
							zap.String("tenant_id", tenant.ID.String()),
							zap.String("to", msg.From),
						)
					}
					continue
				}

				if isUnsupportedNonTextMessage(msg) {
					uc.sendNativeReadAndTyping(ctx, msg)
					if err := uc.handleMsgUseCase.sendTenantMessage(ctx, msg.From, tenant.ID, whatsapp.TextOnlySupportMessage()); err != nil {
						uc.logger.Warn("failed to send text-only response",
							zap.Error(err),
							zap.String("tenant_id", tenant.ID.String()),
							zap.String("to", msg.From),
							zap.String("message_type", msg.Type),
						)
					}
					continue
				}

				uc.logger.Debug("ignoring message without supported input while tenant is closed",
					zap.String("type", msg.Type),
					zap.String("from", msg.From),
				)
			}
		}
		uc.inboxRepo.MarkAsProcessed(ctx, inboxID)
		return nil
	}

	// 6. Processar mensagens
	if len(value.Messages) > 0 {
		for _, msg := range value.Messages {
			messageText := extractSupportedInput(msg)

			uc.logger.Info("message received",
				zap.String("from", msg.From),
				zap.String("type", msg.Type),
				zap.String("extracted_text", messageText),
			)

			// Chamar use case de handling
			if messageText != "" {
				uc.sendNativeReadAndTyping(ctx, msg)
				handleInput := HandleMessageInput{
					From:      msg.From,
					Text:      messageText,
					TenantID:  tenant.ID,
					Timestamp: msg.Timestamp,
				}

				if err := uc.handleMsgUseCase.Execute(ctx, handleInput); err != nil {
					uc.logger.Error("failed to handle message",
						zap.Error(err),
					)
					// Não falha o processamento do inbox por causa disso
				}
				continue
			}

			if isUnsupportedNonTextMessage(msg) {
				uc.sendNativeReadAndTyping(ctx, msg)
				if err := uc.handleMsgUseCase.sendTenantMessage(ctx, msg.From, tenant.ID, whatsapp.TextOnlySupportMessage()); err != nil {
					uc.logger.Warn("failed to send text-only response",
						zap.Error(err),
						zap.String("tenant_id", tenant.ID.String()),
						zap.String("to", msg.From),
						zap.String("message_type", msg.Type),
					)
				}
				continue
			}

			uc.logger.Debug("ignoring message without supported input",
				zap.String("type", msg.Type),
				zap.String("from", msg.From),
			)
		}
	}

	// 7. Marcar como processado
	if err := uc.inboxRepo.MarkAsProcessed(ctx, inboxID); err != nil {
		return fmt.Errorf("failed to mark as processed: %w", err)
	}

	uc.logger.Info("message processed successfully",
		zap.String("inbox_id", inboxID.String()),
	)

	return nil
}

func (uc *ProcessWhatsAppMessageUseCase) buildClosedTenantResponse(
	ctx context.Context,
	tenantObj *tenant.Tenant,
	userPhone string,
	userText string,
) string {
	base := whatsapp.RestaurantClosedMessage(tenantObj.Settings.Messages)
	openTab := uc.findOpenTabForPhone(ctx, tenantObj.ID, userPhone)
	if openTab == nil {
		return base
	}

	summary := fmt.Sprintf(
		"%s\n\n📋 *Sua Comanda (aberta)*\n\nSubtotal: R$ %.2f\nTaxa de serviço: R$ %.2f\n*Total: R$ %.2f*",
		whatsapp.TabCodeNotice(openTab.PublicCode),
		openTab.Subtotal,
		openTab.ServiceFee,
		openTab.Total,
	)

	instruction := "Como estamos fora do expediente, não recebemos novos pedidos agora.\n" +
		"Se quiser finalizar sua comanda, fale com nossa equipe para seguir com o pagamento."

	return base + "\n\n" + summary + "\n\n" + instruction
}

func (uc *ProcessWhatsAppMessageUseCase) tryHandleClosedTenantOpenTab(
	ctx context.Context,
	tenantObj *tenant.Tenant,
	userPhone string,
	userText string,
) (bool, error) {
	if tenantObj == nil || uc.handleMsgUseCase == nil || uc.handleMsgUseCase.sessionRepo == nil {
		return false, nil
	}

	if uc.findOpenTabForPhone(ctx, tenantObj.ID, userPhone) == nil {
		return false, nil
	}

	sess, err := uc.handleMsgUseCase.sessionRepo.Find(ctx, userPhone, tenantObj.ID.String())
	if err != nil {
		return true, err
	}

	if sess != nil && sess.State == session.StateClosingTab {
		return true, uc.handleMsgUseCase.Execute(ctx, HandleMessageInput{
			From:     userPhone,
			Text:     userText,
			TenantID: tenantObj.ID,
		})
	}

	if sess == nil {
		sess = session.NewSession(userPhone, tenantObj.ID)
	}

	response, newState, err := uc.handleMsgUseCase.startClosingTabFlow(ctx, sess)
	if err != nil {
		return true, err
	}

	if err := uc.sendClosedTenantClosingResponse(ctx, tenantObj.ID, userPhone, response, newState); err != nil {
		return true, err
	}

	if newState != "" {
		sess.TransitionTo(newState)
	}

	if err := uc.handleMsgUseCase.sessionRepo.Save(ctx, sess); err != nil {
		return true, err
	}

	return true, nil
}

func (uc *ProcessWhatsAppMessageUseCase) sendClosedTenantClosingResponse(
	ctx context.Context,
	tenantID uuid.UUID,
	userPhone string,
	response string,
	newState session.ConversationState,
) error {
	response = uc.handleMsgUseCase.decorateClosedTenantClosingTabMessage(ctx, tenantID, response)
	if strings.TrimSpace(response) == "" {
		return nil
	}

	if newState == session.StateMainMenu && uc.handleMsgUseCase.isClosingTabPaymentUnavailableMessage(response) {
		return uc.handleMsgUseCase.sendClosingTabPaymentUnavailableMenu(ctx, userPhone, tenantID, response)
	}

	return uc.handleMsgUseCase.sendTenantMessage(ctx, userPhone, tenantID, response)
}

func (uc *ProcessWhatsAppMessageUseCase) findOpenTabForPhone(
	ctx context.Context,
	tenantID uuid.UUID,
	userPhone string,
) *tab.Tab {
	if uc.handleMsgUseCase == nil || uc.handleMsgUseCase.tabRepo == nil || uc.handleMsgUseCase.sessionRepo == nil {
		return nil
	}

	sess, err := uc.handleMsgUseCase.sessionRepo.Find(ctx, userPhone, tenantID.String())
	if err == nil && sess != nil && sess.TabID != nil {
		t, tabErr := uc.handleMsgUseCase.tabRepo.FindByID(ctx, *sess.TabID, tenantID)
		if tabErr == nil && t != nil && t.Status == tab.StatusOpen && uc.handleMsgUseCase.isCustomerVisibleTab(t) {
			return t
		}
	}

	openTabs, err := uc.handleMsgUseCase.tabRepo.FindByTenantAndStatus(ctx, tenantID, tab.StatusOpen)
	if err != nil {
		return nil
	}

	normalizedPhone := normalizePhoneDigits(userPhone)
	for _, candidate := range openTabs {
		if !uc.handleMsgUseCase.isCustomerVisibleTab(candidate) {
			continue
		}
		if normalizePhoneDigits(candidate.UserPhone) == normalizedPhone {
			return candidate
		}
	}

	return nil
}

func normalizePhoneDigits(phone string) string {
	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	return digits.String()
}

func extractSupportedInput(msg WhatsAppInboundMessage) string {
	msgType := strings.ToLower(strings.TrimSpace(msg.Type))
	switch msgType {
	case "text":
		return strings.TrimSpace(msg.Text.Body)
	case "interactive":
		switch strings.ToLower(strings.TrimSpace(msg.Interactive.Type)) {
		case "button_reply":
			return strings.TrimSpace(msg.Interactive.ButtonReply.ID)
		case "list_reply":
			return strings.TrimSpace(msg.Interactive.ListReply.ID)
		}
	}
	return ""
}

func isUnsupportedNonTextMessage(msg WhatsAppInboundMessage) bool {
	if strings.TrimSpace(msg.From) == "" {
		return false
	}

	msgType := strings.ToLower(strings.TrimSpace(msg.Type))
	if msgType == "" || msgType == "text" {
		return false
	}

	// button_reply e list_reply são tratados como input suportado.
	if msgType == "interactive" {
		switch strings.ToLower(strings.TrimSpace(msg.Interactive.Type)) {
		case "button_reply", "list_reply":
			return false
		}
	}

	return true
}

func (uc *ProcessWhatsAppMessageUseCase) sendNativeReadAndTyping(ctx context.Context, msg WhatsAppInboundMessage) {
	if uc == nil || uc.handleMsgUseCase == nil || uc.handleMsgUseCase.sender == nil {
		return
	}

	messageID := strings.TrimSpace(msg.ID)
	if messageID == "" {
		return
	}

	nativeSender, ok := uc.handleMsgUseCase.sender.(NativeStatusSender)
	if !ok {
		return
	}

	if err := nativeSender.MarkAsRead(ctx, messageID); err != nil {
		uc.logger.Warn("failed to mark message as read",
			zap.String("message_id", messageID),
			zap.Error(err),
		)
	}

	if err := nativeSender.SendTypingIndicator(ctx, messageID); err != nil {
		uc.logger.Warn("failed to send typing indicator",
			zap.String("message_id", messageID),
			zap.Error(err),
		)
	}
}
