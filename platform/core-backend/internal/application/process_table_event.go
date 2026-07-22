package application

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

const (
	mainMenuOrderOption  = "1"
	mainMenuTabOption    = "2"
	mainMenuWaiterOption = "4"
)

type ProcessTableEventUseCase struct {
	tableRepo   table.Repository
	tabRepo     tab.Repository
	sessionRepo session.Repository
	tenantRepo  tenant.Repository
	sender      WhatsAppSender
	logger      *zap.Logger
}

func NewProcessTableEventUseCase(
	tableRepo table.Repository,
	tabRepo tab.Repository,
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	sender WhatsAppSender,
	logger *zap.Logger,
) *ProcessTableEventUseCase {
	return &ProcessTableEventUseCase{
		tableRepo:   tableRepo,
		tabRepo:     tabRepo,
		sessionRepo: sessionRepo,
		tenantRepo:  tenantRepo,
		sender:      sender,
		logger:      logger,
	}
}

// TableEventPayload is the payload published by Node.js admin panel
type TableEventPayload struct {
	RequestID string `json:"request_id"`
	Action    string `json:"action"` // "APPROVE" or "REJECT"
}

func (uc *ProcessTableEventUseCase) Execute(ctx context.Context, payloadBytes []byte) error {
	var payload TableEventPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal table event payload: %w", err)
	}

	reqID, err := uuid.Parse(payload.RequestID)
	if err != nil {
		return fmt.Errorf("invalid request_id uuid: %w", err)
	}

	// Currently we only handle APPROVE
	if payload.Action != "APPROVE" {
		uc.logger.Info("ignoring table event action", zap.String("action", payload.Action))
		return nil
	}

	// 1. Encontrar a solicitação
	req, err := uc.tableRepo.FindRequestByID(ctx, reqID)
	if err != nil {
		return fmt.Errorf("failed to find table request: %w", err)
	}
	if req == nil {
		uc.logger.Warn("table request not found", zap.String("request_id", reqID.String()))
		return nil
	}

	if req.Status != table.RequestStatusPending {
		uc.logger.Info("table request already processed", zap.String("status", string(req.Status)))
		return nil
	}

	// 2. Atualizar status da Request
	req.Status = table.RequestStatusApproved
	if err := uc.tableRepo.UpdateRequest(ctx, req); err != nil {
		return fmt.Errorf("failed to update table request status: %w", err)
	}

	if req.TableID == nil {
		return fmt.Errorf("table request %s has no table_id", req.ID)
	}

	// 3. Atualizar status da Mesa
	t, err := uc.tableRepo.FindByID(ctx, *req.TableID, req.TenantID)
	if err != nil {
		return fmt.Errorf("failed to find table: %w", err)
	}
	if t == nil {
		return fmt.Errorf("table %s not found", req.TableID.String())
	}
	if t != nil {
		t.Status = table.StatusOccupied
		if err := uc.tableRepo.Update(ctx, t); err != nil {
			return fmt.Errorf("failed to update table status: %w", err)
		}
	}

	// 4. Criar nova Comanda (Tab)
	// Verificar se já tem comanda ativa (segurança)
	activeTab, _ := uc.tabRepo.FindOpenByTable(ctx, t.ID, t.TenantID)
	var tabID uuid.UUID
	publicCode := ""

	if activeTab == nil {
		newTab := &tab.Tab{
			ID:               uuid.New(),
			TenantID:         t.TenantID,
			TableID:          &t.ID,
			SourceRequestID:  &req.ID,
			UserPhone:        req.UserPhone,
			ServiceMode:      "COM_MESA",
			OpenedByUserID:   req.ApprovedByUserID,
			OpenedByUserName: req.ApprovedByUserName,
			Status:           tab.StatusOpen,
		}
		newTab.PublicCode = tab.BuildPublicCode(newTab.ID)
		if err := uc.tabRepo.Create(ctx, newTab); err != nil {
			return fmt.Errorf("failed to create tab: %w", err)
		}
		tabID = newTab.ID
		publicCode = newTab.PublicCode
	} else {
		tabID = activeTab.ID
		publicCode = activeTab.PublicCode
	}

	// 5. Atualizar Sessão do WhatsApp
	sess, err := uc.sessionRepo.Find(ctx, req.UserPhone, req.TenantID.String())
	if err != nil {
		return fmt.Errorf("failed to find whatsapp session: %w", err) // logged but doesn't break
	}

	if sess != nil {
		sess.TableID = &t.ID
		sess.TabID = &tabID
		sess.TransitionTo(session.StateMainMenu)
		if err := uc.sessionRepo.Save(ctx, sess); err != nil {
			uc.logger.Error("failed to update wa session", zap.Error(err))
		}

		// 6. Enviar Mensagem de Aprovação via WhatsApp
		tenantObj, tenantErr := uc.tenantRepo.FindByID(ctx, req.TenantID)
		msgBody := whatsapp.TableRequestApprovedMessageWithCode(t.Number, publicCode)
		msgFallback := whatsapp.TableRequestApprovedMenuMessageWithCode(t.Number, publicCode)
		if tenantErr == nil && tenantObj != nil {
			msgBody = whatsapp.TableRequestApprovedMessageWithCode(t.Number, publicCode, tenantObj.Settings.Messages)
			msgFallback = whatsapp.TableRequestApprovedMenuMessageWithCode(t.Number, publicCode, tenantObj.Settings.Messages)
			msgBody = whatsapp.WithRestaurantHeader(tenantObj.Name, msgBody)
			msgFallback = whatsapp.WithRestaurantHeader(tenantObj.Name, msgFallback)
		}

		ctx = whatsapp.WithTenantID(ctx, req.TenantID)
		if _, err := sendInteractiveButtonsWithBack(uc.sender, ctx, sess.UserPhone, msgBody, buildTableApprovedButtons()); err != nil {
			uc.logger.Warn("failed to send interactive table approval, falling back to text", zap.Error(err))
			if err := uc.sender.SendText(ctx, sess.UserPhone, appendMainMenuBackOption(msgFallback)); err != nil {
				uc.logger.Error("failed to send wa approval message", zap.Error(err))
			}
		}
	}

	uc.logger.Info("table request approved successfully", zap.String("request_id", req.ID.String()))
	return nil
}

func buildTableApprovedButtons() []whatsapp.InteractiveButton {
	return []whatsapp.InteractiveButton{
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: mainMenuOrderOption, Title: "🛒 Fazer pedido"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: mainMenuTabOption, Title: "📋 Ver comanda"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: mainMenuWaiterOption, Title: "🙋 Chamar garçom"},
		},
	}
}
