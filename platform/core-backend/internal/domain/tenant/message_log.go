package tenant

import (
	"time"

	"github.com/google/uuid"
)

type MessageDirection string

const (
	DirectionIn  MessageDirection = "IN"
	DirectionOut MessageDirection = "OUT"
)

type MessageLog struct {
	ID        uuid.UUID        `json:"id" gorm:"type:uuid;primary_key;default:uuid_generate_v4()"`
	TenantID  uuid.UUID        `json:"tenant_id" gorm:"type:uuid;not null"`
	Direction MessageDirection `json:"direction" gorm:"type:varchar(10);not null"`
	Status    string           `json:"status" gorm:"type:varchar(50)"`
	MessageID string           `json:"message_id" gorm:"type:varchar(100)"`
	CreatedAt time.Time        `json:"created_at"`
}

func (MessageLog) TableName() string {
	return "message_logs"
}
