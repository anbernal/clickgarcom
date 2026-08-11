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

func TestDeliveryCheckoutClientCreateSendsInternalContract(t *testing.T) {
	tenantID := uuid.New()
	customerID := uuid.New()
	addressID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, "/admin/api/internal/delivery/checkout", request.URL.Path)
		require.Equal(t, "secret", request.Header.Get("X-Internal-Token"))
		var payload map[string]interface{}
		require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
		require.Equal(t, tenantID.String(), payload["tenant_id"])
		require.Equal(t, "abc-123", payload["checkout_key"])
		_, _ = writer.Write([]byte(`{"id":"00000000-0000-0000-0000-000000000001","tenant_id":"00000000-0000-0000-0000-000000000002","checkout_key":"abc-123","fulfillment_mode":"OWN","status":"PENDING_PAYMENT","order_total":20,"customer_delivery_fee":8,"total_amount":28,"currency":"BRL"}`))
	}))
	defer server.Close()

	client := NewDeliveryCheckoutClient(server.URL, "secret", zap.NewNop())
	result, err := client.Create(context.Background(), DeliveryCheckoutInput{
		TenantID: tenantID, CheckoutKey: "abc-123", CustomerID: customerID, CustomerAddressID: addressID,
		OrderTotal: 20, DestinationLat: -23, DestinationLng: -46,
	})
	require.NoError(t, err)
	require.Equal(t, "abc-123", result.CheckoutKey)
}

func TestDeliveryCheckoutClientDoesNotRetryClientErrors(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls++
		http.Error(writer, `{"message":"invalid checkout"}`, http.StatusBadRequest)
	}))
	defer server.Close()
	client := NewDeliveryCheckoutClient(server.URL, "secret", zap.NewNop())
	_, err := client.Confirm(context.Background(), DeliveryCheckoutConfirmation{TenantID: uuid.New(), CheckoutKey: "key", ConfirmationToken: "token", PaymentReference: "payment"})
	require.Error(t, err)
	require.Equal(t, 1, calls)
}

func TestDeliveryCheckoutClientGetSendsTenantScope(t *testing.T) {
	tenantID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodGet, request.Method)
		require.Equal(t, "/admin/api/internal/delivery/checkout/key-123", request.URL.Path)
		require.Equal(t, tenantID.String(), request.Header.Get("X-Tenant-ID"))
		_, _ = writer.Write([]byte(`{"tenant_id":"` + tenantID.String() + `","checkout_key":"key-123","status":"PAID"}`))
	}))
	defer server.Close()

	client := NewDeliveryCheckoutClient(server.URL, "secret", zap.NewNop())
	result, err := client.Get(context.Background(), tenantID, "key-123")
	require.NoError(t, err)
	require.Equal(t, "PAID", result.Status)
}

func TestDeliveryCheckoutClientConfirmPaidUsesInternalAmountContract(t *testing.T) {
	tenantID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/admin/api/internal/delivery/checkout/confirm-paid", request.URL.Path)
		require.Equal(t, "secret", request.Header.Get("X-Internal-Token"))
		var payload map[string]interface{}
		require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
		require.Equal(t, tenantID.String(), payload["tenant_id"])
		require.Equal(t, 29.5, payload["paid_amount"])
		_, _ = writer.Write([]byte(`{"tenant_id":"` + tenantID.String() + `","checkout_key":"key-123","status":"PAID","payment_reference":"mp-1"}`))
	}))
	defer server.Close()

	client := NewDeliveryCheckoutClient(server.URL, "secret", zap.NewNop())
	result, err := client.ConfirmPaid(context.Background(), DeliveryCheckoutPaidConfirmation{
		TenantID: tenantID, CheckoutKey: "key-123", PaymentReference: "mp-1", PaidAmount: 29.5,
	})
	require.NoError(t, err)
	require.Equal(t, "PAID", result.Status)
}
