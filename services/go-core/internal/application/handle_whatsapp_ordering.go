package application

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

// handleOrderingSimplified - fluxo simplificado de pedidos
// Usuário digita número do item (1-N) e sistema cria pedido com 1 unidade
// CORRIGIDO: Busca itens do banco ao invés de confiar no contexto da sessão
func (uc *HandleWhatsAppMessageUseCase) handleOrderingSimplified(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	if text == "0" {
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	// Buscar itens do menu novamente (mais confiável que contexto)
	items, err := uc.menuRepo.FindItemsByTenant(ctx, sess.TenantID, true)
	if err != nil {
		uc.logger.Error("failed to fetch menu items", zap.Error(err))
		return "❌ Erro ao buscar cardápio. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if len(items) == 0 {
		return "📋 Cardápio ainda não disponível.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	// Parsear número do item
	itemNum, err := strconv.Atoi(text)
	if err != nil || itemNum < 1 || itemNum > len(items) {
		return fmt.Sprintf("❌ Número inválido. Digite um número entre 1 e %d\n\n_Digite 0 para voltar_",
			len(items)), session.StateOrdering, nil
	}

	selectedItem := items[itemNum-1]

	// Buscar ou criar tab para o usuário
	userTab, err := uc.getOrCreateTab(ctx, sess)
	if err != nil {
		uc.logger.Error("failed to get/create tab", zap.Error(err))
		return "❌ Erro ao processar pedido. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	// Criar pedido com 1 unidade
	orderInput := CreateOrderInput{
		TenantID: sess.TenantID,
		TabID:    userTab.ID,
		Items: []OrderItemInput{
			{
				MenuItemID:   selectedItem.ID,
				Quantity:     1,
				Observations: "",
			},
		},
		Notes: fmt.Sprintf("Pedido via WhatsApp - %s", sess.UserPhone),
	}

	order, err := uc.createOrderUC.Execute(ctx, orderInput)
	if err != nil {
		uc.logger.Error("failed to create order", zap.Error(err))
		return "❌ Erro ao criar pedido. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	// Mensagem após criação: pedido enviado e aguardando aceite da cozinha
	msg := fmt.Sprintf(`⏳ *Pedido enviado!*

📦 Item: %s
💰 Valor: R$ %.2f
🔢 Quantidade: 1

Seu pedido foi enviado, aguarde o aceite da nossa cozinha.
Assim que for aceito, vamos informar o tempo estimado de entrega.

%s`, selectedItem.Name, selectedItem.Price, whatsapp.MainMenuMessage())

	uc.logger.Info("order created via whatsapp",
		zap.String("order_id", order.ID.String()),
		zap.String("user_phone", sess.UserPhone),
		zap.String("item_name", selectedItem.Name),
	)

	return msg, session.StateMainMenu, nil
}

// getOrCreateTab busca ou cria uma tab para o usuário
func (uc *HandleWhatsAppMessageUseCase) getOrCreateTab(
	ctx context.Context,
	sess *session.Session,
) (*tab.Tab, error) {

	// Se já tem tab ID na sessão, buscar
	if sess.TabID != nil {
		existingTab, err := uc.tabRepo.FindByID(ctx, *sess.TabID, sess.TenantID)
		if err == nil && existingTab.Status == tab.StatusOpen {
			return existingTab, nil
		}
	}

	// Criar nova tab
	newTab := &tab.Tab{
		ID:        uuid.New(),
		TenantID:  sess.TenantID,
		UserPhone: sess.UserPhone,
		Status:    tab.StatusOpen,
	}

	if err := uc.tabRepo.Create(ctx, newTab); err != nil {
		return nil, fmt.Errorf("failed to create tab: %w", err)
	}

	// Salvar tab ID na sessão
	sess.TabID = &newTab.ID

	uc.logger.Info("new tab created",
		zap.String("tab_id", newTab.ID.String()),
		zap.String("user_phone", sess.UserPhone),
	)

	return newTab, nil
}

// handleMainMenuSimplified - menu principal com opção de pedido simplificado
func (uc *HandleWhatsAppMessageUseCase) handleMainMenuSimplified(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {

	switch text {
	case "1":
		// Fazer pedido - mostrar todos os itens disponíveis
		items, err := uc.menuRepo.FindItemsByTenant(ctx, sess.TenantID, true)
		if err != nil {
			uc.logger.Error("failed to fetch menu items", zap.Error(err))
			return "❌ Erro ao buscar cardápio. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
				session.StateMainMenu, nil
		}

		if len(items) == 0 {
			return "📋 Cardápio ainda não disponível.\n\n" + whatsapp.MainMenuMessage(),
				session.StateMainMenu, nil
		}

		// Montar mensagem com itens
		msg := "🛒 *Fazer Pedido*\n\nItens disponíveis:\n\n"
		for i, item := range items {
			msg += fmt.Sprintf("*%d* - %s - R$ %.2f\n", i+1, item.Name, item.Price)
		}
		msg += "\n_Digite o número do item para pedir 1 unidade_"
		msg += "\n_Digite 0 para voltar ao menu_"

		// Não precisa mais salvar no contexto - vamos buscar do banco na próxima mensagem

		return msg, session.StateOrdering, nil

	case "2":
		// Ver comanda
		return "📋 *Sua Comanda*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
			session.StateViewingTab, nil

	case "3":
		// Repetir rodada
		return "🔄 *Repetir Rodada*\n\nEm breve!\n\n_Digite 0 para voltar ao menu_",
			session.StateMainMenu, nil

	case "4":
		// Chamar garçom
		msg := whatsapp.ServiceRequestConfirmed("Chamar Garçom")
		msg += "\n\n_Digite 0 para voltar ao menu_"
		return msg, session.StateMainMenu, nil

	case "5":
		// Fechar conta
		return "💰 *Fechar Conta*\n\nEm breve!\n\n_Digite 0 para voltar ao menu_",
			session.StateMainMenu, nil

	default:
		return whatsapp.InvalidOptionMessage() + "\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
}
