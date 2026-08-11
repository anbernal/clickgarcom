package deliveryrealtime

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeClient struct {
	scope   Scope
	queue   chan []byte
	closed  bool
	blocked bool
}

func (f *fakeClient) Scope() Scope { return f.scope }
func (f *fakeClient) Send(data []byte) bool {
	if f.blocked || f.closed {
		return false
	}
	select {
	case f.queue <- data:
		return true
	default:
		return false
	}
}
func (f *fakeClient) Close() error { f.closed = true; return nil }

func TestHubBroadcastIsolatedByDelivery(t *testing.T) {
	hub := NewHub()
	tenant := uuid.New()
	deliveryA, deliveryB := uuid.New(), uuid.New()
	a := &fakeClient{scope: Scope{TenantID: tenant, DeliveryID: deliveryA}, queue: make(chan []byte, 2)}
	b := &fakeClient{scope: Scope{TenantID: tenant, DeliveryID: deliveryB}, queue: make(chan []byte, 2)}
	require.NoError(t, hub.Register(a))
	require.NoError(t, hub.Register(b))

	e := deliveryevent.PublicEvent{Version: 1, EventID: "evt-1", Type: deliveryevent.EventLocationUpdate,
		TenantID: tenant, DeliveryID: deliveryA, OccurredAt: time.Now()}
	sent, duplicate, err := hub.Broadcast(e)
	require.NoError(t, err)
	require.False(t, duplicate)
	require.Equal(t, 1, sent)
	require.Len(t, a.queue, 1)
	require.Len(t, b.queue, 0)

	var got deliveryevent.PublicEvent
	require.NoError(t, json.Unmarshal(<-a.queue, &got))
	require.Equal(t, deliveryA, got.DeliveryID)
}

func TestHubDeduplicatesAndRemovesSlowClient(t *testing.T) {
	hub := NewHub()
	scope := Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	slow := &fakeClient{scope: scope, queue: make(chan []byte), blocked: true}
	require.NoError(t, hub.Register(slow))
	e := deliveryevent.PublicEvent{Version: 1, EventID: "evt-1", Type: deliveryevent.EventStatusChanged,
		TenantID: scope.TenantID, DeliveryID: scope.DeliveryID, OccurredAt: time.Now()}
	sent, duplicate, err := hub.Broadcast(e)
	require.NoError(t, err)
	require.False(t, duplicate)
	require.Equal(t, 0, sent)
	require.True(t, slow.closed)
	require.Equal(t, 0, hub.ClientCount())

	_, duplicate, err = hub.Broadcast(e)
	require.NoError(t, err)
	require.True(t, duplicate)
}

func TestHubCloseRoomClosesOnlyTargetDelivery(t *testing.T) {
	hub := NewHub()
	tenant := uuid.New()
	scopeA := Scope{TenantID: tenant, DeliveryID: uuid.New()}
	scopeB := Scope{TenantID: tenant, DeliveryID: uuid.New()}
	a := &fakeClient{scope: scopeA, queue: make(chan []byte, 1)}
	b := &fakeClient{scope: scopeB, queue: make(chan []byte, 1)}
	require.NoError(t, hub.Register(a))
	require.NoError(t, hub.Register(b))
	hub.CloseRoom(scopeA)
	require.True(t, a.closed)
	require.False(t, b.closed)
	require.Equal(t, 0, hub.RoomClientCount(scopeA))
	require.Equal(t, 1, hub.RoomClientCount(scopeB))
}
