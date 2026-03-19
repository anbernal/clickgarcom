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
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
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

func TestHandleWhatsAppMessageMainMenuOptionShowsInteractiveTabSummary(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511933333333"
	tableID := uuid.New()
	tabID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TableID = &tableID
	sess.TabID = &tabID
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := newTestTableRepo()
	tableRepo.tablesByID[tableID] = &table.Table{
		ID:       tableID,
		TenantID: tenantID,
		Number:   "5",
	}
	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				TableID:    &tableID,
				UserPhone:  phone,
				Subtotal:   250,
				ServiceFee: 25,
				Total:      275,
				Status:     tab.StatusOpen,
			},
		},
	}
	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		tabRepo,
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
		Text:     "2",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !strings.Contains(message.Body, "Sua Comanda") {
		t.Fatalf("expected tab summary body, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Mesa 05") {
		t.Fatalf("expected table number, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "275,00") {
		t.Fatalf("expected total formatted in BRL, got %q", message.Body)
	}
	if len(message.Buttons) != 3 {
		t.Fatalf("expected 3 buttons, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != tabSummaryNewOrderID {
		t.Fatalf("expected first button id %q, got %q", tabSummaryNewOrderID, message.Buttons[0].Reply.ID)
	}
	if message.Buttons[1].Reply.ID != tabSummaryCloseTabID {
		t.Fatalf("expected second button id %q, got %q", tabSummaryCloseTabID, message.Buttons[1].Reply.ID)
	}
	if message.Buttons[2].Reply.ID != tabSummaryBackMenuID {
		t.Fatalf("expected third button id %q, got %q", tabSummaryBackMenuID, message.Buttons[2].Reply.ID)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateViewingTab {
		t.Fatalf("expected session state %s, got %s", session.StateViewingTab, updatedSession.State)
	}
}

func TestHandleWhatsAppMessageMainMenuOptionShowsInteractiveCategoryMenu(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511911111111"
	categoryFoodID := uuid.New()
	categoryDrinkID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	menuRepo := &testCreateOrderMenuRepo{
		categoriesByID: map[uuid.UUID]*menu.Category{
			categoryFoodID: {
				ID:           categoryFoodID,
				TenantID:     tenantID,
				Name:         "Comidas",
				Description:  "Pratos quentes e porções",
				DisplayOrder: 1,
				Active:       true,
			},
			categoryDrinkID: {
				ID:           categoryDrinkID,
				TenantID:     tenantID,
				Name:         "Bebidas",
				Description:  "Sucos, drinks e refrigerantes",
				DisplayOrder: 2,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{},
	}

	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		menuRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		sender,
		"",
		zap.NewNop(),
	)

	if err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "1",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.listMessages); got != 1 {
		t.Fatalf("expected 1 interactive category list, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}

	message := sender.listMessages[0]
	if !strings.Contains(message.Body, "Cardápio Interativo") {
		t.Fatalf("expected category menu body, got %q", message.Body)
	}
	if len(message.Sections) != 1 || len(message.Sections[0].Rows) != 2 {
		t.Fatalf("expected 2 category rows, got %+v", message.Sections)
	}
	if message.Sections[0].Rows[0].ID != orderingCategoryPrefix+categoryFoodID.String() {
		t.Fatalf("expected first row id %q, got %q", orderingCategoryPrefix+categoryFoodID.String(), message.Sections[0].Rows[0].ID)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateOrdering {
		t.Fatalf("expected session state %s, got %s", session.StateOrdering, updatedSession.State)
	}
	if got := updatedSession.Context[orderingStepKey]; got != orderingStepCategorySelection {
		t.Fatalf("expected ordering step %q, got %#v", orderingStepCategorySelection, got)
	}
}

func TestHandleWhatsAppMessageInteractiveOrderingCreatesOrder(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511922222222"
	tableID := uuid.New()
	categoryFoodID := uuid.New()
	categoryDrinkID := uuid.New()
	itemFoodID := uuid.New()
	itemDrinkID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TableID = &tableID
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	menuRepo := &testCreateOrderMenuRepo{
		categoriesByID: map[uuid.UUID]*menu.Category{
			categoryFoodID: {
				ID:           categoryFoodID,
				TenantID:     tenantID,
				Name:         "Comidas",
				Description:  "Pratos da casa",
				DisplayOrder: 1,
				Active:       true,
			},
			categoryDrinkID: {
				ID:           categoryDrinkID,
				TenantID:     tenantID,
				Name:         "Bebidas",
				Description:  "Drinks e bebidas sem álcool",
				DisplayOrder: 2,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{
			itemFoodID: {
				ID:           itemFoodID,
				TenantID:     tenantID,
				CategoryID:   &categoryFoodID,
				Name:         "Picanha na Brasa",
				Description:  "Acompanha farofa e fritas",
				Price:        119,
				Available:    true,
				Destination:  "KITCHEN",
				ImageURL:     "https://cdn.example.com/menu/picanha.jpg",
				DisplayOrder: 1,
			},
			itemDrinkID: {
				ID:           itemDrinkID,
				TenantID:     tenantID,
				CategoryID:   &categoryDrinkID,
				Name:         "Água com Gás",
				Description:  "Garrafa 500ml",
				Price:        9,
				Available:    true,
				Destination:  "BAR",
				DisplayOrder: 1,
			},
		},
	}

	tabRepo := &testCreateOrderTabRepo{
		tabsByID: map[uuid.UUID]*tab.Tab{},
	}
	orderRepo := &testCreateOrderRepo{}
	orderBatchRepo := &testCreateOrderBatchRepo{}
	publisher := &testKDSEventPublisher{}
	createOrderUC := NewCreateOrderUseCase(
		orderRepo,
		orderBatchRepo,
		tabRepo,
		menuRepo,
		nil,
		publisher,
		zap.NewNop(),
	)

	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		menuRepo,
		tabRepo,
		&testTableRepo{tablesByID: map[uuid.UUID]*table.Table{
			tableID: {ID: tableID, TenantID: tenantID, Number: "7"},
		}},
		nil,
		nil,
		createOrderUC,
		sender,
		"",
		zap.NewNop(),
	)

	steps := []string{
		"1",
		orderingCategoryPrefix + categoryFoodID.String(),
		orderingItemPrefix + itemFoodID.String(),
		orderingQuantityPrefix + "2",
		orderingChangeItemID,
		orderingCategoryPrefix + categoryDrinkID.String(),
		orderingItemPrefix + itemDrinkID.String(),
		orderingQuantityPrefix + "1",
		orderingConfirmOrderID,
	}
	for _, step := range steps {
		if err := uc.Execute(ctx, HandleMessageInput{
			From:     phone,
			Text:     step,
			TenantID: tenantID,
		}); err != nil {
			t.Fatalf("Execute(%q) error = %v", step, err)
		}
	}

	if got := len(sender.listMessages); got < 3 {
		t.Fatalf("expected at least 3 list messages across the flow, got %d", got)
	}
	if got := len(sender.interactiveMessages); got < 3 {
		t.Fatalf("expected at least 3 interactive button messages, got %d", got)
	}
	if got := len(sender.imageMessages); got != 1 {
		t.Fatalf("expected 1 image preview message, got %d", got)
	}
	if got := len(orderRepo.created); got != 2 {
		t.Fatalf("expected 2 created orders split by destination, got %d", got)
	}
	if got := len(orderBatchRepo.created); got != 1 {
		t.Fatalf("expected 1 order batch, got %d", got)
	}

	createdByDestination := map[string]int{}
	for _, createdOrder := range orderRepo.created {
		createdByDestination[string(createdOrder.Destination)] += len(createdOrder.Items)
	}
	if got := createdByDestination["KITCHEN"]; got != 1 {
		t.Fatalf("expected 1 kitchen item, got %d", got)
	}
	if got := createdByDestination["BAR"]; got != 1 {
		t.Fatalf("expected 1 bar item, got %d", got)
	}

	lastList := sender.listMessages[len(sender.listMessages)-1]
	if !strings.Contains(lastList.Body, "Pedido enviado!") {
		t.Fatalf("expected success prefix on final main menu message, got %q", lastList.Body)
	}
	if !strings.Contains(lastList.Body, "2x Picanha na Brasa") {
		t.Fatalf("expected food item summary on final main menu message, got %q", lastList.Body)
	}
	if !strings.Contains(lastList.Body, "1x Água com Gás") {
		t.Fatalf("expected drink item summary on final main menu message, got %q", lastList.Body)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateMainMenu {
		t.Fatalf("expected session state %s, got %s", session.StateMainMenu, updatedSession.State)
	}
	if _, ok := updatedSession.Context[orderingCartKey]; ok {
		t.Fatalf("expected ordering cart to be cleared, got %#v", updatedSession.Context)
	}
	if _, ok := updatedSession.Context[orderingSelectedItemIDKey]; ok {
		t.Fatalf("expected ordering context to be cleared, got %#v", updatedSession.Context)
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
	tablesByID      map[uuid.UUID]*table.Table
}

func newTestTableRepo() *testTableRepo {
	return &testTableRepo{
		pendingByPhone: make(map[string]*table.TableRequest),
		tablesByID:     make(map[uuid.UUID]*table.Table),
	}
}

func (r *testTableRepo) FindByID(_ context.Context, id uuid.UUID, tenantID uuid.UUID) (*table.Table, error) {
	if tbl, ok := r.tablesByID[id]; ok && tbl.TenantID == tenantID {
		cloned := *tbl
		return &cloned, nil
	}
	return nil, nil
}

func (r *testTableRepo) FindByNumber(_ context.Context, number string, tenantID uuid.UUID) (*table.Table, error) {
	for _, tbl := range r.tablesByID {
		if tbl.TenantID == tenantID && tbl.Number == number {
			cloned := *tbl
			return &cloned, nil
		}
	}
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

type testTabRepo struct {
	byID map[uuid.UUID]*tab.Tab
}

func (r *testTabRepo) FindByID(_ context.Context, id uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	if r == nil {
		return nil, nil
	}
	if openTab, ok := r.byID[id]; ok && openTab.TenantID == tenantID {
		cloned := *openTab
		return &cloned, nil
	}
	return nil, nil
}

func (r *testTabRepo) FindOpenByTable(_ context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	if r == nil {
		return nil, nil
	}
	for _, openTab := range r.byID {
		if openTab.TenantID == tenantID && openTab.TableID != nil && *openTab.TableID == tableID && openTab.Status == tab.StatusOpen {
			cloned := *openTab
			return &cloned, nil
		}
	}
	return nil, nil
}

func (r *testTabRepo) FindAllOpenByTable(_ context.Context, tableID uuid.UUID, tenantID uuid.UUID) ([]*tab.Tab, error) {
	var tabs []*tab.Tab
	if r == nil {
		return tabs, nil
	}
	for _, openTab := range r.byID {
		if openTab.TenantID == tenantID && openTab.TableID != nil && *openTab.TableID == tableID && openTab.Status == tab.StatusOpen {
			cloned := *openTab
			tabs = append(tabs, &cloned)
		}
	}
	return tabs, nil
}

func (r *testTabRepo) FindByTenantAndStatus(_ context.Context, tenantID uuid.UUID, status tab.Status) ([]*tab.Tab, error) {
	var tabs []*tab.Tab
	if r == nil {
		return tabs, nil
	}
	for _, openTab := range r.byID {
		if openTab.TenantID == tenantID && openTab.Status == status {
			cloned := *openTab
			tabs = append(tabs, &cloned)
		}
	}
	return tabs, nil
}

func (r *testTabRepo) Create(_ context.Context, openTab *tab.Tab) error {
	if r.byID == nil {
		r.byID = make(map[uuid.UUID]*tab.Tab)
	}
	cloned := *openTab
	r.byID[openTab.ID] = &cloned
	return nil
}

func (r *testTabRepo) Update(_ context.Context, openTab *tab.Tab) error {
	if r.byID == nil {
		r.byID = make(map[uuid.UUID]*tab.Tab)
	}
	cloned := *openTab
	r.byID[openTab.ID] = &cloned
	return nil
}

func (r *testTabRepo) CreateJoinRequest(_ context.Context, req *tab.TabJoinRequest) error {
	return nil
}

func (r *testTabRepo) FindPendingJoinRequestByOpener(_ context.Context, openerPhone string, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testTabRepo) FindJoinRequestByID(_ context.Context, id uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testTabRepo) UpdateJoinRequestStatus(_ context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	return nil
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
	imageMessages       []testImageMessage
	interactiveMessages []testInteractiveMessage
	listMessages        []testInteractiveListMessage
}

func (s *testWhatsAppSender) SendText(_ context.Context, to string, message string) error {
	s.textMessages = append(s.textMessages, message)
	return nil
}

func (s *testWhatsAppSender) SendImage(_ context.Context, to, imageURL, caption string) (string, error) {
	s.imageMessages = append(s.imageMessages, testImageMessage{
		To:       to,
		ImageURL: imageURL,
		Caption:  caption,
	})
	return "", nil
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

type testImageMessage struct {
	To       string
	ImageURL string
	Caption  string
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
