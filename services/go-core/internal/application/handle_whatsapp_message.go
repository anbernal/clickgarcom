package application

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type HandleWhatsAppMessageUseCase struct {
	sessionRepo   session.Repository
	tenantRepo    tenant.Repository
	menuRepo      menu.Repository
	tabRepo       tab.Repository
	tableRepo     table.Repository
	createOrderUC *CreateOrderUseCase
	sender        WhatsAppSender
	logger        *zap.Logger
}

type WhatsAppSender interface {
	SendText(ctx context.Context, to string, message string) error
}

func NewHandleWhatsAppMessageUseCase(
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	menuRepo menu.Repository,
	tabRepo tab.Repository,
	tableRepo table.Repository,
	createOrderUC *CreateOrderUseCase,
	sender WhatsAppSender,
	logger *zap.Logger,
) *HandleWhatsAppMessageUseCase {
	return &HandleWhatsAppMessageUseCase{
		sessionRepo:   sessionRepo,
		tenantRepo:    tenantRepo,
		menuRepo:      menuRepo,
		tabRepo:       tabRepo,
		tableRepo:     tableRepo,
		createOrderUC: createOrderUC,
		sender:        sender,
		logger:        logger,
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
					// Mesa encontrada - iniciar fluxo de QR Code
					t, _ := uc.tenantRepo.FindByID(ctx, input.TenantID)
					welcomeMsg := whatsapp.WelcomeTableMessage(t.Name, tTable.Number)

					// Salvar Tabela no Contexto para criar o request no próximo passo
					sess.SetContext("pending_table_id", tTable.ID.String())
					sess.SetContext("pending_table_number", tTable.Number)
					sess.TransitionTo(session.StateWaitingTableConfirmation)

					if err := uc.sender.SendText(ctx, input.From, welcomeMsg); err != nil {
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

		welcomeMsg := whatsapp.WelcomeMessage(t.Name)
		if err := uc.sender.SendText(ctx, input.From, welcomeMsg); err != nil {
			return fmt.Errorf("failed to send welcome: %w", err)
		}

		sess.TransitionTo(session.StateMainMenu)
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
		if err := uc.sender.SendText(ctx, input.From, response); err != nil {
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

	case session.StateWaitingAdminApproval:
		return uc.handleWaitingAdminApproval(ctx, sess, text)

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
		// Repetir rodada
		return "🔄 *Repetir Rodada*\n\nEm breve!\n\n_Digite 0 para voltar ao menu_",
			session.StateMainMenu, nil

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
	// TODO: Criar service request no banco

	msg := whatsapp.ServiceRequestConfirmed("Chamar Garçom")
	msg += "\n\n_Digite 0 para voltar ao menu_"

	return msg, session.StateMainMenu, nil
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
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
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
		TableID:   tableID,
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

	return whatsapp.TableRequestPendingMessage(), session.StateWaitingAdminApproval, nil
}
