package handlers

import (
	"context"
	"encoding/json"
	"strings"
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

	// 1. Extrair wamid para idempotência e metadata do número para billing/tracking
	var payload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &payload); err != nil {
		h.logger.Error("failed to parse webhook payload", zap.Error(err))
		return c.SendStatus(fiber.StatusOK) // ACK mesmo com erro de parse
	}

	wamid := extractWAMID(payload)
	phoneNumberID, displayPhoneNumber := extractPhoneNumberMetadata(payload)

	if wamid == "" {
		h.logger.Warn("webhook without wamid, skipping")
		return c.SendStatus(fiber.StatusOK)
	}

	var resolvedTenant *tenant.Tenant
	if h.tenantRepo != nil {
		resolvedTenant = h.resolveTenantForBilling(c.Context(), phoneNumberID, displayPhoneNumber)
	}

	if resolvedTenant != nil && resolvedTenant.BillingPlan == tenant.PlanPrePaid && resolvedTenant.WalletBalance <= 0 {
		h.logger.Warn("tenant out of credits, dropping incoming message",
			zap.String("tenant_id", resolvedTenant.ID.String()),
			zap.String("phone_number_id", phoneNumberID),
			zap.String("display_phone_number", displayPhoneNumber),
			zap.Float64("balance", resolvedTenant.WalletBalance),
		)
		return c.SendStatus(fiber.StatusOK) // Dropar silenciosamente
	}

	// 2. Inbox Pattern - persistir RAW
	event := &inbox.InboxEvent{
		ID:                uuid.New(),
		Source:            "whatsapp",
		ProviderMessageID: wamid,
		Payload:           c.Body(),
		Processed:         false,
	}

	if resolvedTenant != nil {
		event.TenantID = &resolvedTenant.ID
	}

	if err := h.inboxRepo.Store(c.Context(), event); err != nil {
		// Provavelmente duplicado (UNIQUE constraint)
		h.logger.Debug("inbox store failed (likely duplicate)",
			zap.String("wamid", wamid),
			zap.Error(err),
		)
		return c.SendStatus(fiber.StatusOK)
	}

	if resolvedTenant != nil {
		userPhone, messagePreview := extractInboundBillingDetails(payload)

		go func(tid uuid.UUID, mid string, billingPlan string, messagePrice float64) {
			if billingPlan == tenant.PlanPrePaid {
				_ = h.tenantRepo.DeductWalletBalance(context.Background(), tid, messagePrice)
			}
			if h.logRepo != nil {
				_ = h.logRepo.Save(context.Background(), &tenant.MessageLog{
					TenantID:       tid,
					Direction:      tenant.DirectionIn,
					MessageID:      mid,
					Status:         "RECEIVED",
					UserPhone:      userPhone,
					MessagePreview: messagePreview,
				})
			}
		}(resolvedTenant.ID, wamid, resolvedTenant.BillingPlan, resolvedTenant.MessagePrice)
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

// extractPhoneNumberMetadata extrai os metadados do número comercial que recebeu a mensagem.
func extractPhoneNumberMetadata(payload map[string]interface{}) (string, string) {
	entry, ok := payload["entry"].([]interface{})
	if !ok || len(entry) == 0 {
		return "", ""
	}

	changes, ok := entry[0].(map[string]interface{})["changes"].([]interface{})
	if !ok || len(changes) == 0 {
		return "", ""
	}

	value, ok := changes[0].(map[string]interface{})["value"].(map[string]interface{})
	if !ok {
		return "", ""
	}

	metadata, ok := value["metadata"].(map[string]interface{})
	if !ok {
		return "", ""
	}

	phoneNumberID, _ := metadata["phone_number_id"].(string)
	displayPhoneNumber, _ := metadata["display_phone_number"].(string)
	return phoneNumberID, displayPhoneNumber
}

func extractInboundBillingDetails(payload map[string]interface{}) (string, string) {
	entry, ok := payload["entry"].([]interface{})
	if !ok || len(entry) == 0 {
		return "", ""
	}

	changes, ok := entry[0].(map[string]interface{})["changes"].([]interface{})
	if !ok || len(changes) == 0 {
		return "", ""
	}

	value, ok := changes[0].(map[string]interface{})["value"].(map[string]interface{})
	if !ok {
		return "", ""
	}

	messages, ok := value["messages"].([]interface{})
	if !ok || len(messages) == 0 {
		return "", ""
	}

	message, ok := messages[0].(map[string]interface{})
	if !ok {
		return "", ""
	}

	userPhone, _ := message["from"].(string)
	return strings.TrimSpace(userPhone), sanitizeInboundPreview(message)
}

func sanitizeInboundPreview(message map[string]interface{}) string {
	candidates := []string{
		lookupNestedString(message, "text", "body"),
		lookupNestedString(message, "interactive", "button_reply", "title"),
		lookupNestedString(message, "interactive", "list_reply", "title"),
		lookupNestedString(message, "interactive", "list_reply", "description"),
	}

	for _, candidate := range candidates {
		normalized := normalizeInboundPreview(candidate)
		if normalized != "" {
			return normalized
		}
	}

	msgType, _ := message["type"].(string)
	if normalized := normalizeInboundPreview(msgType); normalized != "" {
		return normalized
	}

	return ""
}

func lookupNestedString(source map[string]interface{}, keys ...string) string {
	var current interface{} = source

	for _, key := range keys {
		mapped, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}

		current, ok = mapped[key]
		if !ok {
			return ""
		}
	}

	value, _ := current.(string)
	return value
}

func normalizeInboundPreview(value string) string {
	normalized := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if normalized == "" {
		return ""
	}

	runes := []rune(normalized)
	if len(runes) > 255 {
		return string(runes[:255])
	}

	return normalized
}

func (h *WhatsAppWebhookHandler) resolveTenantForBilling(ctx context.Context, phoneNumberID, displayPhoneNumber string) *tenant.Tenant {
	if h.tenantRepo == nil {
		return nil
	}

	if phoneNumberID != "" {
		if tnt, err := h.tenantRepo.FindByWabaID(ctx, phoneNumberID); err == nil {
			return tnt
		}
	}

	if displayPhoneNumber != "" {
		if tnt, err := h.tenantRepo.FindByWhatsAppNumber(ctx, displayPhoneNumber); err == nil {
			return tnt
		}
	}

	return nil
}
