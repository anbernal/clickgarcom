package payment

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type Status string
type Type string
type Method string
type Provider string
type AttemptStatus string

const (
	StatusPending   Status = "PENDING"
	StatusConfirmed Status = "CONFIRMED"
	StatusExpired   Status = "EXPIRED"
	StatusCanceled  Status = "CANCELED"

	TypeFull Type = "FULL"

	MethodPix        Method = "PIX"
	MethodCreditCard Method = "CREDIT_CARD"
	MethodDebitCard  Method = "DEBIT_CARD"

	ProviderMercadoPago Provider = "MERCADO_PAGO"

	AttemptStatusCreated    AttemptStatus = "CREATED"
	AttemptStatusProcessing AttemptStatus = "PROCESSING"
	AttemptStatusUnknown    AttemptStatus = "UNKNOWN"
	AttemptStatusPending    AttemptStatus = "PENDING"
	AttemptStatusApproved   AttemptStatus = "APPROVED"
	AttemptStatusRejected   AttemptStatus = "REJECTED"
	AttemptStatusCanceled   AttemptStatus = "CANCELED"
	AttemptStatusExpired    AttemptStatus = "EXPIRED"
	AttemptStatusError      AttemptStatus = "ERROR"
)

type JSONMap map[string]interface{}

func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(m)
}

func (m *JSONMap) Scan(value interface{}) error {
	if m == nil {
		return errors.New("payment.JSONMap: nil receiver")
	}
	if value == nil {
		*m = JSONMap{}
		return nil
	}

	var bytes []byte
	switch typed := value.(type) {
	case []byte:
		bytes = typed
	case string:
		bytes = []byte(typed)
	default:
		return errors.New("payment.JSONMap: unsupported scan type")
	}

	if len(bytes) == 0 {
		*m = JSONMap{}
		return nil
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		return err
	}
	*m = JSONMap(decoded)
	return nil
}

type Payment struct {
	ID                uuid.UUID  `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	TenantID          uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TabID             *uuid.UUID `json:"tab_id,omitempty" gorm:"type:uuid;index"`
	OrderID           *uuid.UUID `json:"order_id,omitempty" gorm:"type:uuid;index"`
	PaymentType       Type       `json:"payment_type" gorm:"type:varchar(20);not null"`
	Amount            float64    `json:"amount" gorm:"type:numeric(10,2);not null"`
	Status            Status     `json:"status" gorm:"type:varchar(20);default:'PENDING'"`
	Method            Method     `json:"method,omitempty" gorm:"type:varchar(20)"`
	ExternalReference string     `json:"external_reference,omitempty" gorm:"type:varchar(100);index"`
	PixTxID           *string    `json:"pix_txid,omitempty" gorm:"column:pix_txid;type:varchar(255)"`
	PixQRCode         string     `json:"pix_qr_code,omitempty" gorm:"type:text"`
	PixQRCodeImage    string     `json:"pix_qr_code_image,omitempty" gorm:"type:text"`
	Metadata          JSONMap    `json:"metadata,omitempty" gorm:"type:jsonb"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	PaidAt            *time.Time `json:"paid_at,omitempty"`
	ExpiredAt         *time.Time `json:"expired_at,omitempty"`
}

func (Payment) TableName() string {
	return "payments"
}

type Attempt struct {
	ID                 uuid.UUID     `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	PaymentID          uuid.UUID     `json:"payment_id" gorm:"type:uuid;not null;index"`
	TenantID           uuid.UUID     `json:"tenant_id" gorm:"type:uuid;not null;index"`
	TabID              *uuid.UUID    `json:"tab_id,omitempty" gorm:"type:uuid;index"`
	Provider           Provider      `json:"provider" gorm:"type:varchar(30);not null"`
	PaymentMethod      Method        `json:"payment_method" gorm:"type:varchar(20);not null"`
	RequestedAmount    float64       `json:"requested_amount" gorm:"type:numeric(10,2);not null"`
	IdempotencyKey     string        `json:"idempotency_key" gorm:"type:varchar(120);not null;uniqueIndex"`
	ExternalReference  string        `json:"external_reference" gorm:"type:varchar(120);not null;index"`
	ProviderPaymentID  *string       `json:"provider_payment_id,omitempty" gorm:"type:varchar(120);index"`
	Status             AttemptStatus `json:"status" gorm:"type:varchar(20);not null"`
	ProviderStatus     string        `json:"provider_status,omitempty" gorm:"type:varchar(80)"`
	ProviderStatusInfo string        `json:"provider_status_detail,omitempty" gorm:"column:provider_status_detail;type:text"`
	RequestPayload     JSONMap       `json:"request_payload,omitempty" gorm:"type:jsonb"`
	ResponsePayload    JSONMap       `json:"response_payload,omitempty" gorm:"type:jsonb"`
	LastError          string        `json:"last_error,omitempty" gorm:"type:text"`
	ReconciledAt       *time.Time    `json:"reconciled_at,omitempty"`
	SettledAt          *time.Time    `json:"settled_at,omitempty"`
	CreatedAt          time.Time     `json:"created_at"`
	UpdatedAt          time.Time     `json:"updated_at"`
}

func (Attempt) TableName() string {
	return "payment_attempts"
}
