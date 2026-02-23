package tenant

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

type Tenant struct {
	ID             uuid.UUID      `json:"id" gorm:"type:uuid;primary_key"`
	Name           string         `json:"name" gorm:"not null"`
	Slug           string         `json:"slug" gorm:"uniqueIndex;not null"`
	WhatsAppNumber string         `json:"whatsapp_number" gorm:"uniqueIndex;not null"`
	WabaID         string         `json:"waba_id" gorm:"column:waba_id"`       // WhatsApp Business Account Phone ID
	MetaToken      string         `json:"meta_token" gorm:"column:meta_token"` // Cloud API Bearer Token
	Settings       TenantSettings `json:"settings" gorm:"type:jsonb"`
	Active         bool           `json:"active" gorm:"default:true"`
	IsOpen         bool           `json:"is_open" gorm:"default:false"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type TenantSettings struct {
	ServiceFeePercent float64 `json:"service_fee_percent"`
	SplitEnabled      bool    `json:"split_enabled"`
	AutoAcceptOrders  bool    `json:"auto_accept_orders"`
	NPSEnabled        bool    `json:"nps_enabled"`
	VoucherEnabled    bool    `json:"voucher_enabled"`
	MPAccessToken     string  `json:"mp_access_token"` // FASE 12
	MPPublicKey       string  `json:"mp_public_key"`   // FASE 12
}

func (Tenant) TableName() string {
	return "tenants"
}

// ============================================
// Scanner/Valuer para JSONB
// ============================================

// Scan implementa sql.Scanner para ler JSONB do Postgres
func (ts *TenantSettings) Scan(value interface{}) error {
	if value == nil {
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("failed to scan TenantSettings: expected []byte")
	}

	return json.Unmarshal(bytes, ts)
}

// Value implementa driver.Valuer para escrever JSONB no Postgres
func (ts TenantSettings) Value() (driver.Value, error) {
	return json.Marshal(ts)
}
