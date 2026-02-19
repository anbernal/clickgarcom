package websocket

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/events"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// MockClient implementation for testing
type MockClient struct {
	TenantID    uuid.UUID
	SendChannel chan []byte
}

func NewMockClient(tenantID uuid.UUID) *MockClient {
	return &MockClient{
		TenantID:    tenantID,
		SendChannel: make(chan []byte, 10), // Buffer to avoid blocking in simple tests
	}
}

func (m *MockClient) GetTenantID() uuid.UUID {
	return m.TenantID
}

func (m *MockClient) GetSendChannel() chan []byte {
	return m.SendChannel
}

func TestHub_Register(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	tenantID := uuid.New()
	client := NewMockClient(tenantID)

	hub.Register(client)

	// Give some time for the channel to be processed
	time.Sleep(50 * time.Millisecond)

	assert.Equal(t, 1, hub.GetClientCount())
	assert.Equal(t, 1, hub.GetTenantClientCount(tenantID))
}

func TestHub_Unregister(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	tenantID := uuid.New()
	client := NewMockClient(tenantID)

	hub.Register(client)
	time.Sleep(20 * time.Millisecond)

	hub.Unregister(client)
	time.Sleep(20 * time.Millisecond)

	assert.Equal(t, 0, hub.GetClientCount())
	assert.Equal(t, 0, hub.GetTenantClientCount(tenantID))
}

func TestHub_BroadcastToTenant(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	tenant1 := uuid.New()
	tenant2 := uuid.New()

	client1 := NewMockClient(tenant1)
	client2 := NewMockClient(tenant1)
	client3 := NewMockClient(tenant2)

	hub.Register(client1)
	hub.Register(client2)
	hub.Register(client3)
	time.Sleep(50 * time.Millisecond)

	event := &events.OrderEvent{
		Type: events.EventOrderCreated,
		Data: &order.Order{ID: uuid.New(), TenantID: tenant1, Status: order.StatusPending},
	}

	hub.BroadcastToTenant(tenant1, event)
	time.Sleep(50 * time.Millisecond)

	// Verify client 1 received
	select {
	case msg := <-client1.SendChannel:
		var received events.OrderEvent
		err := json.Unmarshal(msg, &received)
		assert.NoError(t, err)
		assert.Equal(t, events.EventOrderCreated, received.Type)
	default:
		t.Error("Client 1 should have received a message")
	}

	// Verify client 2 received
	select {
	case msg := <-client2.SendChannel:
		var received events.OrderEvent
		err := json.Unmarshal(msg, &received)
		assert.NoError(t, err)
	default:
		t.Error("Client 2 should have received a message")
	}

	// Verify client 3 did NOT receive
	select {
	case <-client3.SendChannel:
		t.Error("Client 3 (different tenant) should not satisfy receiving a message")
	default:
		// OK
	}
}

func TestHub_Concurrency(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	var wg sync.WaitGroup
	tenantID := uuid.New()
	clientCount := 100

	// Concurrent Registration
	for i := 0; i < clientCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client := NewMockClient(tenantID)
			hub.Register(client)
			// Small sleep to simulate some work/interleaving
			time.Sleep(time.Millisecond)
			hub.BroadcastToTenant(tenantID, &events.OrderEvent{
				Type: events.EventOrderUpdated,
				Data: &order.Order{ID: uuid.New(), TenantID: tenantID},
			})
			time.Sleep(time.Millisecond)
			hub.Unregister(client)
		}()
	}

	// Concurrent Broadcasts from outside
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			hub.BroadcastToTenant(tenantID, &events.OrderEvent{
				Type: events.EventOrderCreated,
				Data: &order.Order{ID: uuid.New(), TenantID: tenantID},
			})
		}()
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	// At the end, count should be 0 because everyone unregistered
	assert.Equal(t, 0, hub.GetClientCount())
}
