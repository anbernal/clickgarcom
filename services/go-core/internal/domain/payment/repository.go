package payment

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	Save(ctx context.Context, p *Payment) error
	FindByID(ctx context.Context, id uuid.UUID) (*Payment, error)
	FindByExternalReference(ctx context.Context, extRef string) (*Payment, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status PaymentStatus) error
}
