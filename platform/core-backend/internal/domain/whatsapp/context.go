package whatsapp

import (
	"context"

	"github.com/google/uuid"
)

type tenantIDContextKey struct{}

func WithTenantID(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, tenantIDContextKey{}, tenantID)
}

func TenantIDFromContext(ctx context.Context) (*uuid.UUID, bool) {
	tenantID, ok := ctx.Value(tenantIDContextKey{}).(uuid.UUID)
	if !ok {
		return nil, false
	}

	return &tenantID, true
}
