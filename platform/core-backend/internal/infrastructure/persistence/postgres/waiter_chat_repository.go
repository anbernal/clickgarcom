package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/waiterchat"
)

type waiterChatRepository struct {
	db *gorm.DB
}

func NewWaiterChatRepository(db *gorm.DB) waiterchat.Repository {
	return &waiterChatRepository{db: db}
}

func (r *waiterChatRepository) FindOpenByPhone(
	ctx context.Context,
	tenantID uuid.UUID,
	userPhone string,
) (*waiterchat.Chat, error) {
	var chat waiterchat.Chat
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND user_phone = ? AND status = ?", tenantID, userPhone, waiterchat.StatusOpen).
		Order("opened_at DESC").
		First(&chat).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &chat, nil
}

func (r *waiterChatRepository) CreateChat(ctx context.Context, chat *waiterchat.Chat) error {
	return r.db.WithContext(ctx).Create(chat).Error
}

func (r *waiterChatRepository) AppendMessage(ctx context.Context, message *waiterchat.Message) error {
	now := time.Now()
	if message.CreatedAt.IsZero() {
		message.CreatedAt = now
	}
	if err := r.db.WithContext(ctx).Create(message).Error; err != nil {
		return err
	}

	return r.db.WithContext(ctx).
		Model(&waiterchat.Chat{}).
		Where("id = ? AND tenant_id = ?", message.ChatID, message.TenantID).
		Updates(map[string]interface{}{
			"last_message_at": now,
		}).Error
}

func (r *waiterChatRepository) CloseChat(
	ctx context.Context,
	chatID uuid.UUID,
	tenantID uuid.UUID,
	closedBy waiterchat.ClosedBy,
) error {
	now := time.Now()
	closedByVal := string(closedBy)
	return r.db.WithContext(ctx).
		Model(&waiterchat.Chat{}).
		Where("id = ? AND tenant_id = ? AND status = ?", chatID, tenantID, waiterchat.StatusOpen).
		Updates(map[string]interface{}{
			"status":          waiterchat.StatusClosed,
			"closed_at":       now,
			"closed_by":       closedByVal,
			"last_message_at": now,
		}).Error
}
