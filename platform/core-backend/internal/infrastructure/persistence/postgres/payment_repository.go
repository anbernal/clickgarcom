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

type PaymentAttemptRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) payment.Repository {
	return &PaymentRepository{db: db}
}

func NewPaymentAttemptRepository(db *gorm.DB) payment.AttemptRepository {
	return &PaymentAttemptRepository{db: db}
}

func (r *PaymentRepository) Create(ctx context.Context, p *payment.Payment) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *PaymentRepository) FindByID(ctx context.Context, id uuid.UUID) (*payment.Payment, error) {
	var p payment.Payment
	if err := r.db.WithContext(ctx).First(&p, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (r *PaymentRepository) FindByExternalReference(ctx context.Context, extRef string) (*payment.Payment, error) {
	var p payment.Payment
	if err := r.db.WithContext(ctx).First(&p, "external_reference = ?", extRef).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (r *PaymentRepository) Update(ctx context.Context, p *payment.Payment) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *PaymentAttemptRepository) Create(ctx context.Context, attempt *payment.Attempt) error {
	if attempt.ID == uuid.Nil {
		attempt.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(attempt).Error
}

func (r *PaymentAttemptRepository) FindByID(ctx context.Context, id uuid.UUID) (*payment.Attempt, error) {
	var attempt payment.Attempt
	if err := r.db.WithContext(ctx).First(&attempt, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &attempt, nil
}

func (r *PaymentAttemptRepository) FindLatestByPaymentID(ctx context.Context, paymentID uuid.UUID) (*payment.Attempt, error) {
	var attempt payment.Attempt
	if err := r.db.WithContext(ctx).
		Where("payment_id = ?", paymentID).
		Order("created_at DESC").
		First(&attempt).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &attempt, nil
}

func (r *PaymentAttemptRepository) FindByProviderPaymentID(ctx context.Context, providerPaymentID string) (*payment.Attempt, error) {
	var attempt payment.Attempt
	if err := r.db.WithContext(ctx).
		Where("provider_payment_id = ?", providerPaymentID).
		Order("created_at DESC").
		First(&attempt).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &attempt, nil
}

func (r *PaymentAttemptRepository) Update(ctx context.Context, attempt *payment.Attempt) error {
	return r.db.WithContext(ctx).Save(attempt).Error
}
