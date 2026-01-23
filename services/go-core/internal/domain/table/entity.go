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

type Table struct {
    ID           uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
    TenantID     uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
    Number       string     `json:"number" gorm:"not null"`
    QRToken      string     `json:"qr_token,omitempty" gorm:"type:text"`
    QRExpiresAt  *time.Time `json:"qr_expires_at,omitempty"`
    Status       Status     `json:"status" gorm:"type:varchar(20);default:AVAILABLE"`
    CreatedAt    time.Time  `json:"created_at"`
    UpdatedAt    time.Time  `json:"updated_at"`
}

func (Table) TableName() string {
    return "tables"
}