package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/tab"
)

type TabRepository struct {
	db *gorm.DB
}

func NewTabRepository(db *gorm.DB) tab.Repository {
	return &TabRepository{db: db}
}

func (r *TabRepository) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	var t tab.Tab
	err := r.db.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		First(&t).Error

	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TabRepository) FindOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	var t tab.Tab
	err := r.db.WithContext(ctx).
		Where("table_id = ? AND tenant_id = ? AND status = ?", tableID, tenantID, tab.StatusOpen).
		First(&t).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Fase 14: Procura todas as comandas simultâneas (Split Checks) naquela mesa
func (r *TabRepository) FindAllOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) ([]*tab.Tab, error) {
	var tabs []*tab.Tab
	err := r.db.WithContext(ctx).
		Where("table_id = ? AND tenant_id = ? AND status = ?", tableID, tenantID, tab.StatusOpen).
		Find(&tabs).Error

	return tabs, err
}

func (r *TabRepository) FindByTenantAndStatus(ctx context.Context, tenantID uuid.UUID, status tab.Status) ([]*tab.Tab, error) {
	var tabs []*tab.Tab
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND status = ?", tenantID, status).
		Order("opened_at DESC").
		Find(&tabs).Error

	return tabs, err
}

func (r *TabRepository) Create(ctx context.Context, t *tab.Tab) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(t).Error
}

func (r *TabRepository) Update(ctx context.Context, t *tab.Tab) error {
	return r.db.WithContext(ctx).Save(t).Error
}

// ──────────────────────────────────────────────────────────────
// Fase 15: Tab Join Request
// ──────────────────────────────────────────────────────────────

func (r *TabRepository) CreateJoinRequest(ctx context.Context, req *tab.TabJoinRequest) error {
	return r.db.WithContext(ctx).Create(req).Error
}

func (r *TabRepository) FindPendingJoinRequestByOpener(ctx context.Context, openerPhone string, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	var req tab.TabJoinRequest
	err := r.db.WithContext(ctx).
		Where("opener_phone = ? AND tenant_id = ? AND status = ?", openerPhone, tenantID, tab.JoinRequestPending).
		Order("created_at DESC").
		First(&req).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &req, err
}

func (r *TabRepository) FindJoinRequestByID(ctx context.Context, id uuid.UUID) (*tab.TabJoinRequest, error) {
	var req tab.TabJoinRequest
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&req).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &req, err
}

func (r *TabRepository) UpdateJoinRequestStatus(ctx context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	return r.db.WithContext(ctx).
		Model(&tab.TabJoinRequest{}).
		Where("id = ?", id).
		Update("status", status).Error
}
