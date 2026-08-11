// Package deliveryrealtime is an isolated realtime projection for customer
// delivery tracking. It must not share the tenant-wide KDS hub: a tracking
// credential is scoped to exactly one delivery room.
package deliveryrealtime

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
	"github.com/google/uuid"
)

var (
	ErrInvalidScope = errors.New("delivery websocket scope is invalid")
	ErrInvalidEvent = errors.New("delivery realtime event is invalid")
)

type Scope struct {
	TenantID   uuid.UUID
	DeliveryID uuid.UUID
}

func (s Scope) Valid() bool {
	return s.TenantID != uuid.Nil && s.DeliveryID != uuid.Nil
}

func RoomKey(scope Scope) string {
	return scope.TenantID.String() + ":" + scope.DeliveryID.String()
}

// Client is intentionally small so hub tests do not require a network socket.
// Send must be non-blocking and return false when the client cannot keep up.
type Client interface {
	Scope() Scope
	Send([]byte) bool
	Close() error
}

type Hub struct {
	mu             sync.RWMutex
	rooms          map[string]map[Client]struct{}
	latest         map[string]deliveryevent.PublicEvent
	latestLocation map[string]deliveryevent.PublicEvent
	// seen is a bounded per-room event-id set. It protects against RabbitMQ
	// redelivery while allowing out-of-order events to pass through.
	seen           map[string]map[string]struct{}
	maxSeenPerRoom int
}

type Stats struct {
	Connections     int `json:"connections"`
	Rooms           int `json:"rooms"`
	LatestLocations int `json:"latest_locations"`
}

func NewHub() *Hub {
	return &Hub{
		rooms:          make(map[string]map[Client]struct{}),
		latest:         make(map[string]deliveryevent.PublicEvent),
		latestLocation: make(map[string]deliveryevent.PublicEvent),
		seen:           make(map[string]map[string]struct{}),
		maxSeenPerRoom: 1024,
	}
}

func (h *Hub) Register(client Client) error {
	if h == nil || client == nil || !client.Scope().Valid() {
		return ErrInvalidScope
	}
	room := RoomKey(client.Scope())
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[Client]struct{})
	}
	h.rooms[room][client] = struct{}{}
	metrics.IncDeliveryTrackingConnections(client.Scope().TenantID.String(), client.Scope().DeliveryID.String())
	return nil
}

func (h *Hub) Unregister(client Client) {
	if h == nil || client == nil {
		return
	}
	room := RoomKey(client.Scope())
	h.mu.Lock()
	if clients := h.rooms[room]; clients != nil {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			metrics.DecDeliveryTrackingConnections(client.Scope().TenantID.String(), client.Scope().DeliveryID.String())
		}
		if len(clients) == 0 {
			delete(h.rooms, room)
		}
	}
	h.mu.Unlock()
}

// Broadcast projects and serializes the event once, then sends only to the
// exact tenant+delivery room. Slow clients are removed and closed so they do
// not block other viewers.
func (h *Hub) Broadcast(event deliveryevent.PublicEvent) (sent int, duplicate bool, err error) {
	if h == nil || !eventTenantDeliveryValid(event) {
		return 0, false, ErrInvalidEvent
	}
	data, err := json.Marshal(event)
	if err != nil {
		return 0, false, fmt.Errorf("marshal delivery realtime event: %w", err)
	}
	room := RoomKey(Scope{TenantID: event.TenantID, DeliveryID: event.DeliveryID})

	h.mu.Lock()
	if h.seen[room] == nil {
		h.seen[room] = make(map[string]struct{})
	}
	if _, ok := h.seen[room][event.EventID]; ok {
		h.mu.Unlock()
		return 0, true, nil
	}
	h.seen[room][event.EventID] = struct{}{}
	if previous, ok := h.latest[room]; !ok || !event.OccurredAt.Before(previous.OccurredAt) {
		h.latest[room] = event
	}
	if event.Data.Location != nil {
		if previous, ok := h.latestLocation[room]; !ok || !event.OccurredAt.Before(previous.OccurredAt) {
			h.latestLocation[room] = event
		}
	}
	if len(h.seen[room]) > h.maxSeenPerRoom {
		// Deterministic bounded memory is more important than retaining a full
		// event history; snapshots reconcile events that fall outside the set.
		for id := range h.seen[room] {
			delete(h.seen[room], id)
			break
		}
	}
	clients := make([]Client, 0, len(h.rooms[room]))
	for client := range h.rooms[room] {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		if client.Send(data) {
			sent++
			continue
		}
		h.Unregister(client)
		_ = client.Close()
		metrics.IncDeliveryRealtimeEventsDropped(event.TenantID.String(), event.DeliveryID.String())
	}
	metrics.IncDeliveryRealtimeEventsPublished(event.TenantID.String(), event.DeliveryID.String(), string(event.Type))
	return sent, false, nil
}

func (h *Hub) RoomClientCount(scope Scope) int {
	if h == nil || !scope.Valid() {
		return 0
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[RoomKey(scope)])
}

// Latest returns the most recent accepted projection for a delivery. It is
// an in-memory read model and must be reconciled with the authoritative REST
// snapshot after reconnects or process restarts.
func (h *Hub) Latest(scope Scope) (deliveryevent.PublicEvent, bool) {
	if h == nil || !scope.Valid() {
		return deliveryevent.PublicEvent{}, false
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	event, ok := h.latestLocation[RoomKey(scope)]
	return event, ok
}

func (h *Hub) ClientCount() int {
	if h == nil {
		return 0
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	total := 0
	for _, clients := range h.rooms {
		total += len(clients)
	}
	return total
}

func (h *Hub) Stats() Stats {
	if h == nil {
		return Stats{}
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	connections := 0
	for _, clients := range h.rooms {
		connections += len(clients)
	}
	return Stats{Connections: connections, Rooms: len(h.rooms), LatestLocations: len(h.latestLocation)}
}

// CloseRoom revokes all active sockets in a delivery room. Credential
// revocation handlers and terminal tracking events can call this method; it
// does not delete persisted delivery data or event dedupe state.
func (h *Hub) CloseRoom(scope Scope) {
	if h == nil || !scope.Valid() {
		return
	}
	room := RoomKey(scope)
	h.mu.Lock()
	clients := make([]Client, 0, len(h.rooms[room]))
	for client := range h.rooms[room] {
		clients = append(clients, client)
		metrics.DecDeliveryTrackingConnections(scope.TenantID.String(), scope.DeliveryID.String())
	}
	delete(h.rooms, room)
	delete(h.latest, room)
	delete(h.latestLocation, room)
	h.mu.Unlock()
	for _, client := range clients {
		_ = client.Close()
	}
}

func eventTenantDeliveryValid(event deliveryevent.PublicEvent) bool {
	return event.TenantID != uuid.Nil && event.DeliveryID != uuid.Nil && event.EventID != ""
}
