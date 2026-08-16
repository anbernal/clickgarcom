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

func TestDeliveryCustomerClientResolveAndListAddresses(t *testing.T) {
	tenantID := uuid.New()
	customerID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, "secret", request.Header.Get("X-Internal-Token"))
		require.Equal(t, tenantID.String(), request.Header.Get("X-Tenant-ID"))
		if request.URL.Path == "/admin/api/internal/delivery/customers/resolve" {
			var body map[string]interface{}
			require.NoError(t, json.NewDecoder(request.Body).Decode(&body))
			require.Equal(t, tenantID.String(), body["tenant_id"])
			require.Equal(t, "Ana Silva", body["name"])
			_, _ = writer.Write([]byte(`{"id":"00000000-0000-0000-0000-000000000003","name":"Ana Silva","phone_normalized":"5511999999999","phone_masked":"551*****99"}`))
			return
		}
		require.Contains(t, request.URL.Path, customerID.String())
		_, _ = writer.Write([]byte(`[]`))
	}))
	defer server.Close()

	client := NewDeliveryCustomerClient(server.URL, "secret", zap.NewNop())
	customer, err := client.Resolve(context.Background(), ResolveDeliveryCustomerInput{TenantID: tenantID, Phone: "+55 11 99999-9999", Name: "Ana Silva"})
	require.NoError(t, err)
	require.Equal(t, "5511999999999", customer.PhoneNormalized)
	require.Equal(t, "Ana Silva", customer.Name)

	addresses, err := client.ListAddresses(context.Background(), tenantID, customerID)
	require.NoError(t, err)
	require.Empty(t, addresses)
}

func TestDeliveryCustomerClientDoesNotRetryDeleteClientError(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls++
		http.Error(writer, `{"message":"not found"}`, http.StatusNotFound)
	}))
	defer server.Close()
	client := NewDeliveryCustomerClient(server.URL, "secret", zap.NewNop())
	err := client.DeleteAddress(context.Background(), uuid.New(), uuid.New(), uuid.New())
	require.Error(t, err)
	require.Equal(t, 1, calls)
}
