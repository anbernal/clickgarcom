package application

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/botconfig"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/user"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

func TestHandleWhatsAppMessageFirstContactShowsWelcomeMenu(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511999999999"

	sessionRepo := newTestSessionRepo()
	tableRepo := newTestTableRepo()
	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		nil,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "oi",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(tableRepo.createdRequests); got != 0 {
		t.Fatalf("expected no table requests on first contact, got %d", got)
	}

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 outbound message, got %d", got)
	}

	message := sender.textMessages[0]
	if !strings.Contains(message, "Que bom ter você aqui") {
		t.Fatalf("expected welcome message, got %q", message)
	}
	if !strings.Contains(message, "Solicitar mesa") {
		t.Fatalf("expected initial menu option, got %q", message)
	}

	sess, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess == nil {
		t.Fatal("expected session to be saved")
	}
	if sess.State != session.StateWelcome {
		t.Fatalf("expected session state %s, got %s", session.StateWelcome, sess.State)
	}
}

func TestHandleWhatsAppMessageWelcomeOptionCreatesTableRequest(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511988888888"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := newTestTableRepo()
	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		nil,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "1",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(tableRepo.createdRequests); got != 1 {
		t.Fatalf("expected 1 table request, got %d", got)
	}

	req := tableRepo.createdRequests[0]
	if req.TableID != nil {
		t.Fatalf("expected request without table assignment, got %v", *req.TableID)
	}
	if req.UserPhone != phone {
		t.Fatalf("expected request phone %q, got %q", phone, req.UserPhone)
	}
	if req.Status != table.RequestStatusPending {
		t.Fatalf("expected request status %s, got %s", table.RequestStatusPending, req.Status)
	}

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 outbound message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "Já solicitei sua mesa") {
		t.Fatalf("expected pending table confirmation, got %q", sender.textMessages[0])
	}

	sess, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess == nil {
		t.Fatal("expected session to be saved")
	}
	if sess.State != session.StateWaitingAdminApproval {
		t.Fatalf("expected session state %s, got %s", session.StateWaitingAdminApproval, sess.State)
	}
}

func TestHandleWhatsAppMessagePendingRequestSkipsWelcomeMenu(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511977777777"

	sessionRepo := newTestSessionRepo()
	tableRepo := newTestTableRepo()
	tableRepo.pendingByPhone[testRepoKey(phone, tenantID)] = &table.TableRequest{
		ID:        uuid.New(),
		TenantID:  tenantID,
		UserPhone: phone,
		PaxCount:  1,
		Status:    table.RequestStatusPending,
	}

	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		nil,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "oi",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(tableRepo.createdRequests); got != 0 {
		t.Fatalf("expected no new table requests, got %d", got)
	}

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 outbound message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "já está na fila") {
		t.Fatalf("expected already-in-queue message, got %q", sender.textMessages[0])
	}

	sess, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if sess == nil {
		t.Fatal("expected session to be saved")
	}
	if sess.State != session.StateWaitingAdminApproval {
		t.Fatalf("expected session state %s, got %s", session.StateWaitingAdminApproval, sess.State)
	}
}

func TestHandleWhatsAppMessageUsesPublishedWelcomeFlow(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511966666666"

	sessionRepo := newTestSessionRepo()
	tableRepo := newTestTableRepo()
	sender := &testWhatsAppSender{}
	botConfigRepo := &testBotConfigRepo{
		publishedByKey: map[string]*botconfig.FlowDefinition{
			testBotFlowKey(tenantID, welcomeMenuFlowKey): {
				ID:       uuid.New(),
				TenantID: tenantID,
				Key:      welcomeMenuFlowKey,
				Channel:  botconfig.ChannelWhatsApp,
				Status:   botconfig.StatusPublished,
				Version:  1,
				Definition: botconfig.Definition{
					"presentation": "reply_buttons",
					"body":         "Fluxo customizado para *{nome_restaurante}*.",
					"actions": []map[string]interface{}{
						{
							"id":              requestTableActionID,
							"label":           "Solicitar mesa",
							"accepted_inputs": []string{"pedir mesa custom"},
						},
					},
				},
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		botConfigRepo,
		nil,
		nil,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "oi",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive outbound message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}
	if !strings.Contains(sender.interactiveMessages[0].Body, "Fluxo customizado para *Anderson's Restaurant*") {
		t.Fatalf("expected custom published flow body, got %q", sender.interactiveMessages[0].Body)
	}
	if len(sender.interactiveMessages[0].Buttons) != 1 {
		t.Fatalf("expected 1 button, got %d", len(sender.interactiveMessages[0].Buttons))
	}
	if sender.interactiveMessages[0].Buttons[0].Reply.ID != requestTableActionID {
		t.Fatalf("expected button id %q, got %q", requestTableActionID, sender.interactiveMessages[0].Buttons[0].Reply.ID)
	}
}

func TestHandleWhatsAppMessageUsesPublishedWelcomeActionInputs(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511955555555"

	sessionRepo := newTestSessionRepo()
	if err := sessionRepo.Save(ctx, session.NewSession(phone, tenantID)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := newTestTableRepo()
	sender := &testWhatsAppSender{}
	botConfigRepo := &testBotConfigRepo{
		publishedByKey: map[string]*botconfig.FlowDefinition{
			testBotFlowKey(tenantID, welcomeMenuFlowKey): {
				ID:       uuid.New(),
				TenantID: tenantID,
				Key:      welcomeMenuFlowKey,
				Channel:  botconfig.ChannelWhatsApp,
				Status:   botconfig.StatusPublished,
				Version:  1,
				Definition: botconfig.Definition{
					"presentation": "reply_buttons",
					"body":         "Flow custom",
					"actions": []map[string]interface{}{
						{
							"id":              requestTableActionID,
							"label":           "Solicitar mesa",
							"accepted_inputs": []string{"pedir mesa custom"},
						},
					},
				},
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		botConfigRepo,
		nil,
		nil,
		tableRepo,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "pedir mesa custom",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(tableRepo.createdRequests); got != 1 {
		t.Fatalf("expected 1 table request, got %d", got)
	}
}

func TestSendTenantMessageUsesInteractiveMainMenuList(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511944444444"

	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	err := uc.sendTenantMessage(ctx, phone, tenantID, "✅ Pedido confirmado!\n\n"+whatsapp.MainMenuMessage())
	if err != nil {
		t.Fatalf("sendTenantMessage() error = %v", err)
	}

	if got := len(sender.listMessages); got != 1 {
		t.Fatalf("expected 1 interactive list message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}

	message := sender.listMessages[0]
	if message.ButtonText != mainMenuListButtonText {
		t.Fatalf("expected button text %q, got %q", mainMenuListButtonText, message.ButtonText)
	}
	if !strings.Contains(message.Body, "Pedido confirmado!") {
		t.Fatalf("expected prefix to be preserved, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Menu Principal") {
		t.Fatalf("expected main menu body, got %q", message.Body)
	}
	if len(message.Sections) != 1 {
		t.Fatalf("expected 1 section, got %d", len(message.Sections))
	}
	if len(message.Sections[0].Rows) != 5 {
		t.Fatalf("expected 5 rows, got %d", len(message.Sections[0].Rows))
	}
	if message.Sections[0].Rows[4].ID != "5" {
		t.Fatalf("expected last row id %q, got %q", "5", message.Sections[0].Rows[4].ID)
	}
}

type testSessionRepo struct {
	sessions map[string]*session.Session
}

func newTestSessionRepo() *testSessionRepo {
	return &testSessionRepo{sessions: make(map[string]*session.Session)}
}

func (r *testSessionRepo) Save(_ context.Context, sess *session.Session) error {
	r.sessions[testRepoKey(sess.UserPhone, sess.TenantID)] = cloneSession(sess)
	return nil
}

func (r *testSessionRepo) Find(_ context.Context, userPhone string, tenantID string) (*session.Session, error) {
	id, err := uuid.Parse(tenantID)
	if err != nil {
		return nil, err
	}
	if sess, ok := r.sessions[testRepoKey(userPhone, id)]; ok {
		return cloneSession(sess), nil
	}
	return nil, nil
}

func (r *testSessionRepo) FindByPhone(ctx context.Context, userPhone string, tenantID string) (*session.Session, error) {
	return r.Find(ctx, userPhone, tenantID)
}

func (r *testSessionRepo) Delete(_ context.Context, userPhone string, tenantID string) error {
	id, err := uuid.Parse(tenantID)
	if err != nil {
		return err
	}
	delete(r.sessions, testRepoKey(userPhone, id))
	return nil
}

func (r *testSessionRepo) Extend(_ context.Context, userPhone string, tenantID string, duration time.Duration) error {
	id, err := uuid.Parse(tenantID)
	if err != nil {
		return err
	}
	sess, ok := r.sessions[testRepoKey(userPhone, id)]
	if !ok {
		return nil
	}
	sess.ExpiresAt = sess.ExpiresAt.Add(duration)
	return nil
}

type testTenantRepo struct {
	tenant *tenant.Tenant
}

func (r *testTenantRepo) FindByID(_ context.Context, id uuid.UUID) (*tenant.Tenant, error) {
	if r.tenant != nil && r.tenant.ID == id {
		return r.tenant, nil
	}
	return nil, nil
}

func (r *testTenantRepo) FindByWhatsAppNumber(_ context.Context, number string) (*tenant.Tenant, error) {
	return nil, nil
}

func (r *testTenantRepo) FindBySlug(_ context.Context, slug string) (*tenant.Tenant, error) {
	return nil, nil
}

func (r *testTenantRepo) FindByWabaID(_ context.Context, wabaID string) (*tenant.Tenant, error) {
	return nil, nil
}

func (r *testTenantRepo) DeductWalletBalance(_ context.Context, tenantID uuid.UUID, amount float64) error {
	return nil
}

func (r *testTenantRepo) Create(_ context.Context, tenant *tenant.Tenant) error {
	r.tenant = tenant
	return nil
}

func (r *testTenantRepo) Update(_ context.Context, tenant *tenant.Tenant) error {
	r.tenant = tenant
	return nil
}

func (r *testTenantRepo) GetUsersByTenant(_ context.Context, tenantID string) ([]*user.User, error) {
	return nil, nil
}

type testTableRepo struct {
	createdRequests []*table.TableRequest
	pendingByPhone  map[string]*table.TableRequest
}

func newTestTableRepo() *testTableRepo {
	return &testTableRepo{
		pendingByPhone: make(map[string]*table.TableRequest),
	}
}

func (r *testTableRepo) FindByID(_ context.Context, id uuid.UUID, tenantID uuid.UUID) (*table.Table, error) {
	return nil, nil
}

func (r *testTableRepo) FindByNumber(_ context.Context, number string, tenantID uuid.UUID) (*table.Table, error) {
	return nil, nil
}

func (r *testTableRepo) FindByTenant(_ context.Context, tenantID uuid.UUID) ([]*table.Table, error) {
	return nil, nil
}

func (r *testTableRepo) Create(_ context.Context, table *table.Table) error {
	return nil
}

func (r *testTableRepo) Update(_ context.Context, table *table.Table) error {
	return nil
}

func (r *testTableRepo) CreateRequest(_ context.Context, req *table.TableRequest) error {
	clone := *req
	r.createdRequests = append(r.createdRequests, &clone)
	r.pendingByPhone[testRepoKey(req.UserPhone, req.TenantID)] = &clone
	return nil
}

func (r *testTableRepo) FindRequestByID(_ context.Context, id uuid.UUID) (*table.TableRequest, error) {
	return nil, nil
}

func (r *testTableRepo) FindPendingRequestByPhone(_ context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	if req, ok := r.pendingByPhone[testRepoKey(phone, tenantID)]; ok {
		clone := *req
		return &clone, nil
	}
	return nil, nil
}

func (r *testTableRepo) FindLatestApprovedRequestByPhone(_ context.Context, phone string, tenantID uuid.UUID) (*table.TableRequest, error) {
	return nil, nil
}

func (r *testTableRepo) UpdateRequest(_ context.Context, req *table.TableRequest) error {
	return nil
}

type testBotConfigRepo struct {
	publishedByKey map[string]*botconfig.FlowDefinition
}

func (r *testBotConfigRepo) FindPublishedByKey(
	_ context.Context,
	tenantID uuid.UUID,
	key string,
	channel botconfig.Channel,
) (*botconfig.FlowDefinition, error) {
	if r == nil {
		return nil, nil
	}
	flow, ok := r.publishedByKey[testBotFlowKey(tenantID, key)]
	if !ok {
		return nil, nil
	}
	cloned := *flow
	return &cloned, nil
}

func (r *testBotConfigRepo) ListPublishedByTenant(
	_ context.Context,
	tenantID uuid.UUID,
	channel botconfig.Channel,
) ([]*botconfig.FlowDefinition, error) {
	return nil, nil
}

type testWhatsAppSender struct {
	textMessages        []string
	interactiveMessages []testInteractiveMessage
	listMessages        []testInteractiveListMessage
}

func (s *testWhatsAppSender) SendText(_ context.Context, to string, message string) error {
	s.textMessages = append(s.textMessages, message)
	return nil
}

func (s *testWhatsAppSender) SendInteractiveButtons(_ context.Context, to, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) {
	clonedButtons := make([]whatsapp.InteractiveButton, len(buttons))
	copy(clonedButtons, buttons)
	s.interactiveMessages = append(s.interactiveMessages, testInteractiveMessage{
		To:      to,
		Body:    bodyText,
		Buttons: clonedButtons,
	})
	return "", nil
}

func (s *testWhatsAppSender) SendInteractiveList(_ context.Context, to, bodyText, buttonText string, sections []whatsapp.InteractiveListSection) (string, error) {
	clonedSections := make([]whatsapp.InteractiveListSection, len(sections))
	for i, section := range sections {
		rows := make([]whatsapp.InteractiveListRow, len(section.Rows))
		copy(rows, section.Rows)
		clonedSections[i] = whatsapp.InteractiveListSection{
			Title: section.Title,
			Rows:  rows,
		}
	}
	s.listMessages = append(s.listMessages, testInteractiveListMessage{
		To:         to,
		Body:       bodyText,
		ButtonText: buttonText,
		Sections:   clonedSections,
	})
	return "", nil
}

type testInteractiveMessage struct {
	To      string
	Body    string
	Buttons []whatsapp.InteractiveButton
}

type testInteractiveListMessage struct {
	To         string
	Body       string
	ButtonText string
	Sections   []whatsapp.InteractiveListSection
}

func testTenant(tenantID uuid.UUID) *tenant.Tenant {
	return &tenant.Tenant{
		ID:   tenantID,
		Name: "Anderson's Restaurant",
	}
}

func testRepoKey(phone string, tenantID uuid.UUID) string {
	return tenantID.String() + ":" + phone
}

func testBotFlowKey(tenantID uuid.UUID, key string) string {
	return tenantID.String() + ":" + key
}

func cloneSession(sess *session.Session) *session.Session {
	if sess == nil {
		return nil
	}

	cloned := *sess
	if sess.TableID != nil {
		tableID := *sess.TableID
		cloned.TableID = &tableID
	}
	if sess.TabID != nil {
		tabID := *sess.TabID
		cloned.TabID = &tabID
	}
	if sess.Context != nil {
		cloned.Context = make(map[string]interface{}, len(sess.Context))
		for key, value := range sess.Context {
			cloned.Context[key] = value
		}
	}

	return &cloned
}
