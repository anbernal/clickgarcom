package application

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
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
	orderingSelectedCartItemIDKey = "ordering_selected_cart_item_id"
	orderingSelectedQuantityKey   = "ordering_selected_quantity"
	orderingOptionGroupIndexKey   = "ordering_option_group_index"
	orderingOptionSelectionsKey   = "ordering_option_selections"
	orderingCartKey               = "ordering_cart"

	orderingCategoryPrefix    = "menu:category:"
	orderingItemPrefix        = "menu:item:"
	orderingQuantityPrefix    = "qty:"
	orderingOptionPrefix      = "opt:"
	orderingConfirmOrderID    = "order:confirm"
	orderingChangeItemID      = "order:change_item"
	orderingRemoveItemID      = "order:remove_item"
	orderingRemoveItemKey     = "order:remove_item:"
	orderingIncreaseOneUnitID = "order:increase_one"
	orderingRemoveOneUnitID   = "order:remove_one"
	orderingSetQuantityID     = "order:set_quantity"
	orderingCartQtyPrefix     = "order:set_qty:"
	orderingRemoveAllUnitsID  = "order:remove_all"
	orderingBackToCartID      = "order:back_cart"
	orderingBackToMenuID      = "order:menu"
	orderingOptionContinueID  = "opt:continue"
	orderingOptionSkipID      = "opt:skip"
	checkoutAccessScope       = "checkout_public"
)

var orderingPreviewDelay = 1200 * time.Millisecond

type checkoutAccessClaims struct {
	Scope      string `json:"scope"`
	TabID      string `json:"tab_id"`
	OwnerPhone string `json:"owner_phone"`
	jwt.RegisteredClaims
}

type orderingCartItem struct {
	LineID          string                   `json:"line_id"`
	MenuItemID      string                   `json:"menu_item_id"`
	Quantity        int                      `json:"quantity"`
	Observations    string                   `json:"observations,omitempty"`
	MenuItemName    string                   `json:"menu_item_name,omitempty"`
	UnitPrice       string                   `json:"unit_price,omitempty"`
	CategoryLabel   string                   `json:"category_label,omitempty"`
	SelectedOptions []orderingSelectedOption `json:"selected_options,omitempty"`
}

type orderingSelectedOption struct {
	GroupName  string  `json:"group_name"`
	OptionName string  `json:"option_name"`
	PriceDelta float64 `json:"price_delta"`
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
		return uc.repeatCurrentPrompt(ctx, sess)
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
		return uc.repeatCurrentPrompt(ctx, sess)
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

	if !selectedItem.IsAvailableAt(time.Now()) {
		detail := ""
		if strings.TrimSpace(selectedItem.UnavailableReason) != "" {
			detail = "\nMotivo: " + selectedItem.UnavailableReason + "."
		}
		return fmt.Sprintf("⚠️ O item *%s* não está disponível agora.%s\n\nEscolha outro item ou digite *0* para voltar ao menu principal.", selectedItem.Name, detail),
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
	if response, newState, blocked, err := uc.guardMainMenuAccess(ctx, sess); err != nil {
		return "", "", err
	} else if blocked {
		return response, newState, nil
	}

	switch text {
	case mainMenuOpenActionID:
		return whatsapp.MainMenuMessage(), session.StateMainMenu, nil
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
		return uc.repeatCurrentPrompt(ctx, sess)
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

func (uc *HandleWhatsAppMessageUseCase) sendOrderingOptionGroupMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	item *menu.Item,
	group menu.OptionGroup,
	currentSelections []orderingSelectedOption,
	notice string,
) error {
	if len(group.Options) == 0 || len(group.Options) > 10 {
		return fmt.Errorf("interactive option menu unavailable for %d options", len(group.Options))
	}

	rows := make([]whatsapp.InteractiveListRow, 0, len(group.Options))
	for index, option := range group.Options {
		description := strings.TrimSpace(option.Description)
		if description == "" {
			description = "Selecionar opcao"
		}
		if option.PriceDelta > 0 {
			description += fmt.Sprintf(" · +R$ %s", formatBRLCurrency(option.PriceDelta))
		}
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingOptionPrefix + strconv.Itoa(index+1),
			Title:       truncateInteractiveTitle(option.Name),
			Description: truncateInteractiveDescription(description),
		})
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		buildOrderingOptionGroupHeader(item, group, currentSelections, notice),
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Ver opcoes",
		[]whatsapp.InteractiveListSection{{Title: truncateInteractiveTitle(group.Name), Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingOptionGroupFallback(
	item *menu.Item,
	group menu.OptionGroup,
	currentSelections []orderingSelectedOption,
	notice string,
) string {
	lines := []string{buildOrderingOptionGroupHeader(item, group, currentSelections, notice), ""}
	for index, option := range group.Options {
		label := fmt.Sprintf("*%d* - %s", index+1, option.Name)
		if option.PriceDelta > 0 {
			label += fmt.Sprintf(" (+R$ %s)", formatBRLCurrency(option.PriceDelta))
		}
		if description := strings.TrimSpace(option.Description); description != "" {
			label += " · " + description
		}
		lines = append(lines, label)
	}

	lines = append(lines, "")
	lines = append(lines, orderingOptionActionHint(group, len(currentSelections)))
	return strings.Join(lines, "\n")
}

func buildOrderingOptionGroupHeader(
	item *menu.Item,
	group menu.OptionGroup,
	currentSelections []orderingSelectedOption,
	notice string,
) string {
	sections := make([]string, 0, 5)
	if trimmedNotice := strings.TrimSpace(notice); trimmedNotice != "" {
		sections = append(sections, trimmedNotice)
	}
	sections = append(sections, fmt.Sprintf("➕ *%s*", item.Name))
	sections = append(sections, fmt.Sprintf("Grupo: *%s*", group.Name))
	if description := strings.TrimSpace(group.Description); description != "" {
		sections = append(sections, description)
	}
	if len(currentSelections) > 0 {
		sections = append(sections, "Ja escolhidos: "+buildOrderingSelectedOptionsSummary(currentSelections))
	}
	sections = append(sections, orderingOptionSelectionRule(group, len(currentSelections)))
	return strings.Join(sections, "\n\n")
}

func orderingOptionSelectionRule(group menu.OptionGroup, currentCount int) string {
	parts := make([]string, 0, 2)
	if group.MinSelect > 0 {
		parts = append(parts, fmt.Sprintf("Escolha no minimo %d opcao(oes).", group.MinSelect))
	} else {
		parts = append(parts, "Esse grupo e opcional.")
	}
	parts = append(parts, fmt.Sprintf("Limite: %d opcao(oes). Ja escolhidas: %d.", group.MaxSelect, currentCount))
	return strings.Join(parts, " ")
}

func orderingOptionActionHint(group menu.OptionGroup, currentCount int) string {
	parts := []string{"Escolha uma opcao pelo numero ou pela lista."}
	if currentCount >= group.MinSelect {
		parts = append(parts, "Digite *ok* para continuar.")
	}
	if group.MinSelect == 0 {
		parts = append(parts, "Digite *pular* para seguir sem selecionar.")
	}
	parts = append(parts, "_Digite 0 para voltar ao menu principal_")
	return strings.Join(parts, " ")
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

func (uc *HandleWhatsAppMessageUseCase) presentOrderingOptionGroup(
	ctx context.Context,
	sess *session.Session,
	item *menu.Item,
	group menu.OptionGroup,
	allSelections []orderingSelectedOption,
	notice string,
) (string, session.ConversationState, error) {
	groupSelections := filterOrderingSelectedOptionsByGroup(allSelections, group.Name)
	decoratedNotice := strings.TrimSpace(notice)
	if summary := buildOrderingSelectedOptionsSummary(allSelections); summary != "" && len(allSelections) > len(groupSelections) {
		if decoratedNotice != "" {
			decoratedNotice += "\n\n"
		}
		decoratedNotice += "Resumo atual: " + summary
	}

	if err := uc.sendOrderingOptionGroupMenu(ctx, sess.UserPhone, sess.TenantID, item, group, groupSelections, decoratedNotice); err == nil {
		return "", session.StateSelectingOptions, nil
	}

	return uc.buildOrderingOptionGroupFallback(item, group, groupSelections, decoratedNotice), session.StateSelectingOptions, nil
}

func (uc *HandleWhatsAppMessageUseCase) buildCartConfirmationFallback(cartBody string) string {
	return strings.TrimSpace(cartBody) + "\n\n*1* - ✅ Enviar pedido\n*2* - ➕ Adicionar mais itens\n*3* - 🛠 Ajustar um item\n*0* - ◂ Menu principal"
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
		orderingSelectedCartItemIDKey,
		orderingSelectedQuantityKey,
		orderingOptionGroupIndexKey,
		orderingOptionSelectionsKey,
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
		orderingSelectedCartItemIDKey,
		orderingSelectedQuantityKey,
		orderingOptionGroupIndexKey,
		orderingOptionSelectionsKey,
	} {
		delete(sess.Context, key)
	}
}

func (uc *HandleWhatsAppMessageUseCase) getOrderingOptionGroupIndex(sess *session.Session) int {
	if sess == nil {
		return 0
	}
	value, ok := sess.GetContext(orderingOptionGroupIndexKey)
	if !ok || value == nil {
		return 0
	}

	index := parseOrderingIntValue(value)
	if index < 0 {
		return 0
	}
	return index
}

func (uc *HandleWhatsAppMessageUseCase) setOrderingOptionGroupIndex(sess *session.Session, index int) {
	if sess == nil {
		return
	}
	if index < 0 {
		index = 0
	}
	sess.SetContext(orderingOptionGroupIndexKey, index)
}

func (uc *HandleWhatsAppMessageUseCase) getOrderingOptionSelections(sess *session.Session) []orderingSelectedOption {
	if sess == nil {
		return nil
	}
	value, ok := sess.GetContext(orderingOptionSelectionsKey)
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []orderingSelectedOption:
		return append([]orderingSelectedOption(nil), typed...)
	case []interface{}:
		return parseOrderingSelectedOptions(typed)
	default:
		return nil
	}
}

func (uc *HandleWhatsAppMessageUseCase) setOrderingOptionSelections(sess *session.Session, options []orderingSelectedOption) {
	if sess == nil || sess.Context == nil {
		return
	}
	if len(options) == 0 {
		delete(sess.Context, orderingOptionSelectionsKey)
		sess.UpdatedAt = time.Now()
		return
	}
	sess.SetContext(orderingOptionSelectionsKey, options)
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

func parseOrderingSelectedOptions(raw interface{}) []orderingSelectedOption {
	switch typed := raw.(type) {
	case []orderingSelectedOption:
		return append([]orderingSelectedOption(nil), typed...)
	case []interface{}:
		options := make([]orderingSelectedOption, 0, len(typed))
		for _, entry := range typed {
			row, ok := entry.(map[string]interface{})
			if !ok {
				continue
			}
			groupName := parseOrderingOptionalString(row["group_name"])
			optionName := parseOrderingOptionalString(row["option_name"])
			priceDelta := parseOrderingFloatValue(row["price_delta"])
			if groupName == "" || optionName == "" || priceDelta < 0 {
				continue
			}
			options = append(options, orderingSelectedOption{
				GroupName:  groupName,
				OptionName: optionName,
				PriceDelta: priceDelta,
			})
		}
		return options
	default:
		return nil
	}
}

func filterOrderingSelectedOptionsByGroup(options []orderingSelectedOption, groupName string) []orderingSelectedOption {
	if len(options) == 0 {
		return nil
	}

	lookup := strings.TrimSpace(strings.ToLower(groupName))
	if lookup == "" {
		return nil
	}

	filtered := make([]orderingSelectedOption, 0, len(options))
	for _, option := range options {
		if strings.TrimSpace(strings.ToLower(option.GroupName)) != lookup {
			continue
		}
		filtered = append(filtered, option)
	}
	return filtered
}

func orderingSelectedOptionSignature(options []orderingSelectedOption) string {
	if len(options) == 0 {
		return ""
	}

	parts := make([]string, 0, len(options))
	for _, option := range options {
		groupName := strings.TrimSpace(strings.ToLower(option.GroupName))
		optionName := strings.TrimSpace(strings.ToLower(option.OptionName))
		if groupName == "" || optionName == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s:%s:%.2f", groupName, optionName, option.PriceDelta))
	}
	sort.Strings(parts)
	return strings.Join(parts, "|")
}

func buildOrderingSelectedOptionsSummary(options []orderingSelectedOption) string {
	if len(options) == 0 {
		return ""
	}

	parts := make([]string, 0, len(options))
	for _, option := range options {
		label := strings.TrimSpace(option.GroupName) + ": " + strings.TrimSpace(option.OptionName)
		if option.PriceDelta > 0 {
			label += fmt.Sprintf(" (+R$ %s)", formatBRLCurrency(option.PriceDelta))
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, ", ")
}

func orderingSelectedOptionsTotal(options []orderingSelectedOption) float64 {
	total := 0.0
	for _, option := range options {
		if option.PriceDelta > 0 {
			total += option.PriceDelta
		}
	}
	return total
}

func resolveOrderingOptionSelections(group menu.OptionGroup, text string) ([]orderingSelectedOption, error) {
	tokens := splitOrderingOptionSelectionTokens(text)
	if len(tokens) == 0 {
		return nil, fmt.Errorf("nenhuma opção foi informada")
	}

	resolved := make([]orderingSelectedOption, 0, len(tokens))
	seen := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		option, err := resolveOrderingOptionToken(group, token)
		if err != nil {
			return nil, err
		}
		if !option.Available {
			return nil, fmt.Errorf("a opção %s não está disponível agora", option.Name)
		}

		key := strings.TrimSpace(strings.ToLower(option.Name))
		if _, exists := seen[key]; exists {
			return nil, fmt.Errorf("a opção %s foi informada mais de uma vez", option.Name)
		}
		seen[key] = struct{}{}

		resolved = append(resolved, orderingSelectedOption{
			GroupName:  group.Name,
			OptionName: option.Name,
			PriceDelta: option.PriceDelta,
		})
	}

	return resolved, nil
}

func splitOrderingOptionSelectionTokens(text string) []string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}

	parts := strings.FieldsFunc(trimmed, func(r rune) bool {
		switch r {
		case ',', ';', '\n':
			return true
		default:
			return false
		}
	})

	if len(parts) == 0 {
		return nil
	}

	tokens := make([]string, 0, len(parts))
	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

func resolveOrderingOptionToken(group menu.OptionGroup, token string) (menu.Option, error) {
	value := strings.TrimSpace(token)
	if value == "" {
		return menu.Option{}, fmt.Errorf("opção vazia")
	}

	if strings.HasPrefix(strings.ToLower(value), orderingOptionPrefix) {
		value = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(value), orderingOptionPrefix))
	}

	if index, err := strconv.Atoi(value); err == nil {
		if index < 1 || index > len(group.Options) {
			return menu.Option{}, fmt.Errorf("a opção %d não existe no grupo %s", index, group.Name)
		}
		return group.Options[index-1], nil
	}

	lookup := strings.TrimSpace(strings.ToLower(value))
	for _, option := range group.Options {
		if strings.TrimSpace(strings.ToLower(option.Name)) == lookup {
			return option, nil
		}
	}

	return menu.Option{}, fmt.Errorf("não encontrei a opção %s no grupo %s", value, group.Name)
}

func toOrderSelectedOptions(options []orderingSelectedOption) []order.SelectedOption {
	if len(options) == 0 {
		return nil
	}

	converted := make([]order.SelectedOption, 0, len(options))
	for _, option := range options {
		groupName := strings.TrimSpace(option.GroupName)
		optionName := strings.TrimSpace(option.OptionName)
		if groupName == "" || optionName == "" || option.PriceDelta < 0 {
			continue
		}
		converted = append(converted, order.SelectedOption{
			GroupName:  groupName,
			OptionName: optionName,
			PriceDelta: option.PriceDelta,
		})
	}
	return converted
}

func toOrderingSelectedOptions(options []order.SelectedOption) []orderingSelectedOption {
	if len(options) == 0 {
		return nil
	}

	converted := make([]orderingSelectedOption, 0, len(options))
	for _, option := range options {
		groupName := strings.TrimSpace(option.GroupName)
		optionName := strings.TrimSpace(option.OptionName)
		if groupName == "" || optionName == "" || option.PriceDelta < 0 {
			continue
		}
		converted = append(converted, orderingSelectedOption{
			GroupName:  groupName,
			OptionName: optionName,
			PriceDelta: option.PriceDelta,
		})
	}
	return converted
}

func (uc *HandleWhatsAppMessageUseCase) advanceOrderingOptionSelection(
	ctx context.Context,
	sess *session.Session,
	item *menu.Item,
	groups []menu.OptionGroup,
	currentIndex int,
	allSelections []orderingSelectedOption,
	notice string,
) (string, session.ConversationState, error) {
	if currentIndex+1 < len(groups) {
		uc.setOrderingOptionGroupIndex(sess, currentIndex+1)
		uc.setOrderingOptionSelections(sess, allSelections)
		return uc.presentOrderingOptionGroup(ctx, sess, item, groups[currentIndex+1], allSelections, notice)
	}

	quantityRaw, ok := sess.GetContext(orderingSelectedQuantityKey)
	if !ok || quantityRaw == nil {
		uc.clearOrderingSelectionContext(sess)
		return uc.startOrderingFlow(ctx, sess)
	}

	quantity, err := orderingQuantityFromContext(quantityRaw)
	if err != nil || quantity < 1 {
		uc.clearOrderingSelectionContext(sess)
		return uc.startOrderingFlow(ctx, sess)
	}

	unitPrice := item.Price + orderingSelectedOptionsTotal(allSelections)
	cart := uc.addItemToOrderingCart(sess, item, quantity, allSelections, unitPrice)

	finalNotice := strings.TrimSpace(notice)
	if finalNotice == "" {
		finalNotice = fmt.Sprintf(
			"✅ Adicionei *%d unidade%s* de *%s* ao carrinho.",
			quantity,
			pluralSuffix(quantity),
			item.Name,
		)
	}
	cartMessage := uc.buildOrderingCartMessageWithNotice(ctx, sess, cart, finalNotice)
	uc.clearOrderingSelectionContext(sess)
	return uc.presentCartConfirmation(ctx, sess, cartMessage)
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

	hints := make([]string, 0, 2)
	if item.NormalizedItemType() == menu.ItemTypeCombo && len(item.EnsureComboComponents()) > 0 {
		hints = append(hints, "combo")
	}
	if len(item.EnsureOptionGroups()) > 0 {
		hints = append(hints, "extras")
	}

	if len(hints) > 0 {
		description = description + " · " + strings.Join(hints, " + ")
	}

	return fmt.Sprintf("R$ %s · %s", formatBRLCurrency(item.Price), description)
}

func orderingItemDetail(item *menu.Item) string {
	if item == nil {
		return ""
	}
	description := strings.TrimSpace(item.Description)
	if description == "" {
		description = "Escolha quantas unidades deseja pedir."
	}

	if item.NormalizedItemType() == menu.ItemTypeCombo {
		if summary := orderingComboSummary(item); summary != "" {
			description += "\n\n🎁 " + summary
		}
	}

	if len(item.EnsureOptionGroups()) > 0 {
		description += "\n\n➕ Possui adicionais cadastrados no cardápio."
	}
	return description
}

func orderingComboSummary(item *menu.Item) string {
	if item == nil {
		return ""
	}

	components := item.EnsureComboComponents()
	if len(components) == 0 {
		return ""
	}

	parts := make([]string, 0, len(components))
	for _, component := range components {
		name := strings.TrimSpace(component.MenuItemName)
		if name == "" {
			continue
		}
		if component.Quantity > 1 {
			parts = append(parts, fmt.Sprintf("%dx %s", component.Quantity, name))
			continue
		}
		parts = append(parts, name)
	}

	if len(parts) == 0 {
		return ""
	}

	return "Inclui " + strings.Join(parts, ", ")
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
				LineID:          parseOrderingOptionalString(entry["line_id"]),
				MenuItemID:      strings.TrimSpace(fmt.Sprintf("%v", entry["menu_item_id"])),
				Quantity:        parseOrderingIntValue(entry["quantity"]),
				Observations:    strings.TrimSpace(fmt.Sprintf("%v", entry["observations"])),
				MenuItemName:    strings.TrimSpace(fmt.Sprintf("%v", entry["menu_item_name"])),
				UnitPrice:       strings.TrimSpace(fmt.Sprintf("%v", entry["unit_price"])),
				CategoryLabel:   strings.TrimSpace(fmt.Sprintf("%v", entry["category_label"])),
				SelectedOptions: parseOrderingSelectedOptions(entry["selected_options"]),
			})
		}
		for index := range cart {
			if strings.TrimSpace(cart[index].LineID) == "" {
				cart[index].LineID = fmt.Sprintf("legacy-%d-%s", index+1, strings.TrimSpace(cart[index].MenuItemID))
			}
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
	if len(cart) == 0 {
		if sess.Context != nil {
			delete(sess.Context, orderingCartKey)
			sess.UpdatedAt = time.Now()
		}
		return
	}
	sess.SetContext(orderingCartKey, cart)
}

func (uc *HandleWhatsAppMessageUseCase) addItemToOrderingCart(
	sess *session.Session,
	item *menu.Item,
	quantity int,
	selectedOptions []orderingSelectedOption,
	unitPrice float64,
) []orderingCartItem {
	cart := uc.getOrderingCart(sess)
	if item == nil || quantity <= 0 {
		return cart
	}

	signature := orderingSelectedOptionSignature(selectedOptions)
	for index := range cart {
		if cart[index].MenuItemID != item.ID.String() {
			continue
		}
		if orderingSelectedOptionSignature(cart[index].SelectedOptions) != signature {
			continue
		}
		cart[index].Quantity += quantity
		if strings.TrimSpace(cart[index].MenuItemName) == "" {
			cart[index].MenuItemName = item.Name
		}
		if strings.TrimSpace(cart[index].UnitPrice) == "" {
			cart[index].UnitPrice = fmt.Sprintf("%.2f", unitPrice)
		}
		cart[index].SelectedOptions = append([]orderingSelectedOption(nil), selectedOptions...)
		uc.setOrderingCart(sess, cart)
		return cart
	}

	cart = append(cart, orderingCartItem{
		LineID:          uuid.NewString(),
		MenuItemID:      item.ID.String(),
		Quantity:        quantity,
		MenuItemName:    item.Name,
		UnitPrice:       fmt.Sprintf("%.2f", unitPrice),
		CategoryLabel:   uc.getContextString(sess, orderingSelectedCategoryIDKey),
		SelectedOptions: append([]orderingSelectedOption(nil), selectedOptions...),
	})
	uc.setOrderingCart(sess, cart)
	return cart
}

type orderingCartDisplayEntry struct {
	LineID          string
	MenuItemID      string
	Quantity        int
	ItemName        string
	LineTotal       float64
	UnitPrice       float64
	ComboSummary    string
	SelectedOptions []orderingSelectedOption
}

func (uc *HandleWhatsAppMessageUseCase) resolveOrderingCartDisplayEntries(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) ([]orderingCartDisplayEntry, float64) {
	if len(cart) == 0 {
		return nil, 0
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

	entries := make([]orderingCartDisplayEntry, 0, len(cart))
	subtotal := 0.0
	for _, entry := range cart {
		quantity := entry.Quantity
		if quantity <= 0 {
			continue
		}

		itemName := strings.TrimSpace(entry.MenuItemName)
		unitPrice := parseOrderingFloatValue(entry.UnitPrice)

		if item := menuItemsByID[entry.MenuItemID]; item != nil {
			itemName = item.Name
			if unitPrice <= 0 {
				unitPrice = item.Price
			}
			entries = append(entries, orderingCartDisplayEntry{
				LineID:          entry.LineID,
				MenuItemID:      entry.MenuItemID,
				Quantity:        quantity,
				ItemName:        itemName,
				LineTotal:       unitPrice * float64(quantity),
				UnitPrice:       unitPrice,
				ComboSummary:    orderingComboSummary(item),
				SelectedOptions: append([]orderingSelectedOption(nil), entry.SelectedOptions...),
			})
			subtotal += unitPrice * float64(quantity)
			continue
		} else {
			unitPrice = parseOrderingFloatValue(entry.UnitPrice)
		}

		if itemName == "" {
			itemName = "Item"
		}

		lineTotal := unitPrice * float64(quantity)
		subtotal += lineTotal
		entries = append(entries, orderingCartDisplayEntry{
			LineID:          entry.LineID,
			MenuItemID:      entry.MenuItemID,
			Quantity:        quantity,
			ItemName:        itemName,
			LineTotal:       lineTotal,
			UnitPrice:       unitPrice,
			ComboSummary:    "",
			SelectedOptions: append([]orderingSelectedOption(nil), entry.SelectedOptions...),
		})
	}

	return entries, subtotal
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartMessage(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) string {
	return uc.buildOrderingCartMessageWithNotice(ctx, sess, cart, "")
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartMessageWithNotice(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
	notice string,
) string {
	if len(cart) == 0 {
		return "🛒 *Seu pedido ainda está vazio.*\n\nEscolha um item para começar."
	}

	entries, subtotal := uc.resolveOrderingCartDisplayEntries(ctx, sess, cart)
	if len(entries) == 0 {
		return "🛒 *Seu pedido ainda está vazio.*\n\nEscolha um item para começar."
	}

	lines := make([]string, 0, len(entries))
	for index, entry := range entries {
		line := fmt.Sprintf("*%d.* %dx %s — R$ %s", index+1, entry.Quantity, entry.ItemName, formatBRLCurrency(entry.LineTotal))
		if strings.TrimSpace(entry.ComboSummary) != "" {
			line += "\n   • " + entry.ComboSummary
		}
		if optionsSummary := buildOrderingSelectedOptionsSummary(entry.SelectedOptions); optionsSummary != "" {
			line += "\n   + " + optionsSummary
		}
		lines = append(lines, line)
	}

	sections := make([]string, 0, 5)
	if trimmedNotice := strings.TrimSpace(notice); trimmedNotice != "" {
		sections = append(sections, trimmedNotice)
	}
	sections = append(sections,
		"🛒 *Seu pedido*",
		strings.Join(lines, "\n"),
		fmt.Sprintf("Subtotal parcial: *R$ %s*", formatBRLCurrency(subtotal)),
		"Deseja adicionar mais itens, ajustar algum item ou enviar agora?\n\n_Se seu pedido já estiver completo, toque em *Enviar pedido* para finalizar._",
	)

	return strings.Join(sections, "\n\n")
}

func (uc *HandleWhatsAppMessageUseCase) sendCartRemovalMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	sess *session.Session,
	cart []orderingCartItem,
) error {
	entries, _ := uc.resolveOrderingCartDisplayEntries(ctx, sess, cart)
	if len(entries) == 0 || len(entries) > 10 {
		return fmt.Errorf("interactive cart removal unavailable for %d items", len(entries))
	}

	rows := make([]whatsapp.InteractiveListRow, 0, len(entries))
	for index, entry := range entries {
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingRemoveItemKey + entry.LineID,
			Title:       truncateInteractiveTitle(fmt.Sprintf("%d. %s", index+1, entry.ItemName)),
			Description: truncateInteractiveDescription(fmt.Sprintf("%dx · R$ %s", entry.Quantity, formatBRLCurrency(entry.LineTotal))),
		})
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		"🛠 *Ajustar item do pedido*\n\nEscolha qual item você quer ajustar no carrinho.",
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Escolher item",
		[]whatsapp.InteractiveListSection{{Title: "Itens no carrinho", Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) buildOrderingCartRemovalFallback(
	ctx context.Context,
	sess *session.Session,
	cart []orderingCartItem,
) string {
	entries, _ := uc.resolveOrderingCartDisplayEntries(ctx, sess, cart)
	if len(entries) == 0 {
		return "🛒 *Seu pedido ainda está vazio.*\n\nEscolha um item para começar."
	}

	lines := make([]string, 0, len(entries))
	for index, entry := range entries {
		line := fmt.Sprintf("*%d* - %dx %s — R$ %s", index+1, entry.Quantity, entry.ItemName, formatBRLCurrency(entry.LineTotal))
		if strings.TrimSpace(entry.ComboSummary) != "" {
			line += "\n   • " + entry.ComboSummary
		}
		if optionsSummary := buildOrderingSelectedOptionsSummary(entry.SelectedOptions); optionsSummary != "" {
			line += "\n   + " + optionsSummary
		}
		lines = append(lines, line)
	}

	return fmt.Sprintf(
		"🛠 *Ajustar item do pedido*\n\n%s\n\nResponda com o número do item que deseja ajustar.\n\n_Digite 0 para voltar ao carrinho_",
		strings.Join(lines, "\n"),
	)
}

func (uc *HandleWhatsAppMessageUseCase) sendCartRemovalActionMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	entry orderingCartDisplayEntry,
) error {
	rows := buildCartRemovalActionRows(entry.Quantity)
	if len(rows) == 0 || len(rows) > 10 {
		return fmt.Errorf("interactive cart adjustment unavailable for %d actions", len(rows))
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		fmt.Sprintf(
			"🛠 *Ajustar item do pedido*\n\n*%s*\nQuantidade atual: *%dx*\nTotal deste item: *R$ %s*\n\nEscolha como você quer ajustar este item.",
			entry.ItemName,
			entry.Quantity,
			formatBRLCurrency(entry.LineTotal),
		),
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Ver ações",
		[]whatsapp.InteractiveListSection{{Title: "Ações disponíveis", Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) buildCartRemovalActionFallback(entry orderingCartDisplayEntry) string {
	lines := []string{
		"🛠 *Ajustar item do pedido*",
		fmt.Sprintf("*%s*", entry.ItemName),
		fmt.Sprintf("Quantidade atual: *%dx*", entry.Quantity),
		fmt.Sprintf("Total deste item: *R$ %s*", formatBRLCurrency(entry.LineTotal)),
	}

	lines = append(lines, "*1* - ➕ Adicionar 1 unidade")
	if entry.Quantity > 1 {
		lines = append(lines, "*2* - ➖ Remover 1 unidade")
		lines = append(lines, "*3* - 🔢 Alterar quantidade")
		lines = append(lines, "*4* - 🗑 Excluir item")
	} else {
		lines = append(lines, "*2* - 🔢 Alterar quantidade")
		lines = append(lines, "*3* - 🗑 Excluir item")
	}

	lines = append(lines, "*0* - ◂ Voltar ao carrinho")
	return strings.Join(lines, "\n\n")
}

func (uc *HandleWhatsAppMessageUseCase) sendCartQuantitySelectionMenu(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	entry orderingCartDisplayEntry,
) error {
	rows := buildCartQuantitySelectionRows()
	if len(rows) == 0 || len(rows) > 10 {
		return fmt.Errorf("interactive cart quantity selection unavailable for %d quantities", len(rows))
	}

	body := whatsapp.WithRestaurantHeader(
		uc.resolveTenantName(ctx, tenantID),
		fmt.Sprintf(
			"🔢 *Alterar quantidade*\n\n*%s*\nQuantidade atual: *%dx*\n\nEscolha uma quantidade na lista ou digite um número entre *1* e *20*.",
			entry.ItemName,
			entry.Quantity,
		),
	)

	_, err := uc.sender.SendInteractiveList(
		whatsapp.WithTenantID(ctx, tenantID),
		to,
		body,
		"Escolher quantidade",
		[]whatsapp.InteractiveListSection{{Title: "Quantidades", Rows: rows}},
	)
	return err
}

func (uc *HandleWhatsAppMessageUseCase) buildCartQuantitySelectionFallback(entry orderingCartDisplayEntry) string {
	lines := []string{
		"🔢 *Alterar quantidade*",
		fmt.Sprintf("*%s*", entry.ItemName),
		fmt.Sprintf("Quantidade atual: *%dx*", entry.Quantity),
		"",
		"*1* - 1 unidade",
		"*2* - 2 unidades",
		"*3* - 3 unidades",
		"*4* - 4 unidades",
		"*5* - 5 unidades",
		"*6* - 6 unidades",
		"*7* - 7 unidades",
		"*8* - 8 unidades",
		"*9* - 9 unidades",
		"*10* - 10 unidades",
		"",
		"Digite um número entre *1* e *20* para definir a nova quantidade.",
		"_Digite 0 para voltar ao ajuste do item_",
	}

	return strings.Join(lines, "\n")
}

func (uc *HandleWhatsAppMessageUseCase) resolveOrderingCartRemovalSelection(
	sess *session.Session,
	text string,
) (string, bool) {
	text = strings.TrimSpace(text)

	if strings.HasPrefix(text, orderingRemoveItemKey) {
		selectedID := strings.TrimSpace(strings.TrimPrefix(text, orderingRemoveItemKey))
		if selectedID == "" {
			return "", false
		}
		for _, entry := range uc.getOrderingCart(sess) {
			if entry.Quantity <= 0 {
				continue
			}
			if strings.TrimSpace(entry.LineID) == selectedID {
				return selectedID, true
			}
			if strings.TrimSpace(entry.MenuItemID) == selectedID && strings.TrimSpace(entry.LineID) != "" {
				return strings.TrimSpace(entry.LineID), true
			}
		}
		return "", false
	}

	index, err := strconv.Atoi(text)
	if err != nil || index < 1 {
		return "", false
	}

	cart := uc.getOrderingCart(sess)
	if index > len(cart) {
		return "", false
	}

	selected := cart[index-1]
	if selected.Quantity <= 0 || strings.TrimSpace(selected.LineID) == "" {
		return "", false
	}

	return strings.TrimSpace(selected.LineID), true
}

func (uc *HandleWhatsAppMessageUseCase) findOrderingCartItem(
	sess *session.Session,
	lineID string,
) (orderingCartItem, bool) {
	selectedID := strings.TrimSpace(lineID)
	if selectedID == "" {
		return orderingCartItem{}, false
	}

	for _, entry := range uc.getOrderingCart(sess) {
		if strings.TrimSpace(entry.LineID) == selectedID && entry.Quantity > 0 {
			return entry, true
		}
	}

	return orderingCartItem{}, false
}

func (uc *HandleWhatsAppMessageUseCase) removeItemFromOrderingCart(
	sess *session.Session,
	lineID string,
) (orderingCartItem, []orderingCartItem, bool) {
	cart := uc.getOrderingCart(sess)
	selectedID := strings.TrimSpace(lineID)
	if selectedID == "" {
		return orderingCartItem{}, cart, false
	}

	updatedCart := make([]orderingCartItem, 0, len(cart))
	var removed orderingCartItem
	found := false

	for _, entry := range cart {
		if !found && strings.TrimSpace(entry.LineID) == selectedID {
			removed = entry
			found = true
			continue
		}
		updatedCart = append(updatedCart, entry)
	}

	if !found {
		return orderingCartItem{}, cart, false
	}

	uc.setOrderingCart(sess, updatedCart)
	return removed, updatedCart, true
}

func (uc *HandleWhatsAppMessageUseCase) updateOrderingCartItemQuantity(
	sess *session.Session,
	lineID string,
	newQuantity int,
) (orderingCartItem, []orderingCartItem, bool) {
	if newQuantity <= 0 {
		return orderingCartItem{}, uc.getOrderingCart(sess), false
	}

	cart := uc.getOrderingCart(sess)
	selectedID := strings.TrimSpace(lineID)
	if selectedID == "" {
		return orderingCartItem{}, cart, false
	}

	updatedCart := make([]orderingCartItem, 0, len(cart))
	var updated orderingCartItem
	found := false

	for _, entry := range cart {
		if !found && strings.TrimSpace(entry.LineID) == selectedID {
			entry.Quantity = newQuantity
			updated = entry
			found = true
		}
		updatedCart = append(updatedCart, entry)
	}

	if !found {
		return orderingCartItem{}, cart, false
	}

	uc.setOrderingCart(sess, updatedCart)
	return updated, updatedCart, true
}

func (uc *HandleWhatsAppMessageUseCase) resolveOrderingCartDisplayEntry(
	ctx context.Context,
	sess *session.Session,
	lineID string,
) (orderingCartDisplayEntry, bool) {
	entries, _ := uc.resolveOrderingCartDisplayEntries(ctx, sess, uc.getOrderingCart(sess))
	selectedID := strings.TrimSpace(lineID)
	if selectedID == "" {
		return orderingCartDisplayEntry{}, false
	}

	for _, entry := range entries {
		if strings.TrimSpace(entry.LineID) == selectedID {
			return entry, true
		}
	}

	return orderingCartDisplayEntry{}, false
}

func (uc *HandleWhatsAppMessageUseCase) clearOrderingCartAdjustmentContext(sess *session.Session) {
	if sess == nil || sess.Context == nil {
		return
	}
	delete(sess.Context, orderingSelectedCartItemIDKey)
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
			MenuItemID:      menuItem.ID,
			Quantity:        entry.Quantity,
			Observations:    strings.TrimSpace(entry.Observations),
			SelectedOptions: toOrderSelectedOptions(entry.SelectedOptions),
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
		comboSummary := ""
		if item := menuItemsByID[entry.MenuItemID]; item != nil {
			itemName = item.Name
			comboSummary = orderingComboSummary(item)
		}
		if itemName == "" {
			itemName = "Item"
		}
		line := fmt.Sprintf("• %dx %s", entry.Quantity, itemName)
		if comboSummary != "" {
			line += " (" + comboSummary + ")"
		}
		if optionsSummary := buildOrderingSelectedOptionsSummary(entry.SelectedOptions); optionsSummary != "" {
			line += " (" + optionsSummary + ")"
		}
		lines = append(lines, line)
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
	imageURL = uc.resolvePublicImageURL(imageURL)

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
	imageURL = uc.resolvePublicImageURL(imageURL)

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

func parseOrderingFloatValue(raw interface{}) float64 {
	value, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprintf("%v", raw)), 64)
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
			}{ID: orderingRemoveItemID, Title: "🛠 Ajustar item"},
		},
	}
}

func buildCartRemovalActionRows(quantity int) []whatsapp.InteractiveListRow {
	rows := []whatsapp.InteractiveListRow{
		{
			ID:          orderingIncreaseOneUnitID,
			Title:       "Adicionar 1 unidade",
			Description: "Aumenta a quantidade deste item em 1",
		},
	}

	if quantity > 1 {
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingRemoveOneUnitID,
			Title:       "Remover 1 unidade",
			Description: "Reduz a quantidade deste item em 1",
		})
	}

	rows = append(rows,
		whatsapp.InteractiveListRow{
			ID:          orderingSetQuantityID,
			Title:       "Alterar quantidade",
			Description: "Define outro valor para este item",
		},
		whatsapp.InteractiveListRow{
			ID:          orderingRemoveAllUnitsID,
			Title:       "Excluir item",
			Description: "Remove este item inteiro do carrinho",
		},
	)

	return rows
}

func buildCartQuantitySelectionRows() []whatsapp.InteractiveListRow {
	rows := make([]whatsapp.InteractiveListRow, 0, 10)
	for quantity := 1; quantity <= 10; quantity++ {
		rows = append(rows, whatsapp.InteractiveListRow{
			ID:          orderingCartQtyPrefix + strconv.Itoa(quantity),
			Title:       fmt.Sprintf("%d unidade%s", quantity, pluralSuffix(quantity)),
			Description: fmt.Sprintf("Definir quantidade para %d", quantity),
		})
	}
	return rows
}

func pluralSuffix(quantity int) string {
	if quantity == 1 {
		return ""
	}
	return "s"
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
		if uc.findUnauthorizedOpenTabForSession(ctx, sess) != nil {
			return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
		}
		return "💰 *Fechar Conta*\n\nAinda não encontrei uma comanda aberta no seu nome.\n\n_Digite 0 para voltar ao menu_",
			session.StateClosingTab, nil
	}

	if userTab.Total <= userTab.PaidAmount {
		return "✅ Sua conta já está sem valores pendentes no momento.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if !uc.isTabOwnedBySessionPhone(userTab, sess.UserPhone) {
		return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
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

	return uc.buildClosingTabTextFallback(ctx, sess.TenantID, message), session.StateClosingTab, nil
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
			if uc.findUnauthorizedOpenTabForSession(ctx, sess) != nil {
				return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
			}
			return "💰 *Fechar Conta*\n\nNão encontrei uma comanda aberta agora.\n\n" + whatsapp.MainMenuMessage(),
				session.StateMainMenu, nil
		}

		if !uc.isTabOwnedBySessionPhone(userTab, sess.UserPhone) {
			return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
		}

		checkoutBase := uc.resolveCurrentPublicCheckoutBaseURL()
		if checkoutBase == "" || isLocalCheckoutBase(checkoutBase) {
			return buildClosingTabPaymentUnavailableMessage(
					"Ainda não consegui gerar um link público de pagamento para o seu celular.",
				),
				session.StateMainMenu, nil
		}

		accessToken, ttl, err := buildCheckoutAccessToken(userTab.ID.String(), userTab.UserPhone)
		if err != nil {
			uc.logger.Error("failed to sign checkout access token",
				zap.Error(err),
				zap.String("tab_id", userTab.ID.String()),
			)
			return buildClosingTabPaymentUnavailableMessage(
					"Não consegui gerar um link seguro de pagamento agora.",
				),
				session.StateMainMenu, nil
		}

		checkoutURL := buildPublicCheckoutURL(checkoutBase, userTab.ID.String(), accessToken)

		return fmt.Sprintf(
			"💳 *Pagamento pelo celular*\n\nAbra sua comanda neste link seguro:\n%s\n\n_Este link é individual e expira em %s._\n\nSe preferir, responda *2* e a equipe finaliza com você por aqui.\n\n%s",
			checkoutURL,
			formatCheckoutAccessTTL(ttl),
			whatsapp.MainMenuMessage(),
		), session.StateMainMenu, nil

	case "2":
		return uc.requestCloseBillByStaff(ctx, sess)

	default:
		return uc.repeatCurrentPrompt(ctx, sess)
	}
}

func (uc *HandleWhatsAppMessageUseCase) sendClosingTabOptions(
	ctx context.Context,
	to string,
	tenantID uuid.UUID,
	restaurantName string,
	tabSummary string,
) error {
	body := uc.buildClosingTabPromptBody(ctx, tenantID, tabSummary)
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

func (uc *HandleWhatsAppMessageUseCase) buildClosingTabPromptBody(
	ctx context.Context,
	tenantID uuid.UUID,
	tabSummary string,
) string {
	var body strings.Builder
	body.WriteString("💰 *Fechar Conta*\n\n")

	if notice := uc.closedTenantClosingTabNotice(ctx, tenantID); notice != "" {
		body.WriteString(notice)
		body.WriteString("\n\n")
	}

	body.WriteString(strings.TrimSpace(tabSummary))
	body.WriteString("\n\nComo você prefere finalizar?")

	return body.String()
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

func (uc *HandleWhatsAppMessageUseCase) buildClosingTabTextFallback(
	ctx context.Context,
	tenantID uuid.UUID,
	tabSummary string,
) string {
	return uc.buildClosingTabPromptBody(ctx, tenantID, tabSummary) + "\n" +
		"*1* - 💳 Pagar agora pelo celular\n" +
		"*2* - 🙋 Pedir para a equipe fechar na mesa\n\n" +
		"_Digite 0 para voltar ao menu_"
}

func (uc *HandleWhatsAppMessageUseCase) closedTenantClosingTabNotice(
	ctx context.Context,
	tenantID uuid.UUID,
) string {
	if uc == nil || uc.tenantRepo == nil {
		return ""
	}

	tenantObj, err := uc.tenantRepo.FindByID(ctx, tenantID)
	if err != nil || tenantObj == nil || tenantObj.IsOpen {
		return ""
	}

	closedMessage := strings.TrimSpace(whatsapp.RestaurantClosedMessage(tenantObj.Settings.Messages))
	openTabLabel := "📋 *Sua Comanda (aberta)*"

	if closedMessage == "" {
		return openTabLabel
	}

	return closedMessage + "\n\n" + openTabLabel
}

func (uc *HandleWhatsAppMessageUseCase) decorateClosedTenantClosingTabMessage(
	ctx context.Context,
	tenantID uuid.UUID,
	body string,
) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return ""
	}

	notice := uc.closedTenantClosingTabNotice(ctx, tenantID)
	if notice == "" || strings.Contains(body, notice) {
		return body
	}

	return notice + "\n\n" + body
}

func buildClosingTabOwnerOnlyMessage() string {
	return "💰 *Fechar Conta*\n\nEsta comanda está vinculada ao telefone responsável que a abriu.\n\nSomente esse número pode fechar e pagar por aqui.\n\nSe precisar, peça autorização da pessoa responsável ou solicite apoio da equipe presencialmente.\n\n" + whatsapp.MainMenuMessage()
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
		if uc.findUnauthorizedOpenTabForSession(ctx, sess) != nil {
			return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
		}
		return "💰 *Fechar Conta*\n\nNão encontrei uma comanda aberta para solicitar o fechamento agora.\n\n" + whatsapp.MainMenuMessage(),
			session.StateMainMenu, nil
	}

	if !uc.isTabOwnedBySessionPhone(userTab, sess.UserPhone) {
		return buildClosingTabOwnerOnlyMessage(), session.StateMainMenu, nil
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
			MenuItemID:      item.MenuItemID,
			Quantity:        item.Quantity,
			Observations:    item.Observations,
			SelectedOptions: append([]order.SelectedOption(nil), item.EnsureSelectedOptions()...),
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
	menuItemsByID := make(map[uuid.UUID]*menu.Item, len(ids))
	menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, ids, tenantID)
	if err == nil {
		for _, menuItem := range menuItems {
			if menuItem != nil {
				nameByID[menuItem.ID] = menuItem.Name
				menuItemsByID[menuItem.ID] = menuItem
			}
		}
	}

	lines := make([]string, 0, len(items))
	for _, item := range items {
		name := nameByID[item.MenuItemID]
		comboSummary := ""
		if menuItem := menuItemsByID[item.MenuItemID]; menuItem != nil {
			comboSummary = orderingComboSummary(menuItem)
		}
		if name == "" {
			name = fmt.Sprintf("Item %s", item.MenuItemID.String()[:8])
		}
		line := fmt.Sprintf("• %dx %s", item.Quantity, name)
		if comboSummary != "" {
			line += " (" + comboSummary + ")"
		}
		if optionsSummary := buildOrderingSelectedOptionsSummary(toOrderingSelectedOptions(item.SelectedOptions)); optionsSummary != "" {
			line += " (" + optionsSummary + ")"
		}
		lines = append(lines, line)
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

func (uc *HandleWhatsAppMessageUseCase) handleViewTab(
	ctx context.Context,
	sess *session.Session,
) (string, session.ConversationState, error) {
	userTab := uc.findSessionOpenTab(ctx, sess)
	if userTab == nil || userTab.Total <= 0 {
		// No tab or empty tab — fall back to text summary
		return uc.buildTabSummaryResponse(ctx, sess, false)
	}

	// Try to send receipt image
	baseURL := uc.resolveCurrentPublicCheckoutBaseURL()
	if baseURL != "" {
		receiptURL := strings.TrimRight(baseURL, "/") + "/api/receipt/" + userTab.ID.String() + "/image.png"
		caption := fmt.Sprintf("📋 Comanda — %s", userTab.ID.String()[:8])

		_, err := uc.sender.SendImage(ctx, sess.UserPhone, receiptURL, caption)
		if err != nil {
			uc.logger.Warn("failed to send receipt image, falling back to text",
				zap.Error(err),
				zap.String("tab_id", userTab.ID.String()),
				zap.String("receipt_url", receiptURL),
			)
			// Fall back to text summary
			return uc.buildTabSummaryResponse(ctx, sess, false)
		}

		// Image sent successfully — return a brief text follow-up
		return "👆 Confira os detalhes da sua comanda na imagem acima.\n\n_Digite 0 para voltar ao menu_",
			session.StateViewingTab, nil
	}

	// No public URL available — fall back to text summary
	return uc.buildTabSummaryResponse(ctx, sess, false)
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
		if err == nil && existingTab != nil && existingTab.Status == tab.StatusOpen && uc.canSessionAccessTab(ctx, sess, existingTab) {
			candidate = existingTab
		}
	}

	if candidate == nil && sess.TableID != nil {
		candidate = uc.findAccessibleOpenTabByTable(ctx, sess, *sess.TableID)
	}

	if candidate == nil {
		openTabs, err := uc.tabRepo.FindByTenantAndStatus(ctx, sess.TenantID, tab.StatusOpen)
		if err != nil {
			return nil
		}

		normalizedPhone := normalizePhoneDigits(sess.UserPhone)
		for _, openTab := range openTabs {
			if !uc.isCustomerVisibleTab(openTab) {
				continue
			}
			if normalizePhoneDigits(openTab.UserPhone) == normalizedPhone {
				candidate = openTab
				break
			}
		}
	}

	if candidate == nil && uc.tableRepo != nil {
		latestReq, err := uc.tableRepo.FindLatestApprovedRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
		if err == nil && latestReq != nil && latestReq.TableID != nil {
			candidate = uc.findAccessibleOpenTabByTable(ctx, sess, *latestReq.TableID)
		}
	}

	if candidate == nil {
		return nil
	}

	uc.reconcileOpenTabMetadata(ctx, sess, candidate)
	return candidate
}

func (uc *HandleWhatsAppMessageUseCase) findUnauthorizedOpenTabForSession(
	ctx context.Context,
	sess *session.Session,
) *tab.Tab {
	if sess == nil || uc.tabRepo == nil {
		return nil
	}

	if sess.TabID != nil {
		existingTab, err := uc.tabRepo.FindByID(ctx, *sess.TabID, sess.TenantID)
		if err == nil && existingTab != nil && existingTab.Status == tab.StatusOpen && !uc.canSessionAccessTab(ctx, sess, existingTab) {
			return existingTab
		}
	}

	if sess.TableID != nil {
		if unauthorized := uc.findUnauthorizedOpenTabByTable(ctx, sess, *sess.TableID); unauthorized != nil {
			return unauthorized
		}
	}

	if uc.tableRepo == nil {
		return nil
	}

	latestReq, err := uc.tableRepo.FindLatestApprovedRequestByPhone(ctx, sess.UserPhone, sess.TenantID)
	if err != nil || latestReq == nil || latestReq.TableID == nil {
		return nil
	}

	return uc.findUnauthorizedOpenTabByTable(ctx, sess, *latestReq.TableID)
}

func (uc *HandleWhatsAppMessageUseCase) findUnauthorizedOpenTabByTable(
	ctx context.Context,
	sess *session.Session,
	tableID uuid.UUID,
) *tab.Tab {
	openTabs, err := uc.tabRepo.FindAllOpenByTable(ctx, tableID, sess.TenantID)
	if err != nil {
		return nil
	}

	for _, openTab := range openTabs {
		if openTab == nil || openTab.Status != tab.StatusOpen {
			continue
		}
		if !uc.isCustomerVisibleTab(openTab) {
			continue
		}
		if normalizePhoneDigits(openTab.UserPhone) == "" {
			continue
		}
		if !uc.canSessionAccessTab(ctx, sess, openTab) {
			return openTab
		}
	}

	return nil
}

func (uc *HandleWhatsAppMessageUseCase) findAccessibleOpenTabByTable(
	ctx context.Context,
	sess *session.Session,
	tableID uuid.UUID,
) *tab.Tab {
	openTabs, err := uc.tabRepo.FindAllOpenByTable(ctx, tableID, sess.TenantID)
	if err != nil {
		return nil
	}

	var sharedCandidate *tab.Tab
	var blankCandidate *tab.Tab

	for _, openTab := range openTabs {
		if openTab == nil || openTab.Status != tab.StatusOpen {
			continue
		}
		if !uc.isCustomerVisibleTab(openTab) {
			continue
		}
		if uc.isTabOwnedBySessionPhone(openTab, sess.UserPhone) {
			return openTab
		}
		if sharedCandidate == nil && uc.hasApprovedSharedJoinAccess(ctx, sess, openTab) {
			sharedCandidate = openTab
		}
		if blankCandidate == nil && normalizePhoneDigits(openTab.UserPhone) == "" {
			blankCandidate = openTab
		}
	}

	if sharedCandidate != nil {
		return sharedCandidate
	}

	return blankCandidate
}

func (uc *HandleWhatsAppMessageUseCase) canSessionAccessTab(
	ctx context.Context,
	sess *session.Session,
	userTab *tab.Tab,
) bool {
	if userTab == nil {
		return false
	}
	if !uc.isCustomerVisibleTab(userTab) {
		return false
	}

	if uc.isTabOwnedBySessionPhone(userTab, sess.UserPhone) {
		return true
	}

	if normalizePhoneDigits(userTab.UserPhone) == "" {
		return true
	}

	return uc.hasApprovedSharedJoinAccess(ctx, sess, userTab)
}

func (uc *HandleWhatsAppMessageUseCase) hasApprovedSharedJoinAccess(
	ctx context.Context,
	sess *session.Session,
	userTab *tab.Tab,
) bool {
	if sess == nil || userTab == nil || uc.tabRepo == nil {
		return false
	}

	joinReq, err := uc.tabRepo.FindApprovedSharedJoinRequestByRequestorAndTab(
		ctx,
		sess.UserPhone,
		userTab.ID,
		sess.TenantID,
	)
	if err != nil {
		uc.logger.Warn("failed to validate shared tab access",
			zap.Error(err),
			zap.String("tab_id", userTab.ID.String()),
			zap.String("user_phone", sess.UserPhone),
		)
		return false
	}

	return joinReq != nil
}

func (uc *HandleWhatsAppMessageUseCase) isTabOwnedBySessionPhone(
	userTab *tab.Tab,
	userPhone string,
) bool {
	if userTab == nil {
		return false
	}

	ownerPhone := normalizePhoneDigits(userTab.UserPhone)
	requestPhone := normalizePhoneDigits(userPhone)
	return ownerPhone != "" && ownerPhone == requestPhone
}

func (uc *HandleWhatsAppMessageUseCase) isCustomerVisibleTab(userTab *tab.Tab) bool {
	if userTab == nil {
		return false
	}

	if userTab.ReopenedAt != nil {
		return false
	}

	return userTab.PaidAmount < userTab.Total
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

func buildCheckoutAccessToken(tabID string, ownerPhone string) (string, time.Duration, error) {
	tabID = strings.TrimSpace(tabID)
	if tabID == "" {
		return "", 0, fmt.Errorf("empty tab id")
	}
	ownerPhone = normalizePhoneDigits(ownerPhone)
	if ownerPhone == "" {
		return "", 0, fmt.Errorf("empty owner phone")
	}

	ttl := resolveCheckoutAccessTTL()
	now := time.Now()
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		secret = "super-secret-key-clg-2024"
	}

	claims := checkoutAccessClaims{
		Scope:      checkoutAccessScope,
		TabID:      tabID,
		OwnerPhone: ownerPhone,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   tabID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", 0, err
	}

	return signed, ttl, nil
}

func resolveCheckoutAccessTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("CHECKOUT_LINK_TTL"))
	if raw == "" {
		return 30 * time.Minute
	}

	ttl, err := time.ParseDuration(raw)
	if err != nil || ttl <= 0 {
		return 30 * time.Minute
	}

	return ttl
}

func buildPublicCheckoutURL(baseURL string, tabID string, accessToken string) string {
	query := url.Values{}
	query.Set("tab_id", strings.TrimSpace(tabID))
	query.Set("access_token", strings.TrimSpace(accessToken))
	return strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/checkout.html#" + query.Encode()
}

func formatCheckoutAccessTTL(ttl time.Duration) string {
	if ttl <= 0 {
		return "alguns minutos"
	}

	if ttl%time.Hour == 0 {
		hours := int(ttl / time.Hour)
		if hours == 1 {
			return "1 hora"
		}
		return fmt.Sprintf("%d horas", hours)
	}

	minutes := int(ttl / time.Minute)
	if minutes <= 1 {
		return "1 minuto"
	}

	return fmt.Sprintf("%d minutos", minutes)
}

func isLocalCheckoutBase(baseURL string) bool {
	normalized := strings.ToLower(strings.TrimSpace(baseURL))
	return strings.Contains(normalized, "localhost") || strings.Contains(normalized, "127.0.0.1")
}

func buildClosingTabPaymentUnavailableMessage(reason string) string {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "Ainda não consegui gerar um link público de pagamento para o seu celular."
	}

	return "💳 *Pagamento pelo celular*\n\n" +
		reason + "\n\n" +
		"Você pode abrir o menu novamente ou chamar um garçom por aqui."
}

func buildClosingTabPaymentUnavailableTextFallback(body string) string {
	return strings.TrimSpace(body) + "\n\n" +
		"*0* - 📱 Abrir menu\n" +
		"*4* - 🙋 Chamar garçom"
}

func (uc *HandleWhatsAppMessageUseCase) isClosingTabPaymentUnavailableMessage(message string) bool {
	body := strings.TrimSpace(message)
	if !strings.Contains(body, "💳 *Pagamento pelo celular*") {
		return false
	}

	return strings.Contains(body, "Ainda não consegui gerar um link público de pagamento") ||
		strings.Contains(body, "Não consegui gerar um link seguro de pagamento")
}

func (uc *HandleWhatsAppMessageUseCase) resolveCurrentPublicCheckoutBaseURL() string {
	candidates := []string{
		uc.publicCheckoutBaseURL,
		os.Getenv("PUBLIC_ADMIN_BASE_URL"),
		os.Getenv("PUBLIC_WEB_BASE_URL"),
		os.Getenv("PUBLIC_WEBHOOK_BASE_URL"),
		os.Getenv("NGROK_PUBLIC_URL"),
	}

	localFallback := ""
	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base == "" {
			continue
		}
		if !isLocalCheckoutBase(base) {
			uc.publicCheckoutBaseURL = base
			return base
		}
		if localFallback == "" {
			localFallback = base
		}
	}

	if ngrokBase := resolveNgrokPublicCheckoutBaseURL(); ngrokBase != "" {
		uc.publicCheckoutBaseURL = ngrokBase
		return ngrokBase
	}

	if localFallback != "" {
		return localFallback
	}

	return ""
}

func (uc *HandleWhatsAppMessageUseCase) resolvePublicImageURL(raw string) string {
	imageURL := strings.TrimSpace(raw)
	if imageURL == "" {
		return ""
	}

	parsed, err := url.Parse(imageURL)
	if err == nil && parsed.IsAbs() && parsed.Host != "" {
		return imageURL
	}

	baseURL := strings.TrimRight(uc.resolveCurrentPublicCheckoutBaseURL(), "/")
	if baseURL == "" {
		return imageURL
	}

	return baseURL + "/" + strings.TrimLeft(imageURL, "/")
}

func resolveNgrokPublicCheckoutBaseURL() string {
	apiCandidates := []string{}
	if configured := strings.TrimSpace(os.Getenv("NGROK_API_URL")); configured != "" {
		apiCandidates = append(apiCandidates, configured)
	} else {
		apiCandidates = append(apiCandidates,
			"http://ngrok:4040",
			"http://localhost:4040",
		)
	}

	client := &http.Client{Timeout: 2 * time.Second}
	for _, candidate := range apiCandidates {
		apiBase := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if apiBase == "" {
			continue
		}

		tunnelsURL := apiBase
		if !strings.HasSuffix(strings.ToLower(tunnelsURL), "/api/tunnels") {
			tunnelsURL += "/api/tunnels"
		}

		req, err := http.NewRequest(http.MethodGet, tunnelsURL, nil)
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		var payload struct {
			Tunnels []struct {
				PublicURL string `json:"public_url"`
			} `json:"tunnels"`
		}
		err = json.NewDecoder(resp.Body).Decode(&payload)
		resp.Body.Close()
		if err != nil {
			continue
		}

		for _, tunnel := range payload.Tunnels {
			publicURL := strings.TrimRight(strings.TrimSpace(tunnel.PublicURL), "/")
			if strings.HasPrefix(strings.ToLower(publicURL), "https://") {
				return publicURL
			}
		}

		for _, tunnel := range payload.Tunnels {
			publicURL := strings.TrimRight(strings.TrimSpace(tunnel.PublicURL), "/")
			if publicURL != "" {
				return publicURL
			}
		}
	}

	return ""
}
