package application

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/servicerequest"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

const (
	orderingStepKey               = "ordering_step"
	orderingStepCategorySelection = "category_selection"
	orderingStepItemSelection     = "item_selection"
	orderingCategoryIDsKey        = "ordering_category_ids"
	orderingItemIDsKey            = "ordering_item_ids"
	orderingItemPreviewCacheKey   = "ordering_item_preview_cache"
	orderingSelectedCategoryIDKey = "ordering_selected_category_id"
	orderingSelectedItemIDKey     = "ordering_selected_item_id"
	orderingSelectedQuantityKey   = "ordering_selected_quantity"
	orderingCartKey               = "ordering_cart"

	orderingCategoryPrefix = "menu:category:"
	orderingItemPrefix     = "menu:item:"
	orderingQuantityPrefix = "qty:"
	orderingConfirmOrderID = "order:confirm"
	orderingChangeItemID   = "order:change_item"
	orderingBackToMenuID   = "order:menu"
)

var orderingPreviewDelay = 1200 * time.Millisecond

type orderingCartItem struct {
	MenuItemID    string `json:"menu_item_id"`
	Quantity      int    `json:"quantity"`
	Observations  string `json:"observations,omitempty"`
	MenuItemName  string `json:"menu_item_name,omitempty"`
	UnitPrice     string `json:"unit_price,omitempty"`
	CategoryLabel string `json:"category_label,omitempty"`
}

type orderingItemPreview struct {
	Name                     string `json:"name,omitempty"`
	Description              string `json:"description,omitempty"`
	ImageURL                 string `json:"image_url,omitempty"`
	WhatsAppShortName        string `json:"whatsapp_short_name,omitempty"`
	WhatsAppShortDescription string `json:"whatsapp_short_description,omitempty"`
}

// handleOrderingSimplified - fluxo simplificado de pedidos
// Evoluído para categorias -> itens -> quantidade -> confirmação,
// mantendo fallback textual quando o canal interativo falha.
func (uc *HandleWhatsAppMessageUseCase) handleOrderingSimplified(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	text = strings.TrimSpace(text)

	if text == "0" {
		uc.clearOrderingContext(sess)
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
	}

	switch uc.getContextString(sess, orderingStepKey) {
	case orderingStepCategorySelection:
		return uc.handleOrderingCategorySelection(ctx, sess, text)
	case orderingStepItemSelection:
		return uc.handleOrderingItemSelection(ctx, sess, text)
	default:
		return uc.startOrderingFlow(ctx, sess)
	}
}

func (uc *HandleWhatsAppMessageUseCase) startOrderingFlow(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	if uc.menuRepo == nil {
		return "📋 Ainda não consegui carregar o cardápio agora. Tente novamente em instantes.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	categories, err := uc.menuRepo.FindCategoriesByTenant(ctx, sess.TenantID)
	if err != nil {
		uc.logger.Error("failed to fetch menu categories", zap.Error(err))
		return "❌ Erro ao buscar categorias do cardápio. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	activeCategories := make([]*menu.Category, 0, len(categories))
	for _, category := range categories {
		if category != nil && category.Active {
			activeCategories = append(activeCategories, category)
		}
	}

	uc.clearOrderingSelectionContext(sess)
	sess.SetContext(orderingStepKey, orderingStepCategorySelection)
	sess.SetContext(orderingCategoryIDsKey, menuCategoryIDs(activeCategories))

	if len(activeCategories) == 0 {
		return uc.showAllItemsForOrdering(ctx, sess)
	}

	if err := uc.sendOrderingCategoryMenu(ctx, sess.UserPhone, sess.TenantID, activeCategories); err == nil {
		return "", session.StateOrdering, nil
	}

	return uc.buildOrderingCategoryFallback(activeCategories), session.StateOrdering, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderingCategorySelection(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	categoryID, ok := uc.resolveOrderingCategorySelection(sess, text)
	if !ok {
		return "❌ Categoria inválida. Escolha uma opção da lista enviada ou digite *0* para voltar ao menu principal.",
			session.StateOrdering, nil
	}

	items, err := uc.menuRepo.FindItemsByCategory(ctx, categoryID, sess.TenantID, true)
	if err != nil {
		uc.logger.Error("failed to fetch category items",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
			zap.String("category_id", categoryID.String()),
		)
		return "❌ Não consegui abrir essa categoria agora. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	category, _ := uc.menuRepo.FindCategoryByID(ctx, categoryID, sess.TenantID)
	categoryName := "Cardápio"
	if category != nil && strings.TrimSpace(category.Name) != "" {
		categoryName = category.Name
	}

	if len(items) == 0 {
		return fmt.Sprintf("📋 A categoria *%s* ainda não tem itens disponíveis.\n\nEscolha outra categoria ou digite *0* para voltar ao menu principal.", categoryName),
			session.StateOrdering, nil
	}

	if uc.sendOrderingCategoryImagePreview(ctx, sess.UserPhone, sess.TenantID, category, items) {
		waitForOrderingPreview(ctx)
	}

	sess.SetContext(orderingStepKey, orderingStepItemSelection)
	sess.SetContext(orderingSelectedCategoryIDKey, categoryID.String())
	sess.SetContext(orderingItemIDsKey, menuItemIDs(items))
	uc.setOrderingItemPreviewCache(sess, items)

	if err := uc.sendOrderingItemsMenu(ctx, sess.UserPhone, sess.TenantID, categoryName, items); err == nil {
		return "", session.StateOrdering, nil
	}

	return uc.buildOrderingItemsFallback(categoryName, items), session.StateOrdering, nil
}

func (uc *HandleWhatsAppMessageUseCase) handleOrderingItemSelection(
	ctx context.Context,
	sess *session.Session,
	text string,
) (string, session.ConversationState, error) {
	itemID, ok := uc.resolveOrderingItemSelection(sess, text)
	if !ok {
		return "❌ Item inválido. Escolha um item da lista enviada ou digite *0* para voltar ao menu principal.",
			session.StateOrdering, nil
	}

	selectedItem, err := uc.menuRepo.FindItemByID(ctx, itemID, sess.TenantID)
	if err != nil || selectedItem == nil {
		uc.logger.Error("failed to load menu item",
			zap.Error(err),
			zap.String("tenant_id", sess.TenantID.String()),
			zap.String("item_id", itemID.String()),
		)
		return "❌ Não consegui abrir esse item agora. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if !selectedItem.Available {
		return fmt.Sprintf("⚠️ O item *%s* não está disponível agora.\n\nEscolha outro item ou digite *0* para voltar ao menu principal.", selectedItem.Name),
			session.StateOrdering, nil
	}

	selectedItem = uc.mergeOrderingItemWithPreviewCache(sess, selectedItem)
	sess.SetContext(orderingSelectedItemIDKey, selectedItem.ID.String())
	delete(sess.Context, orderingSelectedQuantityKey)

	if uc.sendOrderingItemImagePreview(ctx, sess.UserPhone, sess.TenantID, selectedItem) {
		waitForOrderingPreview(ctx)
	}

	if err := uc.sendQuantityMenu(ctx, sess.UserPhone, sess.TenantID, selectedItem); err == nil {
		return "", session.StateSelectingQty, nil
	}

	return uc.buildQuantityFallback(selectedItem), session.StateSelectingQty, nil
}

func (uc *HandleWhatsAppMessageUseCase) showAllItemsForOrdering(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	items, err := uc.menuRepo.FindItemsByTenant(ctx, sess.TenantID, true)
	if err != nil {
		uc.logger.Error("failed to fetch tenant menu items", zap.Error(err))
		return "❌ Não consegui carregar o cardápio agora. Tente novamente.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if len(items) == 0 {
		return "📋 Cardápio ainda não disponível.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	sess.SetContext(orderingStepKey, orderingStepItemSelection)
	sess.SetContext(orderingItemIDsKey, menuItemIDs(items))
	uc.setOrderingItemPreviewCache(sess, items)

	if err := uc.sendOrderingItemsMenu(ctx, sess.UserPhone, sess.TenantID, "Cardápio", items); err == nil {
		return "", session.StateOrdering, nil
	}

	return uc.buildOrderingItemsFallback("Cardápio", items), session.StateOrdering, nil
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
		return uc.startOrderingFlow(ctx, sess)

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

func (uc *HandleWhatsAppMessageUseCase) sendOrderingCategoryMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	categories []*menu.Category,
) error {
	if len(categories) == 0 || len(categories) > 10 {
		return fmt.Errorf("interactive category menu unavailable for %d categories", len(categories))
	}

	rows := make([]whatsapp.InteractiveListRow, 0, len(categories))
	for _, category := range categories {
		if category == nil {
			continue
		}
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingCategoryPrefix + category.ID.String(),
			Title:       truncateInteractiveTitle(category.Name),
			Description: truncateInteractiveDescription(orderingCategoryDescription(category)),
		})
	}

	if len(rows) == 0 {
		return fmt.Errorf("no category rows available")
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		"🍽️ *Cardápio Interativo*\n\nEscolha uma categoria para começar seu pedido.",
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Ver categorias",
		[]whatsapp.InteractiveListSection{{Title: "Categorias", Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) sendOrderingItemsMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	categoryName string,
	items []*menu.Item,
) error {
	if len(items) == 0 || len(items) > 10 {
		return fmt.Errorf("interactive item menu unavailable for %d items", len(items))
	}

	rows := make([]whatsapp.InteractiveListRow, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingItemPrefix + item.ID.String(),
			Title:       truncateInteractiveTitle(orderingItemListTitle(item)),
			Description: truncateInteractiveDescription(orderingItemDescription(item)),
		})
	}

	if len(rows) == 0 {
		return fmt.Errorf("no item rows available")
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		fmt.Sprintf("🛒 *%s*\n\nEscolha o item que você quer adicionar ao pedido.", strings.TrimSpace(categoryName)),
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Ver itens",
		[]whatsapp.InteractiveListSection{{Title: truncateInteractiveTitle(categoryName), Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) sendQuantityMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	item *menu.Item,
) error {
	if item == nil {
		return fmt.Errorf("nil item")
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		fmt.Sprintf(
			"✨ *%s*\n%s\n\n💰 Valor unitário: *R$ %s*\n\nEscolha a quantidade ou responda com outro número.",
			item.Name,
			orderingItemDetail(item),
			formatBRLCurrency(item.Price),
		),
	)

	_, err := uc.sender.SendInteractiveButtons(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		buildQuantityButtons(),
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) sendCartConfirmationMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	cartBody string,
) error {
	if strings.TrimSpace(cartBody) == "" {
		return fmt.Errorf("empty cart confirmation payload")
	}

	body := whatsapp.WithRestaurantHeader(uc.resolveTenantName(ctx, tenantID), cartBody)
	_, err := uc.sender.SendInteractiveButtons(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		buildOrderConfirmationButtons(),
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCategoryFallback(categories []*menu.Category) string {
	if len(categories) == 0 {
		return "📋 Cardápio ainda não disponível.\n\n" + whatsapp.MainMenuMessage()
	}

	lines := make([]string, 0, len(categories))
	for index, category := range categories {
		if category == nil {
			continue
		}
		lines = append(lines, fmt.Sprintf("*%d* - %s", index+1, category.Name))
	}

	return "🍽️ *Cardápio Interativo*\n\nEscolha uma categoria:\n\n" +
		strings.Join(lines, "\n") +
		"\n\n_Digite o número da categoria ou 0 para voltar ao menu principal_"
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingItemsFallback(categoryName string, items []*menu.Item) string {
	lines := make([]string, 0, len(items))
	for index, item := range items {
		if item == nil {
			continue
		}
		lines = append(lines, fmt.Sprintf("*%d* - %s · R$ %s", index+1, item.Name, formatBRLCurrency(item.Price)))
	}

	return fmt.Sprintf(
		"🛒 *%s*\n\n%s\n\n_Digite o número do item ou 0 para voltar ao menu principal_",
		categoryName,
		strings.Join(lines, "\n"),
	)
}

func (uc *HandleWhatsAppMessageUseCase) buildQuantityFallback(item *menu.Item) string {
	return fmt.Sprintf(
		"✨ *%s*\n%s\n\n💰 Valor unitário: *R$ %s*\n\nDigite a quantidade desejada (ex: 1, 2, 3) ou *0* para voltar ao menu principal.",
		item.Name,
		orderingItemDetail(item),
		formatBRLCurrency(item.Price),
	)
}

func (uc *HandleWhatsAppMessageUseCase) buildCartConfirmationFallback(cartBody string) string {
	return strings.TrimSpace(cartBody) + "\n\n*1* - ✅ Enviar pedido\n*2* - ➕ Adicionar mais itens\n*0* - ◂ Menu principal"
}

func (uc *HandleWhatsAppMessageUseCase) resolveOrderingCategorySelection(sess *session.Session, text string) (uuid.UUID, bool) {
	if strings.HasPrefix(text, orderingCategoryPrefix) {
		id, err := uuid.Parse(strings.TrimPrefix(text, orderingCategoryPrefix))
		return id, err == nil
	}

	index, err := strconv.Atoi(text)
	if err != nil || index < 1 {
		return uuid.Nil, false
	}

	ids := uc.getContextStringSlice(sess, orderingCategoryIDsKey)
	if index > len(ids) {
		return uuid.Nil, false
	}

	id, err := uuid.Parse(ids[index-1])
	return id, err == nil
}

func (uc *HandleWhatsAppMessageUseCase) resolveOrderingItemSelection(sess *session.Session, text string) (uuid.UUID, bool) {
	if strings.HasPrefix(text, orderingItemPrefix) {
		id, err := uuid.Parse(strings.TrimPrefix(text, orderingItemPrefix))
		return id, err == nil
	}

	index, err := strconv.Atoi(text)
	if err != nil || index < 1 {
		return uuid.Nil, false
	}

	ids := uc.getContextStringSlice(sess, orderingItemIDsKey)
	if index > len(ids) {
		return uuid.Nil, false
	}

	id, err := uuid.Parse(ids[index-1])
	return id, err == nil
}

func (uc *HandleWhatsAppMessageUseCase) clearOrderingContext(sess *session.Session) {
	if sess == nil || sess.Context == nil {
		return
	}

	for _, key := range []string{
		orderingStepKey,
		orderingCategoryIDsKey,
		orderingItemIDsKey,
		orderingItemPreviewCacheKey,
		orderingSelectedCategoryIDKey,
		orderingSelectedItemIDKey,
		orderingSelectedQuantityKey,
		orderingCartKey,
	} {
		delete(sess.Context, key)
	}
}

func (uc *HandleWhatsAppMessageUseCase) clearOrderingSelectionContext(sess *session.Session) {
	if sess == nil || sess.Context == nil {
		return
	}

	for _, key := range []string{
		orderingStepKey,
		orderingCategoryIDsKey,
		orderingItemIDsKey,
		orderingItemPreviewCacheKey,
		orderingSelectedCategoryIDKey,
		orderingSelectedItemIDKey,
		orderingSelectedQuantityKey,
	} {
		delete(sess.Context, key)
	}
}

func (uc *HandleWhatsAppMessageUseCase) getContextString(sess *session.Session, key string) string {
	if sess == nil {
		return ""
	}
	value, ok := sess.GetContext(key)
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func (uc *HandleWhatsAppMessageUseCase) getContextStringSlice(sess *session.Session, key string) []string {
	if sess == nil {
		return nil
	}
	value, ok := sess.GetContext(key)
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []interface{}:
		values := make([]string, 0, len(typed))
		for _, raw := range typed {
			if raw == nil {
				continue
			}
			values = append(values, strings.TrimSpace(fmt.Sprintf("%v", raw)))
		}
		return values
	default:
		return nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) setOrderingItemPreviewCache(sess *session.Session, items []*menu.Item) {
	if sess == nil {
		return
	}

	previews := make(map[string]orderingItemPreview, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		previews[item.ID.String()] = orderingItemPreview{
			Name:                     strings.TrimSpace(item.Name),
			Description:              strings.TrimSpace(item.Description),
			ImageURL:                 strings.TrimSpace(item.ImageURL),
			WhatsAppShortName:        strings.TrimSpace(item.WhatsAppShortName),
			WhatsAppShortDescription: strings.TrimSpace(item.WhatsAppShortDescription),
		}
	}

	if len(previews) == 0 {
		delete(sess.Context, orderingItemPreviewCacheKey)
		return
	}

	sess.SetContext(orderingItemPreviewCacheKey, previews)
}

func (uc *HandleWhatsAppMessageUseCase) getOrderingItemPreviewCache(sess *session.Session) map[string]orderingItemPreview {
	if sess == nil {
		return nil
	}

	value, ok := sess.GetContext(orderingItemPreviewCacheKey)
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case map[string]orderingItemPreview:
		cloned := make(map[string]orderingItemPreview, len(typed))
		for id, preview := range typed {
			cloned[id] = preview
		}
		return cloned
	case map[string]interface{}:
		previews := make(map[string]orderingItemPreview, len(typed))
		for id, raw := range typed {
			preview := parseOrderingItemPreview(raw)
			if preview == (orderingItemPreview{}) {
				continue
			}
			previews[id] = preview
		}
		return previews
	default:
		return nil
	}
}

func parseOrderingItemPreview(raw interface{}) orderingItemPreview {
	switch typed := raw.(type) {
	case orderingItemPreview:
		return typed
	case map[string]interface{}:
		return orderingItemPreview{
			Name:                     parseOrderingOptionalString(typed["name"]),
			Description:              parseOrderingOptionalString(typed["description"]),
			ImageURL:                 parseOrderingOptionalString(typed["image_url"]),
			WhatsAppShortName:        parseOrderingOptionalString(typed["whatsapp_short_name"]),
			WhatsAppShortDescription: parseOrderingOptionalString(typed["whatsapp_short_description"]),
		}
	default:
		return orderingItemPreview{}
	}
}

func parseOrderingOptionalString(raw interface{}) string {
	if raw == nil {
		return ""
	}

	value := strings.TrimSpace(fmt.Sprintf("%v", raw))
	if value == "" || value == "<nil>" {
		return ""
	}

	return value
}

func (uc *HandleWhatsAppMessageUseCase) mergeOrderingItemWithPreviewCache(
	sess *session.Session,
	item *menu.Item,
) *menu.Item {
	if item == nil {
		return nil
	}

	previews := uc.getOrderingItemPreviewCache(sess)
	preview, ok := previews[item.ID.String()]
	if !ok {
		return item
	}

	cloned := *item
	if strings.TrimSpace(cloned.Name) == "" {
		cloned.Name = preview.Name
	}
	if strings.TrimSpace(cloned.Description) == "" {
		cloned.Description = preview.Description
	}
	if strings.TrimSpace(cloned.ImageURL) == "" {
		cloned.ImageURL = preview.ImageURL
	}
	if strings.TrimSpace(cloned.WhatsAppShortName) == "" {
		cloned.WhatsAppShortName = preview.WhatsAppShortName
	}
	if strings.TrimSpace(cloned.WhatsAppShortDescription) == "" {
		cloned.WhatsAppShortDescription = preview.WhatsAppShortDescription
	}

	return &cloned
}

func orderingCategoryDescription(category *menu.Category) string {
	if category == nil {
		return ""
	}
	description := strings.TrimSpace(category.Description)
	if description != "" {
		return description
	}
	return "Abrir categoria"
}

func orderingItemListTitle(item *menu.Item) string {
	if item == nil {
		return ""
	}
	if shortName := strings.TrimSpace(item.WhatsAppShortName); shortName != "" {
		return shortName
	}
	return strings.TrimSpace(item.Name)
}

func orderingItemDescription(item *menu.Item) string {
	if item == nil {
		return ""
	}
	description := strings.TrimSpace(item.WhatsAppShortDescription)
	if description == "" {
		description = strings.TrimSpace(item.Description)
	}
	if description == "" {
		description = "Escolher item"
	}
	return fmt.Sprintf("R$ %s · %s", formatBRLCurrency(item.Price), description)
}

func orderingItemDetail(item *menu.Item) string {
	if item == nil {
		return ""
	}
	description := strings.TrimSpace(item.Description)
	if description == "" {
		return "Escolha quantas unidades deseja pedir."
	}
	return description
}

func menuCategoryIDs(categories []*menu.Category) []string {
	ids := make([]string, 0, len(categories))
	for _, category := range categories {
		if category != nil && category.ID != uuid.Nil {
			ids = append(ids, category.ID.String())
		}
	}
	return ids
}

func menuItemIDs(items []*menu.Item) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item != nil && item.ID != uuid.Nil {
			ids = append(ids, item.ID.String())
		}
	}
	return ids
}

func (uc *HandleWhatsAppMessageUseCase) getOrderingCart(sess *session.Session) []orderingCartItem {
	if sess == nil {
		return nil
	}
	value, ok := sess.GetContext(orderingCartKey)
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []orderingCartItem:
		return append([]orderingCartItem(nil), typed...)
	case []interface{}:
		cart := make([]orderingCartItem, 0, len(typed))
		for _, raw := range typed {
			entry, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			cart = append(cart, orderingCartItem{
				MenuItemID:    strings.TrimSpace(fmt.Sprintf("%v", entry["menu_item_id"])),
				Quantity:      parseOrderingIntValue(entry["quantity"]),
				Observations:  strings.TrimSpace(fmt.Sprintf("%v", entry["observations"])),
				MenuItemName:  strings.TrimSpace(fmt.Sprintf("%v", entry["menu_item_name"])),
				UnitPrice:     strings.TrimSpace(fmt.Sprintf("%v", entry["unit_price"])),
				CategoryLabel: strings.TrimSpace(fmt.Sprintf("%v", entry["category_label"])),
			})
		}
		return cart
	default:
		return nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) setOrderingCart(sess *session.Session, cart []orderingCartItem) {
	if sess == nil {
		return
	}
	sess.SetContext(orderingCartKey, cart)
}

func (uc *HandleWhatsAppMessageUseCase) addItemToOrderingCart(sess *session.Session, item *menu.Item, quantity int) []orderingCartItem {
	cart := uc.getOrderingCart(sess)
	if item == nil || quantity <= 0 {
		return cart
	}

	for index := range cart {
		if cart[index].MenuItemID != item.ID.String() {
			continue
		}
		cart[index].Quantity += quantity
		if strings.TrimSpace(cart[index].MenuItemName) == "" {
			cart[index].MenuItemName = item.Name
		}
		if strings.TrimSpace(cart[index].UnitPrice) == "" {
			cart[index].UnitPrice = fmt.Sprintf("%.2f", item.Price)
		}
		uc.setOrderingCart(sess, cart)
		return cart
	}

	cart = append(cart, orderingCartItem{
		MenuItemID:    item.ID.String(),
		Quantity:      quantity,
		MenuItemName:  item.Name,
		UnitPrice:     fmt.Sprintf("%.2f", item.Price),
		CategoryLabel: uc.getContextString(sess, orderingSelectedCategoryIDKey),
	})
	uc.setOrderingCart(sess, cart)
	return cart
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartMessage(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) string {
	if len(cart) == 0 {
		return "🛒 *Seu pedido ainda está vazio.*\n\nEscolha um item para começar."
	}

	itemIDs := make([]uuid.UUID, 0, len(cart))
	for _, entry := range cart {
		id, err := uuid.Parse(strings.TrimSpace(entry.MenuItemID))
		if err == nil {
			itemIDs = append(itemIDs, id)
		}
	}

	menuItemsByID := make(map[string]*menu.Item, len(itemIDs))
	if len(itemIDs) > 0 {
		menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, itemIDs, sess.TenantID)
		if err == nil {
			for _, item := range menuItems {
				if item != nil {
					menuItemsByID[item.ID.String()] = item
				}
			}
		}
	}

	lines := make([]string, 0, len(cart))
	subtotal := 0.0
	for _, entry := range cart {
		quantity := entry.Quantity
		if quantity <= 0 {
			continue
		}

		itemName := strings.TrimSpace(entry.MenuItemName)
		unitPrice := 0.0

		if item := menuItemsByID[entry.MenuItemID]; item != nil {
			itemName = item.Name
			unitPrice = item.Price
		} else {
			unitPrice = parseOrderingFloatValue(entry.UnitPrice)
		}

		if itemName == "" {
			itemName = "Item"
		}

		lineTotal := unitPrice * float64(quantity)
		subtotal += lineTotal
		lines = append(lines, fmt.Sprintf("• %dx %s — R$ %s", quantity, itemName, formatBRLCurrency(lineTotal)))
	}

	if len(lines) == 0 {
		return "🛒 *Seu pedido ainda está vazio.*\n\nEscolha um item para começar."
	}

	return fmt.Sprintf(
		"🛒 *Seu pedido*\n\n%s\n\nSubtotal parcial: *R$ %s*\n\nDeseja adicionar mais itens ou enviar agora?",
		strings.Join(lines, "\n"),
		formatBRLCurrency(subtotal),
	)
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartOrderInput(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) ([]OrderItemInput, error) {
	inputs := make([]OrderItemInput, 0, len(cart))
	for _, entry := range cart {
		itemID, err := uuid.Parse(strings.TrimSpace(entry.MenuItemID))
		if err != nil || entry.Quantity <= 0 {
			continue
		}

		menuItem, err := uc.menuRepo.FindItemByID(ctx, itemID, sess.TenantID)
		if err != nil || menuItem == nil {
			return nil, fmt.Errorf("menu item not found for cart entry %s", entry.MenuItemID)
		}

		inputs = append(inputs, OrderItemInput{
			MenuItemID:   menuItem.ID,
			Quantity:     entry.Quantity,
			Observations: strings.TrimSpace(entry.Observations),
		})
	}

	if len(inputs) == 0 {
		return nil, fmt.Errorf("empty ordering cart")
	}

	return inputs, nil
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartItemsSummary(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) string {
	itemIDs := make([]uuid.UUID, 0, len(cart))
	for _, entry := range cart {
		id, err := uuid.Parse(strings.TrimSpace(entry.MenuItemID))
		if err == nil {
			itemIDs = append(itemIDs, id)
		}
	}

	menuItemsByID := make(map[string]*menu.Item, len(itemIDs))
	if len(itemIDs) > 0 {
		menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, itemIDs, sess.TenantID)
		if err == nil {
			for _, item := range menuItems {
				if item != nil {
					menuItemsByID[item.ID.String()] = item
				}
			}
		}
	}

	lines := make([]string, 0, len(cart))
	for _, entry := range cart {
		if entry.Quantity <= 0 {
			continue
		}
		itemName := strings.TrimSpace(entry.MenuItemName)
		if item := menuItemsByID[entry.MenuItemID]; item != nil {
			itemName = item.Name
		}
		if itemName == "" {
			itemName = "Item"
		}
		lines = append(lines, fmt.Sprintf("• %dx %s", entry.Quantity, itemName))
	}
	return strings.Join(lines, "\n")
}

func waitForOrderingPreview(ctx context.Context) {
	if orderingPreviewDelay <= 0 {
		return
	}

	timer := time.NewTimer(orderingPreviewDelay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}

func (uc *HandleWhatsAppMessageUseCase) sendOrderingItemImagePreview(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	item *menu.Item,
) bool {
	if item == nil {
		uc.logger.Debug("skipping item preview image: item is nil")
		return false
	}

	imageURL := strings.TrimSpace(item.ImageURL)
	if imageURL == "" {
		uc.logger.Debug("skipping item preview image: item has no image URL",
			zap.String("tenant_id", tenantID.String()),
			zap.String("item_id", item.ID.String()),
			zap.String("item_name", item.Name),
		)
		return false
	}

	caption := fmt.Sprintf("%s\nR$ %s", item.Name, formatBRLCurrency(item.Price))
	if description := parseOrderingOptionalString(item.WhatsAppShortDescription); description != "" {
		caption += "\n" + truncateInteractiveDescription(description)
	} else if description := parseOrderingOptionalString(item.Description); description != "" {
		caption += "\n" + truncateInteractiveDescription(description)
	}

	uc.logger.Debug("sending item preview image",
		zap.String("tenant_id", tenantID.String()),
		zap.String("item_id", item.ID.String()),
		zap.String("to", to),
		zap.String("image_url", imageURL),
	)

	messageID, err := uc.sender.SendImage(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		imageURL,
		caption,
	)
	if err != nil {
		uc.logger.Warn("failed to send item preview image",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("item_id", item.ID.String()),
		)
		return false
	}

	uc.logger.Debug("item preview image sent",
		zap.String("tenant_id", tenantID.String()),
		zap.String("item_id", item.ID.String()),
		zap.String("message_id", messageID),
	)

	return true
}

func (uc *HandleWhatsAppMessageUseCase) sendOrderingCategoryImagePreview(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	category *menu.Category,
	items []*menu.Item,
) bool {
	imageURL := ""
	if category != nil {
		imageURL = strings.TrimSpace(category.ImageURL)
	}
	if imageURL == "" {
		for _, item := range items {
			if item == nil {
				continue
			}
			if candidate := strings.TrimSpace(item.ImageURL); candidate != "" {
				imageURL = candidate
				break
			}
		}
	}
	if imageURL == "" {
		uc.logger.Debug("skipping category preview image: no image URL available",
			zap.String("tenant_id", tenantID.String()),
		)
		return false
	}

	categoryName := "Cardápio"
	if category != nil && strings.TrimSpace(category.Name) != "" {
		categoryName = strings.TrimSpace(category.Name)
	}

	caption := fmt.Sprintf("🍽️ %s", categoryName)
	if category != nil {
		if description := parseOrderingOptionalString(category.Description); description != "" {
			caption += "\n" + truncateInteractiveDescription(description)
		}
	}

	uc.logger.Debug("sending category preview image",
		zap.String("tenant_id", tenantID.String()),
		zap.String("category_name", categoryName),
		zap.String("to", to),
		zap.String("image_url", imageURL),
	)

	messageID, err := uc.sender.SendImage(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		imageURL,
		caption,
	)
	if err != nil {
		uc.logger.Warn("failed to send category preview image",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("category_name", categoryName),
		)
		return false
	}

	uc.logger.Debug("category preview image sent",
		zap.String("tenant_id", tenantID.String()),
		zap.String("category_name", categoryName),
		zap.String("message_id", messageID),
	)

	return true
}

func parseOrderingIntValue(value interface{}) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(typed))
		return n
	default:
		n, _ := strconv.Atoi(strings.TrimSpace(fmt.Sprintf("%v", typed)))
		return n
	}
}

func parseOrderingFloatValue(raw string) float64 {
	value, _ := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	return value
}

func buildQuantityButtons() []whatsapp.InteractiveButton {
	quantities := []struct {
		ID    string
		Title string
	}{
		{ID: orderingQuantityPrefix + "1", Title: "1 unidade"},
		{ID: orderingQuantityPrefix + "2", Title: "2 unidades"},
		{ID: orderingQuantityPrefix + "3", Title: "3 unidades"},
	}

	buttons := make([]whatsapp.InteractiveButton, 0, len(quantities))
	for _, quantity := range quantities {
		buttons = append(buttons, whatsapp.InteractiveButton{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: quantity.ID, Title: quantity.Title},
		})
	}
	return buttons
}

func buildOrderConfirmationButtons() []whatsapp.InteractiveButton {
	return []whatsapp.InteractiveButton{
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: orderingConfirmOrderID, Title: "✅ Enviar pedido"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: orderingChangeItemID, Title: "➕ Adicionar mais"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: orderingBackToMenuID, Title: "◂ Menu principal"},
		},
	}
}

func truncateInteractiveTitle(value string) string {
	return truncateInteractiveText(value, 24)
}

func truncateInteractiveDescription(value string) string {
	return truncateInteractiveText(value, 72)
}

func truncateInteractiveText(value string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= maxRunes {
		return string(runes)
	}
	if maxRunes <= 3 {
		return string(runes[:maxRunes])
	}
	return string(runes[:maxRunes-3]) + "..."
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
	tenantObj, _ := uc.tenantRepo.FindByID(ctx, sess.TenantID)
	restaurantName := ""
	msgs := tenant.MessageTemplates{}
	serviceFeePercent := 10.0
	if tenantObj != nil {
		restaurantName = tenantObj.Name
		msgs = tenantObj.Settings.Messages
		if tenantObj.Settings.ServiceFeePercent > 0 {
			serviceFeePercent = tenantObj.Settings.ServiceFeePercent
		}
	}
	tableCode := uc.resolveTabTableCode(ctx, sess.TenantID, userTab)
	message := whatsapp.TabSummaryMessage(
		restaurantName,
		tableCode,
		items,
		serviceFeePercent,
		userTab.Subtotal,
		userTab.ServiceFee,
		userTab.Total,
		msgs,
	)

	if err := uc.sendClosingTabOptions(ctx, sess.UserPhone, sess.TenantID, restaurantName, message); err == nil {
		return "", session.StateClosingTab, nil
	}

	return buildClosingTabTextFallback(message), session.StateClosingTab, nil
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
		return buildClosingTabInvalidOptionMessage(),
			session.StateClosingTab, nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) sendClosingTabOptions(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	restaurantName string,
	tabSummary string,
) error {
	body := "💰 *Fechar Conta*\n\n" + tabSummary + "\n\nComo você prefere finalizar?"
	decoratedBody := whatsapp.WithRestaurantHeader(restaurantName, body)

	_, err := uc.sender.SendInteractiveButtons(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		decoratedBody,
		buildClosingTabButtons(),
	)
	if err != nil {
		uc.logger.Warn("failed to send close tab interactive options",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("to", to),
		)
	}
	return err
}

func buildClosingTabButtons() []whatsapp.InteractiveButton {
	return []whatsapp.InteractiveButton{
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: "1", Title: "Pagar celular"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: "2", Title: "Chamar equipe"},
		},
		{
			Type: "reply",
			Reply: struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}{ID: "0", Title: "Menu"},
		},
	}
}

func buildClosingTabTextFallback(tabSummary string) string {
	return "💰 *Fechar Conta*\n\n" + tabSummary + "\n\n" +
		"Como você prefere finalizar?\n" +
		"*1* - 💳 Pagar agora pelo celular\n" +
		"*2* - 🙋 Pedir para a equipe fechar na mesa\n\n" +
		"_Digite 0 para voltar ao menu_"
}

func buildClosingTabInvalidOptionMessage() string {
	return "❌ Opção inválida.\n\n*1* - 💳 Pagar agora pelo celular\n*2* - 🙋 Pedir para a equipe fechar na mesa\n\n_Digite 0 para voltar ao menu_"
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

	if o.BatchID != nil && *o.BatchID != uuid.Nil {
		id := strings.TrimSpace(o.BatchID.String())
		if len(id) <= 4 {
			return id
		}
		return id[len(id)-4:]
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
	tenantObj, _ := uc.tenantRepo.FindByID(ctx, sess.TenantID)
	restaurantName := ""
	msgs := tenant.MessageTemplates{}
	serviceFeePercent := 10.0
	if tenantObj != nil {
		restaurantName = tenantObj.Name
		msgs = tenantObj.Settings.Messages
		if tenantObj.Settings.ServiceFeePercent > 0 {
			serviceFeePercent = tenantObj.Settings.ServiceFeePercent
		}
	}

	if userTab == nil {
		if isCloseFlow {
			return "💰 *Fechar Conta*\n\nAinda não há itens na comanda.\n\n_Digite 0 para voltar ao menu_",
				session.StateViewingTab, nil
		}
		tableCode := uc.resolveLatestApprovedTableCode(ctx, sess)
		return whatsapp.TabSummaryMenuMessage(
				restaurantName,
				tableCode,
				[]string{},
				serviceFeePercent,
				0,
				0,
				0,
				msgs,
			),
			session.StateViewingTab, nil
	}

	items := uc.buildTabItemsList(ctx, sess.TenantID, userTab.ID)
	tableCode := uc.resolveTabTableCode(ctx, sess.TenantID, userTab)
	bodyMessage := whatsapp.TabSummaryMessage(
		restaurantName,
		tableCode,
		items,
		serviceFeePercent,
		userTab.Subtotal,
		userTab.ServiceFee,
		userTab.Total,
		msgs,
	)
	message := whatsapp.TabSummaryMenuMessage(
		restaurantName,
		tableCode,
		items,
		serviceFeePercent,
		userTab.Subtotal,
		userTab.ServiceFee,
		userTab.Total,
		msgs,
	)

	if isCloseFlow {
		message = "💰 *Fechar Conta*\n\n" + bodyMessage + "\n\n" +
			"Para encerrar a conta, solicite nossa equipe.\n\n_Digite 0 para voltar ao menu_"
		return message, session.StateViewingTab, nil
	}

	return message, session.StateViewingTab, nil
}

func (uc *HandleWhatsAppMessageUseCase) resolveLatestApprovedTableCode(
	ctx context.Context,
	sess *session.Session,
) string {
	if sess == nil {
		return ""
	}
	if sess.TableID != nil {
		if t, err := uc.tableRepo.FindByID(ctx, *sess.TableID, sess.TenantID); err == nil && t != nil {
			return formatTableNumberForDisplay(t.Number)
		}
	}

	latestReq, err := uc.tableRepo.FindLatestApprovedRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
	if err != nil || latestReq == nil || latestReq.TableID == nil {
		return ""
	}

	t, err := uc.tableRepo.FindByID(ctx, *latestReq.TableID, sess.TenantID)
	if err != nil || t == nil {
		return ""
	}
	return formatTableNumberForDisplay(t.Number)
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

		label := fmt.Sprintf("%dx %s", agg.Quantity, name)
		label = truncateTabSummaryLabel(label, 24)
		padding := 26 - utf8.RuneCountInString(label)
		if padding < 2 {
			padding = 2
		}

		lines = append(lines, fmt.Sprintf("%s%sR$ %s", label, strings.Repeat(" ", padding), formatBRLCurrency(agg.Total)))
	}

	return lines
}

func formatBRLCurrency(value float64) string {
	return strings.ReplaceAll(fmt.Sprintf("%.2f", value), ".", ",")
}

func truncateTabSummaryLabel(value string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}

	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= maxRunes {
		return string(runes)
	}
	if maxRunes <= 3 {
		return string(runes[:maxRunes])
	}
	return string(runes[:maxRunes-3]) + "..."
}
