package servicerequest

import (
	"time"

	"github.com/google/uuid"
)

type RequestType string
type Status string

const (
	RequestTypeCloseBill RequestType = "CLOSE_BILL"

	StatusPending    Status = "PENDING"
	StatusInProgress Status = "IN_PROGRESS"
	StatusResolved   Status = "RESOLVED"
	StatusCanceled   Status = "CANCELED"
)

type ServiceRequest struct {
	ID          uuid.UUID   `json:"id" gorm:"type:uuid;primary_key"`
	TenantID    uuid.UUID   `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TableID     uuid.UUID   `json:"table_id" gorm:"type:uuid;not null"`
	TabID       *uuid.UUID  `json:"tab_id,omitempty" gorm:"type:uuid"`
	RequestType RequestType `json:"request_type" gorm:"type:varchar(50);not null"`
	Description string      `json:"description,omitempty" gorm:"type:text"`
	Status      Status      `json:"status" gorm:"type:varchar(20);default:PENDING"`
	Priority    int         `json:"priority" gorm:"default:3"`
	CreatedAt   time.Time   `json:"created_at"`
	ResolvedAt  *time.Time  `json:"resolved_at,omitempty"`
	ResolvedBy  *uuid.UUID  `json:"resolved_by,omitempty" gorm:"type:uuid"`
}

func (ServiceRequest) TableName() string {
	return "service_requests"
}
