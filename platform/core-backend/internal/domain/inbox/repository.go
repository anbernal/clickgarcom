package inbox

import (
    "context"

    "github.com/google/uuid"
)

type Repository interface {
    Store(ctx context.Context, event *InboxEvent) error
    FindByID(ctx context.Context, id uuid.UUID) (*InboxEvent, error)
    MarkAsProcessed(ctx context.Context, id uuid.UUID) error
    MarkAsFailed(ctx context.Context, id uuid.UUID, errorMsg string) error
}