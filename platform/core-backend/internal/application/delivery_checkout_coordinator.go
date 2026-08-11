package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
)

// DeliveryCheckoutGateway is deliberately small so the WhatsApp flow can use
// a fake in development and the Node Admin HTTP client in production.
type DeliveryCheckoutGateway interface {
	Create(context.Context, nodeadmin.DeliveryCheckoutInput) (nodeadmin.DeliveryCheckoutResponse, error)
	Confirm(context.Context, nodeadmin.DeliveryCheckoutConfirmation) (nodeadmin.DeliveryCheckoutResponse, error)
}

type DeliveryCheckoutReconciliationGateway interface {
	Get(context.Context, uuid.UUID, string) (nodeadmin.DeliveryCheckoutResponse, error)
}

type DeliveryCheckoutPaidGateway interface {
	ConfirmPaid(context.Context, nodeadmin.DeliveryCheckoutPaidConfirmation) (nodeadmin.DeliveryCheckoutResponse, error)
}

type DeliveryCheckoutCoordinator struct {
	gateway DeliveryCheckoutGateway
	logger  *zap.Logger
}

type DeliveryCheckoutCreateInput struct {
	TenantID          uuid.UUID
	CustomerID        uuid.UUID
	CustomerAddressID uuid.UUID
	OrderBatchID      *uuid.UUID
	FulfillmentMode   string
	QuoteID           *uuid.UUID
	OrderTotal        float64
	DestinationLat    float64
	DestinationLng    float64
	AddressSnapshot   map[string]interface{}
	// CartFingerprint must change whenever the cart changes. It prevents a
	// stale checkout from being reused for a different cart.
	CartFingerprint string
	CheckoutKey     string
}

type DeliveryCheckoutCreateResult struct {
	CheckoutKey         string
	ConfirmationToken   string
	Status              string
	FulfillmentMode     string
	OrderTotal          float64
	CustomerDeliveryFee float64
	TotalAmount         float64
	Currency            string
	ExpiresAt           time.Time
	QuoteID             *uuid.UUID
}

func NewDeliveryCheckoutCoordinator(gateway DeliveryCheckoutGateway, logger *zap.Logger) *DeliveryCheckoutCoordinator {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryCheckoutCoordinator{gateway: gateway, logger: logger}
}

// Create creates or replays a checkout. The returned financial values are
// authoritative; the Core never recalculates or overwrites the delivery fee.
func (c *DeliveryCheckoutCoordinator) Create(ctx context.Context, input DeliveryCheckoutCreateInput) (DeliveryCheckoutCreateResult, error) {
	if c == nil || c.gateway == nil {
		return DeliveryCheckoutCreateResult{}, fmt.Errorf("delivery checkout gateway is not configured")
	}
	if err := validateCheckoutCreateInput(input); err != nil {
		return DeliveryCheckoutCreateResult{}, err
	}
	key := strings.TrimSpace(input.CheckoutKey)
	if key == "" {
		key = BuildDeliveryCheckoutKey(input)
	}

	response, err := c.gateway.Create(ctx, nodeadmin.DeliveryCheckoutInput{
		TenantID:          input.TenantID,
		CheckoutKey:       key,
		FulfillmentMode:   strings.ToUpper(strings.TrimSpace(input.FulfillmentMode)),
		CustomerID:        input.CustomerID,
		CustomerAddressID: input.CustomerAddressID,
		OrderBatchID:      input.OrderBatchID,
		QuoteID:           input.QuoteID,
		OrderTotal:        input.OrderTotal,
		DestinationLat:    input.DestinationLat,
		DestinationLng:    input.DestinationLng,
		AddressSnapshot:   input.AddressSnapshot,
	})
	if err != nil {
		return DeliveryCheckoutCreateResult{}, err
	}
	if err := validateCheckoutResponse(response, input, key); err != nil {
		return DeliveryCheckoutCreateResult{}, err
	}
	return DeliveryCheckoutCreateResult{
		CheckoutKey:         response.CheckoutKey,
		ConfirmationToken:   deliveryConfirmationToken(response.ConfirmationToken),
		Status:              response.Status,
		FulfillmentMode:     response.FulfillmentMode,
		OrderTotal:          response.OrderTotal,
		CustomerDeliveryFee: response.CustomerDeliveryFee,
		TotalAmount:         response.TotalAmount,
		Currency:            response.Currency,
		ExpiresAt:           response.ExpiresAt,
		QuoteID:             response.QuoteID,
	}, nil
}

// Confirm only accepts a paid response with the same payment reference. It
// is safe to retry because NestJS treats an already-paid checkout idempotently.
func (c *DeliveryCheckoutCoordinator) Confirm(ctx context.Context, tenantID uuid.UUID, checkoutKey, confirmationToken, paymentReference string, deliveryID *uuid.UUID) (nodeadmin.DeliveryCheckoutResponse, error) {
	if c == nil || c.gateway == nil {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout gateway is not configured")
	}
	if tenantID == uuid.Nil || strings.TrimSpace(checkoutKey) == "" || strings.TrimSpace(confirmationToken) == "" || strings.TrimSpace(paymentReference) == "" {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("tenant, checkout, confirmation token and payment reference are required")
	}
	response, err := c.gateway.Confirm(ctx, nodeadmin.DeliveryCheckoutConfirmation{
		TenantID:          tenantID,
		CheckoutKey:       strings.TrimSpace(checkoutKey),
		ConfirmationToken: strings.TrimSpace(confirmationToken),
		PaymentReference:  strings.TrimSpace(paymentReference),
		DeliveryID:        deliveryID,
	})
	if err != nil {
		return nodeadmin.DeliveryCheckoutResponse{}, err
	}
	if response.TenantID != tenantID || response.CheckoutKey != strings.TrimSpace(checkoutKey) {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout response scope mismatch")
	}
	if response.Status != "PAID" || response.PaymentReference == nil || strings.TrimSpace(*response.PaymentReference) != strings.TrimSpace(paymentReference) {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout was not confirmed")
	}
	return response, nil
}

// ConfirmPaid confirms a provider-approved payment through the internal route.
// The amount is checked again by NestJS against the immutable checkout total.
func (c *DeliveryCheckoutCoordinator) ConfirmPaid(ctx context.Context, tenantID uuid.UUID, checkoutKey string, orderBatchID uuid.UUID, paymentReference string, paidAmount float64, deliveryID *uuid.UUID) (nodeadmin.DeliveryCheckoutResponse, error) {
	if c == nil || c.gateway == nil {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout gateway is not configured")
	}
	internal, ok := c.gateway.(DeliveryCheckoutPaidGateway)
	if !ok {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout gateway does not support paid confirmation")
	}
	if tenantID == uuid.Nil || strings.TrimSpace(checkoutKey) == "" || orderBatchID == uuid.Nil || strings.TrimSpace(paymentReference) == "" || !finiteNonNegative(paidAmount) {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("tenant, checkout, payment reference and paid amount are required")
	}
	response, err := internal.ConfirmPaid(ctx, nodeadmin.DeliveryCheckoutPaidConfirmation{
		TenantID: tenantID, CheckoutKey: strings.TrimSpace(checkoutKey), OrderBatchID: orderBatchID, PaymentReference: strings.TrimSpace(paymentReference), PaidAmount: paidAmount, DeliveryID: deliveryID,
	})
	if err != nil {
		return nodeadmin.DeliveryCheckoutResponse{}, err
	}
	if response.TenantID != tenantID || response.CheckoutKey != strings.TrimSpace(checkoutKey) || response.Status != "PAID" || response.PaymentReference == nil || strings.TrimSpace(*response.PaymentReference) != strings.TrimSpace(paymentReference) {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery paid checkout response is invalid")
	}
	return response, nil
}

// Reconcile reads the authoritative state after an ambiguous payment/confirm
// timeout. It never creates a new checkout and returns only tenant-scoped data.
func (c *DeliveryCheckoutCoordinator) Reconcile(ctx context.Context, tenantID uuid.UUID, checkoutKey string) (nodeadmin.DeliveryCheckoutResponse, error) {
	if c == nil || c.gateway == nil {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout gateway is not configured")
	}
	reconciler, ok := c.gateway.(DeliveryCheckoutReconciliationGateway)
	if !ok {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout gateway does not support reconciliation")
	}
	if tenantID == uuid.Nil || strings.TrimSpace(checkoutKey) == "" {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("tenant and checkout key are required")
	}
	response, err := reconciler.Get(ctx, tenantID, strings.TrimSpace(checkoutKey))
	if err != nil {
		return nodeadmin.DeliveryCheckoutResponse{}, err
	}
	if response.TenantID != tenantID || response.CheckoutKey != strings.TrimSpace(checkoutKey) {
		return nodeadmin.DeliveryCheckoutResponse{}, fmt.Errorf("delivery checkout reconciliation scope mismatch")
	}
	return response, nil
}

func BuildDeliveryCheckoutKey(input DeliveryCheckoutCreateInput) string {
	canonical := fmt.Sprintf("%s|%s|%s|%s|%0.2f|%0.6f|%0.6f|%s|%s",
		input.TenantID, input.CustomerID, input.CustomerAddressID,
		strings.ToUpper(strings.TrimSpace(input.FulfillmentMode)),
		input.OrderTotal, input.DestinationLat, input.DestinationLng,
		strings.TrimSpace(input.CartFingerprint), quoteKey(input.QuoteID))
	digest := sha256.Sum256([]byte(canonical))
	return "wa-" + hex.EncodeToString(digest[:])
}

func validateCheckoutCreateInput(input DeliveryCheckoutCreateInput) error {
	if input.TenantID == uuid.Nil || input.CustomerID == uuid.Nil || input.CustomerAddressID == uuid.Nil {
		return fmt.Errorf("tenant, customer and address are required")
	}
	if !finiteNonNegative(input.OrderTotal) {
		return fmt.Errorf("order total must be finite and non-negative")
	}
	if !finiteCoordinate(input.DestinationLat, -90, 90) || !finiteCoordinate(input.DestinationLng, -180, 180) {
		return fmt.Errorf("destination coordinates are invalid")
	}
	return nil
}

func validateCheckoutResponse(response nodeadmin.DeliveryCheckoutResponse, input DeliveryCheckoutCreateInput, key string) error {
	if response.TenantID != input.TenantID || response.CustomerID != input.CustomerID || response.CustomerAddressID != input.CustomerAddressID || response.CheckoutKey != key {
		return fmt.Errorf("delivery checkout response scope mismatch")
	}
	if response.Status != "PENDING_PAYMENT" {
		return fmt.Errorf("delivery checkout is not available for payment: %s", response.Status)
	}
	if response.ExpiresAt.IsZero() || !response.ExpiresAt.After(time.Now()) {
		return fmt.Errorf("delivery checkout is already expired")
	}
	if !finiteNonNegative(response.OrderTotal) || !finiteNonNegative(response.CustomerDeliveryFee) || !finiteNonNegative(response.TotalAmount) {
		return fmt.Errorf("delivery checkout returned invalid financial values")
	}
	if math.Abs(response.OrderTotal-input.OrderTotal) > 0.001 || math.Abs(response.TotalAmount-(response.OrderTotal+response.CustomerDeliveryFee)) > 0.001 {
		return fmt.Errorf("delivery checkout financial snapshot is inconsistent")
	}
	if response.ConfirmationToken == nil || strings.TrimSpace(*response.ConfirmationToken) == "" {
		return fmt.Errorf("delivery checkout confirmation token is missing")
	}
	return nil
}

func finiteNonNegative(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}

func finiteCoordinate(value, min, max float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= min && value <= max
}

func quoteKey(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func deliveryConfirmationToken(token *string) string {
	if token == nil {
		return ""
	}
	return strings.TrimSpace(*token)
}
