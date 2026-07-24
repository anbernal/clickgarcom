package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/domain/conversation"
)

type portalConversationEventRepository struct{ db *gorm.DB }

func NewPortalConversationEventRepository(db *gorm.DB) conversation.OutputStore {
	return &portalConversationEventRepository{db: db}
}

func NewPortalConversationInputRepository(db *gorm.DB) conversation.InputStore {
	return &portalConversationEventRepository{db: db}
}

func (r *portalConversationEventRepository) AppendInput(ctx context.Context, tenantID, tabID uuid.UUID, input conversation.Input) error {
	payload, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("marshal portal conversation input: %w", err)
	}
	return r.db.WithContext(ctx).Exec(
		`INSERT INTO tab_portal_conversation_events
			(tenant_id, tab_id, direction, event_type, payload)
		 VALUES (?, ?, 'INBOUND', 'CUSTOMER_MESSAGE', ?::jsonb)`,
		tenantID, tabID, string(payload),
	).Error
}

func (r *portalConversationEventRepository) AppendOutput(ctx context.Context, tenantID, tabID uuid.UUID, output conversation.Output) error {
	payload, err := json.Marshal(output)
	if err != nil {
		return fmt.Errorf("marshal portal conversation output: %w", err)
	}
	return r.db.WithContext(ctx).Exec(
		`INSERT INTO tab_portal_conversation_events
			(tenant_id, tab_id, direction, event_type, payload)
		 VALUES (?, ?, 'OUTBOUND', 'BOT_RESPONSE', ?::jsonb)`,
		tenantID, tabID, string(payload),
	).Error
}
