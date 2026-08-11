package maps

import (
	"context"
	"strings"
)

// FakeProvider is deterministic and intended for contract/unit tests. It can
// be seeded with known geocodes; routes use Haversine plus a configurable
// average speed and are explicitly marked fallback.
type FakeProvider struct {
	Geocodes     map[string]GeocodeResult
	SpeedKPH     float64
	ProviderName string
}

func (f *FakeProvider) Geocode(_ context.Context, request GeocodeRequest) (GeocodeResult, error) {
	if f == nil || f.Geocodes == nil {
		return GeocodeResult{}, ErrInvalidCoordinate
	}
	result, ok := f.Geocodes[strings.ToLower(strings.TrimSpace(request.Address))]
	if !ok {
		return GeocodeResult{}, ErrInvalidCoordinate
	}
	if err := ValidateGeocodeResult(result); err != nil {
		return GeocodeResult{}, err
	}
	return result, nil
}

func (f *FakeProvider) Route(_ context.Context, request RouteRequest) (RouteResult, error) {
	distance, err := HaversineMeters(request.Origin, request.Destination)
	if err != nil {
		return RouteResult{}, err
	}
	speed := 25.0
	if f != nil && f.SpeedKPH > 0 {
		speed = f.SpeedKPH
	}
	eta, err := EstimateETA(distance, speed)
	if err != nil {
		return RouteResult{}, err
	}
	provider := "fake"
	if f != nil && strings.TrimSpace(f.ProviderName) != "" {
		provider = strings.TrimSpace(f.ProviderName)
	}
	return RouteResult{DistanceMeters: distance, DurationSeconds: eta, Provider: provider, Fallback: true}, nil
}
