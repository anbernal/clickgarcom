package handlers

import (
	"encoding/json"

	"github.com/anbernal/clickgarcom/internal/infrastructure/websocket"
	"github.com/gofiber/fiber/v2"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebSocketHandler gerencia conexões WebSocket para o KDS
type WebSocketHandler struct {
	hub    *websocket.Hub
	logger *zap.Logger
}

// NewWebSocketHandler cria um novo handler WebSocket
func NewWebSocketHandler(hub *websocket.Hub, logger *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{
		hub:    hub,
		logger: logger,
	}
}

// HandleKDS gerencia a conexão WebSocket do KDS
// GET /ws/kds?tenant_id=xxx
func (h *WebSocketHandler) HandleKDS(c *fiber.Ctx) error {
	// Validar tenant_id antes do upgrade
	tenantIDStr := c.Query("tenant_id")
	if tenantIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "tenant_id is required",
		})
	}

	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid tenant_id format",
		})
	}

	// TODO: Validar se tenant existe no banco de dados
	// tenantRepo.FindByID(ctx, tenantID)

	// Verificar se é uma requisição de upgrade WebSocket
	if fiberws.IsWebSocketUpgrade(c) {
		c.Locals("tenant_id", tenantID)
		return c.Next()
	}

	return c.Status(fiber.StatusUpgradeRequired).JSON(fiber.Map{
		"error": "websocket upgrade required",
	})
}

// HandleKDSConnection gerencia a conexão WebSocket do KDS
func (h *WebSocketHandler) HandleKDSConnection(c *fiberws.Conn) {
	// Recuperar tenant_id dos locals
	tenantID := c.Locals("tenant_id").(uuid.UUID)

	// Criar e registrar cliente
	client := websocket.NewFiberClient(h.hub, c, tenantID)
	h.hub.Register(client)

	h.logger.Info("websocket client connected",
		zap.String("tenant_id", tenantID.String()),
		zap.Int("total_clients", h.hub.GetClientCount()),
	)

	// Enviar mensagem de boas-vindas
	welcomeMsg := map[string]interface{}{
		"type":      "connected",
		"message":   "Connected to KDS WebSocket",
		"tenant_id": tenantID.String(),
	}
	if data, err := json.Marshal(welcomeMsg); err == nil {
		client.SendMessage(data)
	}

	// Iniciar pumps (leitura e escrita)
	client.Start()
}
