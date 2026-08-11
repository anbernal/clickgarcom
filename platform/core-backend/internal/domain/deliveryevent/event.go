// Package deliveryevent contains the versioned wire contract consumed by the
// realtime delivery projection in Core Go. The package deliberately has no
// persistence or transport dependencies so producers can live in NestJS and
// consumers can be tested without RabbitMQ.
package deliveryevent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const CurrentVersion = 1

// EventType is the stable event name used on delivery.realtime.events.
type EventType string

const (
	EventStatusChanged      EventType = "delivery.status_changed.v1"
	EventLocationUpdate     EventType = "delivery.location_updated.v1"
	EventETAUpdated         EventType = "delivery.eta_updated.v1"
	EventTrackingEnded      EventType = "delivery.tracking_ended.v1"
	EventCompleted          EventType = "delivery.completed.v1"
	EventCreated            EventType = "delivery.created.v1"
	EventAccepted           EventType = "delivery.accepted.v1"
	EventManualRequired     EventType = "delivery.manual_acceptance_required.v1"
	EventReady              EventType = "delivery.ready_for_dispatch.v1"
	EventAssigned           EventType = "delivery.assigned.v1"
	EventPickedUp           EventType = "delivery.picked_up.v1"
	EventArrived            EventType = "delivery.arrived.v1"
	EventException          EventType = "delivery.exception_opened.v1"
	EventReturned           EventType = "delivery.returned.v1"
	EventTrackingAccess     EventType = "delivery.tracking_access_created.v1"
	EventDriverAvailability EventType = "delivery.driver_availability_changed.v1"
	// Legacy values are accepted during the migration from the initial
	// prototype contract and canonicalized to their .v1 equivalents.
	legacyStatusChanged  EventType = "delivery.status_changed"
	legacyLocationUpdate EventType = "delivery.location_updated"
	legacyETAUpdated     EventType = "delivery.eta_updated"
	legacyTrackingEnded  EventType = "delivery.tracking_ended"
)

// Envelope is the v1 event envelope published by the Delivery service.
// Data is intentionally kept raw here; the public projection applies an
// allowlist before anything reaches a customer WebSocket.
type Envelope struct {
	Version       int             `json:"version"`
	EventID       string          `json:"event_id"`
	EventType     EventType       `json:"event_type,omitempty"`
	Type          EventType       `json:"type,omitempty"` // compatibility alias
	TenantID      uuid.UUID       `json:"tenant_id"`
	DeliveryID    uuid.UUID       `json:"delivery_id"`
	AggregateID   uuid.UUID       `json:"aggregate_id"` // v1 contract alias for delivery_id
	CorrelationID uuid.UUID       `json:"correlation_id,omitempty"`
	Sequence      uint64          `json:"sequence,omitempty"`
	OccurredAt    time.Time       `json:"occurred_at"`
	Data          json.RawMessage `json:"data"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	Timestamp     time.Time       `json:"timestamp,omitempty"`
}

// Kind returns the event type regardless of whether a producer sent the v1
// event_type field or the compatibility type field.
func (e Envelope) Kind() EventType {
	if strings.TrimSpace(string(e.EventType)) != "" {
		return e.EventType
	}
	return e.Type
}

func (e Envelope) EffectiveDeliveryID() uuid.UUID {
	if e.DeliveryID != uuid.Nil {
		return e.DeliveryID
	}
	return e.AggregateID
}

// Validate ensures an event cannot be routed into a room with missing scope.
func (e Envelope) Validate() error {
	if e.Version == 0 {
		e.Version = CurrentVersion
	}
	if e.Version != CurrentVersion {
		return fmt.Errorf("unsupported delivery event version %d", e.Version)
	}
	if strings.TrimSpace(e.EventID) == "" {
		return fmt.Errorf("event_id is required")
	}
	if e.TenantID == uuid.Nil {
		return fmt.Errorf("tenant_id is required")
	}
	if e.EffectiveDeliveryID() == uuid.Nil {
		return fmt.Errorf("delivery_id is required")
	}
	if strings.TrimSpace(string(e.Kind())) == "" {
		return fmt.Errorf("event_type is required")
	}
	if !IsSupported(e.Kind()) {
		return fmt.Errorf("unsupported delivery event type %q", e.Kind())
	}
	if e.OccurredAt.IsZero() {
		e.OccurredAt = e.Timestamp
	}
	if e.OccurredAt.IsZero() {
		return fmt.Errorf("occurred_at is required")
	}
	if len(bytes.TrimSpace(e.EffectiveData())) == 0 || bytes.Equal(bytes.TrimSpace(e.EffectiveData()), []byte("null")) {
		return fmt.Errorf("data is required")
	}
	return nil
}

func (e Envelope) EffectiveOccurredAt() time.Time {
	if !e.OccurredAt.IsZero() {
		return e.OccurredAt
	}
	return e.Timestamp
}

func (e Envelope) EffectiveData() json.RawMessage {
	if len(bytes.TrimSpace(e.Data)) > 0 {
		return e.Data
	}
	return e.Payload
}

func IsSupported(kind EventType) bool {
	switch kind {
	case EventStatusChanged, EventLocationUpdate, EventETAUpdated, EventTrackingEnded, EventCompleted,
		EventCreated, EventAccepted, EventManualRequired, EventReady, EventAssigned, EventPickedUp,
		EventArrived, EventException, EventReturned, EventTrackingAccess, EventDriverAvailability,
		legacyStatusChanged, legacyLocationUpdate, legacyETAUpdated, legacyTrackingEnded:
		return true
	default:
		return false
	}
}

func CanonicalType(kind EventType) EventType {
	switch kind {
	case legacyStatusChanged:
		return EventStatusChanged
	case legacyLocationUpdate:
		return EventLocationUpdate
	case legacyETAUpdated:
		return EventETAUpdated
	case legacyTrackingEnded:
		return EventTrackingEnded
	default:
		return kind
	}
}

// PublicLocation contains only data required to draw the marker. It never
// includes a driver identifier, address, phone number or internal metadata.
type PublicLocation struct {
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracy_m,omitempty"`
	HeadingDeg *float64  `json:"heading_deg,omitempty"`
	SpeedMPS   *float64  `json:"speed_mps,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

type PublicData struct {
	Status       string          `json:"status,omitempty"`
	ETASeconds   *int64          `json:"eta_seconds,omitempty"`
	ETAUpdatedAt *time.Time      `json:"eta_updated_at,omitempty"`
	Stale        *bool           `json:"stale,omitempty"`
	Location     *PublicLocation `json:"location,omitempty"`
}

// PublicEvent is the allowlisted payload sent to a tracking browser.
type PublicEvent struct {
	Version    int        `json:"version"`
	EventID    string     `json:"event_id"`
	Type       EventType  `json:"type"`
	TenantID   uuid.UUID  `json:"-"` // used internally for room checks; never sent to public clients
	DeliveryID uuid.UUID  `json:"delivery_id"`
	Sequence   uint64     `json:"sequence,omitempty"`
	OccurredAt time.Time  `json:"occurred_at"`
	Data       PublicData `json:"data"`
}
