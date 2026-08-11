package deliveryevent

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func validEnvelope(t *testing.T, data string) Envelope {
	t.Helper()
	return Envelope{
		Version:   CurrentVersion,
		EventID:   "evt-1",
		EventType: EventLocationUpdate,
		TenantID:  uuid.New(), DeliveryID: uuid.New(),
		OccurredAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		Data:       json.RawMessage(data),
	}
}

func TestProjectPublicAllowlistsLocation(t *testing.T) {
	event, err := ProjectPublic(validEnvelope(t, `{"latitude":-23.55,"longitude":-46.63,"driver_id":"secret","phone":"secret"}`))
	require.NoError(t, err)
	require.NotNil(t, event.Data.Location)
	require.Equal(t, -23.55, event.Data.Location.Latitude)
	require.NotContains(t, string(mustJSON(t, event)), "driver_id")
	require.NotContains(t, string(mustJSON(t, event)), "phone")
}

func TestProjectPublicRejectsInvalidScopeAndCoordinates(t *testing.T) {
	e := validEnvelope(t, `{"latitude":91,"longitude":0}`)
	_, err := ProjectPublic(e)
	require.Error(t, err)

	e = validEnvelope(t, `{"latitude":0}`)
	_, err = ProjectPublic(e)
	require.Error(t, err)

	e = validEnvelope(t, `{"latitude":0,"longitude":0}`)
	e.EventType = "delivery.unknown"
	_, err = ProjectPublic(e)
	require.Error(t, err)
}

func TestEnvelopeAcceptsTypeCompatibilityAlias(t *testing.T) {
	e := validEnvelope(t, `{"status":"IN_TRANSIT"}`)
	e.EventType = ""
	e.Type = EventStatusChanged
	require.NoError(t, e.Validate())
	projected, err := ProjectPublic(e)
	require.NoError(t, err)
	require.Equal(t, EventStatusChanged, projected.Type)
}

func TestEnvelopeAcceptsPayloadAndTimestampAliases(t *testing.T) {
	e := validEnvelope(t, ``)
	e.Data = nil
	e.Payload = json.RawMessage(`{"status":"ARRIVED"}`)
	e.OccurredAt = time.Time{}
	e.Timestamp = time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
	projected, err := ProjectPublic(e)
	require.NoError(t, err)
	require.Equal(t, "ARRIVED", projected.Data.Status)
	require.Equal(t, e.Timestamp, projected.OccurredAt)
}

func TestProjectPublicNestV1Envelope(t *testing.T) {
	e := Envelope{
		Version:  1,
		EventID:  "evt-v1",
		Type:     EventLocationUpdate,
		TenantID: uuid.New(), AggregateID: uuid.New(),
		OccurredAt: time.Now(),
		Data:       json.RawMessage(`{"lat":-23.55,"lng":-46.63,"accuracy_m":8,"recorded_at":"2026-02-03T04:05:06Z","eta_seconds":300,"stale":false}`),
	}
	projected, err := ProjectPublic(e)
	require.NoError(t, err)
	require.Equal(t, e.AggregateID, projected.DeliveryID)
	require.Equal(t, EventLocationUpdate, projected.Type)
	require.NotNil(t, projected.Data.Location)
	require.Equal(t, int64(300), *projected.Data.ETASeconds)
	require.NotNil(t, projected.Data.Stale)
}

func mustJSON(t *testing.T, value interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(value)
	require.NoError(t, err)
	return b
}
