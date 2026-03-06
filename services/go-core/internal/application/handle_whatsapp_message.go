package application

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/waiterchat"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type HandleWhatsAppMessageUseCase struct {
	sessionRepo    session.Repository
	tenantRepo     tenant.Repository
	menuRepo       menu.Repository
	tabRepo        tab.Repository
	tableRepo      table.Repository
	waiterChatRepo waiterchat.Repository
	createOrderUC  *CreateOrderUseCase
	sender         WhatsAppSender
	logger         *zap.Logger
}

type WhatsAppSender interface {
	SendText(ctx context.Context, to string, message string) error
	SendInteractiveButtons(ctx context.Context, to, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) // Fase 14
}

func NewHandleWhatsAppMessageUseCase(
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	menuRepo menu.Repository,
	tabRepo tab.Repository,
	tableRepo table.Repository,
	waiterChatRepo waiterchat.Repository,
	createOrderUC *CreateOrderUseCase,
	sender WhatsAppSender,
	logger *zap.Logger,
) *HandleWhatsAppMessageUseCase {
	return &HandleWhatsAppMessageUseCase{
		sessionRepo:    sessionRepo,
		tenantRepo:     tenantRepo,
		menuRepo:       menuRepo,
		tabRepo:        tabRepo,
		tableRepo:      tableRepo,
		waiterChatRepo: waiterChatRepo,
		createOrderUC:  createOrderUC,
		sender:         sender,
		logger:         logger,
	}
}

type HandleMessageInput struct {
	From      string
	Text      string
	TenantID  uuid.UUID
	Timestamp string
}

func (uc *HandleWhatsAppMessageUseCase) Execute(ctx context.Context, input HandleMessageInput) error {
	// 1. Buscar ou criar sessão
	sess, err := uc.sessionRepo.Find(ctx, input.From, input.TenantID.String())
	if err != nil {
		return fmt.Errorf("failed to find session: %w", err)
	}

	if sess == nil {
		// Primeira interação - criar sessão
		sess = session.NewSession(input.From, input.TenantID)

		// Verificar se é entrada via QR Code (ex: "Mesa 05")
		// O Deep Link WA manda o texto que o usuário clica. Vamos extrair do input.Text se bater com o padrão.
		textUpper := strings.ToUpper(strings.TrimSpace(input.Text))
		if strings.HasPrefix(textUpper, "MESA") {
			// Extract mesa number
			parts := strings.Fields(textUpper)
			if len(parts) >= 2 {
				tableNumber := parts[1]
				tTable, err := uc.tableRepo.FindByNumber(ctx, tableNumber, input.TenantID)
				if err == nil && tTable != nil {
					t, _ := uc.tenantRepo.FindByID(ctx, input.TenantID)

					// Fase 14: Mesas já abertas precisam perguntar Compartilhar vs Individual
					if tTable.Status == table.StatusOccupied {
						activeTabs, err := uc.tabRepo.FindAllOpenByTable(ctx, tTable.ID, input.TenantID)
						if err == nil && len(activeTabs) > 0 {
							sess.SetContext("pending_table_id", tTable.ID.String())
							sess.SetContext("main_tab_id", activeTabs[0].ID.String()) // Pega a primeira comanda (a principal)
							sess.TransitionTo(session.StateWaitingCollabChoice)

							buttons := []whatsapp.InteractiveButton{
								{Type: "reply", Reply: struct {
									ID    string `json:"id"`
									Title string `json:"title"`
								}{ID: "btn_shared", Title: "🤝 Entrar na Comanda"}},
								{Type: "reply", Reply: struct {
									ID    string `json:"id"`
									Title string `json:"title"`
								}{ID: "btn_individual", Title: "💳 Individual"}},
							}

							msg := fmt.Sprintf("Olá! 😊 Vimos que a *Mesa %s* já está em andamento.\n\nVocê deseja entrar na comanda com seus amigos ou criar uma conta só para você?", tTable.Number)
							if _, err := uc.sender.SendInteractiveButtons(whatsapp.WithTenantID(ctx, input.TenantID), input.From, msg, buttons); err != nil {
								uc.logger.Error("failed to send interactive buttons", zap.Error(err))
							}
							return uc.sessionRepo.Save(ctx, sess)
						}
					}

					// Mesa encontrada (LIVRE) - iniciar fluxo de QR Code normal
					welcomeMsg := whatsapp.WelcomeTableMessage(t.Name, tTable.Number, t.Settings.Messages)

					// Salvar Tabela no Contexto para criar o request no próximo passo
					sess.SetContext("pending_table_id", tTable.ID.String())
					sess.SetContext("pending_table_number", tTable.Number)
					sess.TransitionTo(session.StateWaitingTableConfirmation)

					if err := uc.sendTenantMessage(ctx, input.From, input.TenantID, welcomeMsg); err != nil {
						return fmt.Errorf("failed to send welcome table: %w", err)
					}
					return uc.sessionRepo.Save(ctx, sess)
				}
			}
		}

		// Fluxo Normal (Sem QR Code ou falha ao achar mesa)
		t, err := uc.tenantRepo.FindByID(ctx, input.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find tenant: %w", err)
		}

		// Evita duplicar solicitações pendentes para o mesmo telefone.
		existingReq, err := uc.tableRepo.FindPendingRequestByPhone(ctx, input.From, input.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find pending request by phone: %w", err)
		}
		if existingReq != nil {
			if err := uc.sendTenantMessagePlain(ctx, input.From, input.TenantID, whatsapp.AlreadyInQueueMessage()); err != nil {
				return fmt.Errorf("failed to send already-in-queue message: %w", err)
			}
			sess.TransitionTo(session.StateWaitingAdminApproval)
			if err := uc.sessionRepo.Save(ctx, sess); err != nil {
				return fmt.Errorf("failed to save session: %w", err)
			}
			return nil
		}

		// Create TableRequest without a table_id
		req := &table.TableRequest{
			ID:        uuid.New(),
			TenantID:  sess.TenantID,
			TableID:   nil,
			UserPhone: sess.UserPhone,
			PaxCount:  1, // Defaulting to adult 1 passenger
			Status:    table.RequestStatusPending,
		}

		if err := uc.tableRepo.CreateRequest(ctx, req); err != nil {
			uc.logger.Error("failed to create initial table request", zap.Error(err))
			fallbackMsg := whatsapp.WelcomeMessage(t.Name, t.Settings.Messages) + "\n\n⚠️ Tivemos uma instabilidade ao solicitar sua mesa agora. Pode tentar novamente em alguns segundos?"
			if sendErr := uc.sendTenantMessagePlain(ctx, input.From, input.TenantID, fallbackMsg); sendErr != nil {
				return fmt.Errorf("failed to send fallback message: %w", sendErr)
			}
		} else {
			introMsg := whatsapp.WelcomeAndTablePendingMessage(t.Name, t.Settings.Messages)
			if err := uc.sendTenantMessagePlain(ctx, input.From, input.TenantID, introMsg); err != nil {
				return fmt.Errorf("failed to send intro message: %w", err)
			}
		}

		sess.TransitionTo(session.StateWaitingAdminApproval)
		if err := uc.sessionRepo.Save(ctx, sess); err != nil {
			return fmt.Errorf("failed to save session: %w", err)
		}
		return nil
	}

	// 2. Processar mensagem baseado no estado
	response, newState, err := uc.processMessage(ctx, sess, input.Text)
	if err != nil {
		return fmt.Errorf("failed to process message: %w", err)
	}

	// 3. Enviar resposta
	if response != "" {
		if err := uc.sendTenantMessage(ctx, input.From, input.TenantID, response); err != nil {
			return fmt.Errorf("failed to send response: %w", err)
		}
	}

	// 4. Atualizar estado da sessão
	if newState != "" {
		sess.TransitionTo(newState)
	}

	// 5. Salvar sessão atualizada
	if err := uc.sessionRepo.Save(ctx, sess); err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) processMessage(
	ctx context.Context,
	sess *session.Session,
	text string,
) (response string, newState session.ConversationState, err error) {

	text = strings.TrimSpace(text)

	switch sess.State {
	case session.StateMainMenu:
		return uc.handleMainMenuSimplified(ctx, sess, text)

	case session.StateOrdering:
		return uc.handleOrderingSimplified(ctx, sess, text)

	case session.StateSelectingQty:
		return uc.handleQuantitySelection(ctx, sess, text)

	case session.StateConfirmingOrder:
		return uc.handleOrderConfirmation(ctx, sess, text)

	case session.StateViewingTab:
		return uc.handleViewingTab(ctx, sess, text)

	case session.StateServiceRequest:
		return uc.handleServiceRequest(ctx, sess, text)

	case session.StateWaitingTableConfirmation:
		return uc.handleTableConfirmation(ctx, sess, text)

	case session.StateWaitingCollabChoice:
		return uc.handleCollabChoice(ctx, sess, text)

	case session.StateWaitingAdminApproval:
		return uc.handleWaitingAdminApproval(ctx, sess, text)

	case session.StateWaitingJoinApproval:
		return uc.handleWaitingJoinApproval(ctx, sess, text)

	case session.StateWaitingOpenerDecision:
		return uc.handleOpenerDecision(ctx, sess, text)

	default:
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleMainMenu(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	switch text {
	case "1":
		// Fazer pedido
		// TODO: Buscar categorias do menu
		return "🛒 *Fazer Pedido*\n\nEm breve você poderá fazer pedidos!\n\n_Digite 0 para voltar ao menu_",
			session.StateOrdering, nil

	case "2":
		// Ver comanda
		// TODO: Buscar comanda do usuário
		return "📋 *Sua Comanda*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
			session.StateViewingTab, nil

	case "3":
		return uc.handleRepeatLastRound(ctx, sess)

	case "4":
		// Chamar garçom
		return uc.handleCallWaiter(ctx, sess)

	case "5":
		// Fechar conta
		return "💰 *Fechar Conta*\n\nEm breve!\n\n_Digite 0 para voltar ao menu_",
			session.StateMainMenu, nil

	default:
		return whatsapp.InvalidOptionMessage() + "\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) handleCallWaiter(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	if _, err := uc.getOrCreateOpenWaiterChat(ctx, sess); err != nil {
		uc.logger.Error("failed to start waiter chat",
			zap.Error(err),
			zap.String("user_phone", sess.UserPhone),
		)
		return "❌ Não consegui iniciar o atendimento agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	return "🙋 *Olá! Como posso te ajudar?*\n\n" +
			"Pode me contar por aqui que nossa equipe já vai te atender.\n\n" +
			"_Digite 0 para sair da conversa com a equipe_",
		session.StateServiceRequest, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrdering(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	// TODO: Implementar seleção de produtos
	return "Selecione um item do cardápio\n\n_Digite 0 para voltar_",
		session.StateOrdering, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleQuantitySelection(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	// TODO: Processar quantidade
	return "Quantidade selecionada!\n\n_Digite 0 para voltar_",
		session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderConfirmation(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	// TODO: Confirmar pedido
	return "Pedido confirmado!\n\n" + whatsapp.MainMenuMessage(),
		session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleViewingTab(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleServiceRequest(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		if uc.waiterChatRepo != nil {
			chat, err := uc.waiterChatRepo.FindOpenByPhone(ctx, sess.TenantID, sess.UserPhone)
			if err == nil && chat != nil {
				_ = uc.waiterChatRepo.CloseChat(ctx, chat.ID, sess.TenantID, waiterchat.ClosedByCustomer)
			}
		}
		return "✅ Conversa encerrada.\n\n" + whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	if strings.TrimSpace(text) == "" {
		return "✍️ Me envie sua mensagem para eu acionar a equipe.\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	chat, err := uc.getOrCreateOpenWaiterChat(ctx, sess)
	if err != nil {
		uc.logger.Error("failed to get waiter chat for inbound message",
			zap.Error(err),
			zap.String("user_phone", sess.UserPhone),
		)
		return "❌ Tive um problema ao registrar sua mensagem agora. Pode tentar novamente?\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	msg := &waiterchat.Message{
		ID:         uuid.New(),
		ChatID:     chat.ID,
		TenantID:   sess.TenantID,
		SenderType: waiterchat.SenderCustomer,
		SenderName: sess.UserPhone,
		Message:    text,
	}
	if err := uc.waiterChatRepo.AppendMessage(ctx, msg); err != nil {
		uc.logger.Error("failed to append waiter chat message",
			zap.Error(err),
			zap.String("chat_id", chat.ID.String()),
		)
		return "❌ Tive um problema ao registrar sua mensagem agora. Pode tentar novamente?\n\n_Digite 0 para sair da conversa_",
			session.StateServiceRequest, nil
	}

	return "✅ Mensagem enviada para nossa equipe.\n\n_Digite 0 para sair da conversa com a equipe_",
		session.StateServiceRequest, nil
}

func (uc *HandleWhatsAppMessageUseCase) getOrCreateOpenWaiterChat(
	ctx context.Context,
	sess *session.Session,
) (*waiterchat.Chat, error) {
	if uc.waiterChatRepo == nil {
		return nil, fmt.Errorf("waiter chat repo not configured")
	}

	chat, err := uc.waiterChatRepo.FindOpenByPhone(ctx, sess.TenantID, sess.UserPhone)
	if err != nil {
		return nil, err
	}
	if chat != nil {
		return chat, nil
	}

	openTab := uc.findSessionOpenTab(ctx, sess)
	now := time.Now()
	newChat := &waiterchat.Chat{
		ID:            uuid.New(),
		TenantID:      sess.TenantID,
		UserPhone:     sess.UserPhone,
		Status:        waiterchat.StatusOpen,
		OpenedAt:      now,
		LastMessageAt: now,
	}
	if openTab != nil {
		newChat.TabID = &openTab.ID
		newChat.TableID = openTab.TableID
	}

	if err := uc.waiterChatRepo.CreateChat(ctx, newChat); err != nil {
		return nil, err
	}

	systemMsg := &waiterchat.Message{
		ID:         uuid.New(),
		ChatID:     newChat.ID,
		TenantID:   sess.TenantID,
		SenderType: waiterchat.SenderSystem,
		SenderName: "system",
		Message:    "Cliente iniciou atendimento pelo WhatsApp.",
	}
	if err := uc.waiterChatRepo.AppendMessage(ctx, systemMsg); err != nil {
		uc.logger.Warn("failed to append waiter system message",
			zap.Error(err),
			zap.String("chat_id", newChat.ID.String()),
		)
	}

	return newChat, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleTableConfirmation(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	// Permitir cancelar
	if text == "0" || strings.ToLower(text) == "cancelar" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	// Validar quantidade de pessoas
	paxCount, err := strconv.Atoi(text)
	if err != nil || paxCount < 1 || paxCount > 20 {
		return "❌ Por favor, digite um número válido de pessoas (1 a 20).\n\n_Ou digite 0 para cancelar_", session.StateWaitingTableConfirmation, nil
	}

	tableIDStr, ok := sess.GetContext("pending_table_id")
	if !ok {
		return "❌ Ocorreu um erro ao identificar a mesa. Por favor, escaneie o QR Code novamente.", session.StateMainMenu, nil
	}
	tableID, _ := uuid.Parse(tableIDStr.(string))

	// Criar solicitação de mesa
	req := &table.TableRequest{
		ID:        uuid.New(),
		TenantID:  sess.TenantID,
		TableID:   &tableID,
		UserPhone: sess.UserPhone,
		PaxCount:  paxCount,
		Status:    table.RequestStatusPending,
	}

	if err := uc.tableRepo.CreateRequest(ctx, req); err != nil {
		uc.logger.Error("failed to create table request", zap.Error(err))
		return "❌ Tivemos um problema ao registrar sua solicitação. Pode tentar novamente?", session.StateWaitingTableConfirmation, nil
	}

	// Limpar contexto temporário
	sess.Context = make(map[string]interface{})

	return whatsapp.TableRequestPendingMessage(), session.StateWaitingAdminApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleWaitingAdminApproval(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	// Enquanto aguarda aprovação, ignorar outras mensagens exceto cancelamento
	if text == "0" || strings.ToLower(text) == "cancelar" {
		// Opcional: Rejeitar/cancelar a solicitação ativa (não implementado MVP)
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	return whatsapp.AlreadyInQueueMessage(), session.StateWaitingAdminApproval, nil
}

// Fase 14: Lidar com a Escolha do Botão Interativo "Compartilhar Comanda" ou "Individual"
func (uc *HandleWhatsAppMessageUseCase) handleCollabChoice(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	// O Webhook do WhatsApp vai enviar o "ID" do botão se o usuário clicou no botão.
	// O Graph V18 manda no struct "Interactive" que nós ainda não mapeamos todo o corpo, mas caso ele digite,
	// nós capturamos pela string "btn_shared" (que não seria digitada, seria o payload) ou pelas strings.
	// Vamos simplificar para o MVP como se a string recebesse literal do texto do botão caso não encontre ID,
	// e no Webhook passamos de forma unificada.

	// Fast-Fail para cancelar
	if text == "0" || strings.ToLower(text) == "cancelar" {
		sess.Context = make(map[string]interface{})
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	tableIDStr, ok := sess.GetContext("pending_table_id")
	if !ok {
		return "❌ Ocorreu um erro ao identificar a mesa.", session.StateMainMenu, nil
	}
	tableID, _ := uuid.Parse(tableIDStr.(string))

	isShared := text == "btn_shared" || strings.Contains(strings.ToLower(text), "entrar") || strings.Contains(strings.ToLower(text), "compartilhar")
	isIndividual := text == "btn_individual" || strings.Contains(strings.ToLower(text), "individual")

	var joinType tab.JoinType
	if isShared {
		joinType = tab.JoinTypeShared
	} else if isIndividual {
		joinType = tab.JoinTypeIndividual
	} else {
		return "Por favor, toque em um dos botões: *🤝 Entrar na Comanda* ou *💳 Individual*.", session.StateWaitingCollabChoice, nil
	}

	mainTabIDStr, hasMain := sess.GetContext("main_tab_id")
	if !hasMain {
		return "❌ A comanda principal já foi fechada.", session.StateMainMenu, nil
	}
	mainTabID, _ := uuid.Parse(mainTabIDStr.(string))

	mainTab, err := uc.tabRepo.FindByID(ctx, mainTabID, sess.TenantID)
	if err != nil || mainTab == nil {
		return "❌ Erro ao localizar a comanda principal.", session.StateMainMenu, nil
	}

	// Fase 15: Criar JoinRequest PENDING
	joinReq := &tab.TabJoinRequest{
		ID:             uuid.New(),
		TenantID:       sess.TenantID,
		TableID:        tableID,
		MainTabID:      mainTabID,
		RequestorPhone: sess.UserPhone,
		OpenerPhone:    mainTab.UserPhone,
		JoinType:       joinType,
		Status:         tab.JoinRequestPending,
	}

	if err := uc.tabRepo.CreateJoinRequest(ctx, joinReq); err != nil {
		uc.logger.Error("failed to create join request", zap.Error(err))
		return "❌ Tivemos um problema ao processar seu pedido.", session.StateWaitingCollabChoice, nil
	}

	// Salva as referências na sessão e muda o estado
	sess.SetContext("join_request_id", joinReq.ID.String())
	sess.SetContext("join_type", string(joinType))
	sess.TransitionTo(session.StateWaitingJoinApproval)

	// Localiza o opener e envia botões de Aprovar/Recusar
	openerSess, err := uc.sessionRepo.FindByPhone(ctx, mainTab.UserPhone, sess.TenantID.String())
	if err == nil && openerSess != nil {
		joinDesc := "como COMANDA COMPARTILHADA"
		if joinType == tab.JoinTypeIndividual {
			joinDesc = "com CONTA INDIVIDUAL (pagamento separado)"
		}

		tableNumStr, _ := sess.GetContext("pending_table_number")
		tableNumber := ""
		if tableNumStr != nil {
			tableNumber = tableNumStr.(string)
		}

		msgOpener := fmt.Sprintf("🔔 *Solicitação de Entrada*\n\nUm cliente (%s) quer entrar na Mesa %s %s.\n\nO que você deseja fazer?", sess.UserPhone, tableNumber, joinDesc)
		buttons := []whatsapp.InteractiveButton{
			{Type: "reply", Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: fmt.Sprintf("btn_approve_%s", joinReq.ID.String()), Title: "✅ Aprovar"}},
			{Type: "reply", Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: fmt.Sprintf("btn_reject_%s", joinReq.ID.String()), Title: "❌ Recusar"}},
		}

		openerSess.TransitionTo(session.StateWaitingOpenerDecision)
		openerSess.SetContext("pending_join_request_id", joinReq.ID.String())
		uc.sessionRepo.Save(ctx, openerSess)

		if _, err := uc.sender.SendInteractiveButtons(whatsapp.WithTenantID(ctx, sess.TenantID), openerSess.UserPhone, msgOpener, buttons); err != nil {
			uc.logger.Error("failed to send approval to opener", zap.Error(err))
		}
	} else {
		// Log e mantém aguardando
		uc.logger.Warn("opener session not found to send approval request", zap.String("opener_phone", mainTab.UserPhone))
	}

	return "⏳ Pedido enviado! Aguardando aprovação da pessoa responsável pela mesa...", session.StateWaitingJoinApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleWaitingJoinApproval(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)
	if text == "0" || strings.ToLower(text) == "cancelar" {
		sess.Context = make(map[string]interface{})
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	return "⏳ Aguardando aprovação da pessoa responsável pela mesa...\n\n_Digite 0 para cancelar_", session.StateWaitingJoinApproval, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOpenerDecision(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	text = strings.TrimSpace(text)

	reqIDStr, hasReq := sess.GetContext("pending_join_request_id")
	if !hasReq {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	reqID, err := uuid.Parse(reqIDStr.(string))
	if err != nil {
		return "❌ Erro ao ler a solicitação.", session.StateMainMenu, nil
	}

	joinReq, err := uc.tabRepo.FindJoinRequestByID(ctx, reqID)
	if err != nil || joinReq == nil {
		return "❌ Solicitação não encontrada.", session.StateMainMenu, nil
	}

	if joinReq.Status != tab.JoinRequestPending {
		delete(sess.Context, "pending_join_request_id")
		return "Esta solicitação já foi respondida.", session.StateMainMenu, nil
	}

	isApprove := strings.HasPrefix(text, "btn_approve_") || strings.ToLower(text) == "aprovar"
	isReject := strings.HasPrefix(text, "btn_reject_") || strings.ToLower(text) == "recusar"

	if !isApprove && !isReject {
		return "Por favor, responda com *✅ Aprovar* ou *❌ Recusar*.", session.StateWaitingOpenerDecision, nil
	}

	if isApprove {
		joinReq.Status = tab.JoinRequestApproved
		uc.tabRepo.UpdateJoinRequestStatus(ctx, joinReq.ID, tab.JoinRequestApproved)

		clientB, err := uc.sessionRepo.Find(ctx, joinReq.RequestorPhone, sess.TenantID.String())
		if err == nil && clientB != nil {
			if joinReq.JoinType == tab.JoinTypeShared {
				clientB.TabID = &joinReq.MainTabID
				clientB.TableID = &joinReq.TableID
				clientB.Context = make(map[string]interface{})
				clientB.TransitionTo(session.StateMainMenu)
				uc.sessionRepo.Save(ctx, clientB)

				uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "✅ *Sua entrada foi aprovada!*\n\n🤝 Você entrou na Comanda Compartilhada.\n\n"+whatsapp.MainMenuMessage())
			} else {
				newTab := &tab.Tab{
					ID:       uuid.New(),
					TenantID: sess.TenantID,
					TableID:  &joinReq.TableID,
					Status:   tab.StatusOpen,
				}
				uc.tabRepo.Create(ctx, newTab)

				clientB.TabID = &newTab.ID
				clientB.TableID = &joinReq.TableID
				clientB.Context = make(map[string]interface{})
				clientB.TransitionTo(session.StateMainMenu)
				uc.sessionRepo.Save(ctx, clientB)

				uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "✅ *Sua entrada foi aprovada!*\n\n💳 Sua comanda individual foi criada.\n\n"+whatsapp.MainMenuMessage())
			}
		}

		delete(sess.Context, "pending_join_request_id")
		return "✅ Você *aprovou* a entrada.", session.StateMainMenu, nil
	}

	if isReject {
		joinReq.Status = tab.JoinRequestRejected
		uc.tabRepo.UpdateJoinRequestStatus(ctx, joinReq.ID, tab.JoinRequestRejected)

		clientB, err := uc.sessionRepo.Find(ctx, joinReq.RequestorPhone, sess.TenantID.String())
		if err == nil && clientB != nil {
			clientB.Context = make(map[string]interface{})
			clientB.TransitionTo(session.StateMainMenu)
			uc.sessionRepo.Save(ctx, clientB)

			uc.sendTenantMessage(ctx, clientB.UserPhone, sess.TenantID, "❌ *Sua entrada foi recusada* pela pessoa responsável pela mesa.\n\n"+whatsapp.MainMenuMessage())
		}
		delete(sess.Context, "pending_join_request_id")
		return "❌ Você *recusou* a entrada.", session.StateMainMenu, nil
	}

	return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) sendTenantMessage(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	decorated := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), message)
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	return uc.sender.SendText(ctx, to, decorated)
}

func (uc *HandleWhatsAppMessageUseCase) sendTenantMessagePlain(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	message string,
) error {
	ctx = whatsapp.WithTenantID(ctx, tenantID)
	return uc.sender.SendText(ctx, to, strings.TrimSpace(message))
}

func (uc *HandleWhatsAppMessageUseCase) resolveTenantName(ctx context.Context, tenantID uuid.UUID) string {
	t, err := uc.tenantRepo.FindByID(ctx, tenantID)
	if err != nil || t == nil {
		return ""
	}
	return strings.TrimSpace(t.Name)
}
