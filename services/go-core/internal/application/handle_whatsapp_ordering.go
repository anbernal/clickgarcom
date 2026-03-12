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
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/servicerequest"
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
	existingTab := uc.findSessionOpenTab(ctx, sess)
	if existingTab != nil {
		return existingTab, nil
	}

	// Criar nova tab
	newTab := &tab.Tab{
		ID:        uuid.New(),
		TenantID:  sess.TenantID,
		TableID:   sess.TableID,
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
		return uc.handleRepeatLastRound(ctx, sess)

	case "4":
		return uc.handleCallWaiter(ctx, sess)

	case "5":
		return uc.startClosingTabFlow(ctx, sess)

	default:
		return whatsapp.InvalidOptionMessage() + "\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) startClosingTabFlow(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	userTab := uc.findSessionOpenTab(ctx, sess)
	if userTab == nil {
		return "💰 *Fechar Conta*\n\nAinda não encontrei uma comanda aberta no seu nome.\n\n_Digite 0 para voltar ao menu_",
			session.StateClosingTab, nil
	}

	if userTab.Total <= userTab.PaidAmount {
		return "✅ Sua conta já está sem valores pendentes no momento.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
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

	message = "💰 *Fechar Conta*\n\n" + message + "\n\n" +
		"Como você prefere finalizar?\n" +
		"*1* - 💳 Pagar agora pelo celular\n" +
		"*2* - 🙋 Pedir para a equipe fechar na mesa\n\n" +
		"_Digite 0 para voltar ao menu_"

	return message, session.StateClosingTab, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleClosingTab(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	switch strings.TrimSpace(text) {
	case "0":
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil

	case "1":
		userTab := uc.findSessionOpenTab(ctx, sess)
		if userTab == nil {
			return "💰 *Fechar Conta*\n\nNão encontrei uma comanda aberta agora.\n\n" + whatsapp.MainMenuMessage(),
				session.StateMainMenu, nil
		}

		checkoutBase := strings.TrimRight(strings.TrimSpace(uc.publicCheckoutBaseURL), "/")
		if checkoutBase == "" {
			checkoutBase = "http://localhost:3002"
		}
		checkoutURL := fmt.Sprintf("%s/checkout.html?tab_id=%s", checkoutBase, userTab.ID.String())

		return "💳 *Pagamento pelo celular*\n\n" +
				"Você pode fechar sua conta com segurança por este link:\n" +
				checkoutURL + "\n\n" +
				"Se preferir, volte aqui e escolha a opção *2* para pedir apoio da equipe.\n\n" +
				whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil

	case "2":
		return uc.requestCloseBillByStaff(ctx, sess)

	default:
		return "❌ Opção inválida.\n\n*1* - 💳 Pagar agora pelo celular\n*2* - 🙋 Pedir para a equipe fechar na mesa\n\n_Digite 0 para voltar ao menu_",
			session.StateClosingTab, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) requestCloseBillByStaff(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	if uc.serviceRequestRepo == nil {
		uc.logger.Error("service request repo not configured for close bill flow")
		return "❌ Não consegui avisar a equipe agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	userTab := uc.findSessionOpenTab(ctx, sess)
	if userTab == nil {
		return "💰 *Fechar Conta*\n\nNão encontrei uma comanda aberta para solicitar o fechamento agora.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if userTab.TableID == nil {
		if _, err := uc.getOrCreateOpenWaiterChat(ctx, sess); err != nil {
			uc.logger.Warn("failed to open waiter chat as close bill fallback",
				zap.Error(err),
				zap.String("user_phone", sess.UserPhone),
			)
			return "💰 *Fechar Conta*\n\nNão consegui identificar sua mesa com segurança agora.\n\nSe preferir, escolha *1* para pagar pelo celular.\n\n" + whatsapp.MainMenuMessage(),
				session.StateMainMenu, nil
		}

		return "💰 *Fechar Conta*\n\nNão consegui localizar sua mesa automaticamente agora, então já abri um atendimento com a equipe por aqui.\n\nMe envie o número da mesa ou alguma referência, ou *digite 0* para sair da conversa.\n\n",
			session.StateServiceRequest, nil
	}

	existing, err := uc.serviceRequestRepo.FindOpenByTabAndType(
		ctx,
		sess.TenantID,
		userTab.ID,
		servicerequest.RequestTypeCloseBill,
	)
	if err != nil {
		uc.logger.Error("failed to search close bill request",
			zap.Error(err),
			zap.String("tab_id", userTab.ID.String()),
		)
		return "❌ Não consegui avisar a equipe agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if existing != nil {
		return "🙋 Sua conta já está em atendimento pela equipe.\n\nAssim que o pagamento for concluído aí na mesa, finalizamos tudo para você.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	req := &servicerequest.ServiceRequest{
		ID:          uuid.New(),
		TenantID:    sess.TenantID,
		TableID:     *userTab.TableID,
		TabID:       &userTab.ID,
		RequestType: servicerequest.RequestTypeCloseBill,
		Description: fmt.Sprintf("Fechamento solicitado via WhatsApp por %s", sess.UserPhone),
		Status:      servicerequest.StatusPending,
		Priority:    4,
		CreatedAt:   time.Now(),
	}

	if err := uc.serviceRequestRepo.Create(ctx, req); err != nil {
		uc.logger.Error("failed to create close bill request",
			zap.Error(err),
			zap.String("tab_id", userTab.ID.String()),
		)
		return "❌ Não consegui registrar o pedido de fechamento agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	return "🧾 *Já pedi o fechamento da sua conta para a equipe.*\n\n" +
			"Assim que o pagamento for concluído por aí, a comanda será finalizada.\n\n" +
			whatsapp.MainMenuMessage(),
		session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleRepeatLastRound(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	userTab := uc.findSessionOpenTab(ctx, sess)
	if userTab == nil {
		return "🔄 *Repetir Última Rodada*\n\nAinda não encontrei um pedido anterior seu para repetir.\n\nAssim que você fizer um pedido, essa opção funciona automaticamente 😉\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if uc.createOrderUC == nil || uc.createOrderUC.orderRepo == nil {
		uc.logger.Error("createOrder use case not configured for repeat round")
		return "❌ Não consegui repetir seu último pedido agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	orders, err := uc.createOrderUC.orderRepo.FindByTab(ctx, userTab.ID, sess.TenantID)
	if err != nil {
		uc.logger.Error("failed to load orders for repeat round",
			zap.Error(err),
			zap.String("tab_id", userTab.ID.String()),
		)
		return "❌ Não consegui buscar seu último pedido. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	var fallbackOrder *order.Order
	var lastOrder *order.Order
	normalizedPhone := normalizePhoneDigits(sess.UserPhone)

	for _, candidate := range orders {
		if candidate == nil || candidate.Status == order.StatusCanceled || len(candidate.Items) == 0 {
			continue
		}

		if fallbackOrder == nil {
			fallbackOrder = candidate
		}

		if normalizedPhone != "" && strings.Contains(normalizePhoneDigits(candidate.Notes), normalizedPhone) {
			lastOrder = candidate
			break
		}
	}

	if lastOrder == nil {
		lastOrder = fallbackOrder
	}

	if lastOrder == nil {
		return "🔄 *Repetir Última Rodada*\n\nNão encontrei um pedido anterior válido para repetir.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	repeatItems := make([]OrderItemInput, 0, len(lastOrder.Items))
	for _, item := range lastOrder.Items {
		if item.MenuItemID == uuid.Nil || item.Quantity <= 0 {
			continue
		}
		repeatItems = append(repeatItems, OrderItemInput{
			MenuItemID:   item.MenuItemID,
			Quantity:     item.Quantity,
			Observations: item.Observations,
		})
	}

	if len(repeatItems) == 0 {
		return "🔄 *Repetir Última Rodada*\n\nSeu último pedido não tem itens válidos para repetir.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	newOrderInput := CreateOrderInput{
		TenantID: sess.TenantID,
		TabID:    userTab.ID,
		Items:    repeatItems,
		Notes:    fmt.Sprintf("Repetir rodada via WhatsApp - %s (origem: %s)", sess.UserPhone, lastOrder.ID.String()),
	}

	newOrder, err := uc.createOrderUC.Execute(ctx, newOrderInput)
	if err != nil {
		uc.logger.Error("failed to repeat last round",
			zap.Error(err),
			zap.String("tab_id", userTab.ID.String()),
			zap.String("source_order_id", lastOrder.ID.String()),
		)
		return "❌ Não consegui repetir sua última rodada agora. Verifique se os itens ainda estão disponíveis e tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	itemsSummary := uc.buildRepeatRoundItemsSummary(ctx, sess.TenantID, repeatItems)
	msg := "✅ *Perfeito! Já solicitei sua última rodada com a equipe 🤵*\n\n"
	if itemsSummary != "" {
		msg += "🧾 *Itens repetidos:*\n" + itemsSummary + "\n\n"
	}
	orderCode := uc.buildOrderDisplayCode(ctx, sess, userTab, newOrder)
	msg += fmt.Sprintf("📦 Pedido #%s solicitado.\n⏱️ Te aviso quando o status avançar.\n\n%s",
		orderCode,
		whatsapp.MainMenuMessage(),
	)

	return msg, session.StateMainMenu, nil
}

func (uc *HandleWhatsAppMessageUseCase) buildRepeatRoundItemsSummary(
	ctx context.Context,
	tenantID uuid.UUID,
	items []OrderItemInput,
) string {
	if len(items) == 0 {
		return ""
	}

	ids := make([]uuid.UUID, 0, len(items))
	seen := make(map[uuid.UUID]struct{})
	for _, item := range items {
		if item.MenuItemID == uuid.Nil {
			continue
		}
		if _, ok := seen[item.MenuItemID]; ok {
			continue
		}
		seen[item.MenuItemID] = struct{}{}
		ids = append(ids, item.MenuItemID)
	}

	nameByID := make(map[uuid.UUID]string, len(ids))
	menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, ids, tenantID)
	if err == nil {
		for _, menuItem := range menuItems {
			if menuItem != nil {
				nameByID[menuItem.ID] = menuItem.Name
			}
		}
	}

	lines := make([]string, 0, len(items))
	for _, item := range items {
		name := nameByID[item.MenuItemID]
		if name == "" {
			name = fmt.Sprintf("Item %s", item.MenuItemID.String()[:8])
		}
		lines = append(lines, fmt.Sprintf("• %dx %s", item.Quantity, name))
	}

	return strings.Join(lines, "\n")
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderDisplayCode(
	ctx context.Context,
	sess *session.Session,
	userTab *tab.Tab,
	o *order.Order,
) string {
	phoneSuffix := phoneSuffixFromText(sess.UserPhone)
	tableCode := uc.resolveTabTableCode(ctx, sess.TenantID, userTab)
	orderSuffix := orderSuffixFromID(o)

	switch {
	case phoneSuffix != "" && tableCode != "" && orderSuffix != "":
		return fmt.Sprintf("%s-%s-%s", phoneSuffix, tableCode, orderSuffix)
	case phoneSuffix != "" && tableCode != "":
		return fmt.Sprintf("%s-%s", phoneSuffix, tableCode)
	case phoneSuffix != "" && orderSuffix != "":
		return fmt.Sprintf("%s-%s", phoneSuffix, orderSuffix)
	case tableCode != "" && orderSuffix != "":
		return fmt.Sprintf("%s-%s", tableCode, orderSuffix)
	case phoneSuffix != "":
		return phoneSuffix
	case tableCode != "":
		return tableCode
	case orderSuffix != "":
		return orderSuffix
	default:
		return "----"
	}
}

func (uc *HandleWhatsAppMessageUseCase) resolveTabTableCode(
	ctx context.Context,
	tenantID uuid.UUID,
	userTab *tab.Tab,
) string {
	if userTab == nil || userTab.TableID == nil {
		return ""
	}

	t, err := uc.tableRepo.FindByID(ctx, *userTab.TableID, tenantID)
	if err != nil || t == nil {
		return ""
	}
	return formatTableNumberForDisplay(t.Number)
}

func phoneSuffixFromText(raw string) string {
	digits := normalizePhoneDigits(raw)
	if len(digits) == 0 {
		return ""
	}
	if len(digits) <= 4 {
		return digits
	}
	return digits[len(digits)-4:]
}

func orderSuffixFromID(o *order.Order) string {
	if o == nil {
		return ""
	}

	id := strings.TrimSpace(o.ID.String())
	if id == "" {
		return ""
	}
	if len(id) <= 4 {
		return id
	}
	return id[len(id)-4:]
}

func formatTableNumberForDisplay(number string) string {
	raw := strings.TrimSpace(number)
	if raw == "" {
		return ""
	}

	for _, r := range raw {
		if r < '0' || r > '9' {
			return raw
		}
	}

	if len(raw) >= 2 {
		return raw
	}
	return "0" + raw
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
	var candidate *tab.Tab

	if sess.TabID != nil {
		existingTab, err := uc.tabRepo.FindByID(ctx, *sess.TabID, sess.TenantID)
		if err == nil && existingTab != nil && existingTab.Status == tab.StatusOpen {
			candidate = existingTab
		}
	}

	if candidate == nil && sess.TableID != nil {
		byTable, err := uc.tabRepo.FindOpenByTable(ctx, *sess.TableID, sess.TenantID)
		if err == nil && byTable != nil {
			candidate = byTable
		}
	}

	if candidate == nil {
		openTabs, err := uc.tabRepo.FindByTenantAndStatus(ctx, sess.TenantID, tab.StatusOpen)
		if err != nil {
			return nil
		}

		normalizedPhone := normalizePhoneDigits(sess.UserPhone)
		for _, openTab := range openTabs {
			if normalizePhoneDigits(openTab.UserPhone) == normalizedPhone {
				candidate = openTab
				break
			}
		}
	}

	if candidate == nil {
		latestReq, err := uc.tableRepo.FindLatestApprovedRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
		if err == nil && latestReq != nil && latestReq.TableID != nil {
			byTable, tabErr := uc.tabRepo.FindOpenByTable(ctx, *latestReq.TableID, sess.TenantID)
			if tabErr == nil && byTable != nil {
				candidate = byTable
			}
		}
	}

	if candidate == nil {
		return nil
	}

	uc.reconcileOpenTabMetadata(ctx, sess, candidate)
	return candidate
}

func (uc *HandleWhatsAppMessageUseCase) reconcileOpenTabMetadata(
	ctx context.Context,
	sess *session.Session,
	userTab *tab.Tab,
) {
	if userTab == nil {
		return
	}

	tabChanged := false

	if strings.TrimSpace(userTab.UserPhone) == "" && strings.TrimSpace(sess.UserPhone) != "" {
		userTab.UserPhone = sess.UserPhone
		tabChanged = true
	}

	if userTab.TableID == nil {
		recoveredTableID, err := uc.recoverSessionTableID(ctx, sess)
		if err != nil {
			uc.logger.Warn("failed to recover table id for open tab",
				zap.Error(err),
				zap.String("user_phone", sess.UserPhone),
			)
		} else if recoveredTableID != nil {
			userTab.TableID = recoveredTableID
			tabChanged = true
		}
	}

	if tabChanged {
		if err := uc.tabRepo.Update(ctx, userTab); err != nil {
			uc.logger.Warn("failed to reconcile open tab metadata",
				zap.Error(err),
				zap.String("tab_id", userTab.ID.String()),
			)
		}
	}

	if sess.TabID == nil || *sess.TabID != userTab.ID {
		tabID := userTab.ID
		sess.TabID = &tabID
	}

	if userTab.TableID != nil && (sess.TableID == nil || *sess.TableID != *userTab.TableID) {
		tableID := *userTab.TableID
		sess.TableID = &tableID
	}
}

func (uc *HandleWhatsAppMessageUseCase) recoverSessionTableID(
	ctx context.Context,
	sess *session.Session,
) (*uuid.UUID, error) {
	if sess.TableID != nil {
		tableID := *sess.TableID
		return &tableID, nil
	}

	latestReq, err := uc.tableRepo.FindLatestApprovedRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
	if err != nil {
		return nil, err
	}
	if latestReq == nil || latestReq.TableID == nil {
		return nil, nil
	}

	tableID := *latestReq.TableID
	sess.TableID = &tableID
	return &tableID, nil
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
