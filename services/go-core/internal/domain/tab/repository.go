package tab

import (
    "context"

    "github.com/google/uuid"
)

type Repository interface {
    FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Tab, error)
    FindOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*Tab, error)
    FindByTenantAndStatus(ctx context.Context, tenantID uuid.UUID, status Status) ([]*Tab, error)
    Create(ctx context.Context, tab *Tab) error
    Update(ctx context.Context, tab *Tab) error
}