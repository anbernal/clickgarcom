package application

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/anbernal/clickgarcom/internal/domain/conversation"
)

func TestHandlePortalOrderStatusPersistsOnlyForActivePortalAccess(t *testing.T) {
	tenantID := uuid.New()
	tabID := uuid.New()
	store := &testPortalStatusOutputStore{}
	uc := NewHandlePortalOrderStatusUseCase(testPortalAccessVerifier{active: true}, store)

	updated, err := uc.Execute(context.Background(), PortalOrderStatusNotification{
		EventID:  "order-status:accepted",
		TenantID: tenantID,
		TabID:    tabID,
		OrderID:  uuid.New(),
		Status:   "ACCEPTED",
		Text:     "Pedido aceito",
		Actions:  []conversation.Action{{ID: "1", Label: "Fazer pedido"}},
	})
	if err != nil || !updated {
		t.Fatalf("expected portal timeline update, updated=%v err=%v", updated, err)
	}
	if len(store.outputs) != 1 || store.outputs[0].EventID != "order-status:accepted" {
		t.Fatalf("unexpected persisted output: %+v", store.outputs)
	}

	blockedStore := &testPortalStatusOutputStore{}
	blockedUC := NewHandlePortalOrderStatusUseCase(testPortalAccessVerifier{active: false}, blockedStore)
	updated, err = blockedUC.Execute(context.Background(), PortalOrderStatusNotification{
		EventID: "order-status:ready", TenantID: tenantID, TabID: tabID, OrderID: uuid.New(), Status: "READY", Text: "Pedido pronto",
	})
	if err != nil || updated || len(blockedStore.outputs) != 0 {
		t.Fatalf("inactive portal must not receive notification, updated=%v outputs=%d err=%v", updated, len(blockedStore.outputs), err)
	}
}

type testPortalAccessVerifier struct{ active bool }

func (v testPortalAccessVerifier) HasActivePortalAccess(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return v.active, nil
}

type testPortalStatusOutputStore struct{ outputs []conversation.Output }

func (s *testPortalStatusOutputStore) AppendOutput(_ context.Context, _ uuid.UUID, _ uuid.UUID, output conversation.Output) error {
	s.outputs = append(s.outputs, output)
	return nil
}
