package nodeadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type DeliveryQuoteInput struct {
	TenantID          uuid.UUID `json:"tenant_id"`
	CheckoutKey       string    `json:"checkout_key"`
	CustomerID        uuid.UUID `json:"customer_id"`
	CustomerAddressID uuid.UUID `json:"customer_address_id"`
	FormattedAddress  string    `json:"formatted_address"`
	Latitude          float64   `json:"latitude"`
	Longitude         float64   `json:"longitude"`
	OrderTotal        float64   `json:"order_total"`
}

type DeliveryQuoteResponse struct {
	ID                  uuid.UUID `json:"id"`
	TenantID            uuid.UUID `json:"tenant_id"`
	CheckoutKey         string    `json:"checkout_key"`
	CustomerID          uuid.UUID `json:"customer_id"`
	CustomerAddressID   uuid.UUID `json:"customer_address_id"`
	Provider            string    `json:"provider"`
	ExternalQuoteID     string    `json:"external_quote_id"`
	Status              string    `json:"status"`
	CustomerDeliveryFee float64   `json:"customer_delivery_fee"`
	Currency            string    `json:"currency"`
	EstimatedMinutes    int       `json:"estimated_minutes"`
	ExpiresAt           time.Time `json:"expires_at"`
}

// DeliveryQuoteClient owns only the internal quote contract. Provider
// credentials and calls remain inside NestJS, where the fake can later be
// swapped for the iFood sandbox adapter.
type DeliveryQuoteClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

func NewDeliveryQuoteClient(baseURL, internalToken string, logger *zap.Logger) *DeliveryQuoteClient {
	if logger == nil {
		logger = zap.NewNop()
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://node-admin:3002"
	}
	return &DeliveryQuoteClient{baseURL: baseURL, internalToken: strings.TrimSpace(internalToken), httpClient: &http.Client{Timeout: 8 * time.Second}, logger: logger}
}

func (c *DeliveryQuoteClient) Create(ctx context.Context, input DeliveryQuoteInput) (DeliveryQuoteResponse, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return DeliveryQuoteResponse{}, fmt.Errorf("marshal delivery quote request: %w", err)
	}
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/admin/api/internal/delivery/quotes", bytes.NewReader(body))
		if err != nil {
			return DeliveryQuoteResponse{}, fmt.Errorf("build delivery quote request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Token", c.internalToken)
		req.Header.Set("X-Tenant-ID", input.TenantID.String())
		req.Header.Set("X-Correlation-ID", uuid.NewString())
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
			return DeliveryQuoteResponse{}, fmt.Errorf("read delivery quote response: %w", readErr)
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			var result DeliveryQuoteResponse
			if err := json.Unmarshal(responseBody, &result); err != nil {
				return DeliveryQuoteResponse{}, fmt.Errorf("decode delivery quote response: %w", err)
			}
			return result, nil
		}
		lastErr = fmt.Errorf("node-admin delivery quote returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		if resp.StatusCode < 500 || attempt == 3 {
			break
		}
		time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
	}
	c.logger.Warn("delivery quote creation failed", zap.Error(lastErr), zap.String("tenant_id", input.TenantID.String()))
	return DeliveryQuoteResponse{}, lastErr
}
