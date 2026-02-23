package tab

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Tab, error)
	FindOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*Tab, error)
	FindAllOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) ([]*Tab, error) // Fase 14
	FindByTenantAndStatus(ctx context.Context, tenantID uuid.UUID, status Status) ([]*Tab, error)
	Create(ctx context.Context, tab *Tab) error
	Update(ctx context.Context, tab *Tab) error

	// Fase 15: Tab Join Approval
	CreateJoinRequest(ctx context.Context, req *TabJoinRequest) error
	FindPendingJoinRequestByOpener(ctx context.Context, openerPhone string, tenantID uuid.UUID) (*TabJoinRequest, error)
	FindJoinRequestByID(ctx context.Context, id uuid.UUID) (*TabJoinRequest, error)
	UpdateJoinRequestStatus(ctx context.Context, id uuid.UUID, status JoinRequestStatus) error
}
