package postgres

import (
	"context"
	"time"

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

	if err != nil {
		return nil, err
	}

	if err := r.hydrateMenuItemsCatalog(ctx, items, tenantID); err != nil {
		return nil, err
	}

	return hydrateAndFilterMenuItems(items, availableOnly), nil
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

	if err != nil {
		return nil, err
	}

	if err := r.hydrateMenuItemsCatalog(ctx, items, tenantID); err != nil {
		return nil, err
	}

	return hydrateAndFilterMenuItems(items, availableOnly), nil
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

	if err := r.hydrateMenuItemsCatalog(ctx, []*menu.Item{&item}, tenantID); err != nil {
		return nil, err
	}

	item.HydrateAvailabilityState(time.Now())
	return &item, nil
}

// FindItemsByIDs busca múltiplos itens por IDs
func (r *MenuRepository) FindItemsByIDs(ctx context.Context, ids []uuid.UUID, tenantID uuid.UUID) ([]*menu.Item, error) {
	var items []*menu.Item
	err := r.db.WithContext(ctx).
		Where("id IN ? AND tenant_id = ?", ids, tenantID).
		Find(&items).Error

	if err != nil {
		return nil, err
	}

	if err := r.hydrateMenuItemsCatalog(ctx, items, tenantID); err != nil {
		return nil, err
	}

	for _, item := range items {
		if item != nil {
			item.HydrateAvailabilityState(time.Now())
		}
	}

	return items, nil
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

		items = hydrateAndFilterMenuItems(items, availableOnly)

		// Criar uma estrutura temporária para armazenar os itens
		// (não podemos modificar diretamente pois Category não tem campo Items)
		// Vamos retornar apenas as categorias que têm itens disponíveis
		if len(items) > 0 || !availableOnly {
			categories[i] = category
		}
	}

	return categories, nil
}

func hydrateAndFilterMenuItems(items []*menu.Item, availableOnly bool) []*menu.Item {
	now := time.Now()
	filtered := make([]*menu.Item, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}

		item.HydrateAvailabilityState(now)
		if availableOnly && !item.IsCurrentlyAvailable {
			continue
		}

		filtered = append(filtered, item)
	}

	return filtered
}

func (r *MenuRepository) hydrateMenuItemsCatalog(ctx context.Context, items []*menu.Item, tenantID uuid.UUID) error {
	componentIDs := make([]uuid.UUID, 0)
	seen := make(map[uuid.UUID]struct{})

	for _, item := range items {
		if item == nil {
			continue
		}

		item.EnsureOptionGroups()
		for _, component := range item.EnsureComboComponents() {
			if component.MenuItemID == uuid.Nil {
				continue
			}
			if _, exists := seen[component.MenuItemID]; exists {
				continue
			}
			seen[component.MenuItemID] = struct{}{}
			componentIDs = append(componentIDs, component.MenuItemID)
		}
	}

	if len(componentIDs) == 0 {
		return nil
	}

	var componentItems []*menu.Item
	if err := r.db.WithContext(ctx).
		Select("id, tenant_id, name, price").
		Where("tenant_id = ? AND id IN ?", tenantID, componentIDs).
		Find(&componentItems).Error; err != nil {
		return err
	}

	componentMap := make(map[uuid.UUID]*menu.Item, len(componentItems))
	for _, componentItem := range componentItems {
		if componentItem == nil {
			continue
		}
		componentMap[componentItem.ID] = componentItem
	}

	for _, item := range items {
		if item == nil {
			continue
		}

		components := item.EnsureComboComponents()
		for index := range components {
			componentItem := componentMap[components[index].MenuItemID]
			if componentItem == nil {
				continue
			}
			components[index].MenuItemName = componentItem.Name
			components[index].MenuItemPrice = componentItem.Price
		}
		item.ComboComponents = components
	}

	return nil
}
