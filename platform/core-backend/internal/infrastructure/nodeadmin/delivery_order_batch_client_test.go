package nodeadmin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestDeliveryOrderBatchClientReconcileSendsTenantAndEventScope(t *testing.T) {
	tenantID := uuid.New()
	batchID := uuid.New()
	eventID := uuid.New()
	orderID := uuid.New()
	deliveryID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/admin/api/internal/deliveries/order-event", request.URL.Path)
		require.Equal(t, "secret", request.Header.Get("X-Internal-Token"))
		require.Equal(t, tenantID.String(), request.Header.Get("X-Tenant-ID"))
		require.Equal(t, eventID.String(), request.Header.Get("X-Correlation-ID"))
		var payload map[string]string
		require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
		require.Equal(t, tenantID.String(), payload["tenant_id"])
		require.Equal(t, batchID.String(), payload["batch_id"])
		require.Equal(t, orderID.String(), payload["order_id"])
		require.Equal(t, eventID.String(), payload["event_id"])
		_, _ = writer.Write([]byte(`{"batch_id":"` + batchID.String() + `","delivery_id":"` + deliveryID.String() + `","ignored":false,"reason":"STATE_RECONCILED"}`))
	}))
	defer server.Close()

	client := NewDeliveryOrderBatchClient(server.URL, "secret", zap.NewNop())
	result, err := client.Reconcile(context.Background(), DeliveryOrderBatchReconcileInput{TenantID: tenantID, BatchID: batchID, OrderID: orderID, EventID: eventID})
	require.NoError(t, err)
	require.Equal(t, batchID, result.BatchID)
	require.NotNil(t, result.DeliveryID)
	require.Equal(t, deliveryID, *result.DeliveryID)
}
