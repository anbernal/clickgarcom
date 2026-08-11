// Package deliverynotification contains the Core-side fulfillment event
// consumer. It converts only an explicit notification projection into the
// existing notifications.send contract.
package deliverynotification

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	domain "github.com/anbernal/clickgarcom/internal/domain/deliveryfulfillment"
	request "github.com/anbernal/clickgarcom/internal/domain/deliverynotification"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
	"go.uber.org/zap"
)

type NotificationPublisher interface {
	Publish(context.Context, request.Request) error
}

type NotificationPublisherFunc func(context.Context, request.Request) error

func (f NotificationPublisherFunc) Publish(ctx context.Context, r request.Request) error {
	return f(ctx, r)
}

type FulfillmentEventConsumer struct {
	publisher NotificationPublisher
	logger    *zap.Logger
	mu        sync.Mutex
	seen      map[string]struct{}
	order     []string
	maxSeen   int
}

func NewFulfillmentEventConsumer(publisher NotificationPublisher, logger *zap.Logger) *FulfillmentEventConsumer {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &FulfillmentEventConsumer{publisher: publisher, logger: logger, seen: make(map[string]struct{}), maxSeen: 4096}
}

func (c *FulfillmentEventConsumer) Handle(ctx context.Context, body []byte) error {
	started := time.Now()
	eventType := "unknown"
	observe := func(outcome string) {
		metrics.ObserveDeliveryFulfillmentEvent(eventType, outcome, time.Since(started).Seconds())
	}
	if c == nil || c.publisher == nil {
		observe("error")
		return fmt.Errorf("delivery fulfillment notification publisher is not configured")
	}
	var event domain.Envelope
	if err := json.Unmarshal(body, &event); err != nil {
		observe("invalid")
		return fmt.Errorf("decode delivery fulfillment event: %w", err)
	}
	if domain.IsSupported(event.Kind()) {
		eventType = string(event.Kind())
	}
	if err := event.Validate(); err != nil {
		observe("invalid")
		return err
	}
	request, ok, err := event.Notification()
	if err != nil {
		observe("error")
		return err
	}
	if !ok {
		observe("ignored")
		return nil
	}

	// Hold the small in-memory dedupe lock through publishing. A failed
	// publish is deliberately not remembered, so RabbitMQ can retry safely.
	c.mu.Lock()
	if _, duplicate := c.seen[event.EventID]; duplicate {
		c.mu.Unlock()
		observe("duplicate")
		return nil
	}
	if err := c.publisher.Publish(ctx, request); err != nil {
		c.mu.Unlock()
		observe("error")
		return err
	}
	c.seen[event.EventID] = struct{}{}
	c.order = append(c.order, event.EventID)
	if len(c.order) > c.maxSeen {
		delete(c.seen, c.order[0])
		c.order = c.order[1:]
	}
	c.mu.Unlock()

	c.logger.Debug("delivery fulfillment notification projected",
		zap.String("event_id", request.EventID),
		zap.String("tenant_id", request.TenantID.String()),
		zap.String("delivery_id", request.DeliveryID.String()),
		zap.String("milestone", string(request.Milestone)),
	)
	observe("success")
	return nil
}
