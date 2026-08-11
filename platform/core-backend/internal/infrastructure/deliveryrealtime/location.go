package deliveryrealtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/deliveryevent"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
)

var (
	ErrInvalidLocation       = errors.New("invalid delivery location")
	ErrStaleLocation         = errors.New("delivery location is older than the latest accepted point")
	ErrLocationNotAuthorized = errors.New("driver is not authorized for this delivery")
)

// LocationPoint is the small, transport-independent request accepted from a
// driver. DeviceRecordedAt is preferred; RecordedAt is accepted as the v1
// contract alias. EventID provides idempotency for retries from an offline
// queue.
type LocationPoint struct {
	EventID          string    `json:"event_id"`
	Latitude         float64   `json:"latitude"`
	Longitude        float64   `json:"longitude"`
	AccuracyM        *float64  `json:"accuracy_m,omitempty"`
	HeadingDeg       *float64  `json:"heading_deg,omitempty"`
	SpeedMPS         *float64  `json:"speed_mps,omitempty"`
	DeviceRecordedAt time.Time `json:"device_recorded_at"`
	RecordedAt       time.Time `json:"recorded_at,omitempty"`
}

// UnmarshalJSON accepts both the transport-neutral latitude/longitude names
// and the Delivery v1 contract's lat/lng names.
func (p *LocationPoint) UnmarshalJSON(data []byte) error {
	var raw struct {
		EventID          string    `json:"event_id"`
		Latitude         *float64  `json:"latitude"`
		Longitude        *float64  `json:"longitude"`
		Lat              *float64  `json:"lat"`
		Lng              *float64  `json:"lng"`
		AccuracyM        *float64  `json:"accuracy_m"`
		HeadingDeg       *float64  `json:"heading_deg"`
		SpeedMPS         *float64  `json:"speed_mps"`
		DeviceRecordedAt time.Time `json:"device_recorded_at"`
		RecordedAt       time.Time `json:"recorded_at"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if raw.Latitude == nil {
		raw.Latitude = raw.Lat
	}
	if raw.Longitude == nil {
		raw.Longitude = raw.Lng
	}
	*p = LocationPoint{EventID: raw.EventID, AccuracyM: raw.AccuracyM,
		HeadingDeg: raw.HeadingDeg, SpeedMPS: raw.SpeedMPS,
		DeviceRecordedAt: raw.DeviceRecordedAt, RecordedAt: raw.RecordedAt}
	if raw.Latitude != nil {
		p.Latitude = *raw.Latitude
	}
	if raw.Longitude != nil {
		p.Longitude = *raw.Longitude
	}
	return nil
}

func (p LocationPoint) EffectiveRecordedAt() time.Time {
	if !p.DeviceRecordedAt.IsZero() {
		return p.DeviceRecordedAt
	}
	return p.RecordedAt
}

// LocationSink is an optional persistence adapter. NestJS remains the owner
// of production Redis/PostgreSQL state; Core Go can inject an adapter when it
// owns ingestion in a deployment, while tests can use nil or a fake sink.
type LocationSink interface {
	SaveLocation(context.Context, Scope, LocationPoint) error
}

type LocationIngestor struct {
	hub       *Hub
	sink      LocationSink
	now       func() time.Time
	maxAge    time.Duration
	maxFuture time.Duration
	mu        sync.Mutex
	accepted  map[string]string // room -> last event ID
}

func NewLocationIngestor(hub *Hub, sink LocationSink) *LocationIngestor {
	return &LocationIngestor{
		hub: hub, sink: sink, now: time.Now,
		maxAge: 5 * time.Minute, maxFuture: 2 * time.Minute,
		accepted: make(map[string]string),
	}
}

// Ingest validates a point from an already-authorized driver, persists it when
// an adapter is configured, and publishes an allowlisted projection. The
// authorization boundary deliberately lives outside this service so it can be
// provided by the NestJS driver assignment rules without sharing storage.
func (i *LocationIngestor) Ingest(ctx context.Context, scope Scope, point LocationPoint) (deliveryevent.PublicEvent, error) {
	if i == nil || i.hub == nil || !scope.Valid() {
		metrics.IncDeliveryLocationRejected("invalid_scope")
		return deliveryevent.PublicEvent{}, ErrInvalidLocation
	}
	if err := i.validate(point); err != nil {
		metrics.IncDeliveryLocationRejected("validation")
		return deliveryevent.PublicEvent{}, err
	}
	recordedAt := point.EffectiveRecordedAt()
	room := RoomKey(scope)
	i.mu.Lock()
	if latest, ok := i.hub.Latest(scope); ok && latest.Data.Location != nil && recordedAt.Before(latest.OccurredAt) {
		metrics.IncDeliveryLocationRejected("stale")
		i.mu.Unlock()
		return deliveryevent.PublicEvent{}, ErrStaleLocation
	}
	if lastID := i.accepted[room]; lastID == point.EventID {
		latest, ok := i.hub.Latest(scope)
		i.mu.Unlock()
		if ok {
			return latest, nil
		}
		return deliveryevent.PublicEvent{}, nil
	}
	i.mu.Unlock()

	if i.sink != nil {
		if err := i.sink.SaveLocation(ctx, scope, point); err != nil {
			metrics.IncDeliveryLocationRejected("persistence")
			return deliveryevent.PublicEvent{}, fmt.Errorf("persist delivery location: %w", err)
		}
	}

	accuracy := point.AccuracyM
	heading := point.HeadingDeg
	speed := point.SpeedMPS
	publicEvent := deliveryevent.PublicEvent{
		Version:    deliveryevent.CurrentVersion,
		EventID:    point.EventID,
		Type:       deliveryevent.EventLocationUpdate,
		TenantID:   scope.TenantID,
		DeliveryID: scope.DeliveryID,
		OccurredAt: recordedAt,
		Data: deliveryevent.PublicData{
			Location: &deliveryevent.PublicLocation{
				Latitude: point.Latitude, Longitude: point.Longitude,
				AccuracyM: accuracy, HeadingDeg: heading, SpeedMPS: speed,
				RecordedAt: recordedAt,
			},
		},
	}
	_, duplicate, err := i.hub.Broadcast(publicEvent)
	if err != nil {
		metrics.IncDeliveryLocationRejected("publish")
		return deliveryevent.PublicEvent{}, err
	}
	i.mu.Lock()
	i.accepted[room] = point.EventID
	i.mu.Unlock()
	if duplicate {
		if latest, ok := i.hub.Latest(scope); ok {
			return latest, nil
		}
	}
	metrics.IncDeliveryLocationAccepted("realtime")
	return publicEvent, nil
}

func (i *LocationIngestor) validate(point LocationPoint) error {
	if strings.TrimSpace(point.EventID) == "" {
		return fmt.Errorf("%w: event_id is required", ErrInvalidLocation)
	}
	if math.IsNaN(point.Latitude) || math.IsInf(point.Latitude, 0) || point.Latitude < -90 || point.Latitude > 90 {
		return fmt.Errorf("%w: invalid latitude", ErrInvalidLocation)
	}
	if math.IsNaN(point.Longitude) || math.IsInf(point.Longitude, 0) || point.Longitude < -180 || point.Longitude > 180 {
		return fmt.Errorf("%w: invalid longitude", ErrInvalidLocation)
	}
	if point.AccuracyM != nil && (*point.AccuracyM < 0 || *point.AccuracyM > 5000 || math.IsNaN(*point.AccuracyM) || math.IsInf(*point.AccuracyM, 0)) {
		return fmt.Errorf("%w: invalid accuracy_m", ErrInvalidLocation)
	}
	if point.SpeedMPS != nil && (*point.SpeedMPS < 0 || *point.SpeedMPS > 100 || math.IsNaN(*point.SpeedMPS) || math.IsInf(*point.SpeedMPS, 0)) {
		return fmt.Errorf("%w: invalid speed_mps", ErrInvalidLocation)
	}
	if point.HeadingDeg != nil && (*point.HeadingDeg < 0 || *point.HeadingDeg > 360 || math.IsNaN(*point.HeadingDeg) || math.IsInf(*point.HeadingDeg, 0)) {
		return fmt.Errorf("%w: invalid heading_deg", ErrInvalidLocation)
	}
	recordedAt := point.EffectiveRecordedAt()
	if recordedAt.IsZero() {
		return fmt.Errorf("%w: recorded_at is required", ErrInvalidLocation)
	}
	now := i.now()
	if recordedAt.Before(now.Add(-i.maxAge)) {
		return fmt.Errorf("%w: location is too old", ErrInvalidLocation)
	}
	if recordedAt.After(now.Add(i.maxFuture)) {
		return fmt.Errorf("%w: location is in the future", ErrInvalidLocation)
	}
	return nil
}
