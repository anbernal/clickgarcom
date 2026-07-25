package conversation

import (
	"context"
	"testing"

	"github.com/google/uuid"

	domain "github.com/anbernal/clickgarcom/internal/domain/conversation"
)

func TestPortalSenderStoresImageAsStructuredMedia(t *testing.T) {
	store := &portalSenderTestStore{}
	sender := NewPortalSender(store, uuid.New(), uuid.New())

	_, err := sender.SendImage(
		context.Background(),
		"",
		"https://clickgarcom.example/assets/menu/burger.jpg",
		"Smash Clássico",
	)
	if err != nil {
		t.Fatalf("send portal image: %v", err)
	}
	if len(store.outputs) != 1 {
		t.Fatalf("expected one portal output, got %d", len(store.outputs))
	}

	output := store.outputs[0]
	if output.Text != "Smash Clássico" {
		t.Fatalf("unexpected image caption: %q", output.Text)
	}
	if output.ImageURL != "https://clickgarcom.example/assets/menu/burger.jpg" {
		t.Fatalf("unexpected structured image URL: %q", output.ImageURL)
	}
}

type portalSenderTestStore struct {
	outputs []domain.Output
}

func (s *portalSenderTestStore) AppendOutput(_ context.Context, _, _ uuid.UUID, output domain.Output) error {
	s.outputs = append(s.outputs, output)
	return nil
}
