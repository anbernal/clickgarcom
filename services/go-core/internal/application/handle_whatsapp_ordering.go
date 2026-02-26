package application

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/order"
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

	// Mensagem após criação: pedido enviado e aguardando confirmação
	msg := fmt.Sprintf(`⏳ *Pedido enviado!*

📦 Item: %s
💰 Valor: R$ %.2f
🔢 Quantidade: 1

Seu pedido foi enviado. Aguarde a confirmação da equipe.
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
		return uc.buildTabSummaryResponse(ctx, sess, false)

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
		return uc.buildTabSummaryResponse(ctx, sess, true)

	default:
		return whatsapp.InvalidOptionMessage() + "\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) buildTabSummaryResponse(
	ctx context.Context,
	sess *session.Session,
	isCloseFlow bool,
) (string, session.ConversationState, error) {
	userTab := uc.findSessionOpenTab(ctx, sess)
	if userTab == nil {
		if isCloseFlow {
			return "💰 *Fechar Conta*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
				session.StateViewingTab, nil
		}
		return "📋 *Sua Comanda*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
			session.StateViewingTab, nil
	}

	items := uc.buildTabItemsList(ctx, sess.TenantID, userTab.ID)
	message := whatsapp.TabSummaryMessage(items, userTab.Subtotal, userTab.ServiceFee, userTab.Total)

	if tenantObj, err := uc.tenantRepo.FindByID(ctx, sess.TenantID); err == nil && tenantObj != nil {
		message = whatsapp.TabSummaryMessage(
			items,
			userTab.Subtotal,
			userTab.ServiceFee,
			userTab.Total,
			tenantObj.Settings.Messages,
		)
	}

	if isCloseFlow {
		message = "💰 *Fechar Conta*\n\n" + message + "\n\n" +
			"Para encerrar a conta, solicite nossa equipe.\n\n_Digite 0 para voltar ao menu_"
		return message, session.StateViewingTab, nil
	}

	message += "\n\n_Digite 0 para voltar ao menu_"
	return message, session.StateViewingTab, nil
}

func (uc *HandleWhatsAppMessageUseCase) findSessionOpenTab(
	ctx context.Context,
	sess *session.Session,
) *tab.Tab {
	if sess.TabID != nil {
		existingTab, err := uc.tabRepo.FindByID(ctx, *sess.TabID, sess.TenantID)
		if err == nil && existingTab != nil && existingTab.Status == tab.StatusOpen {
			return existingTab
		}
	}

	openTabs, err := uc.tabRepo.FindByTenantAndStatus(ctx, sess.TenantID, tab.StatusOpen)
	if err != nil {
		return nil
	}

	normalizedPhone := normalizePhoneDigits(sess.UserPhone)
	for _, candidate := range openTabs {
		if normalizePhoneDigits(candidate.UserPhone) == normalizedPhone {
			return candidate
		}
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) buildTabItemsList(
	ctx context.Context,
	tenantID uuid.UUID,
	tabID uuid.UUID,
) []string {
	if uc.createOrderUC == nil || uc.createOrderUC.orderRepo == nil {
		return []string{}
	}

	orders, err := uc.createOrderUC.orderRepo.FindByTab(ctx, tabID, tenantID)
	if err != nil {
		uc.logger.Warn("failed to load tab orders for summary",
			zap.Error(err),
			zap.String("tab_id", tabID.String()),
		)
		return []string{}
	}

	type itemAgg struct {
		MenuItemID uuid.UUID
		Quantity   int
		Total      float64
	}

	aggregated := make(map[uuid.UUID]*itemAgg)
	orderedIDs := make([]uuid.UUID, 0)

	for _, ord := range orders {
		if ord == nil || ord.Status == order.StatusCanceled {
			continue
		}

		for _, item := range ord.Items {
			existing, ok := aggregated[item.MenuItemID]
			if !ok {
				existing = &itemAgg{MenuItemID: item.MenuItemID}
				aggregated[item.MenuItemID] = existing
				orderedIDs = append(orderedIDs, item.MenuItemID)
			}
			existing.Quantity += item.Quantity
			existing.Total += float64(item.Quantity) * item.UnitPrice
		}
	}

	if len(aggregated) == 0 {
		return []string{}
	}

	menuItemIDs := make([]uuid.UUID, 0, len(orderedIDs))
	for _, id := range orderedIDs {
		if id != uuid.Nil {
			menuItemIDs = append(menuItemIDs, id)
		}
	}

	itemNameByID := make(map[uuid.UUID]string, len(menuItemIDs))
	if len(menuItemIDs) > 0 {
		menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, menuItemIDs, tenantID)
		if err != nil {
			uc.logger.Warn("failed to load menu item names for tab summary", zap.Error(err))
		} else {
			for _, menuItem := range menuItems {
				if menuItem != nil {
					itemNameByID[menuItem.ID] = menuItem.Name
				}
			}
		}
	}

	lines := make([]string, 0, len(orderedIDs))
	for _, id := range orderedIDs {
		agg := aggregated[id]
		if agg == nil || agg.Quantity <= 0 {
			continue
		}

		name := itemNameByID[id]
		if name == "" {
			name = fmt.Sprintf("Item %s", id.String()[:8])
		}

		lines = append(lines, fmt.Sprintf("%dx %s - R$ %.2f", agg.Quantity, name, agg.Total))
	}

	return lines
}
