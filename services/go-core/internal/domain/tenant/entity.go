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
	WabaID         string         `json:"waba_id" gorm:"column:waba_id"`                           // WhatsApp Business Account Phone ID
	MetaToken      string         `json:"meta_token" gorm:"column:meta_token"`                     // Cloud API Bearer Token
	WalletBalance  float64        `json:"wallet_balance" gorm:"type:numeric(10,2);default:0.00"`   // FASE 13
	BillingPlan    string         `json:"billing_plan" gorm:"type:varchar(20);default:'pre_paid'"` // FASE 13
	Settings       TenantSettings `json:"settings" gorm:"type:jsonb"`
	Active         bool           `json:"active" gorm:"default:true"`
	IsOpen         bool           `json:"is_open" gorm:"default:false"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

const (
	PlanPrePaid  = "pre_paid"
	PlanPostPaid = "post_paid"
)

// MessageTemplates contém os templates personalizáveis de mensagem do bot WhatsApp.
// Campos vazios significam "usar mensagem padrão do sistema".
// Variáveis disponíveis: {nome_restaurante}, {numero_mesa}, {numero_pedido},
// {itens}, {subtotal}, {taxa}, {total}, {tipo_servico}, {codigo_pix}
type MessageTemplates struct {
	Welcome          string `json:"msg_welcome,omitempty"`
	RestaurantClosed string `json:"msg_restaurant_closed,omitempty"`
	WelcomeTable     string `json:"msg_welcome_table,omitempty"`
	TablePending     string `json:"msg_table_request_pending,omitempty"`
	TableApproved    string `json:"msg_table_approved,omitempty"`
	MainMenu         string `json:"msg_main_menu,omitempty"`
	InvalidOption    string `json:"msg_invalid_option,omitempty"`
	OrderConfirmed   string `json:"msg_order_confirmed,omitempty"`
	OrderReady       string `json:"msg_order_ready,omitempty"`
	TabSummary       string `json:"msg_tab_summary,omitempty"`
	ServiceRequest   string `json:"msg_service_request,omitempty"`
	PaymentPending   string `json:"msg_payment_pending,omitempty"`
	PaymentConfirmed string `json:"msg_payment_confirmed,omitempty"`
}

type TenantSettings struct {
	ServiceFeePercent float64          `json:"service_fee_percent"`
	SplitEnabled      bool             `json:"split_enabled"`
	AutoAcceptOrders  bool             `json:"auto_accept_orders"`
	NPSEnabled        bool             `json:"nps_enabled"`
	VoucherEnabled    bool             `json:"voucher_enabled"`
	MPAccessToken     string           `json:"mp_access_token"` // FASE 12
	MPPublicKey       string           `json:"mp_public_key"`   // FASE 12
	Messages          MessageTemplates `json:"messages"`        // FASE 16
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
