package nodeadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DeliveryCheckoutClient is the only Core-side writer for Delivery checkout
// state. Business pricing, holds and quote usage remain owned by NestJS.
type DeliveryCheckoutClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type DeliveryCheckoutInput struct {
	TenantID          uuid.UUID              `json:"tenant_id"`
	CheckoutKey       string                 `json:"checkout_key"`
	FulfillmentMode   string                 `json:"fulfillment_mode,omitempty"`
	CustomerID        uuid.UUID              `json:"customer_id"`
	CustomerAddressID uuid.UUID              `json:"customer_address_id"`
	OrderBatchID      *uuid.UUID             `json:"order_batch_id,omitempty"`
	QuoteID           *uuid.UUID             `json:"quote_id,omitempty"`
	OrderTotal        float64                `json:"order_total"`
	DestinationLat    float64                `json:"destination_lat"`
	DestinationLng    float64                `json:"destination_lng"`
	AddressSnapshot   map[string]interface{} `json:"address_snapshot,omitempty"`
}

type DeliveryCheckoutConfirmation struct {
	TenantID          uuid.UUID  `json:"tenant_id"`
	CheckoutKey       string     `json:"checkout_key"`
	ConfirmationToken string     `json:"confirmation_token"`
	PaymentReference  string     `json:"payment_reference"`
	DeliveryID        *uuid.UUID `json:"delivery_id,omitempty"`
}

type DeliveryCheckoutPaidConfirmation struct {
	TenantID         uuid.UUID  `json:"tenant_id"`
	CheckoutKey      string     `json:"checkout_key"`
	PaymentReference string     `json:"payment_reference"`
	OrderBatchID     uuid.UUID  `json:"order_batch_id"`
	PaidAmount       float64    `json:"paid_amount"`
	DeliveryID       *uuid.UUID `json:"delivery_id,omitempty"`
}

type DeliveryCheckoutResponse struct {
	ID                  uuid.UUID              `json:"id"`
	TenantID            uuid.UUID              `json:"tenant_id"`
	CheckoutKey         string                 `json:"checkout_key"`
	FulfillmentMode     string                 `json:"fulfillment_mode"`
	CustomerID          uuid.UUID              `json:"customer_id"`
	CustomerAddressID   uuid.UUID              `json:"customer_address_id"`
	OrderBatchID        *uuid.UUID             `json:"order_batch_id"`
	QuoteID             *uuid.UUID             `json:"quote_id"`
	Status              string                 `json:"status"`
	OrderTotal          float64                `json:"order_total"`
	CustomerDeliveryFee float64                `json:"customer_delivery_fee"`
	TotalAmount         float64                `json:"total_amount"`
	Currency            string                 `json:"currency"`
	ExpiresAt           time.Time              `json:"expires_at"`
	PaymentReference    *string                `json:"payment_reference"`
	DeliveryID          *uuid.UUID             `json:"delivery_id"`
	ConfirmationToken   *string                `json:"confirmation_token"`
	FinancialSnapshot   map[string]interface{} `json:"financial_snapshot"`
}

func NewDeliveryCheckoutClient(baseURL, internalToken string, logger *zap.Logger) *DeliveryCheckoutClient {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmedBaseURL == "" {
		trimmedBaseURL = "http://node-admin:3002"
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryCheckoutClient{
		baseURL:       trimmedBaseURL,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 8 * time.Second},
		logger:        logger,
	}
}

func (c *DeliveryCheckoutClient) Create(ctx context.Context, input DeliveryCheckoutInput) (DeliveryCheckoutResponse, error) {
	var response DeliveryCheckoutResponse
	if err := c.post(ctx, "/admin/api/internal/delivery/checkout", input, &response); err != nil {
		c.logger.Warn("delivery checkout creation failed", zap.Error(err), zap.String("tenant_id", input.TenantID.String()), zap.String("checkout_key", input.CheckoutKey))
		return DeliveryCheckoutResponse{}, err
	}
	return response, nil
}

func (c *DeliveryCheckoutClient) Confirm(ctx context.Context, input DeliveryCheckoutConfirmation) (DeliveryCheckoutResponse, error) {
	var response DeliveryCheckoutResponse
	if err := c.post(ctx, "/admin/api/internal/delivery/checkout/confirm", input, &response); err != nil {
		c.logger.Warn("delivery checkout confirmation failed", zap.Error(err), zap.String("tenant_id", input.TenantID.String()), zap.String("checkout_key", input.CheckoutKey))
		return DeliveryCheckoutResponse{}, err
	}
	return response, nil
}

// ConfirmPaid is restricted to the internal service-token route and is used
// only after the payment provider has reported an approved amount. It avoids
// persisting or replaying the customer-facing confirmation token in payment
// webhooks.
func (c *DeliveryCheckoutClient) ConfirmPaid(ctx context.Context, input DeliveryCheckoutPaidConfirmation) (DeliveryCheckoutResponse, error) {
	var response DeliveryCheckoutResponse
	if err := c.post(ctx, "/admin/api/internal/delivery/checkout/confirm-paid", input, &response); err != nil {
		c.logger.Warn("delivery paid checkout confirmation failed", zap.Error(err), zap.String("tenant_id", input.TenantID.String()), zap.String("checkout_key", input.CheckoutKey))
		return DeliveryCheckoutResponse{}, err
	}
	return response, nil
}

func (c *DeliveryCheckoutClient) Get(ctx context.Context, tenantID uuid.UUID, checkoutKey string) (DeliveryCheckoutResponse, error) {
	var response DeliveryCheckoutResponse
	path := "/admin/api/internal/delivery/checkout/" + url.PathEscape(strings.TrimSpace(checkoutKey))
	if err := c.request(ctx, http.MethodGet, path, tenantID, nil, &response); err != nil {
		c.logger.Warn("delivery checkout reconciliation failed", zap.Error(err), zap.String("tenant_id", tenantID.String()))
		return DeliveryCheckoutResponse{}, err
	}
	return response, nil
}

func (c *DeliveryCheckoutClient) Cancel(ctx context.Context, tenantID uuid.UUID, checkoutKey string) (DeliveryCheckoutResponse, error) {
	var response DeliveryCheckoutResponse
	path := "/admin/api/internal/delivery/checkout/" + url.PathEscape(strings.TrimSpace(checkoutKey)) + "/cancel"
	if err := c.request(ctx, http.MethodPost, path, tenantID, nil, &response); err != nil {
		return DeliveryCheckoutResponse{}, err
	}
	return response, nil
}

func (c *DeliveryCheckoutClient) post(ctx context.Context, path string, payload interface{}, target interface{}) error {
	return c.request(ctx, http.MethodPost, path, uuid.Nil, payload, target)
}

func (c *DeliveryCheckoutClient) request(ctx context.Context, method, path string, tenantID uuid.UUID, payload interface{}, target interface{}) error {
	body, err := json.Marshal(payload)
	if payload != nil && err != nil {
		return fmt.Errorf("marshal delivery checkout request: %w", err)
	}
	if payload == nil {
		body = nil
	}
	endpoint := c.baseURL + path
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		var reader io.Reader
		if body != nil {
			reader = bytes.NewReader(body)
		}
		req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
		if err != nil {
			return fmt.Errorf("build delivery checkout request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Correlation-ID", uuid.NewString())
		if c.internalToken != "" {
			req.Header.Set("X-Internal-Token", c.internalToken)
		}
		if tenantID != uuid.Nil {
			req.Header.Set("X-Tenant-ID", tenantID.String())
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			if attempt < 3 {
				time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
				continue
			}
			break
		}
		responseBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("read delivery checkout response: %w", readErr)
			break
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if target == nil || len(responseBody) == 0 {
				return nil
			}
			if err := json.Unmarshal(responseBody, target); err != nil {
				return fmt.Errorf("decode delivery checkout response: %w", err)
			}
			return nil
		}
		lastErr = fmt.Errorf("node-admin delivery checkout returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		if resp.StatusCode < 500 {
			break
		}
		if attempt < 3 {
			time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
		}
	}
	return lastErr
}
