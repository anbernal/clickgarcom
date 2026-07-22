package whatsapp

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	domain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	outboxTemplateInteractiveMainMenu = "interactive_main_menu"
	outboxMainMenuButtonText          = "Abrir menu"
)

type OutboxProcessor struct {
	db         *gorm.DB
	apiClient  *MetaAPIClient
	logRepo    tenant.MessageLogRepository
	tenantRepo tenant.Repository
	logger     *zap.Logger
	batchSize  int
}

func NewOutboxProcessor(db *gorm.DB, apiClient *MetaAPIClient, logRepo tenant.MessageLogRepository, tenantRepo tenant.Repository, logger *zap.Logger) *OutboxProcessor {
	return &OutboxProcessor{
		db:         db,
		apiClient:  apiClient,
		logRepo:    logRepo,
		tenantRepo: tenantRepo,
		logger:     logger,
		batchSize:  10, // Processar 10 mensagens por vez
	}
}

func (p *OutboxProcessor) ProcessPending(ctx context.Context) error {
	startedAt := time.Now()
	defer func() {
		metrics.ObserveOutboxRunDuration(time.Since(startedAt).Seconds())
		metrics.SetOutboxLastRunTimestamp(float64(time.Now().Unix()))
	}()

	// 1. Buscar mensagens pendentes
	var messages []domain.OutboxMessage

	err := p.db.WithContext(ctx).
		Where("sent = ? AND attempts < max_attempts", false).
		Where("next_retry_at IS NULL OR next_retry_at <= ?", time.Now()).
		Order("created_at ASC").
		Limit(p.batchSize).
		Find(&messages).Error

	if err != nil {
		return fmt.Errorf("failed to fetch pending messages: %w", err)
	}

	metrics.SetOutboxPendingMessages(len(messages))
	metrics.ObserveOutboxBatchSize(len(messages))

	if len(messages) == 0 {
		return nil // Nada a processar
	}

	p.logger.Info("processing outbox messages",
		zap.Int("count", len(messages)),
	)

	// 2. Processar cada mensagem
	for _, msg := range messages {
		if err := p.processMessage(ctx, &msg); err != nil {
			metrics.IncOutboxMessagesProcessed("error")
			p.logger.Error("failed to process message",
				zap.String("id", msg.ID.String()),
				zap.Error(err),
			)
		} else {
			metrics.IncOutboxMessagesProcessed("success")
		}
	}

	return nil
}

func (p *OutboxProcessor) processMessage(ctx context.Context, msg *domain.OutboxMessage) error {
	// 1. Incrementar tentativas
	msg.Attempts++

	var billingTenant *tenant.Tenant

	// Fase 13: Verificação de Pedágio (Pre-paid Check)
	if msg.TenantID != nil && p.tenantRepo != nil {
		tnt, err := p.tenantRepo.FindByID(ctx, *msg.TenantID)
		if err == nil {
			billingTenant = tnt
			if tnt.BillingPlan == tenant.PlanPrePaid && tnt.WalletBalance <= 0 {
				p.logger.Warn("tenant out of credits, dropping outgoing message", zap.String("msg_id", msg.ID.String()))

				// Marcar a mensagem como erro definitivo (para não dar loop infinito)
				msg.LastError = "OUT OF CREDITS"
				msg.Attempts = msg.MaxAttempts
				msg.Sent = false
				return p.db.Save(msg).Error
			}
			// Assumiremos a dedução caso enviada com sucesso no passo 4
		}
	}

	// 2. Tentar enviar
	messageID, preview, err := p.sendMessage(ctx, msg, billingTenant)

	if err != nil {
		// Falhou - atualizar erro e próximo retry
		msg.LastError = err.Error()

		if msg.Attempts >= msg.MaxAttempts {
			p.logger.Warn("max attempts reached, giving up",
				zap.String("id", msg.ID.String()),
				zap.String("recipient", msg.Recipient),
			)
		} else {
			// Backoff exponencial: 5min, 15min, 45min
			retryDelay := time.Duration(5*msg.Attempts*msg.Attempts) * time.Minute
			nextRetry := time.Now().Add(retryDelay)
			msg.NextRetryAt = &nextRetry

			p.logger.Info("scheduling retry",
				zap.String("id", msg.ID.String()),
				zap.Int("attempt", msg.Attempts),
				zap.Time("next_retry", nextRetry),
			)
		}

		return p.db.Save(msg).Error
	}

	// 3. Sucesso - marcar como enviado
	now := time.Now()
	msg.Sent = true
	msg.SentAt = &now
	msg.LastError = "" // Limpar erro anterior

	p.logger.Info("message sent successfully",
		zap.String("id", msg.ID.String()),
		zap.String("recipient", msg.Recipient),
		zap.String("whatsapp_message_id", messageID),
	)

	err = p.db.Save(msg).Error

	// 4. Salvar Monitoria (Billing/Tracking Fase 11) e Deduzir Pedágio (Fase 13)
	if err == nil && msg.TenantID != nil {
		go func(tid uuid.UUID, mid string) {
			if p.tenantRepo != nil {
				tnt, err := p.tenantRepo.FindByID(context.Background(), tid)
				if err == nil && tnt.BillingPlan == tenant.PlanPrePaid {
					_ = p.tenantRepo.DeductWalletBalance(context.Background(), tid, tnt.MessagePrice)
				}
			}
			if p.logRepo != nil {
				p.logRepo.Save(context.Background(), &tenant.MessageLog{
					TenantID:       tid,
					Direction:      tenant.DirectionOut,
					MessageID:      mid,
					Status:         "SENT",
					UserPhone:      strings.TrimSpace(msg.Recipient),
					MessagePreview: sanitizeMessagePreview(preview),
				})
			}
		}(*msg.TenantID, messageID)
	}

	return err
}

func (p *OutboxProcessor) sendMessage(
	ctx context.Context,
	msg *domain.OutboxMessage,
	tenantObj *tenant.Tenant,
) (string, string, error) {
	if p.apiClient == nil {
		return "", "", fmt.Errorf("MetaAPIClient is not initialized")
	}

	preview := msg.Payload
	if msg.TemplateID == outboxTemplateInteractiveMainMenu {
		body := p.composeInteractiveMainMenuBody(msg.Payload, tenantObj)
		if body != "" {
			if messageID, err := p.apiClient.SendInteractiveList(
				ctx,
				msg.Recipient,
				body,
				outboxMainMenuButtonText,
				buildOutboxMainMenuSections(),
			); err == nil {
				return messageID, body, nil
			} else {
				p.logger.Warn("failed to send interactive main menu, falling back to text",
					zap.String("id", msg.ID.String()),
					zap.String("recipient", msg.Recipient),
					zap.Error(err),
				)
			}
		}
	}

	messageID, err := p.apiClient.SendTextMessage(ctx, msg.Recipient, msg.Payload)
	return messageID, preview, err
}

func (p *OutboxProcessor) composeInteractiveMainMenuBody(
	payload string,
	tenantObj *tenant.Tenant,
) string {
	prefix, matched := extractMainMenuPrefix(payload, tenantObj)
	if matched {
		body := strings.TrimSpace(domain.MainMenuBodyMessage())
		if tenantObj != nil {
			body = strings.TrimSpace(domain.MainMenuBodyMessage(tenantObj.Settings.Messages))
		}

		switch {
		case strings.TrimSpace(prefix) == "":
			return decorateInteractiveBody(body, tenantObj)
		case body == "":
			return decorateInteractiveBody(prefix, tenantObj)
		default:
			return decorateInteractiveBody(prefix+"\n\n"+body, tenantObj)
		}
	}

	return decorateInteractiveBody(payload, tenantObj)
}

func decorateInteractiveBody(body string, tenantObj *tenant.Tenant) string {
	text := strings.TrimSpace(body)
	if text == "" {
		return ""
	}
	if tenantObj == nil {
		return text
	}
	return domain.WithRestaurantHeader(strings.TrimSpace(tenantObj.Name), text)
}

func extractMainMenuPrefix(message string, tenantObj *tenant.Tenant) (string, bool) {
	body := strings.TrimSpace(message)
	if body == "" {
		return "", false
	}

	candidates := []string{strings.TrimSpace(domain.MainMenuMessage())}
	if tenantObj != nil {
		candidates = append(candidates, strings.TrimSpace(domain.MainMenuMessage(tenantObj.Settings.Messages)))
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if body == candidate {
			return "", true
		}
		if idx := strings.LastIndex(body, candidate); idx >= 0 {
			return strings.TrimSpace(body[:idx]), true
		}
	}

	return "", false
}

func buildOutboxMainMenuSections() []domain.InteractiveListSection {
	return []domain.InteractiveListSection{
		{
			Title: "Atendimento",
			Rows: []domain.InteractiveListRow{
				{ID: "1", Title: "Fazer pedido", Description: "Ver os itens do cardápio"},
				{ID: "2", Title: "Ver minha comanda", Description: "Consultar itens e valores"},
				{ID: "3", Title: "Repetir última rodada", Description: "Refazer seu último pedido"},
				{ID: "4", Title: "Chamar garçom", Description: "Falar com nossa equipe"},
				{ID: "5", Title: "Fechar conta", Description: "Pagar ou pedir fechamento"},
				{ID: "6", Title: "QR Code de saída", Description: "Conferir se a comanda está fechada"},
			},
		},
	}
}
