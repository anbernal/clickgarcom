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

// DeliveryCustomerClient owns the Core-to-NestJS contract for customer and
// address operations. It deliberately exposes only sanitized projections.
type DeliveryCustomerClient struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
	logger        *zap.Logger
}

type ResolveDeliveryCustomerInput struct {
	TenantID uuid.UUID `json:"tenant_id"`
	Phone    string    `json:"phone"`
}

type DeliveryCustomer struct {
	ID              uuid.UUID `json:"id"`
	PhoneNormalized string    `json:"phone_normalized"`
	PhoneMasked     string    `json:"phone_masked"`
}

type DeliveryAddress struct {
	ID                uuid.UUID  `json:"id"`
	CustomerID        uuid.UUID  `json:"customer_id"`
	Label             string     `json:"label"`
	PostalCode        string     `json:"postal_code"`
	Street            string     `json:"street"`
	AddressNumber     string     `json:"address_number"`
	AddressComplement *string    `json:"address_complement"`
	Neighborhood      string     `json:"neighborhood"`
	City              string     `json:"city"`
	State             string     `json:"state"`
	AddressReference  *string    `json:"address_reference"`
	FormattedAddress  string     `json:"formatted_address"`
	Latitude          *float64   `json:"latitude"`
	Longitude         *float64   `json:"longitude"`
	IsDefault         bool       `json:"is_default"`
	LastUsedAt        *time.Time `json:"last_used_at"`
	ConfirmedAt       time.Time  `json:"confirmed_at"`
}

type CreateDeliveryAddressInput struct {
	Label                  string   `json:"label"`
	PostalCode             string   `json:"postal_code"`
	Street                 string   `json:"street"`
	AddressNumber          string   `json:"address_number"`
	AddressComplement      string   `json:"address_complement,omitempty"`
	Neighborhood           string   `json:"neighborhood"`
	City                   string   `json:"city"`
	State                  string   `json:"state"`
	AddressReference       string   `json:"address_reference,omitempty"`
	Latitude               *float64 `json:"latitude,omitempty"`
	Longitude              *float64 `json:"longitude,omitempty"`
	PostalCodeProvider     string   `json:"postal_code_provider,omitempty"`
	PostalCodeProviderRef  string   `json:"postal_code_provider_ref,omitempty"`
	PostalCodeLookupStatus string   `json:"postal_code_lookup_status,omitempty"`
	GeocodeProvider        string   `json:"geocode_provider,omitempty"`
	GeocodeProviderID      string   `json:"geocode_provider_id,omitempty"`
	GeocodeQuality         string   `json:"geocode_quality,omitempty"`
	Confirmed              bool     `json:"confirmed"`
	IsDefault              bool     `json:"is_default,omitempty"`
}

type UpdateDeliveryAddressInput struct {
	Label             *string  `json:"label,omitempty"`
	PostalCode        *string  `json:"postal_code,omitempty"`
	Street            *string  `json:"street,omitempty"`
	AddressNumber     *string  `json:"address_number,omitempty"`
	AddressComplement *string  `json:"address_complement,omitempty"`
	Neighborhood      *string  `json:"neighborhood,omitempty"`
	City              *string  `json:"city,omitempty"`
	State             *string  `json:"state,omitempty"`
	AddressReference  *string  `json:"address_reference,omitempty"`
	Latitude          *float64 `json:"latitude,omitempty"`
	Longitude         *float64 `json:"longitude,omitempty"`
	Confirmed         *bool    `json:"confirmed,omitempty"`
	IsDefault         *bool    `json:"is_default,omitempty"`
}

type PostalCodeLookupResult struct {
	PostalCode   string `json:"postal_code"`
	Street       string `json:"street"`
	Neighborhood string `json:"neighborhood"`
	City         string `json:"city"`
	State        string `json:"state"`
	Provider     string `json:"provider"`
	Status       string `json:"status"`
}

type GeocodeDeliveryAddressInput struct {
	Street            string `json:"street"`
	AddressNumber     string `json:"address_number"`
	AddressComplement string `json:"address_complement,omitempty"`
	Neighborhood      string `json:"neighborhood"`
	City              string `json:"city"`
	State             string `json:"state"`
	PostalCode        string `json:"postal_code"`
}

type GeocodeDeliveryAddressResult struct {
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	GeocodeProvider      string  `json:"geocode_provider"`
	GeocodeProviderID    *string `json:"geocode_provider_id"`
	GeocodeQuality       string  `json:"geocode_quality"`
	RequiresConfirmation bool    `json:"requires_confirmation"`
}

func NewDeliveryCustomerClient(baseURL, internalToken string, logger *zap.Logger) *DeliveryCustomerClient {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		trimmed = "http://node-admin:3002"
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &DeliveryCustomerClient{
		baseURL:       trimmed,
		internalToken: strings.TrimSpace(internalToken),
		httpClient:    &http.Client{Timeout: 8 * time.Second},
		logger:        logger,
	}
}

func (c *DeliveryCustomerClient) Resolve(ctx context.Context, input ResolveDeliveryCustomerInput) (DeliveryCustomer, error) {
	var result DeliveryCustomer
	err := c.request(ctx, http.MethodPost, "/admin/api/internal/delivery/customers/resolve", input, input.TenantID, &result)
	if err != nil {
		c.logger.Warn("delivery customer resolution failed", zap.Error(err), zap.String("tenant_id", input.TenantID.String()))
	}
	return result, err
}

func (c *DeliveryCustomerClient) ListAddresses(ctx context.Context, tenantID, customerID uuid.UUID) ([]DeliveryAddress, error) {
	var result []DeliveryAddress
	err := c.request(ctx, http.MethodGet, "/admin/api/internal/delivery/customers/"+customerID.String()+"/addresses", nil, tenantID, &result)
	return result, err
}

func (c *DeliveryCustomerClient) CreateAddress(ctx context.Context, tenantID, customerID uuid.UUID, input CreateDeliveryAddressInput) (DeliveryAddress, error) {
	var result DeliveryAddress
	err := c.request(ctx, http.MethodPost, "/admin/api/internal/delivery/customers/"+customerID.String()+"/addresses", input, tenantID, &result)
	return result, err
}

func (c *DeliveryCustomerClient) UpdateAddress(ctx context.Context, tenantID, customerID, addressID uuid.UUID, input UpdateDeliveryAddressInput) (DeliveryAddress, error) {
	var result DeliveryAddress
	err := c.request(ctx, http.MethodPut, "/admin/api/internal/delivery/customers/"+customerID.String()+"/addresses/"+addressID.String(), input, tenantID, &result)
	return result, err
}

func (c *DeliveryCustomerClient) DeleteAddress(ctx context.Context, tenantID, customerID, addressID uuid.UUID) error {
	return c.request(ctx, http.MethodDelete, "/admin/api/internal/delivery/customers/"+customerID.String()+"/addresses/"+addressID.String(), nil, tenantID, nil)
}

func (c *DeliveryCustomerClient) LookupPostalCode(ctx context.Context, tenantID uuid.UUID, postalCode string) (PostalCodeLookupResult, error) {
	var result PostalCodeLookupResult
	err := c.request(ctx, http.MethodPost, "/admin/api/internal/delivery/addresses/postal-code-lookup", map[string]string{"postal_code": postalCode}, tenantID, &result)
	return result, err
}

func (c *DeliveryCustomerClient) Geocode(ctx context.Context, tenantID uuid.UUID, input GeocodeDeliveryAddressInput) (GeocodeDeliveryAddressResult, error) {
	var result GeocodeDeliveryAddressResult
	err := c.request(ctx, http.MethodPost, "/admin/api/internal/delivery/addresses/geocode", input, tenantID, &result)
	return result, err
}

func (c *DeliveryCustomerClient) request(ctx context.Context, method, path string, payload interface{}, tenantID uuid.UUID, target interface{}) error {
	var body []byte
	var err error
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("marshal delivery customer request: %w", err)
		}
	}
	endpoint := c.baseURL + path
	for attempt := 1; attempt <= 3; attempt++ {
		var reader io.Reader
		if body != nil {
			reader = bytes.NewReader(body)
		}
		req, buildErr := http.NewRequestWithContext(ctx, method, endpoint, reader)
		if buildErr != nil {
			return fmt.Errorf("build delivery customer request: %w", buildErr)
		}
		req.Header.Set("X-Internal-Token", c.internalToken)
		req.Header.Set("X-Tenant-ID", tenantID.String())
		req.Header.Set("X-Correlation-ID", uuid.NewString())
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, doErr := c.httpClient.Do(req)
		if doErr != nil {
			if attempt < 3 {
				time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
				continue
			}
			return doErr
		}
		responseBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("read delivery customer response: %w", readErr)
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if target == nil || len(responseBody) == 0 {
				return nil
			}
			if err := json.Unmarshal(responseBody, target); err != nil {
				return fmt.Errorf("decode delivery customer response: %w", err)
			}
			return nil
		}
		lastErr := fmt.Errorf("node-admin delivery customer returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		if resp.StatusCode < 500 || attempt == 3 {
			return lastErr
		}
		time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
	}
	return fmt.Errorf("delivery customer request failed")
}
