package nodeadmin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestDeliveryQuoteClientSendsStableCheckoutContract(t *testing.T) {
	tenantID := uuid.New()
	checkoutKey := "wa-quote-key"
	quoteID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/admin/api/internal/delivery/quotes", request.URL.Path)
		require.Equal(t, tenantID.String(), request.Header.Get("X-Tenant-ID"))
		var payload DeliveryQuoteInput
		require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
		require.Equal(t, checkoutKey, payload.CheckoutKey)
		_, _ = writer.Write([]byte(`{"id":"` + quoteID.String() + `","tenant_id":"` + tenantID.String() + `","checkout_key":"` + checkoutKey + `","status":"VALID","customer_delivery_fee":12.5,"expires_at":"` + time.Now().Add(time.Minute).UTC().Format(time.RFC3339) + `"}`))
	}))
	defer server.Close()

	client := NewDeliveryQuoteClient(server.URL, "secret", zap.NewNop())
	result, err := client.Create(context.Background(), DeliveryQuoteInput{TenantID: tenantID, CheckoutKey: checkoutKey, CustomerID: uuid.New(), CustomerAddressID: uuid.New(), OrderTotal: 30, Latitude: -23, Longitude: -46})
	require.NoError(t, err)
	require.Equal(t, quoteID, result.ID)
	require.Equal(t, 12.5, result.CustomerDeliveryFee)
}
