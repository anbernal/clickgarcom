package session

import (
	"context"
	"time"
)

type Repository interface {
	Save(ctx context.Context, session *Session) error
	Find(ctx context.Context, userPhone string, tenantID string) (*Session, error)
	Delete(ctx context.Context, userPhone string, tenantID string) error
	Extend(ctx context.Context, userPhone string, tenantID string, duration time.Duration) error
}
