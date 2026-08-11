// Package deliveryfulfillment contains the versioned contract exchanged by
// the Delivery fulfillment producer and Core's WhatsApp projection.
package deliveryfulfillment

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/deliverynotification"
	"github.com/google/uuid"
)

const CurrentVersion = 1

type EventType string

const (
	EventQuoteCreated       EventType = "delivery.quote_created.v1"
	EventAttemptFailed      EventType = "delivery.provider_attempt_failed.v1"
	EventProviderAssigned   EventType = "delivery.provider_assigned.v1"
	EventCycleExhausted     EventType = "delivery.provider_cycle_exhausted.v1"
	EventTrackingAvailable  EventType = "delivery.tracking_available.v1"
	EventFulfillmentChanged EventType = "delivery.fulfillment_changed.v1"
	EventCompleted          EventType = "delivery.completed.v1"
)

type Envelope struct {
	Version       int             `json:"version"`
	EventID       string          `json:"event_id"`
	Type          EventType       `json:"type,omitempty"`
	EventType     EventType       `json:"event_type,omitempty"`
	TenantID      uuid.UUID       `json:"tenant_id"`
	AggregateID   uuid.UUID       `json:"aggregate_id"`
	DeliveryID    uuid.UUID       `json:"delivery_id,omitempty"`
	CorrelationID uuid.UUID       `json:"correlation_id,omitempty"`
	OccurredAt    time.Time       `json:"occurred_at"`
	Data          json.RawMessage `json:"data"`
}

func (e Envelope) Kind() EventType {
	if e.Type != "" {
		return e.Type
	}
	return e.EventType
}

func (e Envelope) EffectiveDeliveryID() uuid.UUID {
	if e.DeliveryID != uuid.Nil {
		return e.DeliveryID
	}
	return e.AggregateID
}

func (e Envelope) Validate() error {
	if e.Version == 0 {
		e.Version = CurrentVersion
	}
	if e.Version != CurrentVersion {
		return fmt.Errorf("unsupported delivery fulfillment event version %d", e.Version)
	}
	if strings.TrimSpace(e.EventID) == "" {
		return fmt.Errorf("event_id is required")
	}
	if e.TenantID == uuid.Nil || e.EffectiveDeliveryID() == uuid.Nil {
		return fmt.Errorf("tenant_id and aggregate_id are required")
	}
	if !IsSupported(e.Kind()) {
		return fmt.Errorf("unsupported delivery fulfillment event type %q", e.Kind())
	}
	if e.OccurredAt.IsZero() {
		return fmt.Errorf("occurred_at is required")
	}
	if len(bytes.TrimSpace(e.Data)) == 0 || bytes.Equal(bytes.TrimSpace(e.Data), []byte("null")) {
		return fmt.Errorf("data is required")
	}
	return nil
}

func IsSupported(t EventType) bool {
	switch t {
	case EventQuoteCreated, EventAttemptFailed, EventProviderAssigned, EventCycleExhausted,
		EventTrackingAvailable, EventFulfillmentChanged, EventCompleted:
		return true
	default:
		return false
	}
}

// NotificationData is an allowlisted projection. Producers may include a
// pre-rendered body (normally resolved from tenant templates); Core never
// forwards arbitrary fulfillment fields to WhatsApp.
type NotificationData struct {
	Recipient   string `json:"recipient,omitempty"`
	Body        string `json:"body,omitempty"`
	TemplateID  string `json:"template_id,omitempty"`
	Mode        string `json:"mode,omitempty"`
	DisplayCode string `json:"display_code,omitempty"`
	TrackingURL string `json:"tracking_url,omitempty"`
	PIN         string `json:"pin_entrega,omitempty"`
}

func (e Envelope) Notification() (deliverynotification.Request, bool, error) {
	var data NotificationData
	if err := json.Unmarshal(e.Data, &data); err != nil {
		return deliverynotification.Request{}, false, fmt.Errorf("decode fulfillment notification projection: %w", err)
	}
	if strings.TrimSpace(data.Recipient) == "" {
		// Fulfillment events without a notification projection are valid. They
		// remain available to other consumers and must not be retried forever.
		return deliverynotification.Request{}, false, nil
	}
	milestone, ok := milestoneFor(e.Kind(), data.Mode)
	if !ok {
		return deliverynotification.Request{}, false, nil
	}
	body := strings.TrimSpace(data.Body)
	if body == "" {
		body = defaultBody(milestone, data)
	}
	if body == "" {
		return deliverynotification.Request{}, false, nil
	}
	templateID := strings.TrimSpace(data.TemplateID)
	if templateID == "" {
		templateID = "delivery_" + strings.ToLower(string(milestone)) + "_v1"
	}
	return deliverynotification.Request{
		Version:    CurrentVersion,
		EventID:    e.EventID,
		TenantID:   e.TenantID,
		DeliveryID: e.EffectiveDeliveryID(),
		Recipient:  strings.TrimSpace(data.Recipient),
		Milestone:  milestone,
		TemplateID: templateID,
		Body:       body,
	}, true, nil
}

func milestoneFor(t EventType, mode string) (deliverynotification.Milestone, bool) {
	switch t {
	case EventProviderAssigned:
		return deliverynotification.MilestoneSearchingCourier, true
	case EventAttemptFailed, EventCycleExhausted:
		return deliverynotification.MilestoneAllocationFailed, true
	case EventTrackingAvailable:
		return deliverynotification.MilestoneTrackingAvailable, true
	case EventCompleted:
		return deliverynotification.MilestoneDelivered, true
	case EventFulfillmentChanged:
		if strings.EqualFold(strings.TrimSpace(mode), "OWN") {
			return deliverynotification.MilestoneOwnDispatched, true
		}
		return deliverynotification.MilestonePickedUp, true
	default:
		return "", false
	}
}

func defaultBody(m deliverynotification.Milestone, data NotificationData) string {
	code := strings.TrimSpace(data.DisplayCode)
	if code == "" {
		code = "seu pedido"
	}
	switch m {
	case deliverynotification.MilestoneSearchingCourier:
		return fmt.Sprintf("🚚 Estamos localizando um entregador para o pedido *%s*.", code)
	case deliverynotification.MilestoneAllocationFailed:
		return "Estamos com dificuldade para localizar um entregador. O restaurante já foi avisado e está verificando outra opção. Avisaremos você assim que houver uma atualização."
	case deliverynotification.MilestoneTrackingAvailable:
		if strings.TrimSpace(data.TrackingURL) == "" || strings.EqualFold(strings.TrimSpace(data.Mode), "OWN") {
			return ""
		}
		return fmt.Sprintf("🚚 Acompanhe seu pedido *%s* por aqui: %s", code, strings.TrimSpace(data.TrackingURL))
	case deliverynotification.MilestoneOwnDispatched:
		return fmt.Sprintf("🚲 Seu pedido *%s* saiu para entrega.", code)
	case deliverynotification.MilestonePickedUp:
		if strings.EqualFold(strings.TrimSpace(data.Mode), "OWN") {
			return fmt.Sprintf("🚲 Seu pedido *%s* saiu para entrega.", code)
		}
		return fmt.Sprintf("🚚 Seu pedido *%s* saiu para entrega.", code)
	case deliverynotification.MilestoneDelivered:
		return fmt.Sprintf("✅ Pedido *%s* entregue. Obrigado!", code)
	default:
		return ""
	}
}
