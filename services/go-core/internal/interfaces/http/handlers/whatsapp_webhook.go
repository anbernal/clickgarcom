package handlers

import (
    "encoding/json"
    "time"

    "github.com/gofiber/fiber/v2"
    "github.com/google/uuid"
    "go.uber.org/zap"

    "github.com/anbernal11041983/clickgarcom/internal/domain/inbox"
)

type WhatsAppWebhookHandler struct {
    inboxRepo inbox.Repository
    rabbitMQ  RabbitMQPublisher
    logger    *zap.Logger
}

type RabbitMQPublisher interface {
    Publish(exchange, routingKey string, body []byte) error
}

func NewWhatsAppWebhookHandler(
    inboxRepo inbox.Repository,
    rabbitMQ RabbitMQPublisher,
    logger *zap.Logger,
) *WhatsAppWebhookHandler {
    return &WhatsAppWebhookHandler{
        inboxRepo: inboxRepo,
        rabbitMQ:  rabbitMQ,
        logger:    logger,
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
    
    // 1. Extrair wamid para idempotência
    var payload map[string]interface{}
    if err := json.Unmarshal(c.Body(), &payload); err != nil {
        h.logger.Error("failed to parse webhook payload", zap.Error(err))
        return c.SendStatus(fiber.StatusOK) // ACK mesmo com erro de parse
    }
    
    wamid := extractWAMID(payload)
    if wamid == "" {
        h.logger.Warn("webhook without wamid, skipping")
        return c.SendStatus(fiber.StatusOK)
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
        
        if err := h.rabbitMQ.Publish(
            "clickgarcom.events",
            "whatsapp.message.received",
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