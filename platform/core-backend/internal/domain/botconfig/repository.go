package botconfig

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	FindPublishedByKey(ctx context.Context, tenantID uuid.UUID, key string, channel Channel) (*FlowDefinition, error)
	ListPublishedByTenant(ctx context.Context, tenantID uuid.UUID, channel Channel) ([]*FlowDefinition, error)
}
