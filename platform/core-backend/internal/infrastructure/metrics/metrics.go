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

	ConsumerActive = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "clickgarcom_consumer_active",
		Help: "Whether the queue consumer loop is active for a given queue",
	}, []string{"queue"})

	ConsumerMessagesProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "clickgarcom_consumer_messages_processed_total",
		Help: "The total number of messages processed by queue consumers",
	}, []string{"queue", "status"})

	ConsumerProcessingDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "clickgarcom_consumer_processing_duration_seconds",
		Help:    "Time spent processing messages by queue consumers",
		Buckets: prometheus.DefBuckets,
	}, []string{"queue", "status"})

	OutboxPendingMessages = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "clickgarcom_outbox_pending_messages",
		Help: "The number of pending outbox messages eligible for processing",
	})

	OutboxMessagesProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "clickgarcom_outbox_messages_processed_total",
		Help: "The total number of outbox messages processed",
	}, []string{"status"})

	OutboxRunDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "clickgarcom_outbox_run_duration_seconds",
		Help:    "Time spent running the outbox processing loop",
		Buckets: prometheus.DefBuckets,
	})

	OutboxBatchSize = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "clickgarcom_outbox_batch_size",
		Help:    "Number of messages fetched per outbox processing batch",
		Buckets: []float64{0, 1, 2, 5, 10, 20, 50},
	})

	OutboxLastRunTimestamp = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "clickgarcom_outbox_last_run_timestamp_seconds",
		Help: "Unix timestamp of the last outbox processing run",
	})
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

func SetConsumerActive(queue string, active bool) {
	if active {
		ConsumerActive.WithLabelValues(queue).Set(1)
		return
	}

	ConsumerActive.WithLabelValues(queue).Set(0)
}

func IncConsumerMessagesProcessed(queue, status string) {
	ConsumerMessagesProcessed.WithLabelValues(queue, status).Inc()
}

func ObserveConsumerProcessingDuration(queue, status string, seconds float64) {
	ConsumerProcessingDuration.WithLabelValues(queue, status).Observe(seconds)
}

func SetOutboxPendingMessages(count int) {
	OutboxPendingMessages.Set(float64(count))
}

func IncOutboxMessagesProcessed(status string) {
	OutboxMessagesProcessed.WithLabelValues(status).Inc()
}

func ObserveOutboxRunDuration(seconds float64) {
	OutboxRunDuration.Observe(seconds)
}

func ObserveOutboxBatchSize(size int) {
	OutboxBatchSize.Observe(float64(size))
}

func SetOutboxLastRunTimestamp(unixSeconds float64) {
	OutboxLastRunTimestamp.Set(unixSeconds)
}
