package conversation

import (
	"context"
	"testing"

	"github.com/google/uuid"

	domain "github.com/anbernal/clickgarcom/internal/domain/conversation"
	whatsapp "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

func TestPortalSenderCombinesImageWithFollowingText(t *testing.T) {
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
	if len(store.outputs) != 0 {
		t.Fatalf("expected image to wait for the response, got %d outputs", len(store.outputs))
	}

	if err := sender.SendText(context.Background(), "", "Confira seu pedido"); err != nil {
		t.Fatalf("send portal text: %v", err)
	}
	if len(store.outputs) != 1 {
		t.Fatalf("expected one portal output, got %d", len(store.outputs))
	}

	output := store.outputs[0]
	if output.Text != "Confira seu pedido" {
		t.Fatalf("unexpected output text: %q", output.Text)
	}
	if output.ImageURL != "https://clickgarcom.example/assets/menu/burger.jpg" {
		t.Fatalf("unexpected structured image URL: %q", output.ImageURL)
	}
}

func TestPortalSenderCombinesImageWithInteractiveList(t *testing.T) {
	store := &portalSenderTestStore{}
	sender := NewPortalSender(store, uuid.New(), uuid.New())

	if _, err := sender.SendImage(
		context.Background(),
		"",
		"https://clickgarcom.example/assets/menu/burger.jpg",
		"Burgers",
	); err != nil {
		t.Fatalf("send portal image: %v", err)
	}

	sections := []whatsapp.InteractiveListSection{{
		Title: "Burgers",
		Rows: []whatsapp.InteractiveListRow{{
			ID:          "menu:item:item-1",
			Title:       "Smash Clássico",
			Description: "Pão brioche e queijo",
		}},
	}}
	if _, err := sender.SendInteractiveList(
		context.Background(),
		"",
		"Escolha seu item",
		"Ver itens",
		sections,
	); err != nil {
		t.Fatalf("send portal list: %v", err)
	}

	if len(store.outputs) != 1 {
		t.Fatalf("expected one combined portal output, got %d", len(store.outputs))
	}
	output := store.outputs[0]
	if output.ImageURL != "https://clickgarcom.example/assets/menu/burger.jpg" {
		t.Fatalf("unexpected structured image URL: %q", output.ImageURL)
	}
	if output.Text != "Escolha seu item" {
		t.Fatalf("unexpected output text: %q", output.Text)
	}
	if len(output.Actions) != 1 || output.Actions[0].ID != "menu:item:item-1" {
		t.Fatalf("unexpected interactive actions: %+v", output.Actions)
	}
}

func TestPortalSenderStoresCheckoutURLAsAction(t *testing.T) {
	store := &portalSenderTestStore{}
	sender := NewPortalSender(store, uuid.New(), uuid.New())
	targetURL := "https://clickgarcom.example/checkout.html#access_token=signed-token&tab_id=tab-1"

	if _, err := sender.SendInteractiveURLButton(
		context.Background(),
		"",
		"Abra sua comanda para continuar.",
		"Abrir pagamento",
		targetURL,
	); err != nil {
		t.Fatalf("send portal checkout action: %v", err)
	}

	if len(store.outputs) != 1 || len(store.outputs[0].Actions) != 1 {
		t.Fatalf("expected one checkout action, got %+v", store.outputs)
	}
	if store.outputs[0].Actions[0].URL != targetURL {
		t.Fatalf("unexpected checkout action URL: %q", store.outputs[0].Actions[0].URL)
	}
}

type portalSenderTestStore struct {
	outputs []domain.Output
}

func (s *portalSenderTestStore) AppendOutput(_ context.Context, _, _ uuid.UUID, output domain.Output) error {
	s.outputs = append(s.outputs, output)
	return nil
}
