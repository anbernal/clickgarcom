package billing

import (
	"time"

	"github.com/google/uuid"
)

// Constantes para as operações financeiras
const (
	OperationCharge   = "charge"   // Custo (ex: Mensagem WP)
	OperationRecharge = "recharge" // Recarga (ex: Via PIX/Cartão)
)

// BillingStatement representa um lançamento financeiro na carteira do restaurante
type BillingStatement struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primary_key;default:uuid_generate_v4()"`
	TenantID    uuid.UUID `json:"tenant_id" gorm:"type:uuid;not null;index"`
	Amount      float64   `json:"amount" gorm:"type:numeric(10,2);not null"`
	Operation   string    `json:"operation" gorm:"type:varchar(20);not null"` // 'charge' (-), 'recharge' (+)
	Description string    `json:"description" gorm:"type:varchar(255);not null"`
	ReferenceID string    `json:"reference_id" gorm:"type:varchar(100)"` // Webhook MP ID ou Hash da Mensagem
	CreatedAt   time.Time `json:"created_at"`
}
