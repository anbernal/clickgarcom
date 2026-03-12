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

type SettlementClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type FinalizeApprovedPaymentInput struct {
	TenantID          uuid.UUID `json:"tenant_id"`
	TabID             uuid.UUID `json:"tab_id"`
	PaymentID         uuid.UUID `json:"payment_id"`
	ProviderPaymentID string    `json:"provider_payment_id,omitempty"`
}

func NewSettlementClient(baseURL, internalToken string, logger *zap.Logger) *SettlementClient {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmedBaseURL == "" {
		trimmedBaseURL = "http://node-admin:3002"
	}

	return &SettlementClient{
		baseURL:       trimmedBaseURL,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 8 * time.Second},
		logger:        logger,
	}
}

func (c *SettlementClient) FinalizeApprovedPayment(ctx context.Context, input FinalizeApprovedPaymentInput) error {
	payload, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("failed to marshal settlement payload: %w", err)
	}

	endpoint := c.baseURL + "/admin/api/internal/payments/settlements/approve"
	var lastErr error

	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
		if err != nil {
			return fmt.Errorf("failed to build settlement request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		if c.internalToken != "" {
			req.Header.Set("X-Internal-Token", c.internalToken)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt) * 300 * time.Millisecond)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}

		lastErr = fmt.Errorf("node-admin settlement returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		if resp.StatusCode >= 500 {
			time.Sleep(time.Duration(attempt) * 300 * time.Millisecond)
			continue
		}
		return lastErr
	}

	if lastErr != nil {
		c.logger.Warn("failed to finalize approved payment in node-admin",
			zap.Error(lastErr),
			zap.String("payment_id", input.PaymentID.String()),
			zap.String("tab_id", input.TabID.String()),
		)
	}

	return lastErr
}
