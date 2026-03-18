package application

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
)

func TestProcessTableEventSendsInteractiveApprovalButtons(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	requestID := uuid.New()
	tableID := uuid.New()
	phone := "5511911111111"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := &testProcessTableRepo{
		requestsByID: map[uuid.UUID]*table.TableRequest{
			requestID: {
				ID:        requestID,
				TenantID:  tenantID,
				TableID:   &tableID,
				UserPhone: phone,
				PaxCount:  2,
				Status:    table.RequestStatusPending,
			},
		},
		tablesByID: map[uuid.UUID]*table.Table{
			tableID: {
				ID:       tableID,
				TenantID: tenantID,
				Number:   "3",
				Status:   table.StatusAvailable,
			},
		},
	}
	tabRepo := &testProcessTabRepo{}
	sender := &testWhatsAppSender{}
	uc := NewProcessTableEventUseCase(
		tableRepo,
		tabRepo,
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		sender,
		zap.NewNop(),
	)

	payload, err := json.Marshal(TableEventPayload{
		RequestID: requestID.String(),
		Action:    "APPROVE",
	})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	if err := uc.Execute(ctx, payload); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no fallback text message, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !strings.Contains(message.Body, "Mesa liberada") {
		t.Fatalf("expected approval body, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Mesa 3") {
		t.Fatalf("expected table number in body, got %q", message.Body)
	}
	if len(message.Buttons) != 3 {
		t.Fatalf("expected 3 buttons, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != mainMenuOrderOption {
		t.Fatalf("expected first button id %q, got %q", mainMenuOrderOption, message.Buttons[0].Reply.ID)
	}
	if message.Buttons[1].Reply.ID != mainMenuTabOption {
		t.Fatalf("expected second button id %q, got %q", mainMenuTabOption, message.Buttons[1].Reply.ID)
	}
	if message.Buttons[2].Reply.ID != mainMenuWaiterOption {
		t.Fatalf("expected third button id %q, got %q", mainMenuWaiterOption, message.Buttons[2].Reply.ID)
	}

	updatedReq := tableRepo.requestsByID[requestID]
	if updatedReq.Status != table.RequestStatusApproved {
		t.Fatalf("expected request status %s, got %s", table.RequestStatusApproved, updatedReq.Status)
	}

	updatedTable := tableRepo.tablesByID[tableID]
	if updatedTable.Status != table.StatusOccupied {
		t.Fatalf("expected table status %s, got %s", table.StatusOccupied, updatedTable.Status)
	}

	if got := len(tabRepo.createdTabs); got != 1 {
		t.Fatalf("expected 1 created tab, got %d", got)
	}

	sess, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess == nil {
		t.Fatal("expected session to be saved")
	}
	if sess.State != session.StateMainMenu {
		t.Fatalf("expected session state %s, got %s", session.StateMainMenu, sess.State)
	}
	if sess.TableID == nil || *sess.TableID != tableID {
		t.Fatalf("expected session table id %s, got %v", tableID, sess.TableID)
	}
	if sess.TabID == nil || *sess.TabID != tabRepo.createdTabs[0].ID {
		t.Fatalf("expected session tab id %s, got %v", tabRepo.createdTabs[0].ID, sess.TabID)
	}
}

type testProcessTableRepo struct {
	requestsByID map[uuid.UUID]*table.TableRequest
	tablesByID   map[uuid.UUID]*table.Table
}

func (r *testProcessTableRepo) FindByID(_ context.Context, id uuid.UUID, tenantID uuid.UUID) (*table.Table, error) {
	tbl, ok := r.tablesByID[id]
	if !ok || tbl.TenantID != tenantID {
		return nil, nil
	}
	cloned := *tbl
	return &cloned, nil
}

func (r *testProcessTableRepo) FindByNumber(_ context.Context, number string, tenantID uuid.UUID) (*table.Table, error) {
	for _, tbl := range r.tablesByID {
		if tbl.TenantID == tenantID && tbl.Number == number {
			cloned := *tbl
			return &cloned, nil
		}
	}
	return nil, nil
}

func (r *testProcessTableRepo) FindByTenant(_ context.Context, tenantID uuid.UUID) ([]*table.Table, error) {
	return nil, nil
}

func (r *testProcessTableRepo) Create(_ context.Context, table *table.Table) error {
	return nil
}

func (r *testProcessTableRepo) Update(_ context.Context, tbl *table.Table) error {
	cloned := *tbl
	r.tablesByID[tbl.ID] = &cloned
	return nil
}

func (r *testProcessTableRepo) CreateRequest(_ context.Context, req *table.TableRequest) error {
	cloned := *req
	r.requestsByID[req.ID] = &cloned
	return nil
}

func (r *testProcessTableRepo) FindRequestByID(_ context.Context, id uuid.UUID) (*table.TableRequest, error) {
	req, ok := r.requestsByID[id]
	if !ok {
		return nil, nil
	}
	cloned := *req
	return &cloned, nil
}

func (r *testProcessTableRepo) FindPendingRequestByPhone(_ context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	return nil, nil
}

func (r *testProcessTableRepo) FindLatestApprovedRequestByPhone(_ context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	return nil, nil
}

func (r *testProcessTableRepo) UpdateRequest(_ context.Context, req *table.TableRequest) error {
	cloned := *req
	r.requestsByID[req.ID] = &cloned
	return nil
}

type testProcessTabRepo struct {
	createdTabs []*tab.Tab
}

func (r *testProcessTabRepo) FindByID(_ context.Context, id uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	return nil, nil
}

func (r *testProcessTabRepo) FindOpenByTable(_ context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	return nil, nil
}

func (r *testProcessTabRepo) FindAllOpenByTable(_ context.Context, tableID uuid.UUID, tenantID uuid.UUID) ([]*tab.Tab, error) {
	return nil, nil
}

func (r *testProcessTabRepo) FindByTenantAndStatus(_ context.Context, tenantID uuid.UUID, status tab.Status) ([]*tab.Tab, error) {
	return nil, nil
}

func (r *testProcessTabRepo) Create(_ context.Context, newTab *tab.Tab) error {
	cloned := *newTab
	r.createdTabs = append(r.createdTabs, &cloned)
	return nil
}

func (r *testProcessTabRepo) Update(_ context.Context, tab *tab.Tab) error {
	return nil
}

func (r *testProcessTabRepo) CreateJoinRequest(_ context.Context, req *tab.TabJoinRequest) error {
	return nil
}

func (r *testProcessTabRepo) FindPendingJoinRequestByOpener(_ context.Context, openerPhone string, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testProcessTabRepo) FindJoinRequestByID(_ context.Context, id uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testProcessTabRepo) UpdateJoinRequestStatus(_ context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	return nil
}
