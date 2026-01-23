package tenant

import (
    "time"

    "github.com/google/uuid"
)

type Tenant struct {
    ID             uuid.UUID       `json:"id" gorm:"type:uuid;primary_key"`
    Name           string          `json:"name" gorm:"not null"`
    Slug           string          `json:"slug" gorm:"uniqueIndex;not null"`
    WhatsAppNumber string          `json:"whatsapp_number" gorm:"uniqueIndex;not null"`
    Settings       TenantSettings  `json:"settings" gorm:"type:jsonb"`
    Active         bool            `json:"active" gorm:"default:true"`
    CreatedAt      time.Time       `json:"created_at"`
    UpdatedAt      time.Time       `json:"updated_at"`
}

type TenantSettings struct {
    ServiceFeePercent float64 `json:"service_fee_percent"`
    SplitEnabled      bool    `json:"split_enabled"`
    AutoAcceptOrders  bool    `json:"auto_accept_orders"`
    NPSEnabled        bool    `json:"nps_enabled"`
    VoucherEnabled    bool    `json:"voucher_enabled"`
}

func (Tenant) TableName() string {
    return "tenants"
}