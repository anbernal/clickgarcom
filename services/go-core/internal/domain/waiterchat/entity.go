package waiterchat

import (
	"time"

	"github.com/google/uuid"
)

type Status string
type SenderType string
type ClosedBy string

const (
	StatusOpen   Status = "OPEN"
	StatusClosed Status = "CLOSED"
)

const (
	SenderCustomer SenderType = "CUSTOMER"
	SenderStaff    SenderType = "STAFF"
	SenderSystem   SenderType = "SYSTEM"
)

const (
	ClosedByCustomer ClosedBy = "CUSTOMER"
	ClosedByStaff    ClosedBy = "STAFF"
)

type Chat struct {
	ID            uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	TenantID      uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	UserPhone     string     `json:"user_phone" gorm:"type:varchar(30);not null;index"`
	TabID         *uuid.UUID `json:"tab_id,omitempty" gorm:"type:uuid"`
	TableID       *uuid.UUID `json:"table_id,omitempty" gorm:"type:uuid"`
	Status        Status     `json:"status" gorm:"type:varchar(20);not null;default:OPEN;index"`
	OpenedAt      time.Time  `json:"opened_at"`
	ClosedAt      *time.Time `json:"closed_at,omitempty"`
	LastMessageAt time.Time  `json:"last_message_at"`
	ClosedBy      *ClosedBy  `json:"closed_by,omitempty" gorm:"type:varchar(20)"`
}

type Message struct {
	ID         uuid.UUID  `json:"id" gorm:"type:uuid;primary_key"`
	ChatID     uuid.UUID  `json:"chat_id" gorm:"type:uuid;not null;index"`
	TenantID   uuid.UUID  `json:"tenant_id" gorm:"type:uuid;not null;index"`
	SenderType SenderType `json:"sender_type" gorm:"type:varchar(20);not null"`
	SenderName string     `json:"sender_name,omitempty" gorm:"type:varchar(100)"`
	Message    string     `json:"message" gorm:"type:text;not null"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (Chat) TableName() string {
	return "waiter_chats"
}

func (Message) TableName() string {
	return "waiter_chat_messages"
}
