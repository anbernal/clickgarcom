// Package maps contains a provider-neutral adapter for geocoding and route
// estimates. Providers are injected by the Delivery service; no API key or
// vendor URL is embedded in this package.
package maps

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
)

var (
	ErrInvalidCoordinate = errors.New("invalid map coordinate")
	ErrInvalidRoute      = errors.New("invalid route result")
)

type Coordinate struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func (c Coordinate) Valid() bool {
	return !math.IsNaN(c.Latitude) && !math.IsInf(c.Latitude, 0) && c.Latitude >= -90 && c.Latitude <= 90 &&
		!math.IsNaN(c.Longitude) && !math.IsInf(c.Longitude, 0) && c.Longitude >= -180 && c.Longitude <= 180
}

type GeocodeRequest struct {
	Address string `json:"address"`
}

type GeocodeResult struct {
	Coordinate Coordinate `json:"coordinate"`
	ProviderID string     `json:"provider_id,omitempty"`
	Quality    string     `json:"quality,omitempty"`
}

type RouteRequest struct {
	Origin      Coordinate `json:"origin"`
	Destination Coordinate `json:"destination"`
}

type RouteResult struct {
	DistanceMeters  int    `json:"distance_meters"`
	DurationSeconds int    `json:"duration_seconds"`
	Polyline        string `json:"polyline,omitempty"`
	Provider        string `json:"provider,omitempty"`
	Fallback        bool   `json:"fallback"`
}

type Provider interface {
	Geocode(context.Context, GeocodeRequest) (GeocodeResult, error)
	Route(context.Context, RouteRequest) (RouteResult, error)
}

func ValidateGeocodeResult(result GeocodeResult) error {
	if !result.Coordinate.Valid() {
		return fmt.Errorf("%w: geocode coordinate", ErrInvalidCoordinate)
	}
	if strings.TrimSpace(result.Quality) == "" {
		result.Quality = "APPROXIMATE"
	}
	return nil
}

func ValidateRouteResult(result RouteResult) error {
	if result.DistanceMeters < 0 || result.DurationSeconds < 0 {
		return ErrInvalidRoute
	}
	return nil
}
