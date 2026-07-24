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

// PortalAccessClient requests a one-tab customer portal URL from node-admin.
// The raw portal token is returned once and is never persisted by the worker.
type PortalAccessClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type createPortalAccessResponse struct {
	PortalURL string `json:"portalUrl"`
}

func NewPortalAccessClient(baseURL, internalToken string, logger *zap.Logger) *PortalAccessClient {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmedBaseURL == "" {
		trimmedBaseURL = "http://node-admin:3002"
	}

	return &PortalAccessClient{
		baseURL:       trimmedBaseURL,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 8 * time.Second},
		logger:        logger,
	}
}

func (c *PortalAccessClient) CreatePortalAccess(ctx context.Context, tenantID, tabID uuid.UUID) (string, error) {
	payload, err := json.Marshal(struct {
		TenantID uuid.UUID `json:"tenant_id"`
		TabID    uuid.UUID `json:"tab_id"`
	}{TenantID: tenantID, TabID: tabID})
	if err != nil {
		return "", fmt.Errorf("failed to marshal portal access payload: %w", err)
	}

	endpoint := c.baseURL + "/admin/api/internal/payments/portal-access"
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
		if err != nil {
			return "", fmt.Errorf("failed to build portal access request: %w", err)
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
			var decoded createPortalAccessResponse
			if err := json.Unmarshal(body, &decoded); err != nil {
				return "", fmt.Errorf("failed to decode portal access response: %w", err)
			}
			if strings.TrimSpace(decoded.PortalURL) == "" {
				return "", fmt.Errorf("node-admin portal access response did not include portalUrl")
			}
			return strings.TrimSpace(decoded.PortalURL), nil
		}

		lastErr = fmt.Errorf("node-admin portal access returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		if resp.StatusCode >= 500 {
			time.Sleep(time.Duration(attempt) * 300 * time.Millisecond)
			continue
		}
		break
	}

	c.logger.Warn("failed to create portal access in node-admin",
		zap.Error(lastErr),
		zap.String("tab_id", tabID.String()),
	)
	return "", lastErr
}
