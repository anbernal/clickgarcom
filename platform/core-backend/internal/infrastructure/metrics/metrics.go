package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ActiveConnections tracks the number of currently connected WebSocket clients
	ActiveConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "kds_active_connections",
		Help: "The number of currently connected WebSocket clients",
	}, []string{"tenant_id"})

	// EventsPublished tracks the total number of events broadcasted
	EventsPublished = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kds_events_published_total",
		Help: "The total number of events broadcasted to clients",
	}, []string{"tenant_id", "event_type"})
)

// IncActiveConnections increments the active connections gauge for a tenant
func IncActiveConnections(tenantID string) {
	ActiveConnections.WithLabelValues(tenantID).Inc()
}

// DecActiveConnections decrements the active connections gauge for a tenant
func DecActiveConnections(tenantID string) {
	ActiveConnections.WithLabelValues(tenantID).Dec()
}

// IncEventsPublished increments the events published counter
func IncEventsPublished(tenantID, eventType string) {
	EventsPublished.WithLabelValues(tenantID, eventType).Inc()
}
