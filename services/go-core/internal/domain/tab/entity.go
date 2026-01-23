package tab

import (
    "time"

    "github.com/google/uuid"
)

type Status string

const (
    StatusOpen            Status = "OPEN"
    StatusWaitingPayment  Status = "WAITING_PAYMENT"
    StatusPartiallyPaid   Status = "PARTIALLY_PAID"
    StatusPaid            Status = "PAID"
    StatusClosed          Status = "CLOSED"
)

type Tab struct {
    ID         uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
    TenantID   uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
    TableID    *uuid.UUID `json:"table_id,omitempty" gorm:"type:uuid"`
    
    Subtotal   float64    `json:"subtotal" gorm:"type:decimal(10,2);default:0"`
    ServiceFee float64    `json:"service_fee" gorm:"type:decimal(10,2);default:0"`
    Total      float64    `json:"total" gorm:"type:decimal(10,2);default:0"`
    PaidAmount float64    `json:"paid_amount" gorm:"type:decimal(10,2);default:0"`
    
    Status     Status     `json:"status" gorm:"type:varchar(20);default:OPEN"`
    
    OpenedAt   time.Time  `json:"opened_at"`
    ClosedAt   *time.Time `json:"closed_at,omitempty"`
}

func (Tab) TableName() string {
    return "tabs"
}

// CalculateTotal recalcula o total da comanda
func (t *Tab) CalculateTotal(serviceFeePercent float64) {
    t.ServiceFee = t.Subtotal * (serviceFeePercent / 100)
    t.Total = t.Subtotal + t.ServiceFee
}

// IsPaid verifica se a comanda está totalmente paga
func (t *Tab) IsPaid() bool {
    return t.PaidAmount >= t.Total
}

// CanClose verifica se pode fechar a comanda
func (t *Tab) CanClose() bool {
    return t.Status == StatusPaid || t.Status == StatusClosed
}