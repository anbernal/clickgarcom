package deliveryrealtime

import (
	"testing"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHubLoadProjection100Deliveries(t *testing.T) {
	hub := NewHub()
	tenant := uuid.New()
	clients := make([]*fakeClient, 100)
	for i := range clients {
		scope := Scope{TenantID: tenant, DeliveryID: uuid.New()}
		clients[i] = &fakeClient{scope: scope, queue: make(chan []byte, 8)}
		require.NoError(t, hub.Register(clients[i]))
	}
	started := time.Now()
	for i, client := range clients {
		for n := 0; n < 5; n++ {
			_, _, err := hub.Broadcast(deliveryevent.PublicEvent{
				Version: 1, EventID: client.scope.DeliveryID.String() + "-" + string(rune('a'+n)),
				Type: deliveryevent.EventLocationUpdate, TenantID: tenant, DeliveryID: client.scope.DeliveryID,
				OccurredAt: started.Add(time.Duration(i*5+n) * time.Millisecond),
			})
			require.NoError(t, err)
		}
	}
	require.Equal(t, 100, hub.Stats().Connections)
	for _, client := range clients {
		require.Len(t, client.queue, 5)
	}
}

func BenchmarkHubBroadcast(b *testing.B) {
	hub := NewHub()
	scope := Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	client := &fakeClient{scope: scope, queue: make(chan []byte, b.N+1)}
	require.NoError(b, hub.Register(client))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = hub.Broadcast(deliveryevent.PublicEvent{
			Version: 1, EventID: uuid.NewString(), Type: deliveryevent.EventLocationUpdate,
			TenantID: scope.TenantID, DeliveryID: scope.DeliveryID, OccurredAt: time.Now(),
		})
	}
}
