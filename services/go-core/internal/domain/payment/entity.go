package payment

import (
	"time"

	"github.com/google/uuid"
)

type PaymentStatus string
type PaymentMethod string

const (
	StatusPending   PaymentStatus = "pending"
	StatusApproved  PaymentStatus = "approved"
	StatusRejected  PaymentStatus = "rejected"
	StatusCancelled PaymentStatus = "cancelled"

	MethodPix        PaymentMethod = "pix"
	MethodCreditCard PaymentMethod = "credit_card"
	MethodDebitCard  PaymentMethod = "debit_card"
)

type Payment struct {
	ID                uuid.UUID     `json:"id" gorm:"type:uuid;primary_key;default:uuid_generate_v4()"`
	TenantID          uuid.UUID     `json:"tenant_id" gorm:"type:uuid;not null"`
	OrderID           uuid.UUID     `json:"order_id" gorm:"type:uuid;not null"` // Link com a Mesa/Pedido
	Amount            float64       `json:"amount" gorm:"type:numeric(10,2);not null"`
	Status            PaymentStatus `json:"status" gorm:"type:varchar(20);default:'pending'"`
	Method            PaymentMethod `json:"method" gorm:"type:varchar(20);not null"`
	ExternalReference string        `json:"external_reference" gorm:"type:varchar(100)"` // ID gerado pelo Mercado Pago
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
}

func (Payment) TableName() string {
	return "payments"
}
