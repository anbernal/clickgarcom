package tenant

import (
    "context"

    "github.com/google/uuid"
)

type Repository interface {
    FindByID(ctx context.Context, id uuid.UUID) (*Tenant, error)
    FindByWhatsAppNumber(ctx context.Context, number string) (*Tenant, error)
    FindBySlug(ctx context.Context, slug string) (*Tenant, error)
    Create(ctx context.Context, tenant *Tenant) error
    Update(ctx context.Context, tenant *Tenant) error
}