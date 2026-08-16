package payment

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.uber.org/zap"
)

func TestCreateCardPaymentFallsBackToOrdersAPI(t *testing.T) {
	var legacyCalls, orderCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/payments":
			legacyCalls++
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"Unauthorized use of live credentials","error":"unauthorized","status":401,"cause":[{"code":7,"description":"Unauthorized use of live credentials"}]}`))
		case "/v1/orders":
			orderCalls++
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode order request: %v", err)
			}
			if payload["processing_mode"] != "automatic" || payload["total_amount"] != "44.90" {
				t.Fatalf("unexpected order payload: %#v", payload)
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"ORD01TEST","external_reference":"local-payment","status":"processed","status_detail":"accredited","transactions":{"payments":[{"id":"PAY01TEST","status":"processed","status_detail":"accredited","payment_method":{"id":"master","type":"credit_card"}}]}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewMercadoPagoClient(zap.NewNop())
	client.baseURL = server.URL
	var request CardPaymentRequest
	request.TransactionAmount = 44.90
	request.Token = "card-token"
	request.Description = "Pedido para entrega"
	request.Installments = 1
	request.PaymentMethodID = "master"
	request.ExternalReference = "local-payment"
	request.Payer.Email = "buyer@testuser.com"
	request.Payer.Identification.Type = "CPF"
	request.Payer.Identification.Number = "12345678909"

	response, err := client.CreateCardPayment(context.Background(), "APP_USR-test", "idempotency", request)
	if err != nil {
		t.Fatalf("CreateCardPayment: %v", err)
	}
	if legacyCalls != 1 || orderCalls != 1 {
		t.Fatalf("expected one legacy call and one order call, got legacy=%d orders=%d", legacyCalls, orderCalls)
	}
	if response.ID.String() != "ORD01TEST" || response.Status != "approved" || response.StatusDetail != "accredited" {
		t.Fatalf("unexpected normalized response: %#v", response)
	}
}

func TestCreatePixPaymentFallsBackToOrdersAndMapsQRCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/payments" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"Unauthorized use of live credentials","cause":[{"code":7,"description":"Unauthorized use of live credentials"}]}`))
			return
		}
		if r.URL.Path != "/v1/orders" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"ORD01PIX","external_reference":"local-pix","status":"action_required","status_detail":"waiting_transfer","transactions":{"payments":[{"id":"PAY01PIX","status":"action_required","status_detail":"waiting_transfer","payment_method":{"id":"pix","type":"bank_transfer","qr_code":"pix-copy-paste","qr_code_base64":"pix-image"}}]}}`))
	}))
	defer server.Close()

	client := NewMercadoPagoClient(zap.NewNop())
	client.baseURL = server.URL
	var request PixPaymentRequest
	request.TransactionAmount = 15
	request.ExternalReference = "local-pix"
	request.Payer.Email = "buyer@testuser.com"

	response, err := client.CreatePixPayment(context.Background(), "APP_USR-test", "idempotency", request)
	if err != nil {
		t.Fatalf("CreatePixPayment: %v", err)
	}
	if response.ID.String() != "ORD01PIX" || response.Status != "pending" || response.StatusDetail != "waiting_transfer" {
		t.Fatalf("unexpected normalized response: %#v", response)
	}
	if response.PointOfInteraction.TransactionData.QRCode != "pix-copy-paste" || response.PointOfInteraction.TransactionData.QRCodeBase64 != "pix-image" {
		t.Fatalf("PIX data was not mapped: %#v", response.PointOfInteraction.TransactionData)
	}
}

func TestCreatePixSandboxPaymentUsesOrdersAPROScenarioDirectly(t *testing.T) {
	var paymentCalls, orderCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/payments":
			paymentCalls++
			http.Error(w, "legacy payments endpoint must not be used", http.StatusInternalServerError)
		case "/v1/orders":
			orderCalls++
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode sandbox PIX order: %v", err)
			}
			payer, _ := payload["payer"].(map[string]any)
			if payer["first_name"] != "APRO" || payer["email"] != "test_user_br@testuser.com" {
				t.Fatalf("unexpected sandbox payer: %#v", payer)
			}
			if _, exists := payer["identification"]; exists {
				t.Fatalf("sandbox PIX preset must not send buyer identification: %#v", payer)
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"ORD01PIXTEST","external_reference":"local-pix-test","status":"action_required","status_detail":"waiting_transfer","transactions":{"payments":[{"id":"PAY01PIXTEST","status":"action_required","status_detail":"waiting_transfer","payment_method":{"id":"pix","type":"bank_transfer","qr_code":"sandbox-pix-code"}}]}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewMercadoPagoClient(zap.NewNop())
	client.baseURL = server.URL
	var request PixPaymentRequest
	request.TransactionAmount = 44.90
	request.ExternalReference = "local-pix-test"
	request.Payer.Email = "buyer-provided@example.com"
	request.Payer.FirstName = "Visitante"
	request.Payer.Identification.Type = "CPF"
	request.Payer.Identification.Number = "19119119100"

	response, err := client.CreatePixSandboxPayment(context.Background(), "APP_USR-test", "sandbox-idempotency", request)
	if err != nil {
		t.Fatalf("CreatePixSandboxPayment: %v", err)
	}
	if paymentCalls != 0 || orderCalls != 1 {
		t.Fatalf("expected direct Orders API call, got payments=%d orders=%d", paymentCalls, orderCalls)
	}
	if response.ID.String() != "ORD01PIXTEST" || response.Status != "pending" || response.PointOfInteraction.TransactionData.QRCode != "sandbox-pix-code" {
		t.Fatalf("unexpected sandbox PIX response: %#v", response)
	}
}

func TestGetPaymentReadsApprovedSandboxOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/orders/ORD01PIXTEST" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"id":"ORD01PIXTEST","external_reference":"local-pix-test","status":"processed","status_detail":"accredited","transactions":{"payments":[{"id":"PAY01PIXTEST","status":"processed","status_detail":"accredited","payment_method":{"id":"pix","type":"bank_transfer"}}]}}`))
	}))
	defer server.Close()

	client := NewMercadoPagoClient(zap.NewNop())
	client.baseURL = server.URL
	response, err := client.GetPayment(context.Background(), "APP_USR-test", "ORD01PIXTEST")
	if err != nil {
		t.Fatalf("GetPayment: %v", err)
	}
	if response.Status != "approved" || response.StatusDetail != "accredited" {
		t.Fatalf("expected approved sandbox order, got %#v", response)
	}
}
