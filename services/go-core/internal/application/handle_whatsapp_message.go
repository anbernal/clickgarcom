package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type HandleWhatsAppMessageUseCase struct {
	sessionRepo session.Repository
	tenantRepo  tenant.Repository
	sender      WhatsAppSender
	logger      *zap.Logger
}

type WhatsAppSender interface {
	SendText(ctx context.Context, to string, message string) error
}

func NewHandleWhatsAppMessageUseCase(
	sessionRepo session.Repository,
	tenantRepo tenant.Repository,
	sender WhatsAppSender,
	logger *zap.Logger,
) *HandleWhatsAppMessageUseCase {
	return &HandleWhatsAppMessageUseCase{
		sessionRepo: sessionRepo,
		tenantRepo:  tenantRepo,
		sender:      sender,
		logger:      logger,
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

		// Buscar tenant para saudação
		t, err := uc.tenantRepo.FindByID(ctx, input.TenantID)
		if err != nil {
			return fmt.Errorf("failed to find tenant: %w", err)
		}

		// Enviar boas-vindas
		welcomeMsg := whatsapp.WelcomeMessage(t.Name)
		if err := uc.sender.SendText(ctx, input.From, welcomeMsg); err != nil {
			return fmt.Errorf("failed to send welcome: %w", err)
		}

		// Mudar para menu principal
		sess.TransitionTo(session.StateMainMenu)

		// Salvar sessão
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
		return uc.handleMainMenu(ctx, sess, text)

	case session.StateOrdering:
		return uc.handleOrdering(ctx, sess, text)

	case session.StateSelectingQty:
		return uc.handleQuantitySelection(ctx, sess, text)

	case session.StateConfirmingOrder:
		return uc.handleOrderConfirmation(ctx, sess, text)

	case session.StateViewingTab:
		return uc.handleViewingTab(ctx, sess, text)

	case session.StateServiceRequest:
		return uc.handleServiceRequest(ctx, sess, text)

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
