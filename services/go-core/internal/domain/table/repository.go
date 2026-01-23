package table

import (
    "context"

    "github.com/google/uuid"
)

type Repository interface {
    FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Table, error)
    FindByNumber(ctx context.Context, number string, tenantID uuid.UUID) (*Table, error)
    FindByTenant(ctx context.Context, tenantID uuid.UUID) ([]*Table, error)
    Create(ctx context.Context, table *Table) error
    Update(ctx context.Context, table *Table) error
}