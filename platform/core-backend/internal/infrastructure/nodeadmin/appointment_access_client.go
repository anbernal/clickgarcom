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

// AppointmentAccessClient mints a short lived booking capability for the
// phone already authenticated by the WhatsApp session.
type AppointmentAccessClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type AppointmentAccess struct {
	Slug       string    `json:"slug"`
	Capability string    `json:"capability"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

func NewAppointmentAccessClient(baseURL, internalToken string, logger *zap.Logger) *AppointmentAccessClient {
	if logger == nil {
		logger = zap.NewNop()
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "http://node-admin:3002"
	}
	return &AppointmentAccessClient{baseURL: base, internalToken: strings.TrimSpace(internalToken), httpClient: &http.Client{Timeout: 8 * time.Second}, logger: logger}
}

func (c *AppointmentAccessClient) Create(ctx context.Context, tenantID uuid.UUID, phone string) (AppointmentAccess, error) {
	payload, err := json.Marshal(map[string]string{"tenant_id": tenantID.String(), "phone": strings.TrimSpace(phone), "purpose": "BOOKING"})
	if err != nil {
		return AppointmentAccess{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/api/appointments/access", bytes.NewReader(payload))
	if err != nil {
		return AppointmentAccess{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalToken)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return AppointmentAccess{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return AppointmentAccess{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return AppointmentAccess{}, fmt.Errorf("appointment access returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var access AppointmentAccess
	if err := json.Unmarshal(body, &access); err != nil {
		return AppointmentAccess{}, err
	}
	if strings.TrimSpace(access.Slug) == "" || strings.TrimSpace(access.Capability) == "" {
		return AppointmentAccess{}, fmt.Errorf("appointment access response is incomplete")
	}
	return access, nil
}
