package user

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository interface {
	Create(u *User) error
	FindByEmail(email string) (*User, error)
	FindByID(id uuid.UUID) (*User, error)
}

type gormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) Create(u *User) error {
	return r.db.Create(u).Error
}

func (r *gormRepository) FindByEmail(email string) (*User, error) {
	var u User
	if err := r.db.Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *gormRepository) FindByID(id uuid.UUID) (*User, error) {
	var u User
	if err := r.db.First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}
