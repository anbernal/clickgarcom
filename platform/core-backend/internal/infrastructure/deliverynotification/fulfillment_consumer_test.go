package deliverynotification

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	domain "github.com/anbernal/clickgarcom/internal/domain/deliveryfulfillment"
	request "github.com/anbernal/clickgarcom/internal/domain/deliverynotification"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

type notificationPublisherSpy struct {
	requests []request.Request
	err      error
}

func (s *notificationPublisherSpy) Publish(_ context.Context, notification request.Request) error {
	if s.err != nil {
		return s.err
	}
	s.requests = append(s.requests, notification)
	return nil
}

func TestFulfillmentConsumerDeduplicatesEventID(t *testing.T) {
	spy := &notificationPublisherSpy{}
	consumer := NewFulfillmentEventConsumer(spy, zap.NewNop())
	body := eventBody(t, domain.EventProviderAssigned, domain.NotificationData{Recipient: "5511999999999", DisplayCode: "A123"})
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.Len(t, spy.requests, 1)
	require.Equal(t, request.MilestoneSearchingCourier, spy.requests[0].Milestone)
}

func TestFulfillmentConsumerDoesNotRememberFailedPublish(t *testing.T) {
	spy := &notificationPublisherSpy{err: errors.New("temporary")}
	consumer := NewFulfillmentEventConsumer(spy, zap.NewNop())
	body := eventBody(t, domain.EventCycleExhausted, domain.NotificationData{Recipient: "5511999999999"})
	require.Error(t, consumer.Handle(context.Background(), body))
	spy.err = nil
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.Len(t, spy.requests, 1)
}

func TestFulfillmentConsumerIgnoresEventsWithoutNotificationProjection(t *testing.T) {
	spy := &notificationPublisherSpy{}
	consumer := NewFulfillmentEventConsumer(spy, zap.NewNop())
	body := eventBody(t, domain.EventQuoteCreated, domain.NotificationData{})
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.Empty(t, spy.requests)
}

func eventBody(t *testing.T, eventType domain.EventType, data domain.NotificationData) []byte {
	t.Helper()
	event := domain.Envelope{
		Version: domain.CurrentVersion, EventID: uuid.NewString(), Type: eventType,
		TenantID: uuid.New(), AggregateID: uuid.New(), OccurredAt: time.Now().UTC(),
	}
	event.Data, _ = json.Marshal(data)
	body, err := json.Marshal(event)
	require.NoError(t, err)
	return body
}
