package handlers

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

type WhatsAppWebhookHandler struct {
	inboxRepo  inbox.Repository
	tenantRepo tenant.Repository
	logRepo    tenant.MessageLogRepository
	rabbitMQ   RabbitMQPublisher
	logger     *zap.Logger
}

type RabbitMQPublisher interface {
	Publish(ctx context.Context, exchange, routingKey string, body []byte) error
}

func NewWhatsAppWebhookHandler(
	inboxRepo inbox.Repository,
	tenantRepo tenant.Repository,
	logRepo tenant.MessageLogRepository,
	rabbitMQ RabbitMQPublisher,
	logger *zap.Logger,
) *WhatsAppWebhookHandler {
	return &WhatsAppWebhookHandler{
		inboxRepo:  inboxRepo,
		tenantRepo: tenantRepo,
		logRepo:    logRepo,
		rabbitMQ:   rabbitMQ,
		logger:     logger,
	}
}

// HandleVerification - Endpoint de verificação do Meta
func (h *WhatsAppWebhookHandler) HandleVerification(c *fiber.Ctx) error {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	verifyToken := c.Locals("whatsapp_verify_token").(string)

	if mode == "subscribe" && token == verifyToken {
		h.logger.Info("WhatsApp webhook verified successfully")
		return c.SendString(challenge)
	}

	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "invalid verification token",
	})
}

// HandleWebhook - Endpoint principal (CRÍTICO: < 10ms)
func (h *WhatsAppWebhookHandler) HandleWebhook(c *fiber.Ctx) error {
	startTime := time.Now()

	// 1. Extrair wamid para idempotência e wabaID para Tracking
	var payload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &payload); err != nil {
		h.logger.Error("failed to parse webhook payload", zap.Error(err))
		return c.SendStatus(fiber.StatusOK) // ACK mesmo com erro de parse
	}

	wamid := extractWAMID(payload)
	wabaID := extractWabaID(payload)

	if wamid == "" {
		h.logger.Warn("webhook without wamid, skipping")
		return c.SendStatus(fiber.StatusOK)
	}

	// Tentar identificar o Inquilino (Restaurante) pelo Telefone Comercial pra Metrificação (Fase 11) e Bilhetagem (Fase 13)
	if wabaID != "" && h.tenantRepo != nil {
		tnt, err := h.tenantRepo.FindByWabaID(c.Context(), wabaID)
		if err == nil {
			// Phase 13: Verificação de Pedágio (Wallet Billing)
			if tnt.BillingPlan == tenant.PlanPrePaid && tnt.WalletBalance <= 0 {
				h.logger.Warn("tenant out of credits, dropping incoming message",
					zap.String("waba_id", wabaID),
					zap.Float64("balance", tnt.WalletBalance),
				)
				return c.SendStatus(fiber.StatusOK) // Dropar silenciosamente
			}

			// Debitar R$ 0,02 e logar recebimento
			go func(tid uuid.UUID, mid string, billingPlan string, messagePrice float64) {
				if billingPlan == tenant.PlanPrePaid {
					_ = h.tenantRepo.DeductWalletBalance(context.Background(), tid, messagePrice)
				}
				if h.logRepo != nil {
					h.logRepo.Save(context.Background(), &tenant.MessageLog{
						TenantID:  tid,
						Direction: tenant.DirectionIn,
						MessageID: mid,
						Status:    "RECEIVED",
					})
				}
			}(tnt.ID, wamid, tnt.BillingPlan, tnt.MessagePrice)
		}
	}

	// 2. Inbox Pattern - persistir RAW
	event := &inbox.InboxEvent{
		ID:                uuid.New(),
		Source:            "whatsapp",
		ProviderMessageID: wamid,
		Payload:           c.Body(),
		Processed:         false,
	}

	if err := h.inboxRepo.Store(c.Context(), event); err != nil {
		// Provavelmente duplicado (UNIQUE constraint)
		h.logger.Debug("inbox store failed (likely duplicate)",
			zap.String("wamid", wamid),
			zap.Error(err),
		)
		return c.SendStatus(fiber.StatusOK)
	}

	// 3. Publicar no RabbitMQ (async)
	go func() {
		message, _ := json.Marshal(map[string]interface{}{
			"inbox_id": event.ID.String(),
			"wamid":    wamid,
		})

		if err := h.rabbitMQ.Publish(context.Background(),
			"",                  // Exchange (default)
			"whatsapp.messages", // Routing Key (queue name)
			message,
		); err != nil {
			h.logger.Error("failed to publish to rabbitmq",
				zap.String("inbox_id", event.ID.String()),
				zap.Error(err),
			)
		}
	}()

	// 4. ACK imediato
	duration := time.Since(startTime)
	h.logger.Debug("webhook processed",
		zap.String("wamid", wamid),
		zap.Duration("duration", duration),
	)

	return c.SendStatus(fiber.StatusOK)
}

// extractWAMID extrai o ID único da mensagem do WhatsApp
func extractWAMID(payload map[string]interface{}) string {
	entry, ok := payload["entry"].([]interface{})
	if !ok || len(entry) == 0 {
		return ""
	}

	changes, ok := entry[0].(map[string]interface{})["changes"].([]interface{})
	if !ok || len(changes) == 0 {
		return ""
	}

	value, ok := changes[0].(map[string]interface{})["value"].(map[string]interface{})
	if !ok {
		return ""
	}

	messages, ok := value["messages"].([]interface{})
	if !ok || len(messages) == 0 {
		return ""
	}

	message, ok := messages[0].(map[string]interface{})
	if !ok {
		return ""
	}

	wamid, _ := message["id"].(string)
	return wamid
}

// extractWabaID extrai o Telefone Comercial ID (WABA) que originou a recepção
func extractWabaID(payload map[string]interface{}) string {
	entry, ok := payload["entry"].([]interface{})
	if !ok || len(entry) == 0 {
		return ""
	}

	changes, ok := entry[0].(map[string]interface{})["changes"].([]interface{})
	if !ok || len(changes) == 0 {
		return ""
	}

	value, ok := changes[0].(map[string]interface{})["value"].(map[string]interface{})
	if !ok {
		return ""
	}

	metadata, ok := value["metadata"].(map[string]interface{})
	if !ok {
		return ""
	}

	// Prioriza phone_number_id (ID oficial do número na Meta Cloud API).
	// fallback para display_phone_number por compatibilidade.
	wabaID, _ := metadata["phone_number_id"].(string)
	if wabaID == "" {
		wabaID, _ = metadata["display_phone_number"].(string)
	}
	return wabaID
}
