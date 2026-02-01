package postgres

import (
    "context"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"
    "gorm.io/gorm/clause"

    "github.com/anbernal11041983/clickgarcom/internal/domain/inbox"
)

type InboxRepository struct {
    db *gorm.DB
}

func NewInboxRepository(db *gorm.DB) inbox.Repository {
    return &InboxRepository{db: db}
}

func (r *InboxRepository) Store(ctx context.Context, event *inbox.InboxEvent) error {
    if event.ID == uuid.Nil {
        event.ID = uuid.New()
    }
    event.ReceivedAt = time.Now()
    
    // INSERT ... ON CONFLICT DO NOTHING (idempotência)
    return r.db.WithContext(ctx).
        Clauses(clause.OnConflict{DoNothing: true}).
        Create(event).Error
}

func (r *InboxRepository) FindByID(ctx context.Context, id uuid.UUID) (*inbox.InboxEvent, error) {
    var event inbox.InboxEvent
    if err := r.db.WithContext(ctx).First(&event, "id = ?", id).Error; err != nil {
        return nil, err
    }
    return &event, nil
}

func (r *InboxRepository) MarkAsProcessed(ctx context.Context, id uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&inbox.InboxEvent{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "processed":    true,
            "processed_at": now,
        }).Error
}

func (r *InboxRepository) MarkAsFailed(ctx context.Context, id uuid.UUID, errorMsg string) error {
    return r.db.WithContext(ctx).
        Model(&inbox.InboxEvent{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "processing_error": errorMsg,
        }).Error
}