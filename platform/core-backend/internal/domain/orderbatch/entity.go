package orderbatch

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending      Status = "PENDING"
	StatusAccepted     Status = "ACCEPTED"
	StatusReadyPartial Status = "READY_PARTIAL"
	StatusReady        Status = "READY"
	StatusDelivered    Status = "DELIVERED"
	StatusCanceled     Status = "CANCELED"
)

type OrderBatch struct {
	ID            uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID      uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TabID         uuid.UUID  `json:"tab_id" gorm:"type:uuid;not null;index"`
	CustomerPhone string     `json:"customer_phone,omitempty" gorm:"type:varchar(30)"`
	Status        Status     `json:"status" gorm:"type:varchar(20);not null;default:'PENDING'"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	AcceptedAt    *time.Time `json:"accepted_at,omitempty"`
	ReadyAt       *time.Time `json:"ready_at,omitempty"`
	DeliveredAt   *time.Time `json:"delivered_at,omitempty"`
	CanceledAt    *time.Time `json:"canceled_at,omitempty"`
	CancelReason  string     `json:"cancel_reason,omitempty" gorm:"type:text"`
}

func (OrderBatch) TableName() string {
	return "order_batches"
}
