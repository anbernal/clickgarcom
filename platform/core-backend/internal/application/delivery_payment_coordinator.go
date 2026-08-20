package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
	"github.com/google/uuid"
)

// DeliveryPaidPaymentInput contains only server-side payment facts. It is
// intentionally independent from a WhatsApp session because webhooks may be
// delivered after the conversation has expired.
type DeliveryPaidPaymentInput struct {
	TenantID         uuid.UUID
	CheckoutKey      string
	OrderBatchID     uuid.UUID
	PaymentReference string
	PaidAmount       float64
	EventID          uuid.UUID
}

type DeliveryPaymentCoordinator struct {
	checkout        *DeliveryCheckoutCoordinator
	batch           DeliveryOrderBatchGateway
	orderActivation DeliveryOrderActivationGateway
}

// DeliveryOrderActivationGateway releases the already persisted operational
// orders only after the delivery checkout has been confirmed as paid.
type DeliveryOrderActivationGateway interface {
	PublishDeliveryBatch(ctx context.Context, tenantID, batchID uuid.UUID) error
}

func NewDeliveryPaymentCoordinator(checkout *DeliveryCheckoutCoordinator, batch DeliveryOrderBatchGateway) *DeliveryPaymentCoordinator {
	return &DeliveryPaymentCoordinator{checkout: checkout, batch: batch}
}

func (c *DeliveryPaymentCoordinator) SetOrderActivationGateway(gateway DeliveryOrderActivationGateway) {
	if c != nil {
		c.orderActivation = gateway
	}
}

// ConfirmPaid projects the DELIVERY batch first and then confirms the
// provider-approved amount against the immutable NestJS checkout. The paid
// projection is intentionally finalized by ReconcilePaid after the customer
// payment message is sent, preserving WhatsApp message order.
func (c *DeliveryPaymentCoordinator) ConfirmPaid(ctx context.Context, input DeliveryPaidPaymentInput) error {
	if c == nil || c.checkout == nil || c.batch == nil {
		return fmt.Errorf("delivery payment coordinator is not configured")
	}
	if input.TenantID == uuid.Nil || strings.TrimSpace(input.CheckoutKey) == "" || input.OrderBatchID == uuid.Nil || strings.TrimSpace(input.PaymentReference) == "" || !finiteNonNegative(input.PaidAmount) {
		return fmt.Errorf("tenant, checkout, order batch, payment reference and paid amount are required")
	}
	if input.EventID == uuid.Nil {
		return fmt.Errorf("delivery payment event id is required")
	}
	reconciled, err := c.batch.Reconcile(ctx, nodeadmin.DeliveryOrderBatchReconcileInput{TenantID: input.TenantID, BatchID: input.OrderBatchID, EventID: input.EventID})
	if err != nil {
		return err
	}
	if reconciled.DeliveryID == nil || *reconciled.DeliveryID == uuid.Nil {
		return fmt.Errorf("delivery is not available for payment confirmation: %s", strings.TrimSpace(reconciled.Reason))
	}
	if _, err = c.checkout.ConfirmPaid(ctx, input.TenantID, input.CheckoutKey, input.OrderBatchID, input.PaymentReference, input.PaidAmount, reconciled.DeliveryID); err != nil {
		return err
	}
	return nil
}

// ReconcilePaid promotes the already-confirmed delivery. It is called only
// after the payment-approved message has been handed to WhatsApp so the
// subsequent preparation notification cannot overtake it in the outbox.
func (c *DeliveryPaymentCoordinator) ReconcilePaid(ctx context.Context, input DeliveryPaidPaymentInput) error {
	if c == nil || c.batch == nil {
		return fmt.Errorf("delivery payment coordinator is not configured")
	}
	if input.TenantID == uuid.Nil || input.OrderBatchID == uuid.Nil || input.EventID == uuid.Nil {
		return fmt.Errorf("tenant, order batch and payment event id are required")
	}
	if _, err := c.batch.Reconcile(ctx, nodeadmin.DeliveryOrderBatchReconcileInput{
		TenantID: input.TenantID, BatchID: input.OrderBatchID, EventID: input.EventID, PaymentConfirmed: true,
	}); err != nil {
		return err
	}
	if c.orderActivation != nil {
		if err := c.orderActivation.PublishDeliveryBatch(ctx, input.TenantID, input.OrderBatchID); err != nil {
			return fmt.Errorf("publish paid delivery batch: %w", err)
		}
	}
	return nil
}
