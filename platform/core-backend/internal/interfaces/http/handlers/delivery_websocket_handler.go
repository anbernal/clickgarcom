package handlers

import (
	"net/url"
	"strings"

	"github.com/anbernal/clickgarcom/internal/infrastructure/deliveryrealtime"
	"github.com/gofiber/fiber/v2"
	fiberws "github.com/gofiber/websocket/v2"
	"go.uber.org/zap"
)

// DeliveryAuthorizer validates a tracking credential and returns the exact
// room scope. It is intentionally injected: Core Go does not own the Delivery
// credential tables, so NestJS can provide this contract without sharing its
// persistence implementation.
type DeliveryAuthorizer interface {
	AuthorizeDelivery(*fiber.Ctx) (deliveryrealtime.Scope, error)
}

type DeliveryAuthorizerFunc func(*fiber.Ctx) (deliveryrealtime.Scope, error)

func (f DeliveryAuthorizerFunc) AuthorizeDelivery(c *fiber.Ctx) (deliveryrealtime.Scope, error) {
	return f(c)
}

type DeliveryWebSocketHandler struct {
	hub        *deliveryrealtime.Hub
	authorizer DeliveryAuthorizer
	logger     *zap.Logger
}

func NewDeliveryWebSocketHandler(hub *deliveryrealtime.Hub, authorizer DeliveryAuthorizer, logger *zap.Logger) *DeliveryWebSocketHandler {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryWebSocketHandler{hub: hub, authorizer: authorizer, logger: logger}
}

// Authorize runs before the WebSocket upgrade. A nil authorizer denies all
// connections, preventing an accidentally exposed unauthenticated room while
// the NestJS credential endpoint is being integrated.
func (h *DeliveryWebSocketHandler) Authorize(c *fiber.Ctx) error {
	if !sameDeliveryOrigin(c) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "invalid websocket origin"})
	}
	if !fiberws.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}
	if h == nil || h.authorizer == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "delivery tracking unavailable"})
	}
	scope, err := h.authorizer.AuthorizeDelivery(c)
	if err != nil || !scope.Valid() {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid delivery tracking credential"})
	}
	c.Locals("delivery_scope", scope)
	return c.Next()
}

func (h *DeliveryWebSocketHandler) HandleConnection(c *fiberws.Conn) {
	if h == nil || h.hub == nil {
		_ = c.Close()
		return
	}
	scope, ok := c.Locals("delivery_scope").(deliveryrealtime.Scope)
	if !ok || !scope.Valid() {
		_ = c.Close()
		return
	}
	client := deliveryrealtime.NewFiberClient(h.hub, c, scope)
	if err := h.hub.Register(client); err != nil {
		_ = c.Close()
		return
	}
	h.logger.Info("delivery tracking websocket connected",
		zap.String("tenant_id", scope.TenantID.String()),
		zap.String("delivery_id", scope.DeliveryID.String()),
	)
	client.Start()
}

func sameDeliveryOrigin(c *fiber.Ctx) bool {
	raw := strings.TrimSpace(c.Get("Origin"))
	if raw == "" {
		return false
	}
	origin, err := url.Parse(raw)
	return err == nil && strings.EqualFold(origin.Hostname(), c.Hostname())
}
