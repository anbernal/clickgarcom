package postgres

import (
	"github.com/anbernal/clickgarcom/internal/domain/user"
	"gorm.io/gorm"
)

func NewUserRepository(db *gorm.DB) user.Repository {
	return user.NewRepository(db)
}
