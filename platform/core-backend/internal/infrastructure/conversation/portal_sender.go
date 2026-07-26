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
	// Meta needs separate media and interactive messages; the portal can render both atomically.
	pendingImageURL     string
	pendingImageCaption string
}

func NewPortalSender(store domain.OutputStore, tenantID, tabID uuid.UUID) *PortalSender {
	return &PortalSender{store: store, tenantID: tenantID, tabID: tabID}
}

func (s *PortalSender) SendText(ctx context.Context, _ string, message string) error {
	imageURL, _ := s.takePendingImage()
	return s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{
		Text:     strings.TrimSpace(message),
		ImageURL: imageURL,
	})
}

func (s *PortalSender) SendImage(ctx context.Context, _ string, imageURL, caption string) (string, error) {
	if s.pendingImageURL != "" {
		if err := s.flushPendingImage(ctx); err != nil {
			return "", err
		}
	}
	s.pendingImageURL = strings.TrimSpace(imageURL)
	s.pendingImageCaption = strings.TrimSpace(caption)
	return "portal", nil
}

func (s *PortalSender) SendInteractiveButtons(ctx context.Context, _ string, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) {
	actions := make([]domain.Action, 0, len(buttons))
	for _, button := range buttons {
		actions = append(actions, domain.Action{ID: button.Reply.ID, Label: button.Reply.Title})
	}
	imageURL, _ := s.takePendingImage()
	return "portal", s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{
		Text:     strings.TrimSpace(bodyText),
		ImageURL: imageURL,
		Actions:  actions,
	})
}

func (s *PortalSender) SendInteractiveURLButton(ctx context.Context, _ string, bodyText, displayText, targetURL string) (string, error) {
	imageURL, _ := s.takePendingImage()
	return "portal", s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{
		Text:     strings.TrimSpace(bodyText),
		ImageURL: imageURL,
		Actions: []domain.Action{{
			ID:    "checkout:url",
			Label: strings.TrimSpace(displayText),
			URL:   strings.TrimSpace(targetURL),
		}},
	})
}

func (s *PortalSender) SendInteractiveList(ctx context.Context, _ string, bodyText, _ string, sections []whatsapp.InteractiveListSection) (string, error) {
	actions := make([]domain.Action, 0)
	for _, section := range sections {
		for _, row := range section.Rows {
			actions = append(actions, domain.Action{ID: row.ID, Label: row.Title, Description: row.Description})
		}
	}
	imageURL, _ := s.takePendingImage()
	return "portal", s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{
		Text:     strings.TrimSpace(bodyText),
		ImageURL: imageURL,
		Actions:  actions,
	})
}

func (s *PortalSender) flushPendingImage(ctx context.Context) error {
	imageURL, caption := s.takePendingImage()
	if imageURL == "" {
		return nil
	}
	return s.store.AppendOutput(ctx, s.tenantID, s.tabID, domain.Output{
		Text:     caption,
		ImageURL: imageURL,
	})
}

func (s *PortalSender) takePendingImage() (string, string) {
	imageURL := s.pendingImageURL
	caption := s.pendingImageCaption
	s.pendingImageURL = ""
	s.pendingImageCaption = ""
	return imageURL, caption
}
