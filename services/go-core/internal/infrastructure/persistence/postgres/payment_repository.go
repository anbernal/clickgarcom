package postgres

import (
	"context"

	"github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PaymentRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) payment.Repository {
	return &PaymentRepository{db: db}
}

func (r *PaymentRepository) Save(ctx context.Context, p *payment.Payment) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *PaymentRepository) FindByID(ctx context.Context, id uuid.UUID) (*payment.Payment, error) {
	var p payment.Payment
	if err := r.db.WithContext(ctx).First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PaymentRepository) FindByExternalReference(ctx context.Context, extRef string) (*payment.Payment, error) {
	var p payment.Payment
	if err := r.db.WithContext(ctx).First(&p, "external_reference = ?", extRef).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PaymentRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status payment.PaymentStatus) error {
	return r.db.WithContext(ctx).Model(&payment.Payment{}).Where("id = ?", id).Update("status", status).Error
}
