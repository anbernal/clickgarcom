package waiterchat

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	FindOpenByPhone(ctx context.Context, tenantID uuid.UUID, userPhone string) (*Chat, error)
	CreateChat(ctx context.Context, chat *Chat) error
	AppendMessage(ctx context.Context, message *Message) error
	CloseChat(ctx context.Context, chatID uuid.UUID, tenantID uuid.UUID, closedBy ClosedBy) error
}
