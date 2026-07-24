package conversation

import (
	"context"
	"strings"

	"github.com/google/uuid"

	domain "github.com/anbernal/clickgarcom/internal/domain/conversation"
	whatsapp "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

// PortalSender implements the delivery shape used by the WhatsApp use case,
// storing the same response as a portal event instead of calling Meta.
type PortalSender struct {
	store    domain.OutputStore
	tenantID uuid.UUID
	tabID    uuid.UUID
}

func NewPortalSender(store domain.OutputStore, tenantID, tabID uuid.UUID) *PortalSender {
	return &PortalSender{store: store, tenantID: tenantID, tabID: tabID}
}

func (s *PortalSender) SendText(ctx context.Context, _ string, message string) error {
	return s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{Text: strings.TrimSpace(message)})
}

func (s *PortalSender) SendImage(ctx context.Context, _ string, imageURL, caption string) (string, error) {
	text := strings.TrimSpace(caption)
	if strings.TrimSpace(imageURL) != "" {
		text = strings.TrimSpace(text + "\n" + imageURL)
	}
	return "portal", s.SendText(ctx, "", text)
}

func (s *PortalSender) SendInteractiveButtons(ctx context.Context, _ string, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) {
	actions := make([]domain.Action, 0, len(buttons))
	for _, button := range buttons {
		actions = append(actions, domain.Action{ID: button.Reply.ID, Label: button.Reply.Title})
	}
	return "portal", s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{Text: strings.TrimSpace(bodyText), Actions: actions})
}

func (s *PortalSender) SendInteractiveList(ctx context.Context, _ string, bodyText, _ string, sections []whatsapp.InteractiveListSection) (string, error) {
	actions := make([]domain.Action, 0)
	for _, section := range sections {
		for _, row := range section.Rows {
			actions = append(actions, domain.Action{ID: row.ID, Label: row.Title, Description: row.Description})
		}
	}
	return "portal", s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{Text: strings.TrimSpace(bodyText), Actions: actions})
}
