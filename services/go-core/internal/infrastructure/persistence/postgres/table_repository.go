package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/table"
)

type tableRepository struct {
	db *gorm.DB
}

func NewTableRepository(db *gorm.DB) table.Repository {
	return &tableRepository{db: db}
}

func (r *tableRepository) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*table.Table, error) {
	var t table.Table
	err := r.db.WithContext(ctx).Where("id = ? AND tenant_id = ?", id, tenantID).First(&t).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // Return nil, nil when not found to easily check
		}
		return nil, err
	}
	return &t, nil
}

func (r *tableRepository) FindByNumber(ctx context.Context, number string, tenantID uuid.UUID) (*table.Table, error) {
	var t table.Table
	err := r.db.WithContext(ctx).Where("number = ? AND tenant_id = ?", number, tenantID).First(&t).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

func (r *tableRepository) FindByTenant(ctx context.Context, tenantID uuid.UUID) ([]*table.Table, error) {
	var tables []*table.Table
	err := r.db.WithContext(ctx).Where("tenant_id = ?", tenantID).Order("number ASC").Find(&tables).Error
	if err != nil {
		return nil, err
	}
	return tables, nil
}

func (r *tableRepository) Create(ctx context.Context, t *table.Table) error {
	return r.db.WithContext(ctx).Create(t).Error
}

func (r *tableRepository) Update(ctx context.Context, t *table.Table) error {
	return r.db.WithContext(ctx).Save(t).Error
}

// Table Request methods

func (r *tableRepository) CreateRequest(ctx context.Context, req *table.TableRequest) error {
	return r.db.WithContext(ctx).Create(req).Error
}

func (r *tableRepository) FindRequestByID(ctx context.Context, id uuid.UUID) (*table.TableRequest, error) {
	var req table.TableRequest
	err := r.db.WithContext(ctx).Preload("Table").Where("id = ?", id).First(&req).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &req, nil
}

func (r *tableRepository) FindPendingRequestByPhone(ctx context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	var req table.TableRequest
	err := r.db.WithContext(ctx).Where("user_phone = ? AND tenant_id = ? AND status = ?", phone, tenantID, table.RequestStatusPending).First(&req).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &req, nil
}

func (r *tableRepository) FindLatestApprovedRequestByPhone(ctx context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	var req table.TableRequest
	err := r.db.WithContext(ctx).
		Where("user_phone = ? AND tenant_id = ? AND status = ? AND table_id IS NOT NULL", phone, tenantID, table.RequestStatusApproved).
		Order("updated_at DESC, created_at DESC").
		First(&req).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &req, nil
}

func (r *tableRepository) UpdateRequest(ctx context.Context, req *table.TableRequest) error {
	return r.db.WithContext(ctx).Save(req).Error
}
