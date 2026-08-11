package maps

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
)

type Calculator struct {
	Primary          Provider
	Fallback         Provider
	FallbackSpeedKPH float64
	ProviderName     string
}

func (c Calculator) Route(ctx context.Context, request RouteRequest) (RouteResult, error) {
	started := time.Now()
	if !request.Origin.Valid() || !request.Destination.Valid() {
		return RouteResult{}, ErrInvalidCoordinate
	}
	if c.Primary != nil {
		result, err := c.Primary.Route(ctx, request)
		if err == nil && ValidateRouteResult(result) == nil {
			result.Fallback = false
			metrics.ObserveMapProvider("route", providerName(c.ProviderName, result.Provider), "success", time.Since(started).Seconds())
			return result, nil
		}
		metrics.ObserveMapProvider("route", providerName(c.ProviderName, "primary"), "error", time.Since(started).Seconds())
	}
	fallback := c.Fallback
	if fallback == nil {
		speed := c.FallbackSpeedKPH
		if speed <= 0 {
			speed = 25
		}
		fallback = &FakeProvider{SpeedKPH: speed}
	}
	result, err := fallback.Route(ctx, request)
	if err != nil {
		return RouteResult{}, fmt.Errorf("maps route unavailable: %w", err)
	}
	result.Fallback = true
	if strings.TrimSpace(result.Provider) == "" {
		result.Provider = "fallback"
	}
	metrics.IncMapFallback("route")
	metrics.ObserveMapProvider("route", result.Provider, "fallback", time.Since(started).Seconds())
	return result, nil
}

func (c Calculator) Geocode(ctx context.Context, request GeocodeRequest) (GeocodeResult, error) {
	started := time.Now()
	if c.Primary == nil {
		return GeocodeResult{}, fmt.Errorf("maps geocode provider is not configured")
	}
	result, err := c.Primary.Geocode(ctx, request)
	if err != nil {
		metrics.ObserveMapProvider("geocode", providerName(c.ProviderName, "primary"), "error", time.Since(started).Seconds())
		return GeocodeResult{}, err
	}
	metrics.ObserveMapProvider("geocode", providerName(c.ProviderName, "primary"), "success", time.Since(started).Seconds())
	return result, nil
}

func providerName(configured, fallback string) string {
	if strings.TrimSpace(configured) != "" {
		return strings.TrimSpace(configured)
	}
	if strings.TrimSpace(fallback) != "" {
		return strings.TrimSpace(fallback)
	}
	return "unknown"
}
