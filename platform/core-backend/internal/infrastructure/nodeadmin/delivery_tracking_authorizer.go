package nodeadmin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/infrastructure/deliveryrealtime"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DeliveryTrackingAuthorizer asks node-admin to validate the HttpOnly
// tracking credential. Core owns the websocket hub but never touches the
// delivery credential tables or logs the opaque token.
type DeliveryTrackingAuthorizer struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type deliveryTrackingScopeResponse struct {
	TenantID   string `json:"tenant_id"`
	DeliveryID string `json:"delivery_id"`
}

func NewDeliveryTrackingAuthorizer(baseURL, internalToken string, logger *zap.Logger) *DeliveryTrackingAuthorizer {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://node-admin:3002"
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryTrackingAuthorizer{
		baseURL:       baseURL,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 3 * time.Second},
		logger:        logger,
	}
}

func (a *DeliveryTrackingAuthorizer) Authorize(c *fiber.Ctx) (deliveryrealtime.Scope, error) {
	if a == nil || strings.TrimSpace(a.internalToken) == "" {
		return deliveryrealtime.Scope{}, fmt.Errorf("delivery tracking authorizer is not configured")
	}
	trackingToken := strings.TrimSpace(c.Cookies("delivery_tracking_token"))
	if trackingToken == "" {
		return deliveryrealtime.Scope{}, fmt.Errorf("tracking credential is missing")
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, a.baseURL+"/admin/api/internal/deliveries/tracking/authorize", nil)
	if err != nil {
		return deliveryrealtime.Scope{}, fmt.Errorf("create tracking authorization request: %w", err)
	}
	req.Header.Set("X-Internal-Token", a.internalToken)
	req.Header.Set("Cookie", "delivery_tracking_token="+trackingToken)
	resp, err := a.httpClient.Do(req)
	if err != nil {
		a.logger.Warn("delivery tracking authorization request failed", zap.Error(err))
		return deliveryrealtime.Scope{}, fmt.Errorf("tracking authorization unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return deliveryrealtime.Scope{}, fmt.Errorf("tracking credential was rejected")
	}
	var decoded deliveryTrackingScopeResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return deliveryrealtime.Scope{}, fmt.Errorf("decode tracking authorization response: %w", err)
	}
	tenantID, err := uuid.Parse(strings.TrimSpace(decoded.TenantID))
	if err != nil {
		return deliveryrealtime.Scope{}, fmt.Errorf("invalid tracking tenant scope")
	}
	deliveryID, err := uuid.Parse(strings.TrimSpace(decoded.DeliveryID))
	if err != nil {
		return deliveryrealtime.Scope{}, fmt.Errorf("invalid tracking delivery scope")
	}
	return deliveryrealtime.Scope{TenantID: tenantID, DeliveryID: deliveryID}, nil
}
