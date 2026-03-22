package application

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/botconfig"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/servicerequest"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/waiterchat"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type HandleWhatsAppMessageUseCase struct {
	sessionRepo           session.Repository
	tenantRepo            tenant.Repository
	botConfigRepo         botconfig.Repository
	menuRepo              menu.Repository
	tabRepo               tab.Repository
	tableRepo             table.Repository
	serviceRequestRepo    servicerequest.Repository
	waiterChatRepo        waiterchat.Repository
	createOrderUC         *CreateOrderUseCase
	sender                WhatsAppSender
	logger                *zap.Logger
	publicCheckoutBaseURL string
}

type WhatsAppSender interface {
	SendText(ctx context.Context, to string, message string) error
	SendImage(ctx context.Context, to, imageURL, caption string) (string, error)
	SendInteractiveButtons(ctx context.Context, to, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) // Fase 14
	SendInteractiveList(ctx context.Context, to, bodyText, buttonText string, sections []whatsapp.InteractiveListSection) (string, error)
}

func NewHandleWhatsAppMessageUseCase(
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	botConfigRepo botconfig.Repository,
	menuRepo menu.Repository,
	tabRepo tab.Repository,
	tableRepo table.Repository,
	serviceRequestRepo servicerequest.Repository,
	waiterChatRepo waiterchat.Repository,
	createOrderUC *CreateOrderUseCase,
	sender WhatsAppSender,
	publicCheckoutBaseURL string,
	logger *zap.Logger,
) *HandleWhatsAppMessageUseCase {
	return &HandleWhatsAppMessageUseCase{
		sessionRepo:           sessionRepo,
		tenantRepo:            tenantRepo,
		botConfigRepo:         botConfigRepo,
		menuRepo:              menuRepo,
		tabRepo:               tabRepo,
		tableRepo:             tableRepo,
		serviceRequestRepo:    serviceRequestRepo,
		waiterChatRepo:        waiterChatRepo,
		createOrderUC:         createOrderUC,
		sender:                sender,
		logger:                logger,
		publicCheckoutBaseURL: publicCheckoutBaseURL,
	}
}

type HandleMessageInput struct {
	From      string
	Text      string
	TenantID  uuid.UUID
	Timestamp string
}

const (
	welcomeMenuFlowKey       = "welcome_menu"
	requestTableActionID     = "request_table"
	defaultWelcomeMenuAction = "btn_request_table"
	mainMenuListButtonText   = "Abrir menu"
	tabSummaryNewOrderID     = "1"
	tabSummaryCloseTabID     = "2"
	tabSummaryBackMenuID     = "0"
)

type botFlowActionDefinition struct {
	ID             string   `json:"id"`
	Label          string   `json:"label"`
	AcceptedInputs []string `json:"accepted_inputs"`
}

type botFlowDefinitionPayload struct {
	Presentation       string                    `json:"presentation"`
	Body               string                    `json:"body"`
	UseWelcomeTemplate bool                      `json:"use_welcome_template"`
	Actions            []botFlowActionDefinition `json:"actions"`
}

func (uc *HandleWhatsAppMessageUseCase) Execute(ctx context.Context, input HandleMessageInput) error {
	// 1. Buscar ou criar sessão
	sess, err := uc.sessionRepo.Find(ctx, input.From, input.TenantID.String())
	if err != nil {
		return fmt.Errorf("failed to find session: %w", err)
	}

	if sess == nil {
		// Primeira interação - criar sessão
		sess = session.NewSession(input.From, input.TenantID)

		// Verificar se é entrada via QR Code (ex: "Mesa 05")
		// O Deep Link WA manda o texto que o usuário clica. Vamos extrair do input.Text se bater com o padrão.
		textUpper := strings.ToUpper(strings.TrimSpace(input.Text))
		if strings.HasPrefix(textUpper, "MESA") {
			// Extract mesa number
			parts := strings.Fields(textUpper)
			if len(parts) >= 2 {
				tableNumber := parts[1]
				tTable, err := uc.tableRepo.FindByNumber(ctx, tableNumber, input.TenantID)
				if err == nil && tTable != nil {
					t, _ := uc.tenantRepo.FindByID(ctx, input.TenantID)

					// Fase 14: Mesas já abertas precisam perguntar Compartilhar vs Individual
					if tTable.Status == table.StatusOccupied {
						activeTabs, err := uc.tabRepo.FindAllOpenByTable(ctx, tTable.ID, input.TenantID)
						if err == nil && len(activeTabs) > 0 {
							sess.SetContext("pending_table_id", tTable.ID.String())
							sess.SetContext("main_tab_id", activeTabs[0].ID.String()) // Pega a primeira comanda (a principal)
							sess.TransitionTo(session.StateWaitingCollabChoice)

							buttons := []whatsapp.InteractiveButton{
								{Type: "reply", Reply: struct {
									ID    string `json:"id"`
									Title string `json:"title"`
								}{ID: "btn_shared", Title: "🤝 Entrar na Comanda"}},
								{Type: "reply", Reply: struct {
									ID    string `json:"id"`
									Title string `json:"title"`
								}{ID: "btn_individual", Title: "💳 Individual"}},
							}

							msg := fmt.Sprintf("Olá! 😊 Vimos que a *Mesa %s* já está em andamento.\n\nVocê deseja entrar na comanda com seus amigos ou criar uma conta só para você?", tTable.Number)
							if _, err := uc.sender.SendInteractiveButtons(whatsapp.WithTenantID(ctx, input.TenantID), input.From, msg, buttons); err != nil {
								uc.logger.Error("failed to send interactive buttons", zap.Error(err))
							}
							return uc.sessionRepo.Save(ctx, sess)
						}
					}

					// Mesa encontrada (LIVRE) - iniciar fluxo de QR Code normal
					welcomeMsg := whatsapp.WelcomeTableMessage(t.Name, tTable.Number, t.Settings.Messages)

					// Salvar Tabela no Contexto para criar o request no próximo passo
					sess.SetContext("pending_table_id", tTable.ID.String())
					sess.SetContext("pending_table_number", tTable.Number)
					sess.TransitionTo(session.StateWaitingTableConfirmation)

					if err := uc.sendTenantMessage(ctx, input.From, input.TenantID, welcomeMsg); err != nil {
						return fmt.Errorf("failed to send welcome table: %w", err)
					}
					return uc.sessionRepo.Save(ctx, sess)
				}
			}
		}

		// Fluxo Normal (Sem QR Code ou falha ao achar mesa)
		t, err := uc.tenantRepo.FindByID(ctx, input.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find tenant: %w", err)
		}

		// Evita duplicar solicitações pendentes para o mesmo telefone.
		existingReq, err := uc.tableRepo.FindPendingRequestByPhone(ctx, input.From, input.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find pending request by phone: %w", err)
		}
		if existingReq != nil {
			if err := uc.sendWaitingAdminApprovalMenu(ctx, input.From, input.TenantID, whatsapp.AlreadyInQueueMessage()); err != nil {
				return fmt.Errorf("failed to send already-in-queue message: %w", err)
			}
			sess.TransitionTo(session.StateWaitingAdminApproval)
			if err := uc.sessionRepo.Save(ctx, sess); err != nil {
				return fmt.Errorf("failed to save session: %w", err)
			}
			return nil
		}

		if err := uc.sendWelcomeMenu(ctx, input.From, t, ""); err != nil {
			return fmt.Errorf("failed to send intro menu: %w", err)
		}

		if err := uc.sessionRepo.Save(ctx, sess); err != nil {
			return fmt.Errorf("failed to save session: %w", err)
		}
		return nil
	}

	// 2. Processar mensagem baseado no estado
	response, newState, err := uc.processMessage(ctx, sess, input.Text)
	if err != nil {
		return fmt.Errorf("failed to process message: %w", err)
	}

	// 3. Enviar resposta
	if response == "" && sess.State == session.StateWelcome && (newState == "" || newState == session.StateWelcome) {
		t, tenantErr := uc.tenantRepo.FindByID(ctx, input.TenantID)
		if tenantErr != nil {
			return fmt.Errorf("failed to find tenant: %w", tenantErr)
		}
		if t == nil {
			return fmt.Errorf("tenant not found: %s", input.TenantID.String())
		}
		if err := uc.sendWelcomeMenu(ctx, input.From, t, ""); err != nil {
			return fmt.Errorf("failed to send welcome menu response: %w", err)
		}
	}

	if response != "" {
		sendMessage := uc.sendTenantMessage
		if sess.State == session.StateWelcome {
			t, tenantErr := uc.tenantRepo.FindByID(ctx, input.TenantID)
			if tenantErr != nil {
				return fmt.Errorf("failed to find tenant: %w", tenantErr)
			}
			if t == nil {
				return fmt.Errorf("tenant not found: %s", input.TenantID.String())
			}

			if newState == "" || newState == session.StateWelcome {
				if err := uc.sendWelcomeMenu(ctx, input.From, t, response); err != nil {
					return fmt.Errorf("failed to send welcome menu response: %w", err)
				}
				sendMessage = nil
			} else if newState == session.StateWaitingAdminApproval {
				if err := uc.sendWaitingAdminApprovalMenu(ctx, input.From, input.TenantID, response); err != nil {
					return fmt.Errorf("failed to send waiting admin approval response: %w", err)
				}
				sendMessage = nil
			} else {
				sendMessage = uc.sendTenantMessagePlain
			}
		} else if newState == session.StateViewingTab {
			if err := uc.sendTabSummaryMenu(ctx, input.From, sess); err != nil {
				return fmt.Errorf("failed to send tab summary response: %w", err)
			}
			sendMessage = nil
		} else if newState == session.StateWaitingAdminApproval {
			if err := uc.sendWaitingAdminApprovalMenu(ctx, input.From, input.TenantID, response); err != nil {
				return fmt.Errorf("failed to send waiting admin approval response: %w", err)
			}
			sendMessage = nil
		} else if newState == session.StateWaitingJoinApproval {
			if err := uc.sendWaitingJoinApprovalMenu(ctx, input.From, input.TenantID, response); err != nil {
				return fmt.Errorf("failed to send waiting join approval response: %w", err)
			}
			sendMessage = nil
		}
		if sendMessage != nil {
			if err := sendMessage(ctx, input.From, input.TenantID, response); err != nil {
				return fmt.Errorf("failed to send response: %w", err)
			}
		}
	}

	// 4. Atualizar estado da sessão
	if newState != "" {
		sess.TransitionTo(newState)
	}

	// 5. Salvar sessão atualizada
	if err := uc.sessionRepo.Save(ctx, sess); err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) processMessage(
	ctx context.Context,
	sess *session.Session,
	text string,
) (response string, newState session.ConversationState, err error) {

	text = strings.TrimSpace(text)

	switch sess.State {
	case session.StateWelcome:
		return uc.handleWelcomeMenu(ctx, sess, text)

	case session.StateMainMenu:
		return uc.handleMainMenuSimplified(ctx, sess, text)

	case session.StateOrdering:
		return uc.handleOrderingSimplified(ctx, sess, text)

	case session.StateSelectingQty:
		return uc.handleQuantitySelection(ctx, sess, text)

	case session.StateConfirmingOrder:
		return uc.handleOrderConfirmation(ctx, sess, text)

	case session.StateRemovingOrderItem:
		return uc.handleOrderingCartItemRemoval(ctx, sess, text)

	case session.StateAdjustingOrderItem:
		return uc.handleOrderingCartItemAdjustment(ctx, sess, text)

	case session.StateSelectingCartItemQty:
		return uc.handleOrderingCartItemQuantitySelection(ctx, sess, text)

	case session.StateViewingTab:
		return uc.handleViewingTab(ctx, sess, text)

	case session.StateClosingTab:
		return uc.handleClosingTab(ctx, sess, text)

	case session.StateServiceRequest:
		return uc.handleServiceRequest(ctx, sess, text)

	case session.StateWaitingTableConfirmation:
		return uc.handleTableConfirmation(ctx, sess, text)

	case session.StateWaitingCollabChoice:
		return uc.handleCollabChoice(ctx, sess, text)

	case session.StateWaitingAdminApproval:
		return uc.handleWaitingAdminApproval(ctx, sess, text)

	case session.StateWaitingJoinApproval:
		return uc.handleWaitingJoinApproval(ctx, sess, text)

	case session.StateWaitingOpenerDecision:
		return uc.handleOpenerDecision(ctx, sess, text)

	default:
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleWelcomeMenu(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	t, err := uc.tenantRepo.FindByID(ctx, sess.TenantID)
	if err != nil {
		return "", "", fmt.Errorf("failed to find tenant: %w", err)
	}

	if uc.isInitialTableRequestChoice(ctx, sess.TenantID, text) {
		existingReq, err := uc.tableRepo.FindPendingRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
		if err != nil {
			return "", "", fmt.Errorf("failed to find pending request by phone: %w", err)
		}
		if existingReq != nil {
			return whatsapp.AlreadyInQueueMessage(), session.StateWaitingAdminApproval, nil
		}

		req := &table.TableRequest{
			ID:        uuid.New(),
			TenantID:  sess.TenantID,
			TableID:   nil,
			UserPhone: sess.UserPhone,
			PaxCount:  1,
			Status:    table.RequestStatusPending,
		}

		if err := uc.tableRepo.CreateRequest(ctx, req); err != nil {
			uc.logger.Error("failed to create initial table request", zap.Error(err))
			return "⚠️ Tivemos uma instabilidade ao solicitar sua mesa agora. Pode tentar novamente em alguns segundos.", session.StateWelcome, nil
		}

		return whatsapp.TableRequestPendingMessage(t.Settings.Messages), session.StateWaitingAdminApproval, nil
	}

	if isWelcomeGreeting(text) {
		return "", session.StateWelcome, nil
	}

	return whatsapp.InvalidOptionMessage(t.Settings.Messages), session.StateWelcome, nil
}

func isWelcomeGreeting(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	normalized = strings.Trim(normalized, "!.? ")

	switch normalized {
	case "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite":
		return true
	default:
		return false
	}
}

func (uc *HandleWhatsAppMessageUseCase) isInitialTableRequestChoice(
	ctx context.Context,
	tenantID uuid.UUID,
	text string,
) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	if normalized == "" {
		return false
	}

	if strings.Contains(normalized, "não") || strings.Contains(normalized, "nao") {
		return false
	}

	if uc.matchesPublishedBotFlowActionInput(ctx, tenantID, welcomeMenuFlowKey, requestTableActionID, text) {
		return true
	}

	switch normalized {
	case "1", defaultWelcomeMenuAction, "sim", "quero", "solicitar mesa", "quero mesa", "quero uma mesa":
		return true
	}

	hasMesa := strings.Contains(normalized, "mesa")
	hasIntent := strings.Contains(normalized, "solicit") ||
		strings.Contains(normalized, "ped") ||
		strings.Contains(normalized, "quero")

	return hasMesa && hasIntent
}

func (uc *HandleWhatsAppMessageUseCase) resolveWelcomeMenuMessage(
	ctx context.Context,
	tenantObj *tenant.Tenant,
) string {
	fallback := whatsapp.WelcomeMenuMessage(tenantObj.Name, tenantObj.Settings.Messages)
	flow := uc.findPublishedBotFlow(ctx, tenantObj.ID, welcomeMenuFlowKey)
	if flow == nil {
		return fallback
	}

	definition, err := uc.decodeBotFlowDefinition(flow)
	if err != nil {
		uc.logger.Warn("failed to decode welcome bot flow definition",
			zap.Error(err),
			zap.String("tenant_id", tenantObj.ID.String()),
			zap.String("flow_key", flow.Key),
		)
		return fallback
	}

	body := strings.TrimSpace(definition.Body)
	if definition.UseWelcomeTemplate {
		body = uc.composeWelcomeMenuBody(tenantObj, definition, "")
	}
	if body == "" {
		return fallback
	}

	return uc.applyFlowReplacements(body, map[string]string{
		"{nome_restaurante}": tenantObj.Name,
	})
}

func (uc *HandleWhatsAppMessageUseCase) matchesPublishedBotFlowActionInput(
	ctx context.Context,
	tenantID uuid.UUID,
	flowKey string,
	actionID string,
	text string,
) bool {
	normalizedInput := normalizeBotFlowInput(text)
	if normalizedInput == "" {
		return false
	}

	flow := uc.findPublishedBotFlow(ctx, tenantID, flowKey)
	if flow == nil {
		return false
	}

	definition, err := uc.decodeBotFlowDefinition(flow)
	if err != nil {
		uc.logger.Warn("failed to decode bot flow definition while matching action",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("flow_key", flowKey),
			zap.String("action_id", actionID),
		)
		return false
	}

	for _, action := range definition.Actions {
		if strings.TrimSpace(action.ID) != actionID {
			continue
		}

		if normalizeBotFlowInput(action.ID) == normalizedInput {
			return true
		}

		if normalizeBotFlowInput(action.Label) == normalizedInput {
			return true
		}

		for _, acceptedInput := range action.AcceptedInputs {
			if normalizeBotFlowInput(acceptedInput) == normalizedInput {
				return true
			}
		}
	}

	return false
}

func (uc *HandleWhatsAppMessageUseCase) findPublishedBotFlow(
	ctx context.Context,
	tenantID uuid.UUID,
	flowKey string,
) *botconfig.FlowDefinition {
	if uc.botConfigRepo == nil {
		return nil
	}

	flow, err := uc.botConfigRepo.FindPublishedByKey(ctx, tenantID, flowKey, botconfig.ChannelWhatsApp)
	if err != nil {
		uc.logger.Warn("failed to load published bot flow",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("flow_key", flowKey),
		)
		return nil
	}

	return flow
}

func (uc *HandleWhatsAppMessageUseCase) sendWelcomeMenu(
	ctx context.Context,
	to string,
	tenantObj *tenant.Tenant,
	prefix string,
) error {
	flow := uc.findPublishedBotFlow(ctx, tenantObj.ID, welcomeMenuFlowKey)
	if flow == nil {
		return uc.sendDefaultWelcomeMenu(ctx, to, tenantObj, prefix)
	}

	definition, err := uc.decodeBotFlowDefinition(flow)
	if err != nil {
		uc.logger.Warn("failed to decode welcome bot flow definition for send",
			zap.Error(err),
			zap.String("tenant_id", tenantObj.ID.String()),
			zap.String("flow_key", flow.Key),
		)
		return uc.sendDefaultWelcomeMenu(ctx, to, tenantObj, prefix)
	}

	buttons := uc.buildInteractiveButtons(definition.Actions)
	if !uc.shouldSendInteractiveWelcome(definition, buttons) {
		return uc.sendTenantMessagePlain(ctx, to, tenantObj.ID, uc.composeWelcomeMenuText(ctx, tenantObj, prefix))
	}

	body := uc.composeWelcomeMenuBody(tenantObj, definition, prefix)
	if _, err := uc.sender.SendInteractiveButtons(whatsapp.WithTenantID(ctx, tenantObj.ID), to, body, buttons); err != nil {
		uc.logger.Warn("failed to send interactive welcome menu, falling back to text",
			zap.Error(err),
			zap.String("tenant_id", tenantObj.ID.String()),
			zap.String("to", to),
		)
		return uc.sendTenantMessagePlain(ctx, to, tenantObj.ID, uc.composeWelcomeMenuText(ctx, tenantObj, prefix))
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) sendDefaultWelcomeMenu(
	ctx context.Context,
	to string,
	tenantObj *tenant.Tenant,
	prefix string,
) error {
	body := strings.TrimSpace(whatsapp.WelcomeMessage(tenantObj.Name, tenantObj.Settings.Messages))
	if strings.TrimSpace(prefix) != "" {
		body = strings.TrimSpace(prefix) + "\n\n" + body
	}

	ctx = whatsapp.WithTenantID(ctx, tenantObj.ID)
	if _, err := uc.sender.SendInteractiveButtons(ctx, to, body, buildDefaultWelcomeButtons()); err != nil {
		uc.logger.Warn("failed to send default interactive welcome menu, falling back to text",
			zap.Error(err),
			zap.String("tenant_id", tenantObj.ID.String()),
			zap.String("to", to),
		)
		return uc.sendTenantMessagePlain(ctx, to, tenantObj.ID, uc.composeWelcomeMenuText(ctx, tenantObj, prefix))
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) decodeBotFlowDefinition(
	flow *botconfig.FlowDefinition,
) (*botFlowDefinitionPayload, error) {
	if flow == nil {
		return nil, fmt.Errorf("flow definition is nil")
	}

	raw, err := json.Marshal(flow.Definition)
	if err != nil {
		return nil, err
	}

	var definition botFlowDefinitionPayload
	if err := json.Unmarshal(raw, &definition); err != nil {
		return nil, err
	}

	return &definition, nil
}

func (uc *HandleWhatsAppMessageUseCase) applyFlowReplacements(
	body string,
	replacements map[string]string,
) string {
	rendered := strings.TrimSpace(body)
	for placeholder, value := range replacements {
		rendered = strings.ReplaceAll(rendered, placeholder, value)
	}
	return strings.TrimSpace(rendered)
}

func (uc *HandleWhatsAppMessageUseCase) composeWelcomeMenuText(
	ctx context.Context,
	tenantObj *tenant.Tenant,
	prefix string,
) string {
	body := uc.resolveWelcomeMenuText(ctx, tenantObj)
	if strings.TrimSpace(prefix) == "" {
		return body
	}

	return strings.TrimSpace(prefix) + "\n\n" + body
}

func (uc *HandleWhatsAppMessageUseCase) resolveWelcomeMenuText(
	ctx context.Context,
	tenantObj *tenant.Tenant,
) string {
	fallback := whatsapp.WelcomeMenuMessage(tenantObj.Name, tenantObj.Settings.Messages)
	flow := uc.findPublishedBotFlow(ctx, tenantObj.ID, welcomeMenuFlowKey)
	if flow == nil {
		return fallback
	}

	definition, err := uc.decodeBotFlowDefinition(flow)
	if err != nil {
		return fallback
	}

	body := uc.composeWelcomeMenuBody(tenantObj, definition, "")
	if strings.TrimSpace(body) == "" {
		return fallback
	}

	if len(definition.Actions) == 0 {
		return body
	}

	lines := make([]string, 0, len(definition.Actions)+1)
	for index, action := range definition.Actions {
		label := strings.TrimSpace(action.Label)
		if label == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("*%d* - %s", index+1, label))
	}
	if len(lines) == 0 {
		return body
	}

	return strings.TrimSpace(body) + "\n\n" + strings.Join(lines, "\n") + "\n\n_Digite o número da opção_"
}

func (uc *HandleWhatsAppMessageUseCase) composeWelcomeMenuBody(
	tenantObj *tenant.Tenant,
	definition *botFlowDefinitionPayload,
	prefix string,
) string {
	body := ""
	if definition != nil && definition.UseWelcomeTemplate {
		body = whatsapp.WelcomeMessage(tenantObj.Name, tenantObj.Settings.Messages)
	}

	if definition != nil {
		rendered := uc.applyFlowReplacements(definition.Body, map[string]string{
			"{nome_restaurante}": tenantObj.Name,
		})
		switch {
		case strings.TrimSpace(body) == "":
			body = rendered
		case strings.TrimSpace(rendered) != "":
			body = strings.TrimSpace(body) + "\n\n" + rendered
		}
	}

	if strings.TrimSpace(body) == "" {
		body = whatsapp.WelcomeMenuMessage(tenantObj.Name, tenantObj.Settings.Messages)
	}

	if strings.TrimSpace(prefix) == "" {
		return body
	}

	return strings.TrimSpace(prefix) + "\n\n" + body
}

func (uc *HandleWhatsAppMessageUseCase) buildInteractiveButtons(
	actions []botFlowActionDefinition,
) []whatsapp.InteractiveButton {
	buttons := make([]whatsapp.InteractiveButton, 0, len(actions))
	for _, action := range actions {
		title := strings.TrimSpace(action.Label)
		if title == "" {
			continue
		}

		button := whatsapp.InteractiveButton{Type: "reply"}
		button.Reply.ID = strings.TrimSpace(action.ID)
		if button.Reply.ID == "" {
			continue
		}

		if len(title) > 20 {
			title = strings.TrimSpace(title[:20])
		}
		button.Reply.Title = title
		buttons = append(buttons, button)
	}
	return buttons
}

func buildDefaultWelcomeButtons() []whatsapp.InteractiveButton {
	return buildSingleReplyButtons(defaultWelcomeMenuAction, "🙋 Solicitar mesa")
}

func (uc *HandleWhatsAppMessageUseCase) shouldSendInteractiveWelcome(
	definition *botFlowDefinitionPayload,
	buttons []whatsapp.InteractiveButton,
) bool {
	if definition == nil {
		return false
	}

	if strings.TrimSpace(strings.ToLower(definition.Presentation)) != "reply_buttons" {
		return false
	}

	return len(buttons) > 0 && len(buttons) <= 3
}

func normalizeBotFlowInput(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

func (uc *HandleWhatsAppMessageUseCase) handleMainMenu(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	if response, newState, blocked, err := uc.guardMainMenuAccess(ctx, sess); err != nil {
		return "", "", err
	} else if blocked {
		return response, newState, nil
	}

	switch text {
	case "1":
		// Fazer pedido
		// TODO: Buscar categorias do menu
		return "🛒 *Fazer Pedido*\n\nEm breve você poderá fazer pedidos!\n\n_Digite 0 para voltar ao menu_",
			session.StateOrdering, nil

	case "2":
		// Ver comanda
		// TODO: Buscar comanda do usuário
		return "📋 *Sua Comanda*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
			session.StateViewingTab, nil

	case "3":
		return uc.handleRepeatLastRound(ctx, sess)

	case "4":
		// Chamar garçom
		return uc.handleCallWaiter(ctx, sess)

	case "5":
		return uc.startClosingTabFlow(ctx, sess)

	default:
		return whatsapp.InvalidOptionMessage() + "\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleCallWaiter(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	if _, err := uc.getOrCreateOpenWaiterChat(ctx, sess); err != nil {
		uc.logger.Error("failed to start waiter chat",
			zap.Error(err),
			zap.String("user_phone", sess.UserPhone),
		)
		return "❌ Não consegui iniciar o atendimento agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	return "🙋 *Olá! Como posso te ajudar?*\n\n" +
			"Pode me contar por aqui que nossa equipe já vai te atender.\n\n" +
			"_Digite 0 para sair da conversa com a equipe_",
		session.StateServiceRequest, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrdering(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	return uc.handleOrderingSimplified(ctx, sess, text)
}

func (uc *HandleWhatsAppMessageUseCase) handleQuantitySelection(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	if text == "0" || text == orderingBackToMenuID {
		uc.clearOrderingContext(sess)
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	selectedItemID := uc.getContextString(sess, orderingSelectedItemIDKey)
	if selectedItemID == "" {
		return uc.startOrderingFlow(ctx, sess)
	}

	itemID, err := uuid.Parse(selectedItemID)
	if err != nil {
		uc.clearOrderingContext(sess)
		return "❌ Perdi a referência do item selecionado. Vamos reabrir o cardápio.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	selectedItem, err := uc.menuRepo.FindItemByID(ctx, itemID, sess.TenantID)
	if err != nil || selectedItem == nil {
		uc.logger.Error("failed to reload selected item for quantity",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
			zap.String("item_id", itemID.String()),
		)
		uc.clearOrderingContext(sess)
		return "❌ Não consegui continuar esse pedido agora. Tente novamente pelo menu principal.",
			session.StateMainMenu, nil
	}

	quantity := 0
	switch {
	case strings.HasPrefix(text, orderingQuantityPrefix):
		quantity, err = strconv.Atoi(strings.TrimPrefix(text, orderingQuantityPrefix))
	case text == orderingChangeItemID:
		if categoryID := uc.getContextString(sess, orderingSelectedCategoryIDKey); categoryID != "" {
			return uc.handleOrderingCategorySelection(ctx, sess, orderingCategoryPrefix+categoryID)
		}
		return uc.startOrderingFlow(ctx, sess)
	default:
		quantity, err = strconv.Atoi(text)
	}

	if err != nil || quantity < 1 || quantity > 20 {
		return fmt.Sprintf("❌ Quantidade inválida para *%s*. Escolha um dos botões ou envie um número entre 1 e 20.\n\n_Digite 0 para voltar ao menu principal_",
				selectedItem.Name),
			session.StateSelectingQty, nil
	}

	sess.SetContext(orderingSelectedQuantityKey, quantity)
	cart := uc.addItemToOrderingCart(sess, selectedItem, quantity)
	sess.SetContext(orderingSelectedQuantityKey, quantity)
	cartMessage := uc.buildOrderingCartMessage(ctx, sess, cart)
	uc.clearOrderingSelectionContext(sess)

	return uc.presentCartConfirmation(ctx, sess, cartMessage)
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderConfirmation(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	switch text {
	case "0", orderingBackToMenuID:
		uc.clearOrderingContext(sess)
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	case orderingChangeItemID, "2":
		if categoryID := uc.getContextString(sess, orderingSelectedCategoryIDKey); categoryID != "" {
			return uc.handleOrderingCategorySelection(ctx, sess, orderingCategoryPrefix+categoryID)
		}
		return uc.startOrderingFlow(ctx, sess)
	case orderingRemoveItemID, "3":
		cart := uc.getOrderingCart(sess)
		if len(cart) == 0 {
			return uc.startOrderingFlow(ctx, sess)
		}
		uc.clearOrderingCartAdjustmentContext(sess)
		if err := uc.sendCartRemovalMenu(ctx, sess.UserPhone, sess.TenantID, sess, cart); err == nil {
			return "", session.StateRemovingOrderItem, nil
		}
		return uc.buildOrderingCartRemovalFallback(ctx, sess, cart), session.StateRemovingOrderItem, nil
	case orderingConfirmOrderID, "1":
	default:
		return "❌ Opção inválida. Use *Enviar pedido*, *Adicionar mais itens*, *Ajustar item* ou digite *0* para voltar ao menu principal.",
			session.StateConfirmingOrder, nil
	}

	cart := uc.getOrderingCart(sess)
	if len(cart) == 0 {
		return uc.startOrderingFlow(ctx, sess)
	}

	if uc.createOrderUC == nil {
		uc.clearOrderingContext(sess)
		return "❌ Não consegui enviar pedidos agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	userTab, err := uc.getOrCreateTab(ctx, sess)
	if err != nil {
		uc.logger.Error("failed to get/create tab for whatsapp order", zap.Error(err))
		return "❌ Não consegui abrir sua comanda agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	orderInput := CreateOrderInput{
		TenantID: sess.TenantID,
		TabID:    userTab.ID,
		Items:    nil,
		Notes:    fmt.Sprintf("Pedido via WhatsApp - %s", sess.UserPhone),
	}

	orderItems, err := uc.buildOrderingCartOrderInput(ctx, sess, cart)
	if err != nil {
		uc.logger.Error("failed to build order input from cart",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
		)
		uc.clearOrderingContext(sess)
		return "❌ Não consegui montar esse pedido agora. Vamos reabrir o cardápio para você tentar novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
	orderInput.Items = orderItems

	createdOrder, err := uc.createOrderUC.Execute(ctx, orderInput)
	if err != nil {
		uc.logger.Error("failed to create whatsapp interactive order",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
		)
		return "❌ Não consegui enviar esse pedido agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	orderCode := uc.buildOrderDisplayCode(ctx, sess, userTab, createdOrder)
	itemsSummary := uc.buildOrderingCartItemsSummary(ctx, sess, cart)
	uc.clearOrderingContext(sess)

	return fmt.Sprintf(
		"✅ *Pedido enviado!*\n\n%s\n\n🧾 Código: *#%s*\n\nSeu pedido já foi encaminhado para a equipe. Vamos te avisar por aqui conforme o status avançar.\n\n%s",
		itemsSummary,
		orderCode,
		whatsapp.MainMenuMessage(),
	), session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderingCartItemRemoval(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	if text == "0" {
		cartMessage := uc.buildOrderingCartMessage(ctx, sess, uc.getOrderingCart(sess))
		return uc.presentCartConfirmation(ctx, sess, cartMessage)
	}

	cart := uc.getOrderingCart(sess)
	if len(cart) == 0 {
		return uc.startOrderingFlow(ctx, sess)
	}

	menuItemID, ok := uc.resolveOrderingCartRemovalSelection(sess, text)
	if !ok {
		return "❌ Item inválido. Escolha um item da lista para excluir ou digite *0* para voltar ao carrinho.",
			session.StateRemovingOrderItem, nil
	}

	sess.SetContext(orderingSelectedCartItemIDKey, menuItemID)
	displayEntry, found := uc.resolveOrderingCartDisplayEntry(ctx, sess, menuItemID)
	if !found {
		uc.clearOrderingCartAdjustmentContext(sess)
		return "❌ Não encontrei esse item no carrinho. Escolha outro item ou digite *0* para voltar ao carrinho.",
			session.StateRemovingOrderItem, nil
	}

	if err := uc.sendCartRemovalActionMenu(ctx, sess.UserPhone, sess.TenantID, displayEntry); err == nil {
		return "", session.StateAdjustingOrderItem, nil
	}

	return uc.buildCartRemovalActionFallback(displayEntry), session.StateAdjustingOrderItem, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderingCartItemAdjustment(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	if text == "0" || text == orderingBackToCartID {
		uc.clearOrderingCartAdjustmentContext(sess)
		cartMessage := uc.buildOrderingCartMessage(ctx, sess, uc.getOrderingCart(sess))
		return uc.presentCartConfirmation(ctx, sess, cartMessage)
	}

	cart := uc.getOrderingCart(sess)
	if len(cart) == 0 {
		uc.clearOrderingCartAdjustmentContext(sess)
		return uc.startOrderingFlow(ctx, sess)
	}

	selectedItemID := uc.getContextString(sess, orderingSelectedCartItemIDKey)
	if selectedItemID == "" {
		if err := uc.sendCartRemovalMenu(ctx, sess.UserPhone, sess.TenantID, sess, cart); err == nil {
			return "", session.StateRemovingOrderItem, nil
		}
		return uc.buildOrderingCartRemovalFallback(ctx, sess, cart), session.StateRemovingOrderItem, nil
	}

	selectedItem, found := uc.findOrderingCartItem(sess, selectedItemID)
	if !found {
		uc.clearOrderingCartAdjustmentContext(sess)
		cartMessage := uc.buildOrderingCartMessageWithNotice(
			ctx,
			sess,
			cart,
			"⚠️ Esse item não está mais no carrinho.",
		)
		return uc.presentCartConfirmation(ctx, sess, cartMessage)
	}

	removeSingleUnit := false
	removeEntireLine := false

	switch {
	case text == orderingIncreaseOneUnitID || text == "1":
		updatedItem, cartAfterUpdate, ok := uc.updateOrderingCartItemQuantity(sess, selectedItemID, selectedItem.Quantity+1)
		if !ok {
			return "❌ Não consegui ajustar esse item agora. Tente novamente.",
				session.StateAdjustingOrderItem, nil
		}
		updatedCart := cartAfterUpdate
		itemName := strings.TrimSpace(updatedItem.MenuItemName)
		if itemName == "" {
			itemName = "item"
		}
		uc.clearOrderingCartAdjustmentContext(sess)
		cartMessage := uc.buildOrderingCartMessageWithNotice(
			ctx,
			sess,
			updatedCart,
			fmt.Sprintf("➕ Adicionei *1 unidade* de *%s*.", itemName),
		)
		return uc.presentCartConfirmation(ctx, sess, cartMessage)
	case text == orderingRemoveOneUnitID || (text == "2" && selectedItem.Quantity > 1):
		removeSingleUnit = true
	case text == orderingSetQuantityID || (text == "3" && selectedItem.Quantity > 1) || (text == "2" && selectedItem.Quantity <= 1):
		displayEntry, _ := uc.resolveOrderingCartDisplayEntry(ctx, sess, selectedItemID)
		if err := uc.sendCartQuantitySelectionMenu(ctx, sess.UserPhone, sess.TenantID, displayEntry); err == nil {
			return "", session.StateSelectingCartItemQty, nil
		}
		return uc.buildCartQuantitySelectionFallback(displayEntry), session.StateSelectingCartItemQty, nil
	case text == orderingRemoveAllUnitsID || (text == "4" && selectedItem.Quantity > 1) || (text == "3" && selectedItem.Quantity <= 1):
		removeEntireLine = true
	default:
		return "❌ Opção inválida. Escolha uma ação da lista ou digite *0* para voltar ao carrinho.",
			session.StateAdjustingOrderItem, nil
	}

	var updatedCart []orderingCartItem
	var notice string
	itemName := strings.TrimSpace(selectedItem.MenuItemName)
	if itemName == "" {
		itemName = "item"
	}

	if removeSingleUnit && selectedItem.Quantity > 1 {
		updatedItem, cartAfterUpdate, ok := uc.updateOrderingCartItemQuantity(sess, selectedItemID, selectedItem.Quantity-1)
		if !ok {
			return "❌ Não consegui ajustar esse item agora. Tente novamente.",
				session.StateAdjustingOrderItem, nil
		}
		updatedCart = cartAfterUpdate
		itemName = strings.TrimSpace(updatedItem.MenuItemName)
		if itemName == "" {
			itemName = "item"
		}
		notice = fmt.Sprintf("➖ Removi *1 unidade* de *%s*.", itemName)
	} else if removeEntireLine || selectedItem.Quantity <= 1 {
		removedItem, cartAfterRemoval, ok := uc.removeItemFromOrderingCart(sess, selectedItemID)
		if !ok {
			return "❌ Não consegui ajustar esse item agora. Tente novamente.",
				session.StateAdjustingOrderItem, nil
		}
		updatedCart = cartAfterRemoval
		itemName = strings.TrimSpace(removedItem.MenuItemName)
		if itemName == "" {
			itemName = "item"
		}
		notice = fmt.Sprintf("🗑 Excluí *%s* do seu pedido.", itemName)
	}

	uc.clearOrderingCartAdjustmentContext(sess)

	if len(updatedCart) == 0 {
		emptyCartNotice := fmt.Sprintf("%s\n\n🛒 Seu carrinho ficou vazio. Vamos reabrir o cardápio para você.", notice)
		if err := uc.sendTenantMessage(ctx, sess.UserPhone, sess.TenantID, emptyCartNotice); err != nil {
			uc.logger.Error("failed to send empty cart notice", zap.Error(err))
		}
		return uc.startOrderingFlow(ctx, sess)
	}

	cartMessage := uc.buildOrderingCartMessageWithNotice(ctx, sess, updatedCart, notice)
	return uc.presentCartConfirmation(ctx, sess, cartMessage)
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderingCartItemQuantitySelection(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	selectedItemID := uc.getContextString(sess, orderingSelectedCartItemIDKey)
	if selectedItemID == "" {
		cart := uc.getOrderingCart(sess)
		if len(cart) == 0 {
			return uc.startOrderingFlow(ctx, sess)
		}
		if err := uc.sendCartRemovalMenu(ctx, sess.UserPhone, sess.TenantID, sess, cart); err == nil {
			return "", session.StateRemovingOrderItem, nil
		}
		return uc.buildOrderingCartRemovalFallback(ctx, sess, cart), session.StateRemovingOrderItem, nil
	}

	displayEntry, found := uc.resolveOrderingCartDisplayEntry(ctx, sess, selectedItemID)
	if !found {
		uc.clearOrderingCartAdjustmentContext(sess)
		cartMessage := uc.buildOrderingCartMessageWithNotice(
			ctx,
			sess,
			uc.getOrderingCart(sess),
			"⚠️ Esse item não está mais no carrinho.",
		)
		return uc.presentCartConfirmation(ctx, sess, cartMessage)
	}

	if text == "0" || text == orderingBackToCartID {
		if err := uc.sendCartRemovalActionMenu(ctx, sess.UserPhone, sess.TenantID, displayEntry); err == nil {
			return "", session.StateAdjustingOrderItem, nil
		}
		return uc.buildCartRemovalActionFallback(displayEntry), session.StateAdjustingOrderItem, nil
	}

	quantity := 0
	var err error
	switch {
	case strings.HasPrefix(text, orderingCartQtyPrefix):
		quantity, err = strconv.Atoi(strings.TrimPrefix(text, orderingCartQtyPrefix))
	default:
		quantity, err = strconv.Atoi(text)
	}

	if err != nil || quantity < 1 || quantity > 20 {
		return "❌ Quantidade inválida. Escolha uma opção da lista ou digite um número entre *1* e *20*.\n\n_Digite 0 para voltar ao ajuste do item_",
			session.StateSelectingCartItemQty, nil
	}

	updatedItem, updatedCart, ok := uc.updateOrderingCartItemQuantity(sess, selectedItemID, quantity)
	if !ok {
		return "❌ Não consegui atualizar a quantidade agora. Tente novamente.",
			session.StateSelectingCartItemQty, nil
	}

	itemName := strings.TrimSpace(updatedItem.MenuItemName)
	if itemName == "" {
		itemName = "item"
	}

	uc.clearOrderingCartAdjustmentContext(sess)
	cartMessage := uc.buildOrderingCartMessageWithNotice(
		ctx,
		sess,
		updatedCart,
		fmt.Sprintf("🔢 Atualizei *%s* para *%d unidade%s*.", itemName, quantity, pluralSuffix(quantity)),
	)
	return uc.presentCartConfirmation(ctx, sess, cartMessage)
}

func (uc *HandleWhatsAppMessageUseCase) presentCartConfirmation(
	ctx context.Context,
	sess *session.Session,
	cartMessage string,
) (string, session.ConversationState, error) {
	uc.clearOrderingCartAdjustmentContext(sess)
	if err := uc.sendCartConfirmationMenu(ctx, sess.UserPhone, sess.TenantID, cartMessage); err == nil {
		return "", session.StateConfirmingOrder, nil
	}

	return uc.buildCartConfirmationFallback(cartMessage), session.StateConfirmingOrder, nil
}

func orderingQuantityFromContext(value interface{}) (int, error) {
	switch typed := value.(type) {
	case int:
		return typed, nil
	case int32:
		return int(typed), nil
	case int64:
		return int(typed), nil
	case float64:
		return int(typed), nil
	case string:
		return strconv.Atoi(strings.TrimSpace(typed))
	default:
		return strconv.Atoi(strings.TrimSpace(fmt.Sprintf("%v", typed)))
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleViewingTab(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	switch strings.TrimSpace(text) {
	case tabSummaryBackMenuID:
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	case tabSummaryNewOrderID:
		return uc.handleMainMenuSimplified(ctx, sess, "1")
	case tabSummaryCloseTabID:
		return uc.startClosingTabFlow(ctx, sess)
	default:
		return uc.buildTabSummaryResponse(ctx, sess, false)
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleServiceRequest(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		if uc.waiterChatRepo != nil {
			chat, err := uc.waiterChatRepo.FindOpenByPhone(ctx, sess.TenantID, sess.UserPhone)
			if err == nil && chat != nil {
				_ = uc.waiterChatRepo.CloseChat(ctx, chat.ID, sess.TenantID, waiterchat.ClosedByCustomer)
			}
		}
		return "✅ Conversa encerrada.\n\n" + whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	if strings.TrimSpace(text) == "" {
		return "✍️ Me envie sua mensagem para eu acionar a equipe.\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	chat, err := uc.getOrCreateOpenWaiterChat(ctx, sess)
	if err != nil {
		uc.logger.Error("failed to get waiter chat for inbound message",
			zap.Error(err),
			zap.String("user_phone", sess.UserPhone),
		)
		return "❌ Tive um problema ao registrar sua mensagem agora. Pode tentar novamente?\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	msg := &waiterchat.Message{
		ID:         uuid.New(),
		ChatID:     chat.ID,
		TenantID:   sess.TenantID,
		SenderType: waiterchat.SenderCustomer,
		SenderName: sess.UserPhone,
		Message:    text,
	}
	if err := uc.waiterChatRepo.AppendMessage(ctx, msg); err != nil {
		uc.logger.Error("failed to append waiter chat message",
			zap.Error(err),
			zap.String("chat_id", chat.ID.String()),
		)
		return "❌ Tive um problema ao registrar sua mensagem agora. Pode tentar novamente?\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	return "✅ Mensagem enviada para nossa equipe.\n\n_Digite 0 para sair da conversa com a equipe_",
		session.StateServiceRequest, nil
}

func (uc *HandleWhatsAppMessageUseCase) getOrCreateOpenWaiterChat(
	ctx context.Context,
	sess *session.Session,
) (*waiterchat.Chat, error) {
	if uc.waiterChatRepo == nil {
		return nil, fmt.Errorf("waiter chat repo not configured")
	}

	chat, err := uc.waiterChatRepo.FindOpenByPhone(ctx, sess.TenantID, sess.UserPhone)
	if err != nil {
		return nil, err
	}
	if chat != nil {
		return chat, nil
	}

	openTab := uc.findSessionOpenTab(ctx, sess)
	now := time.Now()
	newChat := &waiterchat.Chat{
		ID:            uuid.New(),
		TenantID:      sess.TenantID,
		UserPhone:     sess.UserPhone,
		Status:        waiterchat.StatusOpen,
		OpenedAt:      now,
		LastMessageAt: now,
	}
	if openTab != nil {
		newChat.TabID = &openTab.ID
		newChat.TableID = openTab.TableID
	}

	if err := uc.waiterChatRepo.CreateChat(ctx, newChat); err != nil {
		return nil, err
	}

	systemMsg := &waiterchat.Message{
		ID:         uuid.New(),
		ChatID:     newChat.ID,
		TenantID:   sess.TenantID,
		SenderType: waiterchat.SenderSystem,
		SenderName: "system",
		Message:    "Cliente iniciou atendimento pelo WhatsApp.",
	}
	if err := uc.waiterChatRepo.AppendMessage(ctx, systemMsg); err != nil {
		uc.logger.Warn("failed to append waiter system message",
			zap.Error(err),
			zap.String("chat_id", newChat.ID.String()),
		)
	}

	return newChat, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleTableConfirmation(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	// Permitir cancelar
	if text == "0" || strings.ToLower(text) == "cancelar" {
		uc.resetSessionAccess(sess)
		return whatsapp.TableRequestFlowCanceledMessage(), session.StateWelcome, nil
	}

	// Validar quantidade de pessoas
	paxCount, err := strconv.Atoi(text)
	if err != nil || paxCount < 1 || paxCount > 20 {
		return "❌ Por favor, digite um número válido de pessoas (1 a 20).\n\n_Ou digite 0 para cancelar_", session.StateWaitingTableConfirmation, nil
	}

	tableIDStr, ok := sess.GetContext("pending_table_id")
	if !ok {
		return "❌ Ocorreu um erro ao identificar a mesa. Por favor, escaneie o QR Code novamente.", session.StateMainMenu, nil
	}
	tableID, _ := uuid.Parse(tableIDStr.(string))

	// Criar solicitação de mesa
	req := &table.TableRequest{
		ID:        uuid.New(),
		TenantID:  sess.TenantID,
		TableID:   &tableID,
		UserPhone: sess.UserPhone,
		PaxCount:  paxCount,
		Status:    table.RequestStatusPending,
	}

	if err := uc.tableRepo.CreateRequest(ctx, req); err != nil {
		uc.logger.Error("failed to create table request", zap.Error(err))
		return "❌ Tivemos um problema ao registrar sua solicitação. Pode tentar novamente?", session.StateWaitingTableConfirmation, nil
	}

	// Limpar contexto temporário
	sess.Context = make(map[string]interface{})

	return whatsapp.TableRequestPendingMessage(), session.StateWaitingAdminApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleWaitingAdminApproval(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	// Enquanto aguarda aprovação, ignorar outras mensagens exceto cancelamento
	if text == "0" || strings.ToLower(text) == "cancelar" {
		if err := uc.cancelPendingTableRequest(ctx, sess); err != nil {
			uc.logger.Error("failed to cancel pending table request",
				zap.Error(err),
				zap.String("tenant_id", sess.TenantID.String()),
				zap.String("user_phone", sess.UserPhone),
			)
			return "❌ Não consegui retirar você da fila agora. Tente novamente em instantes.",
				session.StateWaitingAdminApproval, nil
		}

		uc.resetSessionAccess(sess)
		return whatsapp.TableRequestCanceledMessage(), session.StateWelcome, nil
	}

	return whatsapp.AlreadyInQueueMessage(), session.StateWaitingAdminApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) cancelPendingTableRequest(
	ctx context.Context,
	sess *session.Session,
) error {
	if uc.tableRepo == nil || sess == nil {
		return nil
	}

	pendingReq, err := uc.tableRepo.FindPendingRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
	if err != nil {
		return err
	}
	if pendingReq == nil {
		return nil
	}

	pendingReq.Status = table.RequestStatusRejected
	return uc.tableRepo.UpdateRequest(ctx, pendingReq)
}

func (uc *HandleWhatsAppMessageUseCase) resetSessionAccess(sess *session.Session) {
	if sess == nil {
		return
	}

	sess.TableID = nil
	sess.TabID = nil
	sess.Context = make(map[string]interface{})
}

func (uc *HandleWhatsAppMessageUseCase) guardMainMenuAccess(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, bool, error) {
	if sess == nil {
		return whatsapp.MenuAccessUnavailableMessage(), session.StateWelcome, true, nil
	}

	if uc.tabRepo == nil && uc.tableRepo == nil {
		return "", "", false, nil
	}

	if uc.tableRepo != nil {
		pendingReq, err := uc.tableRepo.FindPendingRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
		if err != nil {
			return "", "", false, err
		}
		if pendingReq != nil {
			return whatsapp.AlreadyInQueueMessage(), session.StateWaitingAdminApproval, true, nil
		}
	}

	if uc.tabRepo != nil && uc.findSessionOpenTab(ctx, sess) != nil {
		return "", "", false, nil
	}

	if uc.tableRepo == nil {
		return "", "", false, nil
	}

	if recoveredTableID, err := uc.recoverSessionTableID(ctx, sess); err == nil && recoveredTableID != nil {
		return "", "", false, nil
	} else if err != nil {
		uc.logger.Warn("failed to recover menu access while guarding main menu",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
			zap.String("user_phone", sess.UserPhone),
		)
	}

	uc.resetSessionAccess(sess)
	return whatsapp.MenuAccessUnavailableMessage(), session.StateWelcome, true, nil
}

// Fase 14: Lidar com a Escolha do Botão Interativo "Compartilhar Comanda" ou "Individual"
func (uc *HandleWhatsAppMessageUseCase) handleCollabChoice(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	// O Webhook do WhatsApp vai enviar o "ID" do botão se o usuário clicou no botão.
	// O Graph V18 manda no struct "Interactive" que nós ainda não mapeamos todo o corpo, mas caso ele digite,
	// nós capturamos pela string "btn_shared" (que não seria digitada, seria o payload) ou pelas strings.
	// Vamos simplificar para o MVP como se a string recebesse literal do texto do botão caso não encontre ID,
	// e no Webhook passamos de forma unificada.

	// Fast-Fail para cancelar
	if text == "0" || strings.ToLower(text) == "cancelar" {
		sess.Context = make(map[string]interface{})
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	tableIDStr, ok := sess.GetContext("pending_table_id")
	if !ok {
		return "❌ Ocorreu um erro ao identificar a mesa.", session.StateMainMenu, nil
	}
	tableID, _ := uuid.Parse(tableIDStr.(string))

	isShared := text == "btn_shared" || strings.Contains(strings.ToLower(text), "entrar") || strings.Contains(strings.ToLower(text), "compartilhar")
	isIndividual := text == "btn_individual" || strings.Contains(strings.ToLower(text), "individual")

	var joinType tab.JoinType
	if isShared {
		joinType = tab.JoinTypeShared
	} else if isIndividual {
		joinType = tab.JoinTypeIndividual
	} else {
		return "Por favor, toque em um dos botões: *🤝 Entrar na Comanda* ou *💳 Individual*.", session.StateWaitingCollabChoice, nil
	}

	mainTabIDStr, hasMain := sess.GetContext("main_tab_id")
	if !hasMain {
		return "❌ A comanda principal já foi fechada.", session.StateMainMenu, nil
	}
	mainTabID, _ := uuid.Parse(mainTabIDStr.(string))

	mainTab, err := uc.tabRepo.FindByID(ctx, mainTabID, sess.TenantID)
	if err != nil || mainTab == nil {
		return "❌ Erro ao localizar a comanda principal.", session.StateMainMenu, nil
	}

	// Fase 15: Criar JoinRequest PENDING
	joinReq := &tab.TabJoinRequest{
		ID:             uuid.New(),
		TenantID:       sess.TenantID,
		TableID:        tableID,
		MainTabID:      mainTabID,
		RequestorPhone: sess.UserPhone,
		OpenerPhone:    mainTab.UserPhone,
		JoinType:       joinType,
		Status:         tab.JoinRequestPending,
	}

	if err := uc.tabRepo.CreateJoinRequest(ctx, joinReq); err != nil {
		uc.logger.Error("failed to create join request", zap.Error(err))
		return "❌ Tivemos um problema ao processar seu pedido.", session.StateWaitingCollabChoice, nil
	}

	// Salva as referências na sessão e muda o estado
	sess.SetContext("join_request_id", joinReq.ID.String())
	sess.SetContext("join_type", string(joinType))
	sess.TransitionTo(session.StateWaitingJoinApproval)

	// Localiza o opener e envia botões de Aprovar/Recusar
	openerSess, err := uc.sessionRepo.FindByPhone(ctx, mainTab.UserPhone, sess.TenantID.String())
	if err == nil && openerSess != nil {
		joinDesc := "como COMANDA COMPARTILHADA"
		if joinType == tab.JoinTypeIndividual {
			joinDesc = "com CONTA INDIVIDUAL (pagamento separado)"
		}

		tableNumStr, _ := sess.GetContext("pending_table_number")
		tableNumber := ""
		if tableNumStr != nil {
			tableNumber = tableNumStr.(string)
		}

		msgOpener := fmt.Sprintf("🔔 *Solicitação de Entrada*\n\nUm cliente (%s) quer entrar na Mesa %s %s.\n\nO que você deseja fazer?", sess.UserPhone, tableNumber, joinDesc)

		openerSess.TransitionTo(session.StateWaitingOpenerDecision)
		openerSess.SetContext("pending_join_request_id", joinReq.ID.String())
		uc.sessionRepo.Save(ctx, openerSess)

		if err := uc.sendJoinRequestDecisionMenu(ctx, openerSess.UserPhone, sess.TenantID, joinReq.ID, msgOpener); err != nil {
			uc.logger.Error("failed to send approval to opener", zap.Error(err))
		}
	} else {
		// Log e mantém aguardando
		uc.logger.Warn("opener session not found to send approval request", zap.String("opener_phone", mainTab.UserPhone))
	}

	return "⏳ Pedido enviado! Aguardando aprovação da pessoa responsável pela mesa...", session.StateWaitingJoinApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleWaitingJoinApproval(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)
	if text == "0" || strings.ToLower(text) == "cancelar" {
		sess.Context = make(map[string]interface{})
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	return "⏳ Aguardando aprovação da pessoa responsável pela mesa...\n\n_Digite 0 para cancelar_", session.StateWaitingJoinApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOpenerDecision(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	reqIDStr, hasReq := sess.GetContext("pending_join_request_id")
	if !hasReq {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	reqID, err := uuid.Parse(reqIDStr.(string))
	if err != nil {
		return "❌ Erro ao ler a solicitação.", session.StateMainMenu, nil
	}

	joinReq, err := uc.tabRepo.FindJoinRequestByID(ctx, reqID)
	if err != nil || joinReq == nil {
		return "❌ Solicitação não encontrada.", session.StateMainMenu, nil
	}

	if joinReq.Status != tab.JoinRequestPending {
		delete(sess.Context, "pending_join_request_id")
		return "Esta solicitação já foi respondida.", session.StateMainMenu, nil
	}

	isApprove := strings.HasPrefix(text, "btn_approve_") || strings.ToLower(text) == "aprovar"
	isReject := strings.HasPrefix(text, "btn_reject_") || strings.ToLower(text) == "recusar"

	if !isApprove && !isReject {
		body := "🔔 *Solicitação pendente*\n\nEscolha *Aprovar* ou *Recusar* para responder ao pedido de entrada."
		if err := uc.sendJoinRequestDecisionMenu(ctx, sess.UserPhone, sess.TenantID, joinReq.ID, body); err == nil {
			return "", session.StateWaitingOpenerDecision, nil
		}
		return "Por favor, responda com *aprovar* ou *recusar*.", session.StateWaitingOpenerDecision, nil
	}

	if isApprove {
		joinReq.Status = tab.JoinRequestApproved
		uc.tabRepo.UpdateJoinRequestStatus(ctx, joinReq.ID, tab.JoinRequestApproved)

		clientB, err := uc.sessionRepo.Find(ctx, joinReq.RequestorPhone, sess.TenantID.String())
		if err == nil && clientB != nil {
			if joinReq.JoinType == tab.JoinTypeShared {
				clientB.TabID = &joinReq.MainTabID
				clientB.TableID = &joinReq.TableID
				clientB.Context = make(map[string]interface{})
				clientB.TransitionTo(session.StateMainMenu)
				uc.sessionRepo.Save(ctx, clientB)

				uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "✅ *Sua entrada foi aprovada!*\n\n🤝 Você entrou na Comanda Compartilhada.\n\n"+whatsapp.MainMenuMessage())
			} else {
				newTab := &tab.Tab{
					ID:        uuid.New(),
					TenantID:  sess.TenantID,
					TableID:   &joinReq.TableID,
					UserPhone: joinReq.RequestorPhone,
					Status:    tab.StatusOpen,
				}
				uc.tabRepo.Create(ctx, newTab)

				clientB.TabID = &newTab.ID
				clientB.TableID = &joinReq.TableID
				clientB.Context = make(map[string]interface{})
				clientB.TransitionTo(session.StateMainMenu)
				uc.sessionRepo.Save(ctx, clientB)

				uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "✅ *Sua entrada foi aprovada!*\n\n💳 Sua comanda individual foi criada.\n\n"+whatsapp.MainMenuMessage())
			}
		}

		delete(sess.Context, "pending_join_request_id")
		return "✅ Você *aprovou* a entrada.", session.StateMainMenu, nil
	}

	if isReject {
		joinReq.Status = tab.JoinRequestRejected
		uc.tabRepo.UpdateJoinRequestStatus(ctx, joinReq.ID, tab.JoinRequestRejected)

		clientB, err := uc.sessionRepo.Find(ctx, joinReq.RequestorPhone, sess.TenantID.String())
		if err == nil && clientB != nil {
			clientB.Context = make(map[string]interface{})
			clientB.TransitionTo(session.StateMainMenu)
			uc.sessionRepo.Save(ctx, clientB)

			uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "❌ *Sua entrada foi recusada* pela pessoa responsável pela mesa.\n\n"+whatsapp.MainMenuMessage())
		}
		delete(sess.Context, "pending_join_request_id")
		return "❌ Você *recusou* a entrada.", session.StateMainMenu, nil
	}

	return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) sendTenantMessage(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	tenantObj, _ := uc.tenantRepo.FindByID(ctx, tenantID)
	if prefix, ok := uc.extractMainMenuPrefix(message, tenantObj); ok {
		if err := uc.sendInteractiveMainMenu(ctx, to, tenantID, tenantObj, prefix); err == nil {
			return nil
		}
	}

	decorated := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), uc.resolveTenantMessage(message, tenantObj))
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	return uc.sender.SendText(ctx, to, decorated)
}

func (uc *HandleWhatsAppMessageUseCase) sendTenantMessagePlain(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	return uc.sender.SendText(ctx, to, strings.TrimSpace(message))
}

func (uc *HandleWhatsAppMessageUseCase) sendWaitingAdminApprovalMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	return uc.sendSingleActionMenu(
		ctx,
		to,
		tenantID,
		message,
		strings.TrimSpace(message)+"\n\n_Digite 0 para cancelar_",
		"0",
		"Cancelar",
	)
}

func (uc *HandleWhatsAppMessageUseCase) sendWaitingJoinApprovalMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	return uc.sendSingleActionMenu(
		ctx,
		to,
		tenantID,
		message,
		strings.TrimSpace(message)+"\n\n_Digite 0 para cancelar_",
		"0",
		"Cancelar",
	)
}

func (uc *HandleWhatsAppMessageUseCase) sendSingleActionMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	body string,
	fallback string,
	buttonID string,
	buttonTitle string,
) error {
	decoratedBody := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), strings.TrimSpace(body))
	decoratedFallback := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), strings.TrimSpace(fallback))
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	if _, err := uc.sender.SendInteractiveButtons(ctx, to, decoratedBody, buildSingleReplyButtons(buttonID, buttonTitle)); err != nil {
		uc.logger.Warn("failed to send single-action interactive menu, falling back to text",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("to", to),
		)
		return uc.sender.SendText(ctx, to, decoratedFallback)
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) sendJoinRequestDecisionMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	requestID uuid.UUID,
	body string,
) error {
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	if _, err := uc.sender.SendInteractiveButtons(ctx, to, strings.TrimSpace(body), buildJoinRequestDecisionButtons(requestID)); err != nil {
		uc.logger.Warn("failed to send join request decision buttons, falling back to text",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("to", to),
			zap.String("request_id", requestID.String()),
		)
		fallback := strings.TrimSpace(body) + "\n\nResponda com *aprovar* ou *recusar*."
		return uc.sender.SendText(ctx, to, fallback)
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) resolveTenantName(ctx context.Context, tenantID uuid.UUID) string {
	t, err := uc.tenantRepo.FindByID(ctx, tenantID)
	if err != nil || t == nil {
		return ""
	}
	return strings.TrimSpace(t.Name)
}

func (uc *HandleWhatsAppMessageUseCase) resolveTenantMessage(message string, tenantObj *tenant.Tenant) string {
	body := strings.TrimSpace(message)
	if tenantObj == nil {
		return body
	}

	defaultMainMenu := strings.TrimSpace(whatsapp.MainMenuMessage())
	customMainMenu := strings.TrimSpace(whatsapp.MainMenuMessage(tenantObj.Settings.Messages))
	resolvedMainMenu := customMainMenu
	if resolvedMainMenu == "" {
		resolvedMainMenu = defaultMainMenu
	}

	if body == defaultMainMenu || body == customMainMenu {
		return resolvedMainMenu
	}

	for _, candidate := range []string{defaultMainMenu, customMainMenu} {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if strings.HasSuffix(body, "\n\n"+candidate) {
			prefix := strings.TrimSpace(strings.TrimSuffix(body, "\n\n"+candidate))
			if prefix == "" {
				return resolvedMainMenu
			}
			return prefix + "\n\n" + resolvedMainMenu
		}
	}

	return body
}

func (uc *HandleWhatsAppMessageUseCase) extractMainMenuPrefix(message string, tenantObj *tenant.Tenant) (string, bool) {
	body := strings.TrimSpace(message)
	if body == "" {
		return "", false
	}

	candidates := []string{strings.TrimSpace(whatsapp.MainMenuMessage())}
	if tenantObj != nil {
		candidates = append(candidates, strings.TrimSpace(whatsapp.MainMenuMessage(tenantObj.Settings.Messages)))
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if body == candidate {
			return "", true
		}
		if strings.HasSuffix(body, "\n\n"+candidate) {
			return strings.TrimSpace(strings.TrimSuffix(body, "\n\n"+candidate)), true
		}
	}

	return "", false
}

func (uc *HandleWhatsAppMessageUseCase) sendInteractiveMainMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	tenantObj *tenant.Tenant,
	prefix string,
) error {
	body := uc.composeMainMenuBody(tenantObj, prefix)
	decorated := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), body)
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	_, err := uc.sender.SendInteractiveList(ctx, to, decorated, mainMenuListButtonText, buildMainMenuSections())
	return err
}

func (uc *HandleWhatsAppMessageUseCase) composeMainMenuBody(
	tenantObj *tenant.Tenant,
	prefix string,
) string {
	body := strings.TrimSpace(whatsapp.MainMenuBodyMessage())
	if tenantObj != nil {
		body = strings.TrimSpace(whatsapp.MainMenuBodyMessage(tenantObj.Settings.Messages))
	}

	if strings.TrimSpace(prefix) == "" {
		return body
	}
	if body == "" {
		return strings.TrimSpace(prefix)
	}
	return strings.TrimSpace(prefix) + "\n\n" + body
}

func buildMainMenuSections() []whatsapp.InteractiveListSection {
	return []whatsapp.InteractiveListSection{
		{
			Title: "Atendimento",
			Rows: []whatsapp.InteractiveListRow{
				{ID: "1", Title: "Fazer pedido", Description: "Ver os itens do cardápio"},
				{ID: "2", Title: "Ver minha comanda", Description: "Consultar itens e valores"},
				{ID: "3", Title: "Repetir última rodada", Description: "Refazer seu último pedido"},
				{ID: "4", Title: "Chamar garçom", Description: "Falar com nossa equipe"},
				{ID: "5", Title: "Fechar conta", Description: "Pagar ou pedir fechamento"},
			},
		},
	}
}

func (uc *HandleWhatsAppMessageUseCase) sendTabSummaryMenu(
	ctx context.Context,
	to string,
	sess *session.Session,
) error {
	tenantObj, _ := uc.tenantRepo.FindByID(ctx, sess.TenantID)
	restaurantName := ""
	msgs := tenant.MessageTemplates{}
	serviceFeePercent := 10.0
	if tenantObj != nil {
		restaurantName = tenantObj.Name
		msgs = tenantObj.Settings.Messages
		if tenantObj.Settings.ServiceFeePercent > 0 {
			serviceFeePercent = tenantObj.Settings.ServiceFeePercent
		}
	}

	userTab := uc.findSessionOpenTab(ctx, sess)
	tableCode := uc.resolveLatestApprovedTableCode(ctx, sess)
	items := []string{}
	subtotal := 0.0
	serviceFee := 0.0
	total := 0.0
	if userTab != nil {
		tableCode = uc.resolveTabTableCode(ctx, sess.TenantID, userTab)
		items = uc.buildTabItemsList(ctx, sess.TenantID, userTab.ID)
		subtotal = userTab.Subtotal
		serviceFee = userTab.ServiceFee
		total = userTab.Total
	}

	body := whatsapp.TabSummaryMessage(
		restaurantName,
		tableCode,
		items,
		serviceFeePercent,
		subtotal,
		serviceFee,
		total,
		msgs,
	)
	fallback := whatsapp.TabSummaryMenuMessage(
		restaurantName,
		tableCode,
		items,
		serviceFeePercent,
		subtotal,
		serviceFee,
		total,
		msgs,
	)

	decoratedBody := whatsapp.WithRestaurantHeader(restaurantName, body)
	ctx = whatsapp.WithTenantID(ctx, sess.TenantID)
	if _, err := uc.sender.SendInteractiveButtons(ctx, to, decoratedBody, buildTabSummaryButtons()); err != nil {
		uc.logger.Warn("failed to send interactive tab summary, falling back to text",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
			zap.String("to", to),
		)
		return uc.sender.SendText(ctx, to, whatsapp.WithRestaurantHeader(restaurantName, fallback))
	}

	return nil
}

func buildSingleReplyButtons(buttonID string, title string) []whatsapp.InteractiveButton {
	button := whatsapp.InteractiveButton{Type: "reply"}
	button.Reply.ID = strings.TrimSpace(buttonID)
	button.Reply.Title = strings.TrimSpace(title)
	return []whatsapp.InteractiveButton{button}
}

func buildJoinRequestDecisionButtons(requestID uuid.UUID) []whatsapp.InteractiveButton {
	return []whatsapp.InteractiveButton{
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: fmt.Sprintf("btn_approve_%s", requestID.String()), Title: "✅ Aprovar"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: fmt.Sprintf("btn_reject_%s", requestID.String()), Title: "❌ Recusar"},
		},
	}
}

func buildTabSummaryButtons() []whatsapp.InteractiveButton {
	return []whatsapp.InteractiveButton{
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: tabSummaryNewOrderID, Title: "➕ Novo pedido"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: tabSummaryCloseTabID, Title: "✅ Fechar conta"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: tabSummaryBackMenuID, Title: "◂ Menu principal"},
		},
	}
}
