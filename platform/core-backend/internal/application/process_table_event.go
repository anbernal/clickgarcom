package application

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

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
	tableRepo    table.Repository
	tabRepo      tab.Repository
	sessionRepo  session.Repository
	tenantRepo   tenant.Repository
	sender       WhatsAppSender
	portalAccess PortalAccessIssuer
	logger       *zap.Logger
}

// PortalAccessIssuer creates the one-time URL that lets a customer continue
// the current comanda outside WhatsApp.
type PortalAccessIssuer interface {
	CreatePortalAccess(ctx context.Context, tenantID, tabID uuid.UUID) (string, error)
}

func NewProcessTableEventUseCase(
	tableRepo table.Repository,
	tabRepo tab.Repository,
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	sender WhatsAppSender,
	logger *zap.Logger,
	portalAccess ...PortalAccessIssuer,
) *ProcessTableEventUseCase {
	var issuer PortalAccessIssuer
	if len(portalAccess) > 0 {
		issuer = portalAccess[0]
	}
	return &ProcessTableEventUseCase{
		tableRepo:    tableRepo,
		tabRepo:      tabRepo,
		sessionRepo:  sessionRepo,
		tenantRepo:   tenantRepo,
		sender:       sender,
		portalAccess: issuer,
		logger:       logger,
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

	action := strings.ToUpper(strings.TrimSpace(payload.Action))
	if action != "APPROVE" && action != "REJECT" {
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

	if action == "REJECT" {
		return uc.rejectRequest(ctx, req)
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

	// 3. Atualizar a mesa quando a solicitação veio de um QR de mesa.
	var t *table.Table
	if req.TableID != nil {
		t, err = uc.tableRepo.FindByID(ctx, *req.TableID, req.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find table: %w", err)
		}
		if t == nil {
			return fmt.Errorf("table %s not found", req.TableID.String())
		}
		t.Status = table.StatusOccupied
		if err := uc.tableRepo.Update(ctx, t); err != nil {
			return fmt.Errorf("failed to update table status: %w", err)
		}
	}

	// 4. Criar nova comanda. Solicitações sem mesa entram como SEM_MESA.
	var activeTab *tab.Tab
	if t != nil {
		activeTab, _ = uc.tabRepo.FindOpenByTable(ctx, t.ID, t.TenantID)
	}
	var tabID uuid.UUID
	publicCode := ""

	if activeTab == nil {
		serviceMode := "SEM_MESA"
		openingChannel := "WHATSAPP"
		var tableID *uuid.UUID
		if t != nil {
			serviceMode = "COM_MESA"
			tableID = &t.ID
		}
		newTab := &tab.Tab{
			ID:               uuid.New(),
			TenantID:         req.TenantID,
			TableID:          tableID,
			SourceRequestID:  &req.ID,
			UserPhone:        req.UserPhone,
			ServiceMode:      serviceMode,
			OpeningChannel:   openingChannel,
			OpenedByUserID:   req.ApprovedByUserID,
			OpenedByUserName: req.ApprovedByUserName,
			Status:           tab.StatusOpen,
		}
		// Derive the code from the request so the KDS can show the expected
		// number before approval without granting access to a non-open tab.
		newTab.PublicCode = tab.BuildPublicCode(req.ID)
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
		if t != nil {
			sess.TableID = &t.ID
		} else {
			sess.TableID = nil
		}
		sess.TabID = &tabID
		sess.TransitionTo(session.StateMainMenu)
		if err := uc.sessionRepo.Save(ctx, sess); err != nil {
			uc.logger.Error("failed to update wa session", zap.Error(err))
		}

	}

	// 6. Enviar a aprovação mesmo se a sessão tiver expirado.
	tenantObj, tenantErr := uc.tenantRepo.FindByID(ctx, req.TenantID)
	msgBody := ""
	msgFallback := ""
	if t != nil {
		msgBody = whatsapp.TableRequestApprovedMessageWithCode(t.Number, publicCode)
		msgFallback = whatsapp.TableRequestApprovedMenuMessageWithCode(t.Number, publicCode)
		if tenantErr == nil && tenantObj != nil {
			msgBody = whatsapp.TableRequestApprovedMessageWithCode(t.Number, publicCode, tenantObj.Settings.Messages)
			msgFallback = whatsapp.TableRequestApprovedMenuMessageWithCode(t.Number, publicCode, tenantObj.Settings.Messages)
		}
	} else {
		msgBody = whatsapp.ComandaRequestApprovedMessageWithCode(publicCode)
		msgFallback = msgBody + "\n\n" + "*1* - 🛒 Fazer pedido\n*2* - 📋 Ver minha comanda\n*4* - 🙋 Chamar garçom\n*0* - ◂ Voltar ao menu principal"
	}
	if tenantErr == nil && tenantObj != nil {
		msgBody = whatsapp.WithRestaurantHeader(tenantObj.Name, msgBody)
		msgFallback = whatsapp.WithRestaurantHeader(tenantObj.Name, msgFallback)
	}

	// A portal link is supplementary: failure must never block the WhatsApp
	// approval that already opened the comanda.
	portalURL := ""
	if uc.portalAccess != nil {
		portalURL, err = uc.portalAccess.CreatePortalAccess(ctx, req.TenantID, tabID)
		if err != nil {
			uc.logger.Warn("failed to create portal access for approved comanda", zap.Error(err), zap.String("tab_id", tabID.String()))
		}
	}

	recipient := req.UserPhone
	if sess != nil && strings.TrimSpace(sess.UserPhone) != "" {
		recipient = sess.UserPhone
	}
	ctx = whatsapp.WithTenantID(ctx, req.TenantID)
	if _, err := sendInteractiveButtonsWithBack(uc.sender, ctx, recipient, msgBody, buildTableApprovedButtons()); err != nil {
		uc.logger.Warn("failed to send interactive comanda approval, falling back to text", zap.Error(err))
		if err := uc.sender.SendText(ctx, recipient, appendMainMenuBackOption(msgFallback)); err != nil {
			uc.logger.Error("failed to send wa approval message", zap.Error(err))
		}
	}
	if portalURL != "" {
		portalMessage := "🌐 *Continue sua comanda pelo navegador*\n\nSe o WhatsApp ficar indisponível, use este link para ver pedidos, chamar a equipe e continuar comprando:\n" + portalURL
		if err := uc.sender.SendText(ctx, recipient, portalMessage); err != nil {
			uc.logger.Warn("failed to send portal access link", zap.Error(err), zap.String("tab_id", tabID.String()))
		}
	}

	uc.logger.Info("table request approved successfully", zap.String("request_id", req.ID.String()))
	return nil
}

func (uc *ProcessTableEventUseCase) rejectRequest(ctx context.Context, req *table.TableRequest) error {
	if req.Status != table.RequestStatusPending {
		uc.logger.Info("table request already processed", zap.String("status", string(req.Status)))
		return nil
	}

	req.Status = table.RequestStatusRejected
	if err := uc.tableRepo.UpdateRequest(ctx, req); err != nil {
		return fmt.Errorf("failed to update rejected table request: %w", err)
	}

	sess, err := uc.sessionRepo.Find(ctx, req.UserPhone, req.TenantID.String())
	if err != nil {
		return fmt.Errorf("failed to find whatsapp session: %w", err)
	}
	if sess != nil {
		sess.TableID = nil
		sess.TabID = nil
		sess.Context = make(map[string]interface{})
		sess.TransitionTo(session.StateWelcome)
		if err := uc.sessionRepo.Save(ctx, sess); err != nil {
			uc.logger.Warn("failed to reset rejected request session", zap.Error(err))
		}
	}

	msg := whatsapp.ComandaRequestRejectedMessage()
	if tenantObj, tenantErr := uc.tenantRepo.FindByID(ctx, req.TenantID); tenantErr == nil && tenantObj != nil {
		msg += "\n\n" + whatsapp.WelcomeMenuMessage(tenantObj.Name, tenantObj.Settings.Messages)
		msg = whatsapp.WithRestaurantHeader(tenantObj.Name, msg)
	}
	ctx = whatsapp.WithTenantID(ctx, req.TenantID)
	if err := uc.sender.SendText(ctx, req.UserPhone, msg); err != nil {
		return fmt.Errorf("failed to send rejected request message: %w", err)
	}

	uc.logger.Info("table request rejected", zap.String("request_id", req.ID.String()))
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
