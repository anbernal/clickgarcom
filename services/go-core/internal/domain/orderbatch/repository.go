package orderbatch

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*OrderBatch, error)
	ListByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*OrderBatch, error)
	Create(ctx context.Context, batch *OrderBatch) error
	Update(ctx context.Context, batch *OrderBatch) error
}
