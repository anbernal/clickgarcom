package order

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Status string
type Destination string

const (
	StatusPending   Status = "PENDING"
	StatusAccepted  Status = "ACCEPTED"
	StatusReady     Status = "READY"
	StatusDelivered Status = "DELIVERED"
	StatusCanceled  Status = "CANCELED"
)

const (
	DestinationKitchen Destination = "KITCHEN"
	DestinationBar     Destination = "BAR"
)

var (
	ErrInvalidStatus     = errors.New("invalid order status")
	ErrInvalidTransition = errors.New("invalid status transition")
)

type Order struct {
	ID       uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TabID    uuid.UUID  `json:"tab_id" gorm:"type:uuid;not null;index"`
	BatchID  *uuid.UUID `json:"batch_id,omitempty" gorm:"type:uuid;index"`

	Destination Destination `json:"destination" gorm:"type:varchar(20);not null"`
	Status      Status      `json:"status" gorm:"type:varchar(20);not null;index"`
	Notes       string      `json:"notes,omitempty" gorm:"type:text"`

	Items []OrderItem `json:"items" gorm:"foreignKey:OrderID"`

	// Timestamps do ciclo de vida
	CreatedAt   time.Time  `json:"created_at"`
	AcceptedAt  *time.Time `json:"accepted_at,omitempty"`
	ReadyAt     *time.Time `json:"ready_at,omitempty"`
	DeliveredAt *time.Time `json:"delivered_at,omitempty"`
	CanceledAt  *time.Time `json:"canceled_at,omitempty"`

	CancelReason string `json:"cancel_reason,omitempty" gorm:"type:text"`
}

type OrderItem struct {
	ID                 uuid.UUID        `json:"id" gorm:"type:uuid;primary_key"`
	OrderID            uuid.UUID        `json:"order_id" gorm:"type:uuid;not null"`
	MenuItemID         uuid.UUID        `json:"menu_item_id" gorm:"type:uuid;not null"`
	Quantity           int              `json:"quantity" gorm:"not null"`
	UnitPrice          float64          `json:"unit_price" gorm:"type:decimal(10,2);not null"`
	Observations       string           `json:"observations,omitempty" gorm:"type:text"`
	SelectedOptionsRaw string           `json:"-" gorm:"column:selected_options;type:jsonb"`
	SelectedOptions    []SelectedOption `json:"selected_options,omitempty" gorm:"-"`
	CreatedAt          time.Time        `json:"created_at"`
}

type SelectedOption struct {
	GroupName  string  `json:"group_name"`
	OptionName string  `json:"option_name"`
	PriceDelta float64 `json:"price_delta"`
}

func (Order) TableName() string {
	return "orders"
}

func (OrderItem) TableName() string {
	return "order_items"
}

// State Machine - Transições válidas
var validTransitions = map[Status][]Status{
	StatusPending:   {StatusAccepted, StatusCanceled},
	StatusAccepted:  {StatusReady, StatusCanceled},
	StatusReady:     {StatusDelivered},
	StatusDelivered: {},
	StatusCanceled:  {},
}

// CanTransitionTo verifica se pode fazer a transição
func (o *Order) CanTransitionTo(newStatus Status) error {
	allowed, exists := validTransitions[o.Status]
	if !exists {
		return ErrInvalidStatus
	}

	for _, valid := range allowed {
		if valid == newStatus {
			return nil
		}
	}

	return ErrInvalidTransition
}

// UpdateStatus atualiza o status com validação e timestamps
func (o *Order) UpdateStatus(newStatus Status) error {
	if err := o.CanTransitionTo(newStatus); err != nil {
		return err
	}

	now := time.Now()
	o.Status = newStatus

	switch newStatus {
	case StatusAccepted:
		o.AcceptedAt = &now
	case StatusReady:
		o.ReadyAt = &now
	case StatusDelivered:
		o.DeliveredAt = &now
	case StatusCanceled:
		o.CanceledAt = &now
	}

	return nil
}

// CalculateTotal calcula o total do pedido
func (o *Order) CalculateTotal() float64 {
	total := 0.0
	for _, item := range o.Items {
		total += item.UnitPrice * float64(item.Quantity)
	}
	return total
}

func (i *OrderItem) EnsureSelectedOptions() []SelectedOption {
	if len(i.SelectedOptions) > 0 {
		return i.SelectedOptions
	}

	raw := strings.TrimSpace(i.SelectedOptionsRaw)
	if raw == "" || raw == "null" {
		return nil
	}

	var options []SelectedOption
	if err := json.Unmarshal([]byte(raw), &options); err != nil {
		return nil
	}

	sanitized := make([]SelectedOption, 0, len(options))
	for _, option := range options {
		groupName := strings.TrimSpace(option.GroupName)
		optionName := strings.TrimSpace(option.OptionName)
		if groupName == "" || optionName == "" || option.PriceDelta < 0 {
			continue
		}
		sanitized = append(sanitized, SelectedOption{
			GroupName:  groupName,
			OptionName: optionName,
			PriceDelta: option.PriceDelta,
		})
	}

	i.SelectedOptions = sanitized
	return i.SelectedOptions
}

func (i *OrderItem) SetSelectedOptions(options []SelectedOption) {
	if len(options) == 0 {
		i.SelectedOptions = nil
		i.SelectedOptionsRaw = "[]"
		return
	}

	sanitized := make([]SelectedOption, 0, len(options))
	for _, option := range options {
		groupName := strings.TrimSpace(option.GroupName)
		optionName := strings.TrimSpace(option.OptionName)
		if groupName == "" || optionName == "" || option.PriceDelta < 0 {
			continue
		}
		sanitized = append(sanitized, SelectedOption{
			GroupName:  groupName,
			OptionName: optionName,
			PriceDelta: option.PriceDelta,
		})
	}

	if len(sanitized) == 0 {
		i.SelectedOptions = nil
		i.SelectedOptionsRaw = "[]"
		return
	}

	i.SelectedOptions = sanitized
	payload, err := json.Marshal(sanitized)
	if err != nil {
		i.SelectedOptionsRaw = "[]"
		return
	}
	i.SelectedOptionsRaw = string(payload)
}
