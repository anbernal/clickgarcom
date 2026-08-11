package handlers

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/anbernal/clickgarcom/internal/infrastructure/deliveryrealtime"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDeliveryLocationHandlerRequiresAuthorizer(t *testing.T) {
	app := fiber.New()
	handler := NewDeliveryLocationHandler(nil, nil, nil)
	app.Post("/delivery/driver/deliveries/:deliveryId/locations", handler.Ingest)
	id := uuid.New()
	req := httptest.NewRequest("POST", "/delivery/driver/deliveries/"+id.String()+"/locations", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestDeliveryLocationHandlerAndLatestProjection(t *testing.T) {
	hub := deliveryrealtime.NewHub()
	ingestor := deliveryrealtime.NewLocationIngestor(hub, nil)
	scope := deliveryrealtime.Scope{TenantID: uuid.New(), DeliveryID: uuid.New()}
	authorizer := DriverLocationAuthorizerFunc(func(_ *fiber.Ctx, id uuid.UUID) (deliveryrealtime.Scope, error) {
		if id != scope.DeliveryID {
			t.Fatal("unexpected delivery id")
		}
		return scope, nil
	})
	trackingAuth := DeliveryAuthorizerFunc(func(_ *fiber.Ctx) (deliveryrealtime.Scope, error) { return scope, nil })
	locationHandler := NewDeliveryLocationHandler(ingestor, authorizer, nil)
	latestHandler := NewDeliveryLatestLocationHandler(hub, trackingAuth)
	app := fiber.New()
	app.Post("/delivery/driver/deliveries/:deliveryId/locations", locationHandler.Ingest)
	app.Get("/delivery/tracking/latest-location", latestHandler.Get)
	payload := map[string]any{"event_id": "evt-1", "lat": -23.55, "lng": -46.63, "recorded_at": time.Now().UTC()}
	body, err := json.Marshal(payload)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", "/delivery/driver/deliveries/"+scope.DeliveryID.String()+"/locations", bytesReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusAccepted, resp.StatusCode)

	resp, err = app.Test(httptest.NewRequest("GET", "/delivery/tracking/latest-location", nil))
	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func bytesReader(body []byte) *bytes.Reader { return bytes.NewReader(body) }
