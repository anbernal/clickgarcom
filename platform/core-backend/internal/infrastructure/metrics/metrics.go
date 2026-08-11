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

	DeliveryTrackingConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "delivery_tracking_active_connections",
		Help: "The number of active customer delivery tracking WebSocket connections",
	}, []string{"tenant_id", "delivery_id"})

	DeliveryRealtimeEventsPublished = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_realtime_events_published_total",
		Help: "The number of delivery realtime events projected to tracking clients",
	}, []string{"tenant_id", "delivery_id", "event_type"})

	DeliveryRealtimeEventsDropped = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_realtime_events_dropped_total",
		Help: "The number of delivery realtime events dropped for slow clients",
	}, []string{"tenant_id", "delivery_id"})

	MapProviderRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_map_provider_requests_total",
		Help: "Map provider requests by operation and outcome",
	}, []string{"operation", "provider", "outcome"})

	MapProviderLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name: "delivery_map_provider_latency_seconds",
		Help: "Map provider request latency",
	}, []string{"operation", "provider", "outcome"})

	MapFallbacks = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_map_fallback_total",
		Help: "Number of route calculations served by fallback",
	}, []string{"operation"})

	DeliveryLocationAccepted = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_location_updates_accepted_total",
		Help: "Driver location updates accepted by validation and assignment boundaries",
	}, []string{"outcome"})

	DeliveryLocationRejected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_location_updates_rejected_total",
		Help: "Driver location updates rejected by validation or persistence",
	}, []string{"reason"})

	DeliveryFulfillmentEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "delivery_fulfillment_events_processed_total",
		Help: "Delivery fulfillment events processed by the Core notification projection",
	}, []string{"event_type", "outcome"})

	DeliveryFulfillmentEventDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "delivery_fulfillment_event_processing_duration_seconds",
		Help:    "Time spent validating and projecting Delivery fulfillment events",
		Buckets: prometheus.DefBuckets,
	}, []string{"event_type", "outcome"})

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

func IncDeliveryTrackingConnections(tenantID, deliveryID string) {
	DeliveryTrackingConnections.WithLabelValues(tenantID, deliveryID).Inc()
}

func DecDeliveryTrackingConnections(tenantID, deliveryID string) {
	DeliveryTrackingConnections.WithLabelValues(tenantID, deliveryID).Dec()
}

func IncDeliveryRealtimeEventsPublished(tenantID, deliveryID, eventType string) {
	DeliveryRealtimeEventsPublished.WithLabelValues(tenantID, deliveryID, eventType).Inc()
}

func IncDeliveryRealtimeEventsDropped(tenantID, deliveryID string) {
	DeliveryRealtimeEventsDropped.WithLabelValues(tenantID, deliveryID).Inc()
}

func ObserveMapProvider(operation, provider, outcome string, seconds float64) {
	MapProviderRequests.WithLabelValues(operation, provider, outcome).Inc()
	MapProviderLatency.WithLabelValues(operation, provider, outcome).Observe(seconds)
}

func IncMapFallback(operation string) {
	MapFallbacks.WithLabelValues(operation).Inc()
}

func IncDeliveryLocationAccepted(outcome string) {
	DeliveryLocationAccepted.WithLabelValues(outcome).Inc()
}

func IncDeliveryLocationRejected(reason string) {
	DeliveryLocationRejected.WithLabelValues(reason).Inc()
}

func ObserveDeliveryFulfillmentEvent(eventType, outcome string, seconds float64) {
	DeliveryFulfillmentEvents.WithLabelValues(eventType, outcome).Inc()
	DeliveryFulfillmentEventDuration.WithLabelValues(eventType, outcome).Observe(seconds)
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
