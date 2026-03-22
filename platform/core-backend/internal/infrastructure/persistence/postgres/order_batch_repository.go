package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
)

type orderBatchRepository struct {
	db *gorm.DB
}

func NewOrderBatchRepository(db *gorm.DB) orderbatch.Repository {
	return &orderBatchRepository{db: db}
}

func (r *orderBatchRepository) FindByID(
	ctx context.Context,
	id uuid.UUID,
	tenantID uuid.UUID,
) (*orderbatch.OrderBatch, error) {
	var batch orderbatch.OrderBatch
	err := r.db.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&batch).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &batch, nil
}

func (r *orderBatchRepository) ListByTab(
	ctx context.Context,
	tabID uuid.UUID,
	tenantID uuid.UUID,
) ([]*orderbatch.OrderBatch, error) {
	var batches []*orderbatch.OrderBatch
	err := r.db.WithContext(ctx).
		Where("tab_id = ? AND tenant_id = ?", tabID, tenantID).
		Order("created_at DESC").
		Find(&batches).Error
	if err != nil {
		return nil, err
	}
	return batches, nil
}

func (r *orderBatchRepository) Create(ctx context.Context, batch *orderbatch.OrderBatch) error {
	if batch.ID == uuid.Nil {
		batch.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(batch).Error
}

func (r *orderBatchRepository) Update(ctx context.Context, batch *orderbatch.OrderBatch) error {
	return r.db.WithContext(ctx).Save(batch).Error
}
