package handlers

import (
	"errors"
	"strings"

	"github.com/anbernal/clickgarcom/internal/infrastructure/deliveryrealtime"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DriverLocationAuthorizer is the assignment/state boundary owned by the
// Delivery service. It must verify the authenticated DRIVER is the currently
// assigned driver and that the delivery accepts location updates.
type DriverLocationAuthorizer interface {
	AuthorizeDriverLocation(*fiber.Ctx, uuid.UUID) (deliveryrealtime.Scope, error)
}

type DriverLocationAuthorizerFunc func(*fiber.Ctx, uuid.UUID) (deliveryrealtime.Scope, error)

func (f DriverLocationAuthorizerFunc) AuthorizeDriverLocation(c *fiber.Ctx, deliveryID uuid.UUID) (deliveryrealtime.Scope, error) {
	return f(c, deliveryID)
}

type DeliveryLocationHandler struct {
	ingestor   *deliveryrealtime.LocationIngestor
	authorizer DriverLocationAuthorizer
	logger     *zap.Logger
}

func NewDeliveryLocationHandler(ingestor *deliveryrealtime.LocationIngestor, authorizer DriverLocationAuthorizer, logger *zap.Logger) *DeliveryLocationHandler {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryLocationHandler{ingestor: ingestor, authorizer: authorizer, logger: logger}
}

// Ingest accepts POST /delivery/driver/deliveries/:deliveryId/locations. The
// route is not registered by default because Core Go does not own driver JWT
// assignment persistence; callers must inject an authorizer before wiring it.
func (h *DeliveryLocationHandler) Ingest(c *fiber.Ctx) error {
	if h == nil || h.ingestor == nil || h.authorizer == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "driver location ingestion unavailable"})
	}
	deliveryID, err := uuid.Parse(strings.TrimSpace(c.Params("deliveryId")))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid delivery id"})
	}
	scope, err := h.authorizer.AuthorizeDriverLocation(c, deliveryID)
	if err != nil || !scope.Valid() || scope.DeliveryID != deliveryID {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "driver is not assigned to delivery"})
	}
	var point deliveryrealtime.LocationPoint
	if err := c.BodyParser(&point); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid location payload"})
	}
	event, err := h.ingestor.Ingest(c.Context(), scope, point)
	if err != nil {
		status := fiber.StatusUnprocessableEntity
		if errors.Is(err, deliveryrealtime.ErrStaleLocation) {
			status = fiber.StatusConflict
		}
		h.logger.Debug("delivery location rejected", zap.Error(err), zap.String("delivery_id", deliveryID.String()))
		return c.Status(status).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusAccepted).JSON(event)
}

type DeliveryLatestLocationHandler struct {
	hub        *deliveryrealtime.Hub
	authorizer DeliveryAuthorizer
}

func NewDeliveryLatestLocationHandler(hub *deliveryrealtime.Hub, authorizer DeliveryAuthorizer) *DeliveryLatestLocationHandler {
	return &DeliveryLatestLocationHandler{hub: hub, authorizer: authorizer}
}

// Get returns only the latest allowlisted location projection. The tracking
// credential authorizer must enforce the same tenant+delivery scope as WSS.
func (h *DeliveryLatestLocationHandler) Get(c *fiber.Ctx) error {
	if h == nil || h.hub == nil || h.authorizer == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "delivery tracking unavailable"})
	}
	scope, err := h.authorizer.AuthorizeDelivery(c)
	if err != nil || !scope.Valid() {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid delivery tracking credential"})
	}
	event, ok := h.hub.Latest(scope)
	if !ok || event.Data.Location == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "latest location unavailable"})
	}
	return c.JSON(fiber.Map{
		"delivery_id": event.DeliveryID,
		"occurred_at": event.OccurredAt,
		"location":    event.Data.Location,
		"stale":       event.Data.Stale,
	})
}
