package maps

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type HTTPProviderConfig struct {
	BaseURL      string
	APIKey       string
	APIKeyHeader string
	GeocodePath  string
	RoutePath    string
	ProviderName string
	Timeout      time.Duration
	HTTPClient   *http.Client
}

type HTTPProvider struct {
	baseURL, apiKey, apiKeyHeader, geocodePath, routePath, providerName string
	client                                                              *http.Client
}

func NewHTTPProvider(config HTTPProviderConfig) (*HTTPProvider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("maps provider base URL is required")
	}
	timeout := config.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	client := config.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	header := strings.TrimSpace(config.APIKeyHeader)
	if header == "" {
		header = "X-API-Key"
	}
	name := strings.TrimSpace(config.ProviderName)
	if name == "" {
		name = "http"
	}
	return &HTTPProvider{baseURL: baseURL, apiKey: config.APIKey, apiKeyHeader: header,
		geocodePath: normalizePath(config.GeocodePath), routePath: normalizePath(config.RoutePath),
		providerName: name, client: client}, nil
}

func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

func (p *HTTPProvider) Geocode(ctx context.Context, request GeocodeRequest) (GeocodeResult, error) {
	if p == nil || p.geocodePath == "" {
		return GeocodeResult{}, fmt.Errorf("maps geocode path is not configured")
	}
	var response struct {
		Latitude   float64 `json:"latitude"`
		Longitude  float64 `json:"longitude"`
		Lat        float64 `json:"lat"`
		Lng        float64 `json:"lng"`
		ProviderID string  `json:"provider_id"`
		Quality    string  `json:"quality"`
	}
	if err := p.doJSON(ctx, http.MethodPost, p.geocodePath, request, &response); err != nil {
		return GeocodeResult{}, err
	}
	if response.Latitude == 0 && response.Longitude == 0 && (response.Lat != 0 || response.Lng != 0) {
		response.Latitude, response.Longitude = response.Lat, response.Lng
	}
	result := GeocodeResult{Coordinate: Coordinate{Latitude: response.Latitude, Longitude: response.Longitude}, ProviderID: response.ProviderID, Quality: response.Quality}
	if err := ValidateGeocodeResult(result); err != nil {
		return GeocodeResult{}, err
	}
	return result, nil
}

func (p *HTTPProvider) Route(ctx context.Context, request RouteRequest) (RouteResult, error) {
	if p == nil || p.routePath == "" {
		return RouteResult{}, fmt.Errorf("maps route path is not configured")
	}
	var result RouteResult
	if err := p.doJSON(ctx, http.MethodPost, p.routePath, request, &result); err != nil {
		return RouteResult{}, err
	}
	if err := ValidateRouteResult(result); err != nil {
		return RouteResult{}, err
	}
	result.Provider = p.providerName
	return result, nil
}

func (p *HTTPProvider) doJSON(ctx context.Context, method, path string, payload, response interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal maps request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create maps request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(p.apiKey) != "" {
		req.Header.Set(p.apiKeyHeader, p.apiKey)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("maps provider request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("maps provider returned HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(response); err != nil {
		return fmt.Errorf("decode maps provider response: %w", err)
	}
	return nil
}
