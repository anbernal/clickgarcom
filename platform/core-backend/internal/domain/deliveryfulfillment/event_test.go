package deliveryfulfillment

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEnvelopeNotificationProjectsSafeTrackingEvent(t *testing.T) {
	tenantID, deliveryID := uuid.New(), uuid.New()
	event := Envelope{
		Version: CurrentVersion, EventID: uuid.NewString(), Type: EventTrackingAvailable,
		TenantID: tenantID, AggregateID: deliveryID, OccurredAt: time.Now().UTC(),
		Data: mustJSON(t, NotificationData{Recipient: "5511999999999", Mode: "EXTERNAL", DisplayCode: "A123", TrackingURL: "https://tracking.invalid/a"}),
	}
	require.NoError(t, event.Validate())
	notification, ok, err := event.Notification()
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, tenantID, notification.TenantID)
	require.Equal(t, deliveryID, notification.DeliveryID)
	require.Contains(t, notification.Body, "https://tracking.invalid/a")
}

func TestEnvelopeNotificationSuppressesTrackingForOwn(t *testing.T) {
	event := Envelope{
		Version: CurrentVersion, EventID: uuid.NewString(), Type: EventTrackingAvailable,
		TenantID: uuid.New(), AggregateID: uuid.New(), OccurredAt: time.Now().UTC(),
		Data: mustJSON(t, NotificationData{Recipient: "5511999999999", Mode: "OWN", TrackingURL: "https://tracking.invalid/a"}),
	}
	notification, ok, err := event.Notification()
	require.NoError(t, err)
	require.False(t, ok)
	require.Empty(t, notification.Body)
}

func TestEnvelopeValidationRejectsWrongTenantShape(t *testing.T) {
	event := Envelope{Version: CurrentVersion, EventID: uuid.NewString(), Type: EventCompleted, AggregateID: uuid.New(), OccurredAt: time.Now().UTC(), Data: json.RawMessage(`{}`)}
	require.Error(t, event.Validate())
}

func mustJSON(t *testing.T, value interface{}) json.RawMessage {
	t.Helper()
	body, err := json.Marshal(value)
	require.NoError(t, err)
	return body
}
