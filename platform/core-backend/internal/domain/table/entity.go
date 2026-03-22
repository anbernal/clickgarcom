package table

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusAvailable Status = "AVAILABLE"
	StatusOccupied  Status = "OCCUPIED"
	StatusReserved  Status = "RESERVED"
	StatusCleaning  Status = "CLEANING"
)

type RequestStatus string

const (
	RequestStatusPending  RequestStatus = "PENDING"
	RequestStatusApproved RequestStatus = "APPROVED"
	RequestStatusRejected RequestStatus = "REJECTED"
)

type Table struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID    uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	Number      string     `json:"number" gorm:"not null"`
	Capacity    int        `json:"capacity" gorm:"default:4"`
	QRToken     string     `json:"qr_token,omitempty" gorm:"type:text"`
	QRExpiresAt *time.Time `json:"qr_expires_at,omitempty"`
	Status      Status     `json:"status" gorm:"type:varchar(20);default:AVAILABLE"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (Table) TableName() string {
	return "tables"
}

type TableRequest struct {
	ID        uuid.UUID     `json:"id" gorm:"type:uuid;primary_key"`
	TenantID  uuid.UUID     `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TableID   *uuid.UUID    `json:"table_id" gorm:"type:uuid;index"`
	UserPhone string        `json:"user_phone" gorm:"not null"`
	PaxCount  int           `json:"pax_count" gorm:"not null"`
	Status    RequestStatus `json:"status" gorm:"type:varchar(20);default:PENDING"`
	ApprovedByUserID   *uuid.UUID `json:"approved_by_user_id,omitempty" gorm:"type:uuid"`
	ApprovedByUserName string     `json:"approved_by_user_name,omitempty" gorm:"type:varchar(255)"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`

	Table *Table `json:"table,omitempty" gorm:"foreignKey:TableID"`
}

func (TableRequest) TableName() string {
	return "table_requests"
}
