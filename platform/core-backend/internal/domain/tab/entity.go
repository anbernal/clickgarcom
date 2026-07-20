package tab

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusOpen           Status = "OPEN"
	StatusWaitingPayment Status = "WAITING_PAYMENT"
	StatusPartiallyPaid  Status = "PARTIALLY_PAID"
	StatusPaid           Status = "PAID"
	StatusClosed         Status = "CLOSED"
)

type Tab struct {
	ID                   uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID             uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TableID              *uuid.UUID `json:"table_id,omitempty" gorm:"type:uuid"`
	SourceRequestID      *uuid.UUID `json:"source_request_id,omitempty" gorm:"column:source_request_id;type:uuid"`
	UserPhone            string     `json:"user_phone" gorm:"type:varchar(30)"` // Fase 15: Quem abriu a comanda
	PaymentNotifierPhone string     `json:"payment_notifier_phone,omitempty" gorm:"column:payment_notifier_phone;type:varchar(30)"`
	OpenedByUserID       *uuid.UUID `json:"opened_by_user_id,omitempty" gorm:"column:opened_by_user_id;type:uuid"`
	OpenedByUserName     string     `json:"opened_by_user_name,omitempty" gorm:"column:opened_by_user_name;type:varchar(255)"`
	ServiceMode          string     `json:"service_mode" gorm:"column:service_mode;type:varchar(20);default:COM_MESA"`
	PublicCode           string     `json:"public_code,omitempty" gorm:"column:public_code;type:varchar(12)"`
	ExitValidatedAt      *time.Time `json:"exit_validated_at,omitempty" gorm:"column:exit_validated_at"`
	ExitValidatedBy      *uuid.UUID `json:"exit_validated_by,omitempty" gorm:"column:exit_validated_by;type:uuid"`
	ExitValidationMethod string     `json:"exit_validation_method,omitempty" gorm:"column:exit_validation_method;type:varchar(30)"`

	Subtotal   float64 `json:"subtotal" gorm:"type:decimal(10,2);default:0"`
	ServiceFee float64 `json:"service_fee" gorm:"type:decimal(10,2);default:0"`
	Total      float64 `json:"total" gorm:"type:decimal(10,2);default:0"`
	PaidAmount float64 `json:"paid_amount" gorm:"type:decimal(10,2);default:0"`

	Status Status `json:"status" gorm:"type:varchar(20);default:OPEN"`

	OpenedAt   time.Time  `json:"opened_at"`
	ClosedAt   *time.Time `json:"closed_at,omitempty"`
	ReopenedAt *time.Time `json:"reopened_at,omitempty" gorm:"column:reopened_at"`
}

func BuildPublicCode(id uuid.UUID) string {
	compact := strings.ReplaceAll(id.String(), "-", "")
	if len(compact) > 8 {
		compact = compact[:8]
	}
	return strings.ToUpper(compact)
}

func (Tab) TableName() string {
	return "tabs"
}

// AddOrderTotal adiciona o valor de um pedido ao subtotal da comanda
func (t *Tab) AddOrderTotal(orderTotal float64) {
	t.Subtotal += orderTotal
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
