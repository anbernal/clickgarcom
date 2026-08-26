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

// DigitalMenuAccess is the one-time capability used by WhatsApp to open the
// authenticated digital menu. The raw capability is never persisted by Core.
type DigitalMenuAccess struct {
	Slug           string    `json:"slug"`
	RestaurantName string    `json:"restaurant_name"`
	Capability     string    `json:"capability"`
	ExpiresAt      time.Time `json:"expires_at"`
	Experience     string    `json:"experience"`
}

type DigitalMenuAccessError struct {
	StatusCode int
	Message    string
}

func (e *DigitalMenuAccessError) Error() string {
	return fmt.Sprintf("node-admin digital menu access returned status %d: %s", e.StatusCode, e.Message)
}

type DigitalMenuAccessClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

func NewDigitalMenuAccessClient(baseURL, internalToken string, logger *zap.Logger) *DigitalMenuAccessClient {
	if logger == nil {
		logger = zap.NewNop()
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "http://node-admin:3002"
	}
	return &DigitalMenuAccessClient{
		baseURL:       base,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 8 * time.Second},
		logger:        logger,
	}
}

func (c *DigitalMenuAccessClient) Create(ctx context.Context, tenantID uuid.UUID, phone, experience string) (DigitalMenuAccess, error) {
	payload, err := json.Marshal(map[string]string{"tenant_id": tenantID.String(), "phone": strings.TrimSpace(phone), "experience": strings.TrimSpace(experience)})
	if err != nil {
		return DigitalMenuAccess{}, fmt.Errorf("marshal digital menu access request: %w", err)
	}
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/admin/api/public/menu/internal/access", bytes.NewReader(payload))
		if reqErr != nil {
			return DigitalMenuAccess{}, fmt.Errorf("build digital menu access request: %w", reqErr)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Token", c.internalToken)
		req.Header.Set("X-Tenant-ID", tenantID.String())
		resp, doErr := c.httpClient.Do(req)
		if doErr != nil {
			lastErr = doErr
			if attempt < 3 {
				time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
				continue
			}
			break
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			break
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			var access DigitalMenuAccess
			if err := json.Unmarshal(body, &access); err != nil {
				return DigitalMenuAccess{}, fmt.Errorf("decode digital menu access response: %w", err)
			}
			if strings.TrimSpace(access.Slug) == "" || strings.TrimSpace(access.Capability) == "" {
				return DigitalMenuAccess{}, fmt.Errorf("digital menu access response is incomplete")
			}
			return access, nil
		}
		lastErr = &DigitalMenuAccessError{StatusCode: resp.StatusCode, Message: strings.TrimSpace(string(body))}
		if resp.StatusCode < 500 {
			break
		}
	}
	if lastErr != nil {
		c.logger.Warn("failed to create digital menu access", zap.Error(lastErr), zap.String("tenant_id", tenantID.String()))
	}
	return DigitalMenuAccess{}, lastErr
}
