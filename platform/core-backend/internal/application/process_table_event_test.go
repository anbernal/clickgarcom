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
	approverID := uuid.New()
	phone := "5511911111111"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := &testProcessTableRepo{
		requestsByID: map[uuid.UUID]*table.TableRequest{
			requestID: {
				ID:                 requestID,
				TenantID:           tenantID,
				TableID:            &tableID,
				UserPhone:          phone,
				PaxCount:           2,
				Status:             table.RequestStatusPending,
				ApprovedByUserID:   &approverID,
				ApprovedByUserName: "Maria Gestora",
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
	if len(message.Buttons) != 4 {
		t.Fatalf("expected 4 actions including back, got %d", len(message.Buttons))
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
	if message.Buttons[3].Reply.ID != "0" {
		t.Fatalf("expected final back action, got %q", message.Buttons[3].Reply.ID)
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
	if tabRepo.createdTabs[0].OpenedByUserID == nil || *tabRepo.createdTabs[0].OpenedByUserID != approverID {
		t.Fatalf("expected opened_by_user_id %s, got %v", approverID, tabRepo.createdTabs[0].OpenedByUserID)
	}
	if tabRepo.createdTabs[0].OpenedByUserName != "Maria Gestora" {
		t.Fatalf("expected opened_by_user_name Maria Gestora, got %q", tabRepo.createdTabs[0].OpenedByUserName)
	}
	if tabRepo.createdTabs[0].SourceRequestID == nil || *tabRepo.createdTabs[0].SourceRequestID != requestID {
		t.Fatalf("expected source_request_id %s, got %v", requestID, tabRepo.createdTabs[0].SourceRequestID)
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

func TestProcessTableEventOpensIndependentComanda(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	requestID := uuid.New()
	approverID := uuid.New()
	phone := "5511922222222"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	tableRepo := &testProcessTableRepo{
		requestsByID: map[uuid.UUID]*table.TableRequest{
			requestID: {
				ID:                 requestID,
				TenantID:           tenantID,
				UserPhone:          phone,
				PaxCount:           1,
				Status:             table.RequestStatusPending,
				ApprovedByUserID:   &approverID,
				ApprovedByUserName: "Carlos Garçom",
			},
		},
		tablesByID: map[uuid.UUID]*table.Table{},
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

	payload, err := json.Marshal(TableEventPayload{RequestID: requestID.String(), Action: "APPROVE"})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := uc.Execute(ctx, payload); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if len(tabRepo.createdTabs) != 1 {
		t.Fatalf("expected one independent tab, got %d", len(tabRepo.createdTabs))
	}
	created := tabRepo.createdTabs[0]
	if created.TableID != nil || created.ServiceMode != "SEM_MESA" || created.OpeningChannel != "WHATSAPP" {
		t.Fatalf("expected independent WhatsApp tab, got %+v", created)
	}
	expectedCode := tab.BuildPublicCode(requestID)
	if created.PublicCode != expectedCode {
		t.Fatalf("expected request-derived code %s, got %s", expectedCode, created.PublicCode)
	}
	if len(sender.interactiveMessages) != 1 || !strings.Contains(sender.interactiveMessages[0].Body, created.PublicCode) {
		t.Fatalf("expected public comanda code in approval message, got %+v", sender.interactiveMessages)
	}
}

func TestProcessTableEventSendsPortalLinkAfterApproval(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	requestID := uuid.New()
	phone := "5511944444444"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	tableRepo := &testProcessTableRepo{
		requestsByID: map[uuid.UUID]*table.TableRequest{
			requestID: {ID: requestID, TenantID: tenantID, UserPhone: phone, Status: table.RequestStatusPending},
		},
		tablesByID: map[uuid.UUID]*table.Table{},
	}
	tabRepo := &testProcessTabRepo{}
	sender := &testWhatsAppSender{}
	issuer := &testPortalAccessIssuer{url: "https://clickgarcom.example/portal.html#access_token=secret"}
	uc := NewProcessTableEventUseCase(
		tableRepo,
		tabRepo,
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		sender,
		zap.NewNop(),
		issuer,
	)

	payload, err := json.Marshal(TableEventPayload{RequestID: requestID.String(), Action: "APPROVE"})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := uc.Execute(ctx, payload); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if len(sender.interactiveMessages) != 1 {
		t.Fatalf("expected approval interactive message, got %d", len(sender.interactiveMessages))
	}
	if len(sender.textMessages) != 1 || !strings.Contains(sender.textMessages[0], issuer.url) {
		t.Fatalf("expected separate portal link message, got %+v", sender.textMessages)
	}
	if len(tabRepo.createdTabs) != 1 || issuer.tabID != tabRepo.createdTabs[0].ID || issuer.tenantID != tenantID {
		t.Fatalf("expected portal issuer scoped to the created tab, got tenant=%s tab=%s", issuer.tenantID, issuer.tabID)
	}
}

func TestProcessTableEventRejectsRequestAndNotifiesCustomer(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	requestID := uuid.New()
	phone := "5511933333333"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	tableRepo := &testProcessTableRepo{
		requestsByID: map[uuid.UUID]*table.TableRequest{
			requestID: {
				ID:        requestID,
				TenantID:  tenantID,
				UserPhone: phone,
				Status:    table.RequestStatusPending,
			},
		},
		tablesByID: map[uuid.UUID]*table.Table{},
	}
	sender := &testWhatsAppSender{}
	uc := NewProcessTableEventUseCase(
		tableRepo,
		&testProcessTabRepo{},
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		sender,
		zap.NewNop(),
	)

	payload, err := json.Marshal(TableEventPayload{RequestID: requestID.String(), Action: "REJECT"})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if err := uc.Execute(ctx, payload); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := tableRepo.requestsByID[requestID].Status; got != table.RequestStatusRejected {
		t.Fatalf("expected rejected request, got %s", got)
	}
	if len(sender.textMessages) != 1 || !strings.Contains(sender.textMessages[0], "não conseguiu liberar") {
		t.Fatalf("expected friendly rejection message, got %+v", sender.textMessages)
	}
	sess, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess.State != session.StateWelcome || sess.TabID != nil {
		t.Fatalf("expected session returned to welcome without tab, got %+v", sess)
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

type testPortalAccessIssuer struct {
	url      string
	tenantID uuid.UUID
	tabID    uuid.UUID
}

func (i *testPortalAccessIssuer) CreatePortalAccess(_ context.Context, tenantID, tabID uuid.UUID) (string, error) {
	i.tenantID = tenantID
	i.tabID = tabID
	return i.url, nil
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

func (r *testProcessTabRepo) FindApprovedSharedJoinRequestByRequestorAndTab(_ context.Context, requestorPhone string, mainTabID uuid.UUID, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testProcessTabRepo) UpdateJoinRequestStatus(_ context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	return nil
}
