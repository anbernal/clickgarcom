package order

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Order, error)
	FindByIDWithItems(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Order, error)
	FindByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*Order, error)
	FindByDestinationAndStatus(ctx context.Context, destination Destination, status Status, tenantID uuid.UUID) ([]*Order, error)
	ListByFilters(ctx context.Context, tenantID uuid.UUID, statuses []Status, destination string) ([]*Order, error)
	Create(ctx context.Context, order *Order) error
	Update(ctx context.Context, order *Order) error
}
