package tenant

import (
	"context"

	"github.com/anbernal/clickgarcom/internal/domain/user"
	"github.com/google/uuid"
)

type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*Tenant, error)
	FindByWhatsAppNumber(ctx context.Context, number string) (*Tenant, error)
	FindBySlug(ctx context.Context, slug string) (*Tenant, error)
	Create(ctx context.Context, tenant *Tenant) error
	Update(ctx context.Context, tenant *Tenant) error
	GetUsersByTenant(ctx context.Context, tenantID string) ([]*user.User, error)
}

type MessageLogRepository interface {
	Save(ctx context.Context, log *MessageLog) error
	GetStatsByTenant(ctx context.Context, tenantID string) (inCount int64, outCount int64, err error)
}
