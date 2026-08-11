package deliveryrealtime

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"go.uber.org/zap"
)

// EventConsumer adapts the RabbitMQ delivery.realtime.events payload to the
// isolated hub. It has the same signature as the existing queue consumer and
// can therefore be registered without coupling to NestJS internals.
type EventConsumer struct {
	hub    *Hub
	logger *zap.Logger
}

func NewEventConsumer(hub *Hub, logger *zap.Logger) *EventConsumer {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &EventConsumer{hub: hub, logger: logger}
}

func (c *EventConsumer) Handle(_ context.Context, body []byte) error {
	if c == nil || c.hub == nil {
		return fmt.Errorf("delivery realtime hub is not configured")
	}
	var envelope deliveryevent.Envelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return fmt.Errorf("decode delivery realtime event: %w", err)
	}
	publicEvent, err := deliveryevent.ProjectPublic(envelope)
	if err != nil {
		return fmt.Errorf("validate delivery realtime event: %w", err)
	}
	sent, duplicate, err := c.hub.Broadcast(publicEvent)
	if err != nil {
		return err
	}
	c.logger.Debug("delivery realtime event projected",
		zap.String("event_id", publicEvent.EventID),
		zap.String("event_type", string(publicEvent.Type)),
		zap.String("tenant_id", publicEvent.TenantID.String()),
		zap.String("delivery_id", publicEvent.DeliveryID.String()),
		zap.Int("clients", sent),
		zap.Bool("duplicate", duplicate),
	)
	if publicEvent.Type == deliveryevent.EventTrackingEnded || publicEvent.Type == deliveryevent.EventCompleted {
		c.hub.CloseRoom(Scope{TenantID: publicEvent.TenantID, DeliveryID: publicEvent.DeliveryID})
	}
	return nil
}
