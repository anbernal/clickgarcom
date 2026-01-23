package postgres

import (
    "context"
    "fmt"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "github.com/anbernal11041983/clickgarcom/internal/domain/tenant"
)

type TenantRepository struct {
    db *gorm.DB
}

func NewTenantRepository(db *gorm.DB) tenant.Repository {
    return &TenantRepository{db: db}
}

func (r *TenantRepository) FindByID(ctx context.Context, id uuid.UUID) (*tenant.Tenant, error) {
    var t tenant.Tenant
    if err := r.db.WithContext(ctx).First(&t, "id = ?", id).Error; err != nil {
        return nil, fmt.Errorf("tenant not found: %w", err)
    }
    return &t, nil
}

func (r *TenantRepository) FindByWhatsAppNumber(ctx context.Context, number string) (*tenant.Tenant, error) {
    var t tenant.Tenant
    if err := r.db.WithContext(ctx).First(&t, "whatsapp_number = ?", number).Error; err != nil {
        return nil, fmt.Errorf("tenant not found: %w", err)
    }
    return &t, nil
}

func (r *TenantRepository) FindBySlug(ctx context.Context, slug string) (*tenant.Tenant, error) {
    var t tenant.Tenant
    if err := r.db.WithContext(ctx).First(&t, "slug = ?", slug).Error; err != nil {
        return nil, fmt.Errorf("tenant not found: %w", err)
    }
    return &t, nil
}

func (r *TenantRepository) Create(ctx context.Context, t *tenant.Tenant) error {
    if t.ID == uuid.Nil {
        t.ID = uuid.New()
    }
    return r.db.WithContext(ctx).Create(t).Error
}

func (r *TenantRepository) Update(ctx context.Context, t *tenant.Tenant) error {
    return r.db.WithContext(ctx).Save(t).Error
}