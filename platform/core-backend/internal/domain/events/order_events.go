package events

import (
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/google/uuid"
)

// EventType representa os tipos de eventos do sistema
type EventType string

const (
	EventOrderCreated       EventType = "order.created"
	EventOrderUpdated       EventType = "order.updated"
	EventOrderStatusChanged EventType = "order.status_changed"
	EventOrderCanceled      EventType = "order.canceled"
)

// OrderEvent representa um evento relacionado a pedidos
type OrderEvent struct {
	Type      EventType    `json:"type"`
	Timestamp time.Time    `json:"timestamp"`
	TenantID  uuid.UUID    `json:"tenant_id"`
	Data      *order.Order `json:"data"`
}

// NewOrderCreatedEvent cria um evento de pedido criado
func NewOrderCreatedEvent(ord *order.Order) *OrderEvent {
	return &OrderEvent{
		Type:      EventOrderCreated,
		Timestamp: time.Now(),
		TenantID:  ord.TenantID,
		Data:      ord,
	}
}

// NewOrderStatusChangedEvent cria um evento de mudança de status
func NewOrderStatusChangedEvent(ord *order.Order) *OrderEvent {
	return &OrderEvent{
		Type:      EventOrderStatusChanged,
		Timestamp: time.Now(),
		TenantID:  ord.TenantID,
		Data:      ord,
	}
}

// NewOrderUpdatedEvent cria um evento de atualização de pedido
func NewOrderUpdatedEvent(ord *order.Order) *OrderEvent {
	return &OrderEvent{
		Type:      EventOrderUpdated,
		Timestamp: time.Now(),
		TenantID:  ord.TenantID,
		Data:      ord,
	}
}

// NewOrderCanceledEvent cria um evento de cancelamento
func NewOrderCanceledEvent(ord *order.Order) *OrderEvent {
	return &OrderEvent{
		Type:      EventOrderCanceled,
		Timestamp: time.Now(),
		TenantID:  ord.TenantID,
		Data:      ord,
	}
}
