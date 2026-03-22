package menu

import (
	"context"

	"github.com/google/uuid"
)

// Repository define as operações de persistência para o cardápio
type Repository interface {
	// Categories
	FindCategoriesByTenant(ctx context.Context, tenantID uuid.UUID) ([]*Category, error)
	FindCategoryByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Category, error)

	// Items
	FindItemsByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*Item, error)
	FindItemsByCategory(ctx context.Context, categoryID uuid.UUID, tenantID uuid.UUID, availableOnly bool) ([]*Item, error)
	FindItemByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*Item, error)
	FindItemsByIDs(ctx context.Context, ids []uuid.UUID, tenantID uuid.UUID) ([]*Item, error)

	// Menu completo (categorias com itens)
	FindMenuByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*Category, error)
}
