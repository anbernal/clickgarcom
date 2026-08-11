package deliveryrealtime

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeLocationSink struct {
	points int
	err    error
}

func (s *fakeLocationSink) SaveLocation(_ context.Context, _ Scope, _ LocationPoint) error {
	if s.err != nil {
		return s.err
	}
	s.points++
	return nil
}

func TestLocationIngestorValidatesPublishesAndKeepsLatest(t *testing.T) {
	now := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	hub := NewHub()
	sink := &fakeLocationSink{}
	ingestor := NewLocationIngestor(hub, sink)
	ingestor.now = func() time.Time { return now }
	scope := Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	point := LocationPoint{EventID: "evt-1", Latitude: -23.55, Longitude: -46.63, DeviceRecordedAt: now}
	event, err := ingestor.Ingest(context.Background(), scope, point)
	require.NoError(t, err)
	require.Equal(t, 1, sink.points)
	require.Equal(t, point.EventID, event.EventID)
	latest, ok := hub.Latest(scope)
	require.True(t, ok)
	require.Equal(t, event.EventID, latest.EventID)

	_, err = ingestor.Ingest(context.Background(), scope, LocationPoint{EventID: "evt-old", Latitude: 0, Longitude: 0, DeviceRecordedAt: now.Add(-time.Second)})
	require.ErrorIs(t, err, ErrStaleLocation)
}

func TestLocationIngestorRejectsInvalidAndSinkFailure(t *testing.T) {
	now := time.Now()
	hub := NewHub()
	ingestor := NewLocationIngestor(hub, nil)
	ingestor.now = func() time.Time { return now }
	scope := Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	_, err := ingestor.Ingest(context.Background(), scope, LocationPoint{EventID: "evt", Latitude: 99, Longitude: 0, DeviceRecordedAt: now})
	require.ErrorIs(t, err, ErrInvalidLocation)

	sink := &fakeLocationSink{err: errors.New("redis unavailable")}
	ingestor = NewLocationIngestor(hub, sink)
	ingestor.now = func() time.Time { return now }
	_, err = ingestor.Ingest(context.Background(), scope, LocationPoint{EventID: "evt-2", Latitude: 0, Longitude: 0, DeviceRecordedAt: now})
	require.Error(t, err)
	require.Equal(t, 0, hub.ClientCount())
}
