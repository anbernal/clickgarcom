package user

import (
	"github.com/google/uuid"
	"github.com/yourorg/clickgarcom/services/go-core/internal/domain/user"
	"gorm.io/gorm"
)

type Repository interface {
	Create(u *user.User) error
	FindByEmail(email string) (*user.User, error)
	FindByID(id uuid.UUID) (*user.User, error)
}

type gormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) Create(u *user.User) error {
	return r.db.Create(u).Error
}

func (r *gormRepository) FindByEmail(email string) (*user.User, error) {
	var u user.User
	if err := r.db.Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *gormRepository) FindByID(id uuid.UUID) (*user.User, error) {
	var u user.User
	if err := r.db.First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}
