package deliveryevent

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"
)

// ProjectPublic validates an incoming event and projects only fields allowed
// to leave the trusted backend. Unknown fields are ignored by design.
func ProjectPublic(e Envelope) (PublicEvent, error) {
	if err := e.Validate(); err != nil {
		return PublicEvent{}, err
	}

	var raw struct {
		Status        string          `json:"status"`
		CurrentStatus string          `json:"current_status"`
		ETASeconds    *int64          `json:"eta_seconds"`
		ETAUpdatedAt  *time.Time      `json:"eta_updated_at"`
		Stale         *bool           `json:"stale"`
		Location      json.RawMessage `json:"location"`
		// Accept a flat location payload for location_updated producers while
		// still projecting the same allowlisted shape.
		Latitude   *float64   `json:"latitude"`
		Longitude  *float64   `json:"longitude"`
		Lat        *float64   `json:"lat"`
		Lng        *float64   `json:"lng"`
		AccuracyM  *float64   `json:"accuracy_m"`
		HeadingDeg *float64   `json:"heading_deg"`
		SpeedMPS   *float64   `json:"speed_mps"`
		RecordedAt *time.Time `json:"recorded_at"`
	}
	occurredAt := e.EffectiveOccurredAt()
	if err := json.Unmarshal(e.EffectiveData(), &raw); err != nil {
		return PublicEvent{}, fmt.Errorf("invalid delivery event data: %w", err)
	}

	data := PublicData{
		Status:       strings.TrimSpace(raw.Status),
		ETASeconds:   raw.ETASeconds,
		ETAUpdatedAt: raw.ETAUpdatedAt,
		Stale:        raw.Stale,
	}
	if data.Status == "" {
		data.Status = strings.TrimSpace(raw.CurrentStatus)
	}
	if raw.Latitude == nil {
		raw.Latitude = raw.Lat
	}
	if raw.Longitude == nil {
		raw.Longitude = raw.Lng
	}
	if len(raw.Location) > 0 && string(raw.Location) != "null" {
		var nested struct {
			Latitude   float64    `json:"latitude"`
			Longitude  float64    `json:"longitude"`
			Lat        *float64   `json:"lat"`
			Lng        *float64   `json:"lng"`
			AccuracyM  *float64   `json:"accuracy_m"`
			HeadingDeg *float64   `json:"heading_deg"`
			SpeedMPS   *float64   `json:"speed_mps"`
			RecordedAt *time.Time `json:"recorded_at"`
		}
		if err := json.Unmarshal(raw.Location, &nested); err != nil {
			return PublicEvent{}, fmt.Errorf("invalid delivery location: %w", err)
		}
		if nested.Lat != nil {
			nested.Latitude = *nested.Lat
		}
		if nested.Lng != nil {
			nested.Longitude = *nested.Lng
		}
		if err := validateCoordinates(nested.Latitude, nested.Longitude); err != nil {
			return PublicEvent{}, err
		}
		if nested.RecordedAt == nil {
			nested.RecordedAt = &occurredAt
		}
		data.Location = &PublicLocation{
			Latitude: nested.Latitude, Longitude: nested.Longitude,
			AccuracyM: nested.AccuracyM, HeadingDeg: nested.HeadingDeg,
			SpeedMPS: nested.SpeedMPS, RecordedAt: *nested.RecordedAt,
		}
	} else if raw.Latitude != nil || raw.Longitude != nil {
		if raw.Latitude == nil || raw.Longitude == nil {
			return PublicEvent{}, fmt.Errorf("latitude and longitude must be provided together")
		}
		if err := validateCoordinates(*raw.Latitude, *raw.Longitude); err != nil {
			return PublicEvent{}, err
		}
		recordedAt := occurredAt
		if raw.RecordedAt != nil {
			recordedAt = *raw.RecordedAt
		}
		data.Location = &PublicLocation{
			Latitude: *raw.Latitude, Longitude: *raw.Longitude,
			AccuracyM: raw.AccuracyM, HeadingDeg: raw.HeadingDeg,
			SpeedMPS: raw.SpeedMPS, RecordedAt: recordedAt,
		}
	}
	if data.ETASeconds != nil && *data.ETASeconds < 0 {
		return PublicEvent{}, fmt.Errorf("eta_seconds cannot be negative")
	}

	return PublicEvent{
		Version:    CurrentVersion,
		EventID:    e.EventID,
		Type:       CanonicalType(e.Kind()),
		TenantID:   e.TenantID,
		DeliveryID: e.EffectiveDeliveryID(),
		Sequence:   e.Sequence,
		OccurredAt: occurredAt,
		Data:       data,
	}, nil
}

func validateCoordinates(latitude, longitude float64) error {
	if math.IsNaN(latitude) || math.IsInf(latitude, 0) || latitude < -90 || latitude > 90 {
		return fmt.Errorf("invalid latitude")
	}
	if math.IsNaN(longitude) || math.IsInf(longitude, 0) || longitude < -180 || longitude > 180 {
		return fmt.Errorf("invalid longitude")
	}
	return nil
}
