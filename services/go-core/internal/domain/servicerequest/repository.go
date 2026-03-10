package servicerequest

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	Create(ctx context.Context, req *ServiceRequest) error
	FindOpenByTabAndType(ctx context.Context, tenantID uuid.UUID, tabID uuid.UUID, requestType RequestType) (*ServiceRequest, error)
}
