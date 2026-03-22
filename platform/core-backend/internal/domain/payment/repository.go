package payment

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	Create(ctx context.Context, p *Payment) error
	FindByID(ctx context.Context, id uuid.UUID) (*Payment, error)
	FindByExternalReference(ctx context.Context, extRef string) (*Payment, error)
	Update(ctx context.Context, p *Payment) error
}

type AttemptRepository interface {
	Create(ctx context.Context, attempt *Attempt) error
	FindByID(ctx context.Context, id uuid.UUID) (*Attempt, error)
	FindLatestByPaymentID(ctx context.Context, paymentID uuid.UUID) (*Attempt, error)
	FindByProviderPaymentID(ctx context.Context, providerPaymentID string) (*Attempt, error)
	Update(ctx context.Context, attempt *Attempt) error
}
