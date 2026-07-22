package application

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/botconfig"
	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/user"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

func TestAppendMainMenuBackOption(t *testing.T) {
	message := "Escolha uma quantidade."
	if got := appendMainMenuBackOption(message); !strings.Contains(got, mainMenuBackOptionText) {
		t.Fatalf("expected back option in %q", got)
	}

	withMenu := "Mensagem\n\n*0* · ◂ Menu principal"
	if got := appendMainMenuBackOption(withMenu); got != withMenu {
		t.Fatalf("expected existing menu option to be preserved, got %q", got)
	}
}

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

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive outbound message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !strings.Contains(message.Body, "Que bom ter você aqui") {
		t.Fatalf("expected welcome message, got %q", message.Body)
	}
	if len(message.Buttons) != 1 {
		t.Fatalf("expected 1 welcome button, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != defaultWelcomeMenuAction {
		t.Fatalf("expected welcome button id %q, got %q", defaultWelcomeMenuAction, message.Buttons[0].Reply.ID)
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

func TestHandleWhatsAppMessageWelcomeGreetingResendsWelcomeWithoutInvalidPrefix(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511999990001"

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateWelcome)
	if err := sessionRepo.Save(ctx, sess); err != nil {
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
		Text:     "Olá!",
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

	message := sender.interactiveMessages[0]
	if strings.Contains(message.Body, "Opção inválida") {
		t.Fatalf("expected welcome without invalid prefix, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Que bom ter você aqui") {
		t.Fatalf("expected welcome message, got %q", message.Body)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateWelcome {
		t.Fatalf("expected session state %s, got %s", session.StateWelcome, updatedSession.State)
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

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive outbound message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}
	if !strings.Contains(sender.interactiveMessages[0].Body, "Já solicitei sua mesa") {
		t.Fatalf("expected pending table confirmation, got %q", sender.interactiveMessages[0].Body)
	}
	if len(sender.interactiveMessages[0].Buttons) != 1 || sender.interactiveMessages[0].Buttons[0].Reply.ID != "0" {
		t.Fatalf("expected cancel button on pending approval, got %+v", sender.interactiveMessages[0].Buttons)
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

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive outbound message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}
	if !strings.Contains(sender.interactiveMessages[0].Body, "já está na fila") {
		t.Fatalf("expected already-in-queue message, got %q", sender.interactiveMessages[0].Body)
	}
	if len(sender.interactiveMessages[0].Buttons) != 1 || sender.interactiveMessages[0].Buttons[0].Reply.ID != "0" {
		t.Fatalf("expected cancel button on already-in-queue message, got %+v", sender.interactiveMessages[0].Buttons)
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

func TestHandleWhatsAppMessagePendingRequestCancelRemovesUserFromQueue(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511970000001"

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateWaitingAdminApproval)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := newTestTableRepo()
	tableRepo.pendingByPhone[testRepoKey(phone, tenantID)] = &table.TableRequest{
		ID:        uuid.New(),
		TenantID:  tenantID,
		UserPhone: phone,
		PaxCount:  2,
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
		Text:     "cancelar",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 plain text message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "Retirei você da fila de atendimento") {
		t.Fatalf("expected queue removal message, got %q", sender.textMessages[0])
	}

	if pending, err := tableRepo.FindPendingRequestByPhone(ctx, phone, tenantID); err != nil {
		t.Fatalf("FindPendingRequestByPhone() error = %v", err)
	} else if pending != nil {
		t.Fatalf("expected no pending request after cancel, got %+v", pending)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateWelcome {
		t.Fatalf("expected session state %s, got %s", session.StateWelcome, updatedSession.State)
	}
	if updatedSession.TableID != nil || updatedSession.TabID != nil {
		t.Fatalf("expected access metadata to be cleared, got table=%v tab=%v", updatedSession.TableID, updatedSession.TabID)
	}
}

func TestHandleWhatsAppMessageWaitingTableConfirmationCancelReturnsToWelcome(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511970000002"
	tableID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateWaitingTableConfirmation)
	sess.SetContext("pending_table_id", tableID.String())
	sess.SetContext("pending_table_number", "12")
	if err := sessionRepo.Save(ctx, sess); err != nil {
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
		Text:     "0",
		TenantID: tenantID,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 plain text message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "Não vou seguir com essa solicitação agora") {
		t.Fatalf("expected cancellation message, got %q", sender.textMessages[0])
	}
	if got := len(tableRepo.createdRequests); got != 0 {
		t.Fatalf("expected no table requests to be created, got %d", got)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateWelcome {
		t.Fatalf("expected session state %s, got %s", session.StateWelcome, updatedSession.State)
	}
}

func TestHandleWhatsAppMessageMainMenuWithoutApprovedAccessIsBlocked(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511970000003"

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tableRepo := newTestTableRepo()
	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		&testTabRepo{byID: map[uuid.UUID]*tab.Tab{}},
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

	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 plain text message, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "Seu acesso ao cardápio não está ativo") {
		t.Fatalf("expected menu access blocked message, got %q", sender.textMessages[0])
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateWelcome {
		t.Fatalf("expected session state %s, got %s", session.StateWelcome, updatedSession.State)
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

func TestHandleWhatsAppMessageWaitingJoinApprovalUsesCancelButton(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511940000001"

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateWaitingJoinApproval)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	sender := &testWhatsAppSender{}
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
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

	if err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "status",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}
	if !strings.Contains(sender.interactiveMessages[0].Body, "Aguardando aprovação") {
		t.Fatalf("expected waiting approval body, got %q", sender.interactiveMessages[0].Body)
	}
	if len(sender.interactiveMessages[0].Buttons) != 1 || sender.interactiveMessages[0].Buttons[0].Reply.ID != "0" {
		t.Fatalf("expected cancel button, got %+v", sender.interactiveMessages[0].Buttons)
	}
}

func TestHandleWhatsAppMessageWaitingOpenerDecisionResendsButtonsOnInvalidInput(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511940000002"
	requestID := uuid.New()
	tableID := uuid.New()
	mainTabID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TransitionTo(session.StateWaitingOpenerDecision)
	sess.SetContext("pending_join_request_id", requestID.String())
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	tabRepo := &testTabRepo{
		joinRequestsByID: map[uuid.UUID]*tab.TabJoinRequest{
			requestID: {
				ID:             requestID,
				TenantID:       tenantID,
				TableID:        tableID,
				MainTabID:      mainTabID,
				RequestorPhone: "5511911111111",
				OpenerPhone:    phone,
				JoinType:       tab.JoinTypeShared,
				Status:         tab.JoinRequestPending,
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
		Text:     "talvez",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text messages, got %d", got)
	}
	if !strings.Contains(sender.interactiveMessages[0].Body, "Solicitação pendente") {
		t.Fatalf("expected resend prompt, got %q", sender.interactiveMessages[0].Body)
	}
	if len(sender.interactiveMessages[0].Buttons) != 2 {
		t.Fatalf("expected 2 decision buttons, got %d", len(sender.interactiveMessages[0].Buttons))
	}
	if !strings.HasPrefix(sender.interactiveMessages[0].Buttons[0].Reply.ID, "btn_approve_") {
		t.Fatalf("expected approve button id, got %q", sender.interactiveMessages[0].Buttons[0].Reply.ID)
	}
	if !strings.HasPrefix(sender.interactiveMessages[0].Buttons[1].Reply.ID, "btn_reject_") {
		t.Fatalf("expected reject button id, got %q", sender.interactiveMessages[0].Buttons[1].Reply.ID)
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
	if len(message.Sections[0].Rows) != 6 {
		t.Fatalf("expected 6 rows, got %d", len(message.Sections[0].Rows))
	}
	if message.Sections[0].Rows[5].ID != "6" {
		t.Fatalf("expected last row id %q, got %q", "6", message.Sections[0].Rows[5].ID)
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

func TestHandleWhatsAppMessageCloseTabFlowShowsInteractiveButtons(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511944444444"
	tableID := uuid.New()
	tabID := uuid.New()
	cokeID := uuid.New()
	pizzaID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TableID = &tableID
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	openTab := &tab.Tab{
		ID:         tabID,
		TenantID:   tenantID,
		TableID:    &tableID,
		UserPhone:  phone,
		Status:     tab.StatusOpen,
		Subtotal:   75,
		ServiceFee: 7.5,
		Total:      82.5,
		PaidAmount: 0,
		OpenedAt:   time.Now(),
	}
	tabRepo := &testTabRepo{byID: map[uuid.UUID]*tab.Tab{tabID: openTab}}
	tableRepo := &testTableRepo{tablesByID: map[uuid.UUID]*table.Table{
		tableID: {ID: tableID, TenantID: tenantID, Number: "1"},
	}}
	menuRepo := &testCreateOrderMenuRepo{
		itemsByID: map[uuid.UUID]*menu.Item{
			cokeID:  {ID: cokeID, TenantID: tenantID, Name: "Coca Cola 500ml"},
			pizzaID: {ID: pizzaID, TenantID: tenantID, Name: "Pizza calabresa"},
		},
	}
	orderRepo := &testCreateOrderRepo{
		byTab: map[uuid.UUID][]*order.Order{
			tabID: {
				{
					ID:          uuid.New(),
					TenantID:    tenantID,
					TabID:       tabID,
					Destination: order.DestinationBar,
					Status:      order.StatusPending,
					Items: []order.OrderItem{
						{ID: uuid.New(), MenuItemID: cokeID, Quantity: 2, UnitPrice: 15},
					},
				},
				{
					ID:          uuid.New(),
					TenantID:    tenantID,
					TabID:       tabID,
					Destination: order.DestinationKitchen,
					Status:      order.StatusPending,
					Items: []order.OrderItem{
						{ID: uuid.New(), MenuItemID: pizzaID, Quantity: 1, UnitPrice: 45},
					},
				},
			},
		},
	}
	sender := &testWhatsAppSender{}
	createOrderUC := NewCreateOrderUseCase(
		orderRepo,
		&testCreateOrderBatchRepo{},
		&testCreateOrderTabRepo{},
		menuRepo,
		nil,
		&testKDSEventPublisher{},
		zap.NewNop(),
	)
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		menuRepo,
		tabRepo,
		tableRepo,
		nil,
		nil,
		createOrderUC,
		sender,
		"",
		zap.NewNop(),
	)

	if err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "5",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no text fallback, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !strings.Contains(message.Body, "Fechar Conta") {
		t.Fatalf("expected close tab title, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Sua Comanda") {
		t.Fatalf("expected tab summary, got %q", message.Body)
	}
	if !strings.Contains(message.Body, "Como você prefere finalizar?") {
		t.Fatalf("expected closing CTA, got %q", message.Body)
	}
	if len(message.Buttons) != 3 {
		t.Fatalf("expected 3 buttons, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != "1" || message.Buttons[1].Reply.ID != "2" || message.Buttons[2].Reply.ID != "0" {
		t.Fatalf("unexpected button ids: %+v", message.Buttons)
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateClosingTab {
		t.Fatalf("expected session state %s, got %s", session.StateClosingTab, updatedSession.State)
	}
}

func TestHandleWhatsAppMessageCloseTabFlowFallsBackToTextWhenInteractiveFails(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511955555555"
	tableID := uuid.New()
	tabID := uuid.New()
	cokeID := uuid.New()

	sessionRepo := newTestSessionRepo()
	sess := session.NewSession(phone, tenantID)
	sess.TableID = &tableID
	sess.TransitionTo(session.StateMainMenu)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	openTab := &tab.Tab{
		ID:         tabID,
		TenantID:   tenantID,
		TableID:    &tableID,
		UserPhone:  phone,
		Status:     tab.StatusOpen,
		Subtotal:   75,
		ServiceFee: 7.5,
		Total:      82.5,
		PaidAmount: 0,
		OpenedAt:   time.Now(),
	}
	tabRepo := &testTabRepo{byID: map[uuid.UUID]*tab.Tab{tabID: openTab}}
	tableRepo := &testTableRepo{tablesByID: map[uuid.UUID]*table.Table{
		tableID: {ID: tableID, TenantID: tenantID, Number: "1"},
	}}
	menuRepo := &testCreateOrderMenuRepo{
		itemsByID: map[uuid.UUID]*menu.Item{
			cokeID: {ID: cokeID, TenantID: tenantID, Name: "Coca Cola 500ml"},
		},
	}
	orderRepo := &testCreateOrderRepo{
		byTab: map[uuid.UUID][]*order.Order{
			tabID: {
				{
					ID:          uuid.New(),
					TenantID:    tenantID,
					TabID:       tabID,
					Destination: order.DestinationBar,
					Status:      order.StatusPending,
					Items: []order.OrderItem{
						{ID: uuid.New(), MenuItemID: cokeID, Quantity: 2, UnitPrice: 15},
					},
				},
			},
		},
	}
	sender := &testWhatsAppSender{sendInteractiveButtonsErr: errors.New("interactive unavailable")}
	createOrderUC := NewCreateOrderUseCase(
		orderRepo,
		&testCreateOrderBatchRepo{},
		&testCreateOrderTabRepo{},
		menuRepo,
		nil,
		&testKDSEventPublisher{},
		zap.NewNop(),
	)
	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		menuRepo,
		tabRepo,
		tableRepo,
		nil,
		nil,
		createOrderUC,
		sender,
		"",
		zap.NewNop(),
	)

	if err := uc.Execute(ctx, HandleMessageInput{
		From:     phone,
		Text:     "5",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 0 {
		t.Fatalf("expected no interactive message, got %d", got)
	}
	if got := len(sender.textMessages); got != 1 {
		t.Fatalf("expected 1 text fallback, got %d", got)
	}
	if !strings.Contains(sender.textMessages[0], "*1* - 💳 Pagar agora pelo celular") {
		t.Fatalf("expected payment fallback option, got %q", sender.textMessages[0])
	}
	if !strings.Contains(sender.textMessages[0], "*2* - 🙋 Pedir para a equipe fechar na mesa") {
		t.Fatalf("expected staff fallback option, got %q", sender.textMessages[0])
	}

	updatedSession, err := sessionRepo.Find(ctx, phone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updatedSession == nil {
		t.Fatal("expected session to be saved")
	}
	if updatedSession.State != session.StateClosingTab {
		t.Fatalf("expected session state %s, got %s", session.StateClosingTab, updatedSession.State)
	}
}

func TestHandleWhatsAppMessageCategorySelectionUsesVisualWhatsAppFields(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511911112222"
	categoryFoodID := uuid.New()
	itemFoodID := uuid.New()

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
				Name:         "Hambúrgueres",
				Description:  "Burgers artesanais da casa",
				ImageURL:     "https://cdn.example.com/menu/hamburgueres-banner.jpg",
				DisplayOrder: 1,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{
			itemFoodID: {
				ID:                       itemFoodID,
				TenantID:                 tenantID,
				CategoryID:               &categoryFoodID,
				Name:                     "Hambúrguer Grande da Casa",
				WhatsAppShortName:        "Hambúrguer Grande",
				Description:              "Pão brioche, carne de 180g, queijo, cebola e molho especial",
				WhatsAppShortDescription: "Pão brioche, carne 180g, queijo",
				Price:                    35,
				Available:                true,
				Destination:              "KITCHEN",
				ImageURL:                 "https://cdn.example.com/menu/hamburguer-grande.jpg",
				DisplayOrder:             1,
			},
		},
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

	steps := []string{
		"1",
		orderingCategoryPrefix + categoryFoodID.String(),
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

	if got := len(sender.imageMessages); got != 1 {
		t.Fatalf("expected 1 category image preview, got %d", got)
	}
	if got := sender.imageMessages[0].ImageURL; got != "https://cdn.example.com/menu/hamburgueres-banner.jpg" {
		t.Fatalf("expected category image URL, got %q", got)
	}
	if got := len(sender.listMessages); got != 2 {
		t.Fatalf("expected 2 list messages, got %d", got)
	}

	itemsList := sender.listMessages[1]
	if len(itemsList.Sections) != 1 || len(itemsList.Sections[0].Rows) != 1 {
		t.Fatalf("expected 1 item row, got %+v", itemsList.Sections)
	}

	row := itemsList.Sections[0].Rows[0]
	if row.Title != "Hambúrguer Grande" {
		t.Fatalf("expected WhatsApp short title, got %q", row.Title)
	}
	if !strings.Contains(row.Description, "Pão brioche, carne 180g, queijo") {
		t.Fatalf("expected WhatsApp short description, got %q", row.Description)
	}
}

func TestParseOrderingItemPreviewIgnoresMissingJSONFields(t *testing.T) {
	rawPreview := map[string]orderingItemPreview{
		"item-1": {
			Name:     "Guaraná 500ml",
			ImageURL: "https://cdn.example.com/menu/guarana.jpg",
		},
	}

	payload, err := json.Marshal(rawPreview)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	preview := parseOrderingItemPreview(decoded["item-1"])
	if preview.Description != "" {
		t.Fatalf("expected empty description, got %q", preview.Description)
	}
	if preview.WhatsAppShortDescription != "" {
		t.Fatalf("expected empty WhatsApp short description, got %q", preview.WhatsAppShortDescription)
	}
}

func TestHandleWhatsAppMessageItemSelectionUsesCachedPreviewWhenFindByIDMissesImage(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511955555555"
	categoryFoodID := uuid.New()
	itemFoodID := uuid.New()

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
				Name:         "Hambúrgueres",
				Description:  "Sanduíches da casa",
				ImageURL:     "https://cdn.example.com/menu/hamburgueres-banner.jpg",
				DisplayOrder: 1,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{
			itemFoodID: {
				ID:                       itemFoodID,
				TenantID:                 tenantID,
				CategoryID:               &categoryFoodID,
				Name:                     "Hambúrguer Grande da Casa",
				WhatsAppShortName:        "Hambúrguer Grande",
				Description:              "Pão brioche, carne de 180g, queijo, cebola e molho especial",
				WhatsAppShortDescription: "Pão brioche, carne 180g, queijo",
				Price:                    35,
				Available:                true,
				Destination:              "KITCHEN",
				ImageURL:                 "https://cdn.example.com/menu/hamburguer-grande.jpg",
				DisplayOrder:             1,
			},
		},
		itemByIDLookup: map[uuid.UUID]*menu.Item{
			itemFoodID: {
				ID:           itemFoodID,
				TenantID:     tenantID,
				CategoryID:   &categoryFoodID,
				Name:         "Hambúrguer Grande da Casa",
				Description:  "",
				Price:        35,
				Available:    true,
				Destination:  "KITCHEN",
				ImageURL:     "",
				DisplayOrder: 1,
			},
		},
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

	steps := []string{
		"1",
		orderingCategoryPrefix + categoryFoodID.String(),
		orderingItemPrefix + itemFoodID.String(),
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

	if got := len(sender.imageMessages); got != 2 {
		t.Fatalf("expected 2 image preview messages, got %d", got)
	}

	itemPreview := sender.imageMessages[1]
	if itemPreview.ImageURL != "https://cdn.example.com/menu/hamburguer-grande.jpg" {
		t.Fatalf("expected cached item image URL, got %q", itemPreview.ImageURL)
	}
	if !strings.Contains(itemPreview.Caption, "Pão brioche, carne 180g, queijo") {
		t.Fatalf("expected cached short description in caption, got %q", itemPreview.Caption)
	}
	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 quantity interactive message, got %d", got)
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
	if got := len(sender.imageMessages); got != 2 {
		t.Fatalf("expected 2 image preview messages, got %d", got)
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

func TestHandleWhatsAppMessageCanRemoveItemFromCartBeforeSendingOrder(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511933333333"
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
			tableID: {ID: tableID, TenantID: tenantID, Number: "9"},
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
		orderingRemoveItemID,
		orderingRemoveItemKey + itemDrinkID.String(),
		orderingRemoveAllUnitsID,
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

	if got := len(sender.interactiveMessages); got < 5 {
		t.Fatalf("expected at least 5 interactive button messages, got %d", got)
	}
	confirmationMessage := sender.interactiveMessages[1]
	if len(confirmationMessage.Buttons) != 3 {
		t.Fatalf("expected 3 confirmation buttons, got %d", len(confirmationMessage.Buttons))
	}
	if got := confirmationMessage.Buttons[2].Reply.ID; got != orderingRemoveItemID {
		t.Fatalf("expected remove-item button id %q, got %q", orderingRemoveItemID, got)
	}

	foundRemovalList := false
	for _, listMessage := range sender.listMessages {
		if strings.Contains(listMessage.Body, "Ajustar item do pedido") {
			foundRemovalList = true
			break
		}
	}
	if !foundRemovalList {
		t.Fatalf("expected a removal selection list message, got %+v", sender.listMessages)
	}

	foundActionMenu := false
	for _, listMessage := range sender.listMessages {
		if strings.Contains(listMessage.Body, "Ajustar item do pedido") {
			foundActionMenu = true
			break
		}
	}
	if !foundActionMenu {
		t.Fatalf("expected an item-adjustment interactive message, got lists=%+v", sender.listMessages)
	}

	if got := len(orderRepo.created); got != 1 {
		t.Fatalf("expected 1 created order after removing the drink, got %d", got)
	}
	createdOrder := orderRepo.created[0]
	if got := len(createdOrder.Items); got != 1 {
		t.Fatalf("expected 1 item in the created order, got %d", got)
	}
	if got := createdOrder.Items[0].MenuItemID; got != itemFoodID {
		t.Fatalf("expected remaining item %s, got %s", itemFoodID.String(), got.String())
	}

	updatedConfirmation := sender.interactiveMessages[len(sender.interactiveMessages)-1]
	if !strings.Contains(updatedConfirmation.Body, "Excluí *Água com Gás*") {
		t.Fatalf("expected removal notice on updated cart, got %q", updatedConfirmation.Body)
	}
	if strings.Contains(updatedConfirmation.Body, "1x Água com Gás") {
		t.Fatalf("expected removed item to disappear from updated cart, got %q", updatedConfirmation.Body)
	}

	lastList := sender.listMessages[len(sender.listMessages)-1]
	if !strings.Contains(lastList.Body, "Pedido enviado!") {
		t.Fatalf("expected final success message, got %q", lastList.Body)
	}
	if strings.Contains(lastList.Body, "Água com Gás") {
		t.Fatalf("expected removed item to stay out of final summary, got %q", lastList.Body)
	}
	if !strings.Contains(lastList.Body, "2x Picanha na Brasa") {
		t.Fatalf("expected remaining item in final summary, got %q", lastList.Body)
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
}

func TestHandleWhatsAppMessageCanRemoveSingleUnitFromCartBeforeSendingOrder(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511944444444"
	tableID := uuid.New()
	categoryDrinkID := uuid.New()
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
			categoryDrinkID: {
				ID:           categoryDrinkID,
				TenantID:     tenantID,
				Name:         "Bebidas",
				Description:  "Drinks e bebidas sem álcool",
				DisplayOrder: 1,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{
			itemDrinkID: {
				ID:           itemDrinkID,
				TenantID:     tenantID,
				CategoryID:   &categoryDrinkID,
				Name:         "Coca Cola 500ml",
				Description:  "Garrafa 500ml",
				Price:        15,
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
			tableID: {ID: tableID, TenantID: tenantID, Number: "12"},
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
		orderingCategoryPrefix + categoryDrinkID.String(),
		orderingItemPrefix + itemDrinkID.String(),
		orderingQuantityPrefix + "2",
		orderingRemoveItemID,
		orderingRemoveItemKey + itemDrinkID.String(),
		orderingRemoveOneUnitID,
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

	if got := len(orderRepo.created); got != 1 {
		t.Fatalf("expected 1 created order, got %d", got)
	}
	createdOrder := orderRepo.created[0]
	if got := len(createdOrder.Items); got != 1 {
		t.Fatalf("expected 1 item in created order, got %d", got)
	}
	if got := createdOrder.Items[0].MenuItemID; got != itemDrinkID {
		t.Fatalf("expected menu item %s, got %s", itemDrinkID.String(), got.String())
	}
	if got := createdOrder.Items[0].Quantity; got != 1 {
		t.Fatalf("expected final quantity 1 after removing a single unit, got %d", got)
	}

	updatedConfirmation := sender.interactiveMessages[len(sender.interactiveMessages)-1]
	if !strings.Contains(updatedConfirmation.Body, "Removi *1 unidade* de *Coca Cola 500ml*") {
		t.Fatalf("expected single-unit removal notice, got %q", updatedConfirmation.Body)
	}
	if !strings.Contains(updatedConfirmation.Body, "1x Coca Cola 500ml") {
		t.Fatalf("expected updated cart with quantity 1, got %q", updatedConfirmation.Body)
	}

	lastList := sender.listMessages[len(sender.listMessages)-1]
	if !strings.Contains(lastList.Body, "1x Coca Cola 500ml") {
		t.Fatalf("expected final summary with 1 unit, got %q", lastList.Body)
	}
}

func TestHandleWhatsAppMessageCanSetCartItemQuantityBeforeSendingOrder(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	phone := "5511955550000"
	tableID := uuid.New()
	categoryDrinkID := uuid.New()
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
			categoryDrinkID: {
				ID:           categoryDrinkID,
				TenantID:     tenantID,
				Name:         "Bebidas",
				Description:  "Drinks e bebidas sem álcool",
				DisplayOrder: 1,
				Active:       true,
			},
		},
		itemsByID: map[uuid.UUID]*menu.Item{
			itemDrinkID: {
				ID:           itemDrinkID,
				TenantID:     tenantID,
				CategoryID:   &categoryDrinkID,
				Name:         "Coca Cola 500ml",
				Description:  "Garrafa 500ml",
				Price:        15,
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
			tableID: {ID: tableID, TenantID: tenantID, Number: "14"},
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
		orderingCategoryPrefix + categoryDrinkID.String(),
		orderingItemPrefix + itemDrinkID.String(),
		orderingQuantityPrefix + "2",
		orderingRemoveItemID,
		orderingRemoveItemKey + itemDrinkID.String(),
		orderingSetQuantityID,
		orderingCartQtyPrefix + "5",
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

	foundQuantityMenu := false
	for _, listMessage := range sender.listMessages {
		if strings.Contains(listMessage.Body, "Alterar quantidade") {
			foundQuantityMenu = true
			break
		}
	}
	if !foundQuantityMenu {
		t.Fatalf("expected a quantity selection interactive list, got %+v", sender.listMessages)
	}

	if got := len(orderRepo.created); got != 1 {
		t.Fatalf("expected 1 created order, got %d", got)
	}
	createdOrder := orderRepo.created[0]
	if got := len(createdOrder.Items); got != 1 {
		t.Fatalf("expected 1 item in created order, got %d", got)
	}
	if got := createdOrder.Items[0].Quantity; got != 5 {
		t.Fatalf("expected final quantity 5 after setting quantity, got %d", got)
	}

	updatedConfirmation := sender.interactiveMessages[len(sender.interactiveMessages)-1]
	if !strings.Contains(updatedConfirmation.Body, "Atualizei *Coca Cola 500ml* para *5 unidades*") {
		t.Fatalf("expected quantity update notice, got %q", updatedConfirmation.Body)
	}
	if !strings.Contains(updatedConfirmation.Body, "5x Coca Cola 500ml") {
		t.Fatalf("expected updated cart with quantity 5, got %q", updatedConfirmation.Body)
	}

	lastList := sender.listMessages[len(sender.listMessages)-1]
	if !strings.Contains(lastList.Body, "5x Coca Cola 500ml") {
		t.Fatalf("expected final summary with 5 units, got %q", lastList.Body)
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
	approvedByPhone map[string]*table.TableRequest
	tablesByID      map[uuid.UUID]*table.Table
}

func newTestTableRepo() *testTableRepo {
	return &testTableRepo{
		pendingByPhone:  make(map[string]*table.TableRequest),
		approvedByPhone: make(map[string]*table.TableRequest),
		tablesByID:      make(map[uuid.UUID]*table.Table),
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
	if req, ok := r.approvedByPhone[testRepoKey(phone, tenantID)]; ok {
		clone := *req
		return &clone, nil
	}
	return nil, nil
}

func (r *testTableRepo) UpdateRequest(_ context.Context, req *table.TableRequest) error {
	key := testRepoKey(req.UserPhone, req.TenantID)
	cloned := *req
	delete(r.pendingByPhone, key)
	delete(r.approvedByPhone, key)
	switch req.Status {
	case table.RequestStatusPending:
		r.pendingByPhone[key] = &cloned
	case table.RequestStatusApproved:
		r.approvedByPhone[key] = &cloned
	}
	return nil
}

func TestHandleWhatsAppMessageCloseTabCheckoutRejectsDifferentPhone(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	openerPhone := "5511988882841"
	payerPhone := "5511955555555"
	tableID := uuid.New()
	tabID := uuid.New()

	sess := session.NewSession(payerPhone, tenantID)
	sess.TabID = &tabID
	sess.TableID = &tableID
	sess.TransitionTo(session.StateClosingTab)

	openTab := &tab.Tab{
		ID:         tabID,
		TenantID:   tenantID,
		TableID:    &tableID,
		UserPhone:  openerPhone,
		Status:     tab.StatusOpen,
		Subtotal:   59.5,
		ServiceFee: 5.95,
		Total:      65.45,
		PaidAmount: 0,
		OpenedAt:   time.Now(),
	}
	tabRepo := &testTabRepo{byID: map[uuid.UUID]*tab.Tab{tabID: openTab}}
	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		"https://checkout.example.com",
		zap.NewNop(),
	)

	response, newState, err := uc.handleClosingTab(ctx, sess, "1")
	if err != nil {
		t.Fatalf("handleClosingTab() error = %v", err)
	}

	updatedTab := tabRepo.byID[tabID]
	if updatedTab == nil {
		t.Fatal("expected tab to remain in repository")
	}
	if updatedTab.UserPhone != openerPhone {
		t.Fatalf("expected opener phone %q to be preserved, got %q", openerPhone, updatedTab.UserPhone)
	}
	if updatedTab.PaymentNotifierPhone != "" {
		t.Fatalf("expected payment notifier phone to stay empty, got %q", updatedTab.PaymentNotifierPhone)
	}

	if newState != session.StateMainMenu {
		t.Fatalf("expected new state %s, got %s", session.StateMainMenu, newState)
	}

	if strings.Contains(response, "checkout.example.com/checkout.html#") {
		t.Fatalf("expected checkout link to be blocked, got %q", response)
	}
	if !strings.Contains(response, "Somente esse número pode fechar e pagar por aqui") {
		t.Fatalf("expected owner-only warning, got %q", response)
	}
}

func TestFindSessionOpenTabDoesNotBorrowAnotherPhoneTabByTable(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tableID := uuid.New()
	tabID := uuid.New()

	sess := session.NewSession("5511975009809", tenantID)
	sess.TableID = &tableID

	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:        tabID,
				TenantID:  tenantID,
				TableID:   &tableID,
				UserPhone: "5511975062841",
				Status:    tab.StatusOpen,
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		nil,
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		"",
		zap.NewNop(),
	)

	if got := uc.findSessionOpenTab(ctx, sess); got != nil {
		t.Fatalf("expected no accessible tab, got %+v", got)
	}
}

func TestFindSessionOpenTabAllowsApprovedSharedParticipantButBlocksClosing(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tableID := uuid.New()
	tabID := uuid.New()
	ownerPhone := "5511975062841"
	sharedPhone := "5511975009809"
	joinRequestID := uuid.New()

	sess := session.NewSession(sharedPhone, tenantID)
	sess.TableID = &tableID

	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				TableID:    &tableID,
				UserPhone:  ownerPhone,
				Status:     tab.StatusOpen,
				Subtotal:   59.5,
				ServiceFee: 5.95,
				Total:      65.45,
			},
		},
		joinRequestsByID: map[uuid.UUID]*tab.TabJoinRequest{
			joinRequestID: {
				ID:             joinRequestID,
				TenantID:       tenantID,
				TableID:        tableID,
				MainTabID:      tabID,
				RequestorPhone: sharedPhone,
				OpenerPhone:    ownerPhone,
				JoinType:       tab.JoinTypeShared,
				Status:         tab.JoinRequestApproved,
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		nil,
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		"https://checkout.example.com",
		zap.NewNop(),
	)

	resolved := uc.findSessionOpenTab(ctx, sess)
	if resolved == nil || resolved.ID != tabID {
		t.Fatalf("expected approved shared participant to access tab %s, got %+v", tabID, resolved)
	}

	response, newState, err := uc.startClosingTabFlow(ctx, sess)
	if err != nil {
		t.Fatalf("startClosingTabFlow() error = %v", err)
	}
	if newState != session.StateMainMenu {
		t.Fatalf("expected new state %s, got %s", session.StateMainMenu, newState)
	}
	if !strings.Contains(response, "Somente esse número pode fechar e pagar por aqui") {
		t.Fatalf("expected owner-only warning, got %q", response)
	}
}

func TestFindSessionOpenTabSkipsReopenedTabByPhone(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tabID := uuid.New()
	userPhone := "5511975062841"
	reopenedAt := time.Now().Add(-1 * time.Hour)

	sess := session.NewSession(userPhone, tenantID)

	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				UserPhone:  userPhone,
				Status:     tab.StatusOpen,
				Subtotal:   59.5,
				ServiceFee: 5.95,
				Total:      65.45,
				PaidAmount: 0,
				ReopenedAt: &reopenedAt,
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		nil,
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		"",
		zap.NewNop(),
	)

	if got := uc.findSessionOpenTab(ctx, sess); got != nil {
		t.Fatalf("expected reopened tab to stay hidden from whatsapp, got %+v", got)
	}
}

func TestFindSessionOpenTabSkipsFullyPaidOpenTabByPhone(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tabID := uuid.New()
	userPhone := "5511975062841"

	sess := session.NewSession(userPhone, tenantID)

	tabRepo := &testTabRepo{
		byID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:         tabID,
				TenantID:   tenantID,
				UserPhone:  userPhone,
				Status:     tab.StatusOpen,
				Subtotal:   59.5,
				ServiceFee: 5.95,
				Total:      65.45,
				PaidAmount: 65.45,
			},
		},
	}

	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		nil,
		nil,
		nil,
		tabRepo,
		nil,
		nil,
		nil,
		nil,
		nil,
		"",
		zap.NewNop(),
	)

	if got := uc.findSessionOpenTab(ctx, sess); got != nil {
		t.Fatalf("expected fully-paid open tab to stay hidden from whatsapp, got %+v", got)
	}
}

func TestHandleClosingTabUsesNgrokPublicURLDiscoveredAtRuntime(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tableID := uuid.New()
	tabID := uuid.New()
	ownerPhone := "5511975062841"

	t.Setenv("PUBLIC_ADMIN_BASE_URL", "")
	t.Setenv("PUBLIC_WEB_BASE_URL", "")
	t.Setenv("PUBLIC_WEBHOOK_BASE_URL", "")
	t.Setenv("NGROK_PUBLIC_URL", "")

	ngrokAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tunnels" {
			t.Fatalf("unexpected ngrok API path %q", r.URL.Path)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"tunnels": []map[string]any{
				{"public_url": "https://checkout.example.com"},
			},
		})
	}))
	defer ngrokAPI.Close()
	t.Setenv("NGROK_API_URL", ngrokAPI.URL)

	sess := session.NewSession(ownerPhone, tenantID)
	sess.TabID = &tabID
	sess.TableID = &tableID
	sess.TransitionTo(session.StateClosingTab)

	openTab := &tab.Tab{
		ID:         tabID,
		TenantID:   tenantID,
		TableID:    &tableID,
		UserPhone:  ownerPhone,
		Status:     tab.StatusOpen,
		Subtotal:   59.5,
		ServiceFee: 5.95,
		Total:      65.45,
		PaidAmount: 0,
		OpenedAt:   time.Now(),
	}

	uc := NewHandleWhatsAppMessageUseCase(
		nil,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		&testTabRepo{byID: map[uuid.UUID]*tab.Tab{tabID: openTab}},
		nil,
		nil,
		nil,
		nil,
		nil,
		"http://localhost:3002",
		zap.NewNop(),
	)

	response, newState, err := uc.handleClosingTab(ctx, sess, "1")
	if err != nil {
		t.Fatalf("handleClosingTab() error = %v", err)
	}
	if newState != session.StateMainMenu {
		t.Fatalf("expected new state %s, got %s", session.StateMainMenu, newState)
	}
	if !strings.Contains(response, "https://checkout.example.com/checkout.html#") {
		t.Fatalf("expected runtime-discovered checkout link, got %q", response)
	}
	if strings.Contains(response, "Ainda não consegui gerar um link público de pagamento") {
		t.Fatalf("expected payment link to be generated, got %q", response)
	}
}

func TestExecuteSendsPaymentUnavailableMenuWithOpenMenuAndCallWaiterButtons(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tableID := uuid.New()
	tabID := uuid.New()
	ownerPhone := "5511975062841"

	t.Setenv("PUBLIC_ADMIN_BASE_URL", "")
	t.Setenv("PUBLIC_WEB_BASE_URL", "")
	t.Setenv("PUBLIC_WEBHOOK_BASE_URL", "")
	t.Setenv("NGROK_PUBLIC_URL", "")

	ngrokAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tunnels" {
			t.Fatalf("unexpected ngrok API path %q", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"tunnels": []map[string]any{}})
	}))
	defer ngrokAPI.Close()
	t.Setenv("NGROK_API_URL", ngrokAPI.URL)

	sessionRepo := newTestSessionRepo()
	sender := &testWhatsAppSender{}
	sess := session.NewSession(ownerPhone, tenantID)
	sess.TabID = &tabID
	sess.TableID = &tableID
	sess.TransitionTo(session.StateClosingTab)
	if err := sessionRepo.Save(ctx, sess); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	openTab := &tab.Tab{
		ID:         tabID,
		TenantID:   tenantID,
		TableID:    &tableID,
		UserPhone:  ownerPhone,
		Status:     tab.StatusOpen,
		Subtotal:   59.5,
		ServiceFee: 5.95,
		Total:      65.45,
		PaidAmount: 0,
		OpenedAt:   time.Now(),
	}

	uc := NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		&testTenantRepo{tenant: testTenant(tenantID)},
		nil,
		nil,
		&testTabRepo{byID: map[uuid.UUID]*tab.Tab{tabID: openTab}},
		nil,
		nil,
		nil,
		nil,
		sender,
		"http://localhost:3002",
		zap.NewNop(),
	)

	if err := uc.Execute(ctx, HandleMessageInput{
		From:     ownerPhone,
		Text:     "1",
		TenantID: tenantID,
	}); err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if got := len(sender.interactiveMessages); got != 1 {
		t.Fatalf("expected 1 interactive fallback message, got %d", got)
	}
	if got := len(sender.listMessages); got != 0 {
		t.Fatalf("expected no interactive list messages, got %d", got)
	}
	if got := len(sender.textMessages); got != 0 {
		t.Fatalf("expected no plain text fallback, got %d", got)
	}

	message := sender.interactiveMessages[0]
	if !strings.Contains(message.Body, "Ainda não consegui gerar um link público de pagamento") {
		t.Fatalf("expected payment unavailable body, got %q", message.Body)
	}
	if len(message.Buttons) != 2 {
		t.Fatalf("expected 2 buttons, got %d", len(message.Buttons))
	}
	if message.Buttons[0].Reply.ID != mainMenuOpenActionID || message.Buttons[0].Reply.Title != "Abrir menu" {
		t.Fatalf("expected first button to open menu, got %+v", message.Buttons[0].Reply)
	}
	if message.Buttons[1].Reply.ID != "4" || message.Buttons[1].Reply.Title != "Chamar garçom" {
		t.Fatalf("expected second button to call waiter, got %+v", message.Buttons[1].Reply)
	}

	updated, err := sessionRepo.Find(ctx, ownerPhone, tenantID.String())
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if updated == nil || updated.State != session.StateMainMenu {
		t.Fatalf("expected session to return to main menu, got %+v", updated)
	}
}

type testBotConfigRepo struct {
	publishedByKey map[string]*botconfig.FlowDefinition
}

type testTabRepo struct {
	byID             map[uuid.UUID]*tab.Tab
	joinRequestsByID map[uuid.UUID]*tab.TabJoinRequest
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
	if r.joinRequestsByID == nil {
		r.joinRequestsByID = make(map[uuid.UUID]*tab.TabJoinRequest)
	}
	cloned := *req
	r.joinRequestsByID[req.ID] = &cloned
	return nil
}

func (r *testTabRepo) FindPendingJoinRequestByOpener(_ context.Context, openerPhone string, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testTabRepo) FindJoinRequestByID(_ context.Context, id uuid.UUID) (*tab.TabJoinRequest, error) {
	if r == nil {
		return nil, nil
	}
	req := r.joinRequestsByID[id]
	if req == nil {
		return nil, nil
	}
	cloned := *req
	return &cloned, nil
}

func (r *testTabRepo) FindApprovedSharedJoinRequestByRequestorAndTab(
	_ context.Context,
	requestorPhone string,
	mainTabID uuid.UUID,
	tenantID uuid.UUID,
) (*tab.TabJoinRequest, error) {
	if r == nil {
		return nil, nil
	}

	for _, req := range r.joinRequestsByID {
		if req == nil {
			continue
		}
		if req.TenantID != tenantID || req.MainTabID != mainTabID {
			continue
		}
		if req.JoinType != tab.JoinTypeShared || req.Status != tab.JoinRequestApproved {
			continue
		}
		if normalizePhoneDigits(req.RequestorPhone) != normalizePhoneDigits(requestorPhone) {
			continue
		}
		cloned := *req
		return &cloned, nil
	}

	return nil, nil
}

func (r *testTabRepo) UpdateJoinRequestStatus(_ context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	if r == nil || r.joinRequestsByID == nil {
		return nil
	}
	req := r.joinRequestsByID[id]
	if req == nil {
		return nil
	}
	cloned := *req
	cloned.Status = status
	r.joinRequestsByID[id] = &cloned
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
	textMessages              []string
	imageMessages             []testImageMessage
	interactiveMessages       []testInteractiveMessage
	listMessages              []testInteractiveListMessage
	sendInteractiveButtonsErr error
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
	if s.sendInteractiveButtonsErr != nil {
		return "", s.sendInteractiveButtonsErr
	}
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
