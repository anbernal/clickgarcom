package postgres

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/servicerequest"
)

type ServiceRequestRepository struct {
	db *gorm.DB
}

func NewServiceRequestRepository(db *gorm.DB) servicerequest.Repository {
	return &ServiceRequestRepository{db: db}
}

func (r *ServiceRequestRepository) Create(ctx context.Context, req *servicerequest.ServiceRequest) error {
	if req.ID == uuid.Nil {
		req.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(req).Error
}

func (r *ServiceRequestRepository) FindOpenByTabAndType(
	ctx context.Context,
	tenantID uuid.UUID,
	tabID uuid.UUID,
	requestType servicerequest.RequestType,
) (*servicerequest.ServiceRequest, error) {
	var req servicerequest.ServiceRequest
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND tab_id = ? AND request_type = ? AND status IN ?",
			tenantID,
			tabID,
			requestType,
			[]string{string(servicerequest.StatusPending), string(servicerequest.StatusInProgress)},
		).
		Order("created_at DESC").
		First(&req).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &req, nil
}
