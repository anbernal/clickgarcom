package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/botconfig"
)

type botConfigRepository struct {
	db *gorm.DB
}

func NewBotConfigRepository(db *gorm.DB) botconfig.Repository {
	return &botConfigRepository{db: db}
}

func (r *botConfigRepository) FindPublishedByKey(
	ctx context.Context,
	tenantID uuid.UUID,
	key string,
	channel botconfig.Channel,
) (*botconfig.FlowDefinition, error) {
	var flow botconfig.FlowDefinition
	err := r.db.WithContext(ctx).
		Where(
			"tenant_id = ? AND flow_key = ? AND channel = ? AND status = ?",
			tenantID,
			key,
			channel,
			botconfig.StatusPublished,
		).
		Order("version DESC").
		First(&flow).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &flow, nil
}

func (r *botConfigRepository) ListPublishedByTenant(
	ctx context.Context,
	tenantID uuid.UUID,
	channel botconfig.Channel,
) ([]*botconfig.FlowDefinition, error) {
	var flows []*botconfig.FlowDefinition
	err := r.db.WithContext(ctx).
		Where(
			"tenant_id = ? AND channel = ? AND status = ?",
			tenantID,
			channel,
			botconfig.StatusPublished,
		).
		Order("flow_key ASC, version DESC").
		Find(&flows).Error
	if err != nil {
		return nil, err
	}
	return flows, nil
}
