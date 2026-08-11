package deliveryrealtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestEventConsumerProjectsAndDeduplicates(t *testing.T) {
	hub := NewHub()
	scope := Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	client := &fakeClient{scope: scope, queue: make(chan []byte, 2)}
	require.NoError(t, hub.Register(client))
	consumer := NewEventConsumer(hub, zap.NewNop())

	envelope := deliveryevent.Envelope{Version: 1, EventID: "evt-1", EventType: deliveryevent.EventStatusChanged,
		TenantID: scope.TenantID, DeliveryID: scope.DeliveryID,
		OccurredAt: time.Now(), Data: json.RawMessage(`{"status":"IN_TRANSIT","phone":"never-public"}`)}
	body, err := json.Marshal(envelope)
	require.NoError(t, err)
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.NoError(t, consumer.Handle(context.Background(), body))
	require.Len(t, client.queue, 1)

	var projected map[string]interface{}
	require.NoError(t, json.Unmarshal(<-client.queue, &projected))
	require.NotContains(t, projected, "phone")
}
