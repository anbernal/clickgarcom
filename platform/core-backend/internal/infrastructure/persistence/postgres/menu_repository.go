package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/menu"
)

type MenuRepository struct {
	db *gorm.DB
}

func NewMenuRepository(db *gorm.DB) menu.Repository {
	return &MenuRepository{db: db}
}

// FindCategoriesByTenant busca todas as categorias de um tenant
func (r *MenuRepository) FindCategoriesByTenant(ctx context.Context, tenantID uuid.UUID) ([]*menu.Category, error) {
	var categories []*menu.Category
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND active = ?", tenantID, true).
		Order("display_order ASC, name ASC").
		Find(&categories).Error

	return categories, err
}

// FindCategoryByID busca uma categoria por ID
func (r *MenuRepository) FindCategoryByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*menu.Category, error) {
	var category menu.Category
	err := r.db.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&category).Error

	if err != nil {
		return nil, err
	}
	return &category, nil
}

// FindItemsByTenant busca todos os itens de um tenant
func (r *MenuRepository) FindItemsByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*menu.Item, error) {
	var items []*menu.Item
	query := r.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID)

	if availableOnly {
		query = query.Where("available = ?", true)
	}

	err := query.
		Order("display_order ASC, name ASC").
		Find(&items).Error

	return items, err
}

// FindItemsByCategory busca itens de uma categoria
func (r *MenuRepository) FindItemsByCategory(ctx context.Context, categoryID uuid.UUID, tenantID uuid.UUID, availableOnly bool) ([]*menu.Item, error) {
	var items []*menu.Item
	query := r.db.WithContext(ctx).
		Where("category_id = ? AND tenant_id = ?", categoryID, tenantID)

	if availableOnly {
		query = query.Where("available = ?", true)
	}

	err := query.
		Order("display_order ASC, name ASC").
		Find(&items).Error

	return items, err
}

// FindItemByID busca um item por ID
func (r *MenuRepository) FindItemByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*menu.Item, error) {
	var item menu.Item
	err := r.db.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&item).Error

	if err != nil {
		return nil, err
	}
	return &item, nil
}

// FindItemsByIDs busca múltiplos itens por IDs
func (r *MenuRepository) FindItemsByIDs(ctx context.Context, ids []uuid.UUID, tenantID uuid.UUID) ([]*menu.Item, error) {
	var items []*menu.Item
	err := r.db.WithContext(ctx).
		Where("id IN ? AND tenant_id = ?", ids, tenantID).
		Find(&items).Error

	return items, err
}

// FindMenuByTenant busca o cardápio completo (categorias com itens)
func (r *MenuRepository) FindMenuByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*menu.Category, error) {
	var categories []*menu.Category

	// Buscar categorias
	query := r.db.WithContext(ctx).
		Where("tenant_id = ? AND active = ?", tenantID, true).
		Order("display_order ASC, name ASC")

	err := query.Find(&categories).Error
	if err != nil {
		return nil, err
	}

	// Para cada categoria, buscar seus itens
	for i, category := range categories {
		var items []*menu.Item
		itemQuery := r.db.WithContext(ctx).
			Where("category_id = ? AND tenant_id = ?", category.ID, tenantID)

		if availableOnly {
			itemQuery = itemQuery.Where("available = ?", true)
		}

		err := itemQuery.
			Order("display_order ASC, name ASC").
			Find(&items).Error

		if err != nil {
			return nil, err
		}

		// Criar uma estrutura temporária para armazenar os itens
		// (não podemos modificar diretamente pois Category não tem campo Items)
		// Vamos retornar apenas as categorias que têm itens disponíveis
		if len(items) > 0 || !availableOnly {
			categories[i] = category
		}
	}

	return categories, nil
}
