package application

import (
	"context"
	"testing"

	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type fakePaidBatchGateway struct {
	input nodeadmin.DeliveryOrderBatchReconcileInput
	resp  nodeadmin.DeliveryOrderBatchReconcileResponse
}

type fakePaidDeliveryActivationGateway struct {
	tenantID uuid.UUID
	batchID  uuid.UUID
	calls    int
}

func (f *fakePaidDeliveryActivationGateway) PublishDeliveryBatch(_ context.Context, tenantID, batchID uuid.UUID) error {
	f.tenantID = tenantID
	f.batchID = batchID
	f.calls++
	return nil
}

func (f *fakePaidBatchGateway) Reconcile(_ context.Context, input nodeadmin.DeliveryOrderBatchReconcileInput) (nodeadmin.DeliveryOrderBatchReconcileResponse, error) {
	f.input = input
	return f.resp, nil
}

func TestDeliveryPaymentCoordinatorProjectsBatchAndConfirmsPaidAmount(t *testing.T) {
	tenantID, batchID, deliveryID := uuid.New(), uuid.New(), uuid.New()
	paymentReference := "mp-123"
	checkout := &fakeDeliveryCheckoutGateway{confirmPaid: nodeadmin.DeliveryCheckoutResponse{
		TenantID: tenantID, CheckoutKey: "checkout-1", Status: "PAID", PaymentReference: &paymentReference,
	}}
	batch := &fakePaidBatchGateway{resp: nodeadmin.DeliveryOrderBatchReconcileResponse{BatchID: batchID, DeliveryID: &deliveryID}}
	coordinator := NewDeliveryPaymentCoordinator(NewDeliveryCheckoutCoordinator(checkout, zap.NewNop()), batch)
	activation := &fakePaidDeliveryActivationGateway{}
	coordinator.SetOrderActivationGateway(activation)
	eventID := uuid.New()
	if err := coordinator.ConfirmPaid(context.Background(), DeliveryPaidPaymentInput{
		TenantID: tenantID, CheckoutKey: "checkout-1", OrderBatchID: batchID, PaymentReference: paymentReference, PaidAmount: 42.5, EventID: eventID,
	}); err != nil {
		t.Fatalf("expected paid confirmation, got %v", err)
	}
	if batch.input.EventID != eventID || batch.input.PaymentConfirmed || checkout.paidInput.DeliveryID == nil || *checkout.paidInput.DeliveryID != deliveryID || checkout.paidInput.PaidAmount != 42.5 {
		t.Fatalf("expected reconciled delivery and amount, batch=%+v checkout=%+v", batch.input, checkout.paidInput)
	}
	if err := coordinator.ReconcilePaid(context.Background(), DeliveryPaidPaymentInput{TenantID: tenantID, OrderBatchID: batchID, EventID: eventID}); err != nil {
		t.Fatalf("expected paid reconciliation, got %v", err)
	}
	if !batch.input.PaymentConfirmed {
		t.Fatalf("expected paid reconciliation flag, batch=%+v", batch.input)
	}
	if activation.calls != 1 || activation.tenantID != tenantID || activation.batchID != batchID {
		t.Fatalf("expected paid delivery batch activation, got %+v", activation)
	}
}
