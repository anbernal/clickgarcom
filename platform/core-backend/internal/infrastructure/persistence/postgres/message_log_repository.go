package postgres

import (
	"context"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"

	"gorm.io/gorm"
)

type messageLogRepository struct {
	db *gorm.DB
}

func NewMessageLogRepository(db *gorm.DB) tenant.MessageLogRepository {
	return &messageLogRepository{db: db}
}

func (r *messageLogRepository) Save(ctx context.Context, log *tenant.MessageLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *messageLogRepository) GetStatsByTenant(ctx context.Context, tenantID string) (int64, int64, error) {
	var inCount, outCount int64

	err := r.db.WithContext(ctx).Model(&tenant.MessageLog{}).
		Where("tenant_id = ? AND direction = ?", tenantID, tenant.DirectionIn).
		Count(&inCount).Error
	if err != nil {
		return 0, 0, err
	}

	err = r.db.WithContext(ctx).Model(&tenant.MessageLog{}).
		Where("tenant_id = ? AND direction = ?", tenantID, tenant.DirectionOut).
		Count(&outCount).Error
	if err != nil {
		return 0, 0, err
	}

	return inCount, outCount, nil
}
