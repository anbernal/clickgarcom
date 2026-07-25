package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/anbernal/clickgarcom/internal/domain/conversation"
)

// PortalOrderStatusNotification is the channel projection of order.status_changed.
// The text and actions are produced once by the order service, alongside WhatsApp.
type PortalOrderStatusNotification struct {
	EventID  string                `json:"event_id"`
	TenantID uuid.UUID             `json:"tenant_id"`
	TabID    uuid.UUID             `json:"tab_id"`
	OrderID  uuid.UUID             `json:"order_id"`
	Status   string                `json:"status"`
	Text     string                `json:"text"`
	Actions  []conversation.Action `json:"actions,omitempty"`
}

type PortalAccessVerifier interface {
	HasActivePortalAccess(ctx context.Context, tenantID, tabID uuid.UUID) (bool, error)
}

type HandlePortalOrderStatusUseCase struct {
	accessVerifier PortalAccessVerifier
	outputStore    conversation.OutputStore
}

func NewHandlePortalOrderStatusUseCase(accessVerifier PortalAccessVerifier, outputStore conversation.OutputStore) *HandlePortalOrderStatusUseCase {
	return &HandlePortalOrderStatusUseCase{accessVerifier: accessVerifier, outputStore: outputStore}
}

// Execute returns true only when a portal timeline was updated.
func (uc *HandlePortalOrderStatusUseCase) Execute(ctx context.Context, event PortalOrderStatusNotification) (bool, error) {
	if event.TenantID == uuid.Nil || event.TabID == uuid.Nil || event.OrderID == uuid.Nil {
		return false, fmt.Errorf("portal order status event requires tenant_id, tab_id and order_id")
	}
	if strings.TrimSpace(event.EventID) == "" || strings.TrimSpace(event.Text) == "" {
		return false, fmt.Errorf("portal order status event requires event_id and text")
	}

	active, err := uc.accessVerifier.HasActivePortalAccess(ctx, event.TenantID, event.TabID)
	if err != nil {
		return false, fmt.Errorf("verify portal access: %w", err)
	}
	if !active {
		return false, nil
	}

	if err := uc.outputStore.AppendOutput(ctx, event.TenantID, event.TabID, conversation.Output{
		Text:    strings.TrimSpace(event.Text),
		Actions: event.Actions,
		EventID: strings.TrimSpace(event.EventID),
	}); err != nil {
		return false, fmt.Errorf("append portal order status: %w", err)
	}
	return true, nil
}
