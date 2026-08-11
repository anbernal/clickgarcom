package maps

import "math"

const earthRadiusMeters = 6371008.8

// HaversineMeters provides a deterministic straight-line fallback. It is not
// a road route and callers must expose RouteResult.Fallback to operators.
func HaversineMeters(origin, destination Coordinate) (int, error) {
	if !origin.Valid() || !destination.Valid() {
		return 0, ErrInvalidCoordinate
	}
	lat1, lat2 := origin.Latitude*math.Pi/180, destination.Latitude*math.Pi/180
	dLat := lat2 - lat1
	dLon := (destination.Longitude - origin.Longitude) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLon/2)*math.Sin(dLon/2)
	distance := earthRadiusMeters * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return int(math.Round(distance)), nil
}

// EstimateETA returns a conservative duration for the fallback distance.
func EstimateETA(distanceMeters int, speedKPH float64) (int, error) {
	if distanceMeters < 0 || speedKPH <= 0 || math.IsNaN(speedKPH) || math.IsInf(speedKPH, 0) {
		return 0, ErrInvalidRoute
	}
	seconds := float64(distanceMeters) / (speedKPH * 1000 / 3600)
	return int(math.Ceil(seconds)), nil
}
