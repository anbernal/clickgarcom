package application

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/user"
)

func TestProcessWhatsAppMessageClosedTenantOpenTabStartsClosingFlow(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	inboxID := uuid.New()
	tabID := uuid.New()
	tableID := uuid.New()
	userPhone := "5511999999999"
	displayPhone := "5511000000000"

	tenantObj := testTenant(tenantID)
	tenantObj.IsOpen = false

	inboxRepo := &testInboxRepo{
		events: map[uuid.UUID]*inbox.InboxEvent{
			inboxID: {
				ID:         inboxID,
				Payload:    buildTestWebhookPayload(t, displayPhone, userPhone, "wamid.1", "oi"),
				ReceivedAt: time.Now(),
			},
		},
	}
	tenantRepo := &testProcessTenantRepo{
		byID: map[uuid.UUID]*tenant.Tenant{
			tenantID: tenantObj,
		},
		byWhatsAppNumber: map[string]*tenant.Tenant{
			displayPhone: tenantObj,
		},
	}
	sessionRepo := newTestSessionRepo()
	sender := &testWhatsAppSender{}
	tableRepo := newTestTableRepo()
	tableRepo.tablesByID[tableID] = &table.Table{
		ID:       tableID,
		TenantID: tenantID,
		Number:   "12",
	}
	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				TableID:    &tableID,
				UserPhone:  userPhone,
				Status:     tab.StatusOpen,
				Subtotal:   164,
				ServiceFee: 16.4,
				Total:      180.4,
				PaidAmount: 0,
				OpenedAt:   time.Now(),
			},
		},
	}

	handleUC := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		tenantRepo,
		nil,
		nil,
		tabRepo,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"https://checkout.example.com",
		zap.NewNop(),
	)
	processUC := NewProcessWhatsAppMessageUseCase(inboxRepo, tenantRepo, handleUC, zap.NewNop())

	if err := processUC.Execute(ctx, inboxID); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive closing message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text message, got %d", got)
	}
	if got := len(sender.listMessages); got != 0 {
		t.Fatalf("expected no interactive list message, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !containsAll(
		message.Body,
		"Fechar Conta",
		"O restaurante ainda não está aberto",
		"Sua Comanda (aberta)",
		"Como você prefere finalizar?",
		"Sua Comanda · Mesa 12",
	) {
		t.Fatalf("expected closed-tenant closing flow body, got %q", message.Body)
	}
	if len(message.Buttons) != 3 {
		t.Fatalf("expected 3 buttons, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != "1" || message.Buttons[1].Reply.ID != "2" || message.Buttons[2].Reply.ID != "0" {
		t.Fatalf("unexpected button ids: %+v", message.Buttons)
	}

	sess, err := sessionRepo.Find(ctx, userPhone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess == nil {
		t.Fatal("expected session to be saved")
	}
	if sess.State != session.StateClosingTab {
		t.Fatalf("expected session state %s, got %s", session.StateClosingTab, sess.State)
	}

	event, err := inboxRepo.FindByID(ctx, inboxID)
	if err != nil {
		t.Fatalf("FindByID() error = %v", err)
	}
	if event == nil || !event.Processed {
		t.Fatalf("expected inbox event to be processed, got %+v", event)
	}
}

func TestProcessWhatsAppMessageClosedTenantOpenTabHandlesPaymentOption(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	inboxID := uuid.New()
	tabID := uuid.New()
	tableID := uuid.New()
	userPhone := "5511888888888"
	displayPhone := "5511000000001"

	tenantObj := testTenant(tenantID)
	tenantObj.IsOpen = false

	inboxRepo := &testInboxRepo{
		events: map[uuid.UUID]*inbox.InboxEvent{
			inboxID: {
				ID:         inboxID,
				Payload:    buildTestWebhookPayload(t, displayPhone, userPhone, "wamid.2", "1"),
				ReceivedAt: time.Now(),
			},
		},
	}
	tenantRepo := &testProcessTenantRepo{
		byID: map[uuid.UUID]*tenant.Tenant{
			tenantID: tenantObj,
		},
		byWhatsAppNumber: map[string]*tenant.Tenant{
			displayPhone: tenantObj,
		},
	}
	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(userPhone, tenantID)
	sess.TabID = &tabID
	sess.TableID = &tableID
	sess.TransitionTo(session.StateClosingTab)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	sender := &testWhatsAppSender{}
	tableRepo := newTestTableRepo()
	tableRepo.tablesByID[tableID] = &table.Table{
		ID:       tableID,
		TenantID: tenantID,
		Number:   "12",
	}
	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				TableID:    &tableID,
				UserPhone:  userPhone,
				Status:     tab.StatusOpen,
				Subtotal:   164,
				ServiceFee: 16.4,
				Total:      180.4,
				PaidAmount: 0,
				OpenedAt:   time.Now(),
			},
		},
	}

	handleUC := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		tenantRepo,
		nil,
		nil,
		tabRepo,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"https://checkout.example.com",
		zap.NewNop(),
	)
	processUC := NewProcessWhatsAppMessageUseCase(inboxRepo, tenantRepo, handleUC, zap.NewNop())

	if err := processUC.Execute(ctx, inboxID); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if !senderContains(sender, "💳 *Pagamento pelo celular*") {
		t.Fatalf("expected payment flow message, got text=%v interactive=%v list=%v", sender.textMessages, sender.interactiveMessages, sender.listMessages)
	}
	if !senderContains(sender, "O restaurante ainda não está aberto") {
		t.Fatalf("expected closed-tenant notice in payment flow, got text=%v interactive=%v list=%v", sender.textMessages, sender.interactiveMessages, sender.listMessages)
	}
	if !senderContains(sender, "Sua Comanda (aberta)") {
		t.Fatalf("expected open-tab notice in payment flow, got text=%v interactive=%v list=%v", sender.textMessages, sender.interactiveMessages, sender.listMessages)
	}
	if !senderContains(sender, "https://checkout.example.com/checkout.html#") {
		t.Fatalf("expected checkout URL in outbound message, got text=%v interactive=%v list=%v", sender.textMessages, sender.interactiveMessages, sender.listMessages)
	}

	updatedSession, err := sessionRepo.Find(ctx, userPhone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateMainMenu {
		t.Fatalf("expected session state %s, got %s", session.StateMainMenu, updatedSession.State)
	}
}

func TestProcessWhatsAppMessageClosedTenantIgnoresReopenedPaidTab(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	inboxID := uuid.New()
	tabID := uuid.New()
	tableID := uuid.New()
	userPhone := "5511777772841"
	displayPhone := "5511000000002"
	reopenedAt := time.Now().Add(-2 * time.Hour)

	tenantObj := testTenant(tenantID)
	tenantObj.IsOpen = false

	inboxRepo := &testInboxRepo{
		events: map[uuid.UUID]*inbox.InboxEvent{
			inboxID: {
				ID:         inboxID,
				Payload:    buildTestWebhookPayload(t, displayPhone, userPhone, "wamid.3", "oi"),
				ReceivedAt: time.Now(),
			},
		},
	}
	tenantRepo := &testProcessTenantRepo{
		byID: map[uuid.UUID]*tenant.Tenant{
			tenantID: tenantObj,
		},
		byWhatsAppNumber: map[string]*tenant.Tenant{
			displayPhone: tenantObj,
		},
	}
	sessionRepo := newTestSessionRepo()
	sender := &testWhatsAppSender{}
	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				TableID:    &tableID,
				UserPhone:  userPhone,
				Status:     tab.StatusOpen,
				Subtotal:   164,
				ServiceFee: 16.4,
				Total:      180.4,
				PaidAmount: 180.4,
				ReopenedAt: &reopenedAt,
				OpenedAt:   time.Now(),
			},
		},
	}

	handleUC := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		tenantRepo,
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		sender,
		"https://checkout.example.com",
		zap.NewNop(),
	)
	processUC := NewProcessWhatsAppMessageUseCase(inboxRepo, tenantRepo, handleUC, zap.NewNop())

	if err := processUC.Execute(ctx, inboxID); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 0 {
		t.Fatalf("expected no interactive closing flow for reopened paid tab, got %d", got)
	}
	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 plain closed message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "O restaurante ainda não está aberto") {
		t.Fatalf("expected base closed tenant message, got %q", sender.textMessages[0])
	}
	if strings.Contains(sender.textMessages[0], "Sua Comanda (aberta)") {
		t.Fatalf("did not expect reopened paid tab to be exposed, got %q", sender.textMessages[0])
	}
}

type testInboxRepo struct {
	events map[uuid.UUID]*inbox.InboxEvent
}

func (r *testInboxRepo) Store(_ context.Context, event *inbox.InboxEvent) error {
	if r.events == nil {
		r.events = make(map[uuid.UUID]*inbox.InboxEvent)
	}
	cloned := *event
	r.events[event.ID] = &cloned
	return nil
}

func (r *testInboxRepo) FindByID(_ context.Context, id uuid.UUID) (*inbox.InboxEvent, error) {
	if r.events == nil {
		return nil, nil
	}
	event := r.events[id]
	if event == nil {
		return nil, nil
	}
	cloned := *event
	return &cloned, nil
}

func (r *testInboxRepo) MarkAsProcessed(_ context.Context, id uuid.UUID) error {
	if r.events == nil || r.events[id] == nil {
		return nil
	}
	now := time.Now()
	r.events[id].Processed = true
	r.events[id].ProcessedAt = &now
	return nil
}

func (r *testInboxRepo) MarkAsFailed(_ context.Context, id uuid.UUID, errorMsg string) error {
	if r.events == nil || r.events[id] == nil {
		return nil
	}
	r.events[id].ProcessingError = errorMsg
	return nil
}

type testProcessTenantRepo struct {
	byID             map[uuid.UUID]*tenant.Tenant
	byWhatsAppNumber map[string]*tenant.Tenant
}

func (r *testProcessTenantRepo) FindByID(_ context.Context, id uuid.UUID) (*tenant.Tenant, error) {
	if r.byID == nil {
		return nil, nil
	}
	return r.byID[id], nil
}

func (r *testProcessTenantRepo) FindByWhatsAppNumber(_ context.Context, number string) (*tenant.Tenant, error) {
	if r.byWhatsAppNumber == nil {
		return nil, nil
	}
	return r.byWhatsAppNumber[number], nil
}

func (r *testProcessTenantRepo) FindBySlug(_ context.Context, slug string) (*tenant.Tenant, error) {
	return nil, nil
}

func (r *testProcessTenantRepo) FindByWabaID(_ context.Context, wabaID string) (*tenant.Tenant, error) {
	return nil, nil
}

func (r *testProcessTenantRepo) DeductWalletBalance(_ context.Context, tenantID uuid.UUID, amount float64) error {
	return nil
}

func (r *testProcessTenantRepo) Create(_ context.Context, tenantObj *tenant.Tenant) error {
	if r.byID == nil {
		r.byID = make(map[uuid.UUID]*tenant.Tenant)
	}
	r.byID[tenantObj.ID] = tenantObj
	return nil
}

func (r *testProcessTenantRepo) Update(_ context.Context, tenantObj *tenant.Tenant) error {
	if r.byID == nil {
		r.byID = make(map[uuid.UUID]*tenant.Tenant)
	}
	r.byID[tenantObj.ID] = tenantObj
	return nil
}

func (r *testProcessTenantRepo) GetUsersByTenant(_ context.Context, tenantID string) ([]*user.User, error) {
	return nil, nil
}

func buildTestWebhookPayload(t *testing.T, displayPhone, from, messageID, body string) []byte {
	t.Helper()

	payload := map[string]any{
		"entry": []map[string]any{
			{
				"changes": []map[string]any{
					{
						"value": map[string]any{
							"messaging_product": "whatsapp",
							"metadata": map[string]any{
								"display_phone_number": displayPhone,
								"phone_number_id":      "123",
							},
							"messages": []map[string]any{
								{
									"id":   messageID,
									"from": from,
									"type": "text",
									"text": map[string]any{
										"body": body,
									},
								},
							},
						},
					},
				},
			},
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	return raw
}

func containsAll(body string, fragments ...string) bool {
	for _, fragment := range fragments {
		if fragment == "" {
			continue
		}
		if !senderTextContains(body, fragment) {
			return false
		}
	}
	return true
}

func senderContains(sender *testWhatsAppSender, fragment string) bool {
	for _, message := range sender.textMessages {
		if senderTextContains(message, fragment) {
			return true
		}
	}
	for _, message := range sender.interactiveMessages {
		if senderTextContains(message.Body, fragment) {
			return true
		}
	}
	for _, message := range sender.listMessages {
		if senderTextContains(message.Body, fragment) {
			return true
		}
	}
	return false
}

func senderTextContains(body string, fragment string) bool {
	return fragment != "" && body != "" && strings.Contains(body, fragment)
}
