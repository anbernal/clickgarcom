package tenant

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Tenant struct {
	ID                uuid.UUID      `json:"id" gorm:"type:uuid;primary_key"`
	Name              string         `json:"name" gorm:"not null"`
	Slug              string         `json:"slug" gorm:"uniqueIndex;not null"`
	WhatsAppNumber    string         `json:"whatsapp_number" gorm:"uniqueIndex;not null"`
	WabaID            string         `json:"waba_id" gorm:"column:waba_id;uniqueIndex"`               // WhatsApp Business Account Phone ID
	MetaToken         string         `json:"meta_token" gorm:"column:meta_token"`                     // Cloud API Bearer Token
	WalletBalance     float64        `json:"wallet_balance" gorm:"type:numeric(10,2);default:0.00"`   // FASE 13
	BillingPlan       string         `json:"billing_plan" gorm:"type:varchar(20);default:'pre_paid'"` // FASE 13
	MessagePrice      float64        `json:"message_price" gorm:"type:numeric(10,2);default:0.02"`    // Custo configurável por msg
	EstablishmentType string         `json:"establishment_type" gorm:"column:establishment_type;type:varchar(30);default:'RESTAURANT'"`
	Settings          TenantSettings `json:"settings" gorm:"type:jsonb"`
	Active            bool           `json:"active" gorm:"default:true"`
	IsOpen            bool           `json:"is_open" gorm:"default:false"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
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
	OrderDelivered   string `json:"msg_order_delivered,omitempty"`
	TabSummary       string `json:"msg_tab_summary,omitempty"`
	ServiceRequest   string `json:"msg_service_request,omitempty"`
	PaymentPending   string `json:"msg_payment_pending,omitempty"`
	PaymentConfirmed string `json:"msg_payment_confirmed,omitempty"`
}

type TenantSettings struct {
	ServiceMode       string                 `json:"service_mode"`
	ServiceFeePercent float64                `json:"service_fee_percent"`
	SplitEnabled      bool                   `json:"split_enabled"`
	AutoAcceptOrders  bool                   `json:"auto_accept_orders"`
	NPSEnabled        bool                   `json:"nps_enabled"`
	VoucherEnabled    bool                   `json:"voucher_enabled"`
	MPAccessToken     string                 `json:"mp_access_token"` // FASE 12
	MPPublicKey       string                 `json:"mp_public_key"`   // FASE 12
	PaymentGateway    PaymentGatewaySettings `json:"payment_gateway"`
	Delivery          DeliverySettings       `json:"delivery"`
	Attendance        AttendanceSettings     `json:"attendance"`
	FoodStore         StorefrontSettings     `json:"food_store"`
	Retail            StorefrontSettings     `json:"retail"`
	Appointments      AppointmentSettings    `json:"appointments"`
	Messages          MessageTemplates       `json:"messages"` // FASE 16
}

// AppointmentSettings activates the generic scheduling experience without
// coupling it to dining room, catalog or Delivery capabilities.
type AppointmentSettings struct {
	Enabled   bool   `json:"enabled,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"`
	Permanent bool   `json:"permanent,omitempty"`
}

func (s AppointmentSettings) IsActive(now time.Time) bool {
	if !s.Enabled {
		return false
	}
	if s.Permanent || strings.TrimSpace(s.ExpiresAt) == "" {
		return true
	}
	expiresAt, err := time.Parse(time.RFC3339, s.ExpiresAt)
	return err == nil && expiresAt.After(now)
}

// StorefrontSettings activates a customer-facing commercial catalog. Delivery
// remains a separate fulfillment capability and does not imply a storefront.
type StorefrontSettings struct {
	Enabled *bool `json:"enabled,omitempty"`
}

// FoodStoreEnabled preserves the legacy restaurant cardápio only until the
// Super Admin makes an explicit choice. Market and pharmacy tenants default to
// products, not prepared food.
func (t *Tenant) FoodStoreEnabled() bool {
	if t != nil && t.Settings.FoodStore.Enabled != nil {
		return *t.Settings.FoodStore.Enabled
	}
	if t == nil {
		return false
	}
	// A product-only tenant historically disables Attendance. Keep that profile
	// product-only until food is explicitly enabled; hybrid restaurant tenants
	// preserve their existing cardápio until told otherwise.
	if t.RetailStoreEnabled() && !t.Settings.AttendanceEnabled() {
		return false
	}
	typeName := strings.ToUpper(strings.TrimSpace(t.EstablishmentType))
	return typeName == "" || typeName == "RESTAURANT"
}

func (t *Tenant) RetailStoreEnabled() bool {
	if t != nil && t.Settings.Retail.Enabled != nil {
		return *t.Settings.Retail.Enabled
	}
	if t == nil {
		return false
	}
	typeName := strings.ToUpper(strings.TrimSpace(t.EstablishmentType))
	return typeName == "MARKET" || typeName == "PHARMACY"
}

// AttendanceSettings controls the presencial/restaurant experience. A pointer
// is used so old tenants without this key remain enabled by default.
type AttendanceSettings struct {
	Enabled *bool `json:"enabled,omitempty"`
}

func (s TenantSettings) AttendanceEnabled() bool {
	return s.Attendance.Enabled == nil || *s.Attendance.Enabled
}

// DeliverySettings contains only the WhatsApp entry rules needed by Core. The
// complete Delivery configuration remains owned and validated by Tenant Admin.
type DeliverySettings struct {
	Enabled              bool       `json:"enabled"`
	WhatsAppOrderEnabled bool       `json:"whatsapp_order_enabled"`
	WhatsAppOrderMode    string     `json:"whatsapp_order_mode"`
	EnabledAt            *time.Time `json:"enabled_at,omitempty"`
	ExpiresAt            *time.Time `json:"expires_at,omitempty"`
	Permanent            bool       `json:"permanent,omitempty"`
	DisabledAt           *time.Time `json:"disabled_at,omitempty"`
}

func (s DeliverySettings) IsActive(now time.Time) bool {
	if !s.Enabled {
		return false
	}
	if s.Permanent || s.ExpiresAt == nil {
		return true
	}
	return s.ExpiresAt.After(now)
}

// PaymentGatewaySettings keeps the provider selection tenant-scoped. The encrypted
// access token is never returned by administrative APIs or exposed to checkout users.
type PaymentGatewaySettings struct {
	Provider             string `json:"provider"`
	Enabled              bool   `json:"enabled"`
	Environment          string `json:"environment"`
	PublicKey            string `json:"public_key"`
	AccessTokenEncrypted string `json:"access_token_encrypted"`
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
