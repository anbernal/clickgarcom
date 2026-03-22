package user

import (
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleAdmin        Role = "ADMIN"
	RoleCollaborator Role = "COLLABORATOR"
)

type User struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	TenantID     uuid.UUID `json:"tenant_id" gorm:"type:uuid;not null"`
	Email        string    `json:"email" gorm:"uniqueIndex;not null"`
	PasswordHash string    `json:"password_hash" gorm:"not null"`
	Role         Role      `json:"role" gorm:"type:varchar(20);not null"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (User) TableName() string { return "users" }
