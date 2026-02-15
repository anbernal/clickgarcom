package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/order"
)

type OrderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) order.Repository {
	return &OrderRepository{db: db}
}

func (r *OrderRepository) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	var o order.Order
	err := r.db.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&o).Error

	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *OrderRepository) FindByIDWithItems(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	var o order.Order
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&o).Error

	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *OrderRepository) FindByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*order.Order, error) {
	var orders []*order.Order
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("tab_id = ? AND tenant_id = ?", tabID, tenantID).
		Order("created_at DESC").
		Find(&orders).Error

	return orders, err
}

func (r *OrderRepository) FindByDestinationAndStatus(
	ctx context.Context,
	destination order.Destination,
	status order.Status,
	tenantID uuid.UUID,
) ([]*order.Order, error) {
	var orders []*order.Order
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("destination = ? AND status = ? AND tenant_id = ?", destination, status, tenantID).
		Order("created_at ASC").
		Find(&orders).Error

	return orders, err
}

func (r *OrderRepository) Create(ctx context.Context, o *order.Order) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}

	// Gerar IDs para os itens
	for i := range o.Items {
		if o.Items[i].ID == uuid.Nil {
			o.Items[i].ID = uuid.New()
		}
		o.Items[i].OrderID = o.ID
	}

	return r.db.WithContext(ctx).Create(o).Error
}

func (r *OrderRepository) Update(ctx context.Context, o *order.Order) error {
	return r.db.WithContext(ctx).Save(o).Error
}
