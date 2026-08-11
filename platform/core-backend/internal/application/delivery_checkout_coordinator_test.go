package application

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
)

type fakeDeliveryCheckoutGateway struct {
	created nodeadmin.DeliveryCheckoutInput
	create  nodeadmin.DeliveryCheckoutResponse
	confirm nodeadmin.DeliveryCheckoutResponse
	paidInput nodeadmin.DeliveryCheckoutPaidConfirmation
	confirmPaid nodeadmin.DeliveryCheckoutResponse
}

func (f *fakeDeliveryCheckoutGateway) Create(_ context.Context, input nodeadmin.DeliveryCheckoutInput) (nodeadmin.DeliveryCheckoutResponse, error) {
	f.created = input
	return f.create, nil
}

func (f *fakeDeliveryCheckoutGateway) Confirm(_ context.Context, _ nodeadmin.DeliveryCheckoutConfirmation) (nodeadmin.DeliveryCheckoutResponse, error) {
	return f.confirm, nil
}

func (f *fakeDeliveryCheckoutGateway) ConfirmPaid(_ context.Context, input nodeadmin.DeliveryCheckoutPaidConfirmation) (nodeadmin.DeliveryCheckoutResponse, error) {
	f.paidInput = input
	return f.confirmPaid, nil
}

func TestBuildDeliveryCheckoutKeyIsStableAndChangesWithCart(t *testing.T) {
	tenantID := uuid.New()
	input := DeliveryCheckoutCreateInput{
		TenantID:          tenantID,
		CustomerID:        uuid.New(),
		CustomerAddressID: uuid.New(),
		OrderTotal:        42.5,
		DestinationLat:    -23.5,
		DestinationLng:    -46.6,
		CartFingerprint:   "cart-v1",
	}
	if got, want := BuildDeliveryCheckoutKey(input), BuildDeliveryCheckoutKey(input); got != want {
		t.Fatalf("expected deterministic key, got %q and %q", got, want)
	}
	input.CartFingerprint = "cart-v2"
	if BuildDeliveryCheckoutKey(input) == BuildDeliveryCheckoutKey(DeliveryCheckoutCreateInput{
		TenantID:          tenantID,
		CustomerID:        input.CustomerID,
		CustomerAddressID: input.CustomerAddressID,
		OrderTotal:        42.5,
		DestinationLat:    -23.5,
		DestinationLng:    -46.6,
		CartFingerprint:   "cart-v1",
	}) {
		t.Fatal("expected cart changes to produce a different checkout key")
	}
}

func TestDeliveryCheckoutCoordinatorUsesAuthoritativeFinancialSnapshot(t *testing.T) {
	tenantID, customerID, addressID := uuid.New(), uuid.New(), uuid.New()
	token := "opaque-confirmation-token"
	fake := &fakeDeliveryCheckoutGateway{create: nodeadmin.DeliveryCheckoutResponse{
		ID:                  uuid.New(),
		TenantID:            tenantID,
		CheckoutKey:         "wa-fixed-key",
		FulfillmentMode:     "OWN",
		CustomerID:          customerID,
		CustomerAddressID:   addressID,
		Status:              "PENDING_PAYMENT",
		OrderTotal:          50,
		CustomerDeliveryFee: 7.5,
		TotalAmount:         57.5,
		Currency:            "BRL",
		ExpiresAt:           time.Now().Add(10 * time.Minute),
		ConfirmationToken:   &token,
	}}
	coordinator := NewDeliveryCheckoutCoordinator(fake, nil)
	result, err := coordinator.Create(context.Background(), DeliveryCheckoutCreateInput{
		TenantID:          tenantID,
		CustomerID:        customerID,
		CustomerAddressID: addressID,
		OrderTotal:        50,
		CheckoutKey:       "wa-fixed-key",
		DestinationLat:    -23,
		DestinationLng:    -46,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if result.TotalAmount != 57.5 || result.CustomerDeliveryFee != 7.5 || result.ConfirmationToken != token {
		t.Fatalf("unexpected authoritative result: %+v", result)
	}
	if fake.created.CheckoutKey != "wa-fixed-key" {
		t.Fatalf("expected checkout key to be forwarded, got %q", fake.created.CheckoutKey)
	}
}

func TestDeliveryCheckoutCoordinatorRejectsInconsistentResponse(t *testing.T) {
	tenantID, customerID, addressID := uuid.New(), uuid.New(), uuid.New()
	token := "token"
	fake := &fakeDeliveryCheckoutGateway{create: nodeadmin.DeliveryCheckoutResponse{
		TenantID:            tenantID,
		CheckoutKey:         "key",
		CustomerID:          customerID,
		CustomerAddressID:   addressID,
		Status:              "PENDING_PAYMENT",
		OrderTotal:          50,
		CustomerDeliveryFee: 7.5,
		TotalAmount:         60,
		ExpiresAt:           time.Now().Add(time.Minute),
		ConfirmationToken:   &token,
	}}
	_, err := NewDeliveryCheckoutCoordinator(fake, nil).Create(context.Background(), DeliveryCheckoutCreateInput{
		TenantID:          tenantID,
		CustomerID:        customerID,
		CustomerAddressID: addressID,
		OrderTotal:        50,
		CheckoutKey:       "key",
		DestinationLat:    -23,
		DestinationLng:    -46,
	})
	if err == nil {
		t.Fatal("expected inconsistent total to be rejected")
	}
}

func TestDeliveryCheckoutCoordinatorConfirmRequiresPaidReference(t *testing.T) {
	tenantID := uuid.New()
	paymentReference := "payment-123"
	fake := &fakeDeliveryCheckoutGateway{confirm: nodeadmin.DeliveryCheckoutResponse{
		TenantID:         tenantID,
		CheckoutKey:      "key",
		Status:           "PAID",
		PaymentReference: &paymentReference,
	}}
	_, err := NewDeliveryCheckoutCoordinator(fake, nil).Confirm(context.Background(), tenantID, "key", "token", paymentReference, nil)
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}

	wrong := "other-payment"
	fake.confirm.PaymentReference = &wrong
	if _, err := NewDeliveryCheckoutCoordinator(fake, nil).Confirm(context.Background(), tenantID, "key", "token", paymentReference, nil); err == nil {
		t.Fatal("expected payment reference mismatch to be rejected")
	}
}

func TestDeliveryCheckoutCoordinatorReconcileUsesSameKey(t *testing.T) {
	tenantID := uuid.New()
	fake := &fakeDeliveryCheckoutGatewayWithGet{
		response: nodeadmin.DeliveryCheckoutResponse{TenantID: tenantID, CheckoutKey: "same-key", Status: "PAID"},
	}
	result, err := NewDeliveryCheckoutCoordinator(fake, nil).Reconcile(context.Background(), tenantID, "same-key")
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}
	if result.Status != "PAID" || fake.key != "same-key" {
		t.Fatalf("unexpected reconciliation result: %+v key=%q", result, fake.key)
	}
}

type fakeDeliveryCheckoutGatewayWithGet struct {
	fakeDeliveryCheckoutGateway
	response nodeadmin.DeliveryCheckoutResponse
	key      string
}

func (f *fakeDeliveryCheckoutGatewayWithGet) Get(_ context.Context, _ uuid.UUID, key string) (nodeadmin.DeliveryCheckoutResponse, error) {
	f.key = key
	return f.response, nil
}
