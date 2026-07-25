package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PortalAccessVerifier struct{ db *gorm.DB }

func NewPortalAccessVerifier(db *gorm.DB) *PortalAccessVerifier {
	return &PortalAccessVerifier{db: db}
}

func (r *PortalAccessVerifier) HasActivePortalAccess(ctx context.Context, tenantID, tabID uuid.UUID) (bool, error) {
	var active bool
	err := r.db.WithContext(ctx).Raw(
		`SELECT EXISTS (
			SELECT 1
			  FROM tab_portal_access_credentials c
			  JOIN tabs tb ON tb.id = c.tab_id AND tb.tenant_id = c.tenant_id
			 WHERE c.tenant_id = ?
			   AND c.tab_id = ?
			   AND c.revoked_at IS NULL
			   AND (c.expires_at IS NULL OR c.expires_at > NOW())
			   AND tb.status <> 'CLOSED'
		)`, tenantID, tabID,
	).Scan(&active).Error
	return active, err
}
