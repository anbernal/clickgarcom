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

type DeliveryOrderBatchReconcileInput struct {
	TenantID uuid.UUID
	BatchID  uuid.UUID
	OrderID  uuid.UUID
	EventID  uuid.UUID
}

type DeliveryOrderBatchReconcileResponse struct {
	BatchID    uuid.UUID  `json:"batch_id"`
	DeliveryID *uuid.UUID `json:"delivery_id"`
	Ignored    bool       `json:"ignored"`
	Reason     string     `json:"reason"`
}

// DeliveryOrderBatchClient asks NestJS to project a paid DELIVERY batch into
// the Delivery aggregate. It never writes order or delivery tables directly.
type DeliveryOrderBatchClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

func NewDeliveryOrderBatchClient(baseURL, internalToken string, logger *zap.Logger) *DeliveryOrderBatchClient {
	if logger == nil {
		logger = zap.NewNop()
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://node-admin:3002"
	}
	return &DeliveryOrderBatchClient{baseURL: baseURL, internalToken: strings.TrimSpace(internalToken), httpClient: &http.Client{Timeout: 8 * time.Second}, logger: logger}
}

func (c *DeliveryOrderBatchClient) Reconcile(ctx context.Context, input DeliveryOrderBatchReconcileInput) (DeliveryOrderBatchReconcileResponse, error) {
	if input.TenantID == uuid.Nil || input.BatchID == uuid.Nil {
		return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("tenant and batch are required")
	}
	payload := map[string]interface{}{
		"tenant_id": input.TenantID,
		"batch_id":  input.BatchID,
	}
	if input.OrderID != uuid.Nil {
		payload["order_id"] = input.OrderID
	}
	if input.EventID != uuid.Nil {
		payload["event_id"] = input.EventID
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("marshal delivery batch reconcile request: %w", err)
	}
	var lastErr error
	correlationID := input.EventID.String()
	if input.EventID == uuid.Nil {
		correlationID = input.BatchID.String()
	}
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/admin/api/internal/deliveries/order-event", bytes.NewReader(body))
		if err != nil {
			return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("build delivery batch reconcile request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Token", c.internalToken)
		req.Header.Set("X-Tenant-ID", input.TenantID.String())
		req.Header.Set("X-Correlation-ID", correlationID)
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
			return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("read delivery batch reconcile response: %w", readErr)
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			var result DeliveryOrderBatchReconcileResponse
			if err := json.Unmarshal(responseBody, &result); err != nil {
				return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("decode delivery batch reconcile response: %w", err)
			}
			if result.BatchID != input.BatchID {
				return DeliveryOrderBatchReconcileResponse{}, fmt.Errorf("delivery batch reconcile response scope mismatch")
			}
			return result, nil
		}
		lastErr = fmt.Errorf("node-admin delivery batch reconcile returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		if resp.StatusCode < 500 || attempt == 3 {
			break
		}
		time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
	}
	c.logger.Warn("delivery order batch reconciliation failed", zap.Error(lastErr), zap.String("tenant_id", input.TenantID.String()), zap.String("batch_id", input.BatchID.String()))
	return DeliveryOrderBatchReconcileResponse{}, lastErr
}
