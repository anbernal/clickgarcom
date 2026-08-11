package maps

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHaversineAndETA(t *testing.T) {
	distance, err := HaversineMeters(Coordinate{Latitude: 0, Longitude: 0}, Coordinate{Latitude: 0, Longitude: 1})
	require.NoError(t, err)
	require.InDelta(t, 111195, distance, 100)
	eta, err := EstimateETA(1000, 30)
	require.NoError(t, err)
	require.Equal(t, 120, eta)
}

func TestCalculatorFallsBackWhenProviderFails(t *testing.T) {
	primary := &failingProvider{}
	calculator := Calculator{Primary: primary, FallbackSpeedKPH: 30}
	result, err := calculator.Route(context.Background(), RouteRequest{
		Origin:      Coordinate{Latitude: -23.55, Longitude: -46.63},
		Destination: Coordinate{Latitude: -23.56, Longitude: -46.64},
	})
	require.NoError(t, err)
	require.True(t, result.Fallback)
	require.Positive(t, result.DistanceMeters)
	require.Positive(t, result.DurationSeconds)
}

func TestHTTPProviderUsesConfiguredEndpointAndKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/route", r.URL.Path)
		require.Equal(t, "secret", r.Header.Get("X-Test-Key"))
		_, _ = w.Write([]byte(`{"distance_meters":1200,"duration_seconds":180,"polyline":"abc"}`))
	}))
	defer server.Close()
	provider, err := NewHTTPProvider(HTTPProviderConfig{BaseURL: server.URL, APIKey: "secret", APIKeyHeader: "X-Test-Key", RoutePath: "/route", Timeout: time.Second})
	require.NoError(t, err)
	result, err := provider.Route(context.Background(), RouteRequest{Origin: Coordinate{}, Destination: Coordinate{Latitude: 1, Longitude: 1}})
	require.NoError(t, err)
	require.Equal(t, 1200, result.DistanceMeters)
	require.False(t, result.Fallback)
}

func TestHTTPProviderRequiresBaseURL(t *testing.T) {
	_, err := NewHTTPProvider(HTTPProviderConfig{})
	require.Error(t, err)
}

func TestHTTPProviderRejectsProviderContractErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"message":"provider failure","api_key":"must-not-be-logged"}`))
	}))
	defer server.Close()
	provider, err := NewHTTPProvider(HTTPProviderConfig{BaseURL: server.URL, RoutePath: "/route"})
	require.NoError(t, err)
	_, err = provider.Route(context.Background(), RouteRequest{Origin: Coordinate{}, Destination: Coordinate{Latitude: 1, Longitude: 1}})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "must-not-be-logged")
}

type failingProvider struct{}

func (failingProvider) Geocode(context.Context, GeocodeRequest) (GeocodeResult, error) {
	return GeocodeResult{}, context.DeadlineExceeded
}
func (failingProvider) Route(context.Context, RouteRequest) (RouteResult, error) {
	return RouteResult{}, context.DeadlineExceeded
}
