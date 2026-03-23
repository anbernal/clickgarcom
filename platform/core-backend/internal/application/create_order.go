package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/events"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/infrastructure/websocket"
)

const (
	// ServiceFeePercent é a taxa de serviço padrão (10%)
	ServiceFeePercent = 10.0
	// KDSEventsQueue é a fila usada para propagar eventos de pedidos ao processo da API (WebSocket Hub)
	KDSEventsQueue = "kds.events"
)

var (
	ErrTabNotFound      = errors.New("tab not found")
	ErrTabNotOpen       = errors.New("tab is not open")
	ErrInvalidItems     = errors.New("invalid items")
	ErrItemNotAvailable = errors.New("item not available")
	ErrInvalidQuantity  = errors.New("quantity must be greater than 0")
	ErrInvalidOptions   = errors.New("invalid selected options")
)

// CreateOrderInput representa os dados de entrada para criar um pedido
type CreateOrderInput struct {
	TenantID uuid.UUID
	TabID    uuid.UUID
	Items    []OrderItemInput
	Notes    string
}

// OrderItemInput representa um item do pedido
type OrderItemInput struct {
	MenuItemID      uuid.UUID
	Quantity        int
	Observations    string
	SelectedOptions []order.SelectedOption
}

// CreateOrderUseCase implementa a lógica de criação de pedidos
type CreateOrderUseCase struct {
	orderRepo      order.Repository
	orderBatchRepo orderbatch.Repository
	tabRepo        tab.Repository
	menuRepo       menu.Repository
	wsHub          *websocket.Hub
	publisher      KDSEventPublisher
	logger         *zap.Logger
}

type KDSEventPublisher interface {
	PublishJSON(exchange, routingKey string, data interface{}) error
}

func NewCreateOrderUseCase(
	orderRepo order.Repository,
	orderBatchRepo orderbatch.Repository,
	tabRepo tab.Repository,
	menuRepo menu.Repository,
	wsHub *websocket.Hub,
	publisher KDSEventPublisher,
	logger *zap.Logger,
) *CreateOrderUseCase {
	return &CreateOrderUseCase{
		orderRepo:      orderRepo,
		orderBatchRepo: orderBatchRepo,
		tabRepo:        tabRepo,
		menuRepo:       menuRepo,
		wsHub:          wsHub,
		publisher:      publisher,
		logger:         logger,
	}
}

func (uc *CreateOrderUseCase) Execute(ctx context.Context, input CreateOrderInput) (*order.Order, error) {
	// 1. Validar que a tab existe e está aberta
	existingTab, err := uc.tabRepo.FindByID(ctx, input.TabID, input.TenantID)
	if err != nil {
		uc.logger.Error("tab not found", zap.Error(err), zap.String("tab_id", input.TabID.String()))
		return nil, ErrTabNotFound
	}

	if existingTab.Status != tab.StatusOpen {
		uc.logger.Warn("tab is not open",
			zap.String("tab_id", input.TabID.String()),
			zap.String("status", string(existingTab.Status)),
		)
		return nil, ErrTabNotOpen
	}

	// 2. Validar que há itens no pedido
	if len(input.Items) == 0 {
		return nil, ErrInvalidItems
	}

	// 3. Buscar todos os itens do menu de uma vez
	menuItemIDs := make([]uuid.UUID, len(input.Items))
	for i, item := range input.Items {
		menuItemIDs[i] = item.MenuItemID
	}

	menuItems, err := uc.menuRepo.FindItemsByIDs(ctx, menuItemIDs, input.TenantID)
	if err != nil {
		uc.logger.Error("failed to fetch menu items", zap.Error(err))
		return nil, fmt.Errorf("failed to fetch menu items: %w", err)
	}

	// Criar map para acesso rápido
	menuItemsMap := make(map[uuid.UUID]*menu.Item)
	for _, item := range menuItems {
		menuItemsMap[item.ID] = item
	}

	// 4. Validar cada item e agrupar por destino operacional
	groupedItems := make(map[order.Destination][]order.OrderItem)
	destinationOrder := make([]order.Destination, 0)
	destinationCounts := make(map[order.Destination]int)

	for _, inputItem := range input.Items {
		// Validar quantidade
		if inputItem.Quantity <= 0 {
			return nil, ErrInvalidQuantity
		}

		// Buscar item do menu
		menuItem, exists := menuItemsMap[inputItem.MenuItemID]
		if !exists {
			uc.logger.Warn("menu item not found",
				zap.String("menu_item_id", inputItem.MenuItemID.String()),
			)
			return nil, fmt.Errorf("menu item %s not found", inputItem.MenuItemID)
		}

		// Validar disponibilidade
		if !menuItem.IsAvailableAt(time.Now()) {
			uc.logger.Warn("menu item not available",
				zap.String("menu_item_id", inputItem.MenuItemID.String()),
				zap.String("name", menuItem.Name),
				zap.String("status", menuItem.CurrentAvailabilityStatus),
				zap.String("reason", menuItem.UnavailableReason),
			)
			return nil, ErrItemNotAvailable
		}

		dest := order.Destination(menuItem.Destination)
		if _, ok := groupedItems[dest]; !ok {
			destinationOrder = append(destinationOrder, dest)
		}

		selectedOptions, extrasPerUnit, err := validateSelectedOptions(menuItem, inputItem.SelectedOptions)
		if err != nil {
			uc.logger.Warn("invalid selected options for order item",
				zap.String("menu_item_id", inputItem.MenuItemID.String()),
				zap.String("name", menuItem.Name),
				zap.Error(err),
			)
			return nil, ErrInvalidOptions
		}

		orderItem := order.OrderItem{
			ID:           uuid.New(),
			MenuItemID:   menuItem.ID,
			Quantity:     inputItem.Quantity,
			UnitPrice:    menuItem.Price + extrasPerUnit,
			Observations: inputItem.Observations,
			CreatedAt:    time.Now(),
		}
		orderItem.SetSelectedOptions(selectedOptions)
		groupedItems[dest] = append(groupedItems[dest], orderItem)
		destinationCounts[dest]++
	}

	// 5. Determinar destination principal (onde há mais itens)
	maxCount := 0
	var primaryDestination order.Destination
	for dest, count := range destinationCounts {
		if count > maxCount {
			maxCount = count
			primaryDestination = dest
		}
	}

	// Se não determinou, usar KITCHEN como padrão
	if primaryDestination == "" {
		primaryDestination = order.DestinationKitchen
	}

	// 6. Criar o batch lógico do carrinho
	var batchID *uuid.UUID
	if uc.orderBatchRepo != nil {
		newBatch := &orderbatch.OrderBatch{
			ID:            uuid.New(),
			TenantID:      input.TenantID,
			TabID:         input.TabID,
			CustomerPhone: existingTab.UserPhone,
			Status:        orderbatch.StatusPending,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := uc.orderBatchRepo.Create(ctx, newBatch); err != nil {
			uc.logger.Error("failed to create order batch", zap.Error(err))
			return nil, fmt.Errorf("failed to create order batch: %w", err)
		}
		batchID = &newBatch.ID
	}

	// 7. Criar os pedidos operacionais por destino
	createdOrders := make([]*order.Order, 0, len(destinationOrder))
	var representativeOrder *order.Order
	totalBatchAmount := 0.0

	for _, dest := range destinationOrder {
		items := groupedItems[dest]
		if len(items) == 0 {
			continue
		}

		newOrder := &order.Order{
			ID:          uuid.New(),
			TenantID:    input.TenantID,
			TabID:       input.TabID,
			BatchID:     batchID,
			Destination: dest,
			Status:      order.StatusPending,
			Notes:       input.Notes,
			Items:       items,
			CreatedAt:   time.Now(),
		}

		if err := uc.orderRepo.Create(ctx, newOrder); err != nil {
			uc.logger.Error("failed to create operational order",
				zap.Error(err),
				zap.String("destination", string(dest)),
			)
			return nil, fmt.Errorf("failed to create operational order: %w", err)
		}

		orderTotal := newOrder.CalculateTotal()
		totalBatchAmount += orderTotal
		createdOrders = append(createdOrders, newOrder)

		if representativeOrder == nil || dest == primaryDestination {
			representativeOrder = newOrder
		}

		uc.logger.Info("operational order created successfully",
			zap.String("order_id", newOrder.ID.String()),
			zap.String("tab_id", input.TabID.String()),
			zap.String("destination", string(newOrder.Destination)),
			zap.Int("items_count", len(newOrder.Items)),
			zap.Float64("order_total", orderTotal),
		)

		uc.publishOrderCreatedEvent(input.TenantID, newOrder)
	}

	if representativeOrder == nil {
		return nil, ErrInvalidItems
	}

	// 8. Atualizar totais da tab uma vez pelo valor total do carrinho
	existingTab.AddOrderTotal(totalBatchAmount)
	existingTab.CalculateTotal(ServiceFeePercent)

	if err := uc.tabRepo.Update(ctx, existingTab); err != nil {
		uc.logger.Error("failed to update tab totals", zap.Error(err))
		// Não retorna erro pois o pedido já foi criado
		// TODO: considerar usar transação no futuro
	} else {
		uc.logger.Info("tab totals updated after order batch",
			zap.String("tab_id", existingTab.ID.String()),
			zap.String("batch_id", uuidPointerString(batchID)),
			zap.Float64("subtotal", existingTab.Subtotal),
			zap.Float64("service_fee", existingTab.ServiceFee),
			zap.Float64("total", existingTab.Total),
		)
	}

	uc.logger.Info("order batch created successfully",
		zap.String("batch_id", uuidPointerString(batchID)),
		zap.String("representative_order_id", representativeOrder.ID.String()),
		zap.String("tab_id", input.TabID.String()),
		zap.Int("orders_count", len(createdOrders)),
		zap.Float64("batch_total", totalBatchAmount),
	)

	return representativeOrder, nil
}

func (uc *CreateOrderUseCase) publishOrderCreatedEvent(
	tenantID uuid.UUID,
	newOrder *order.Order,
) {
	event := events.NewOrderCreatedEvent(newOrder)

	if uc.wsHub != nil {
		uc.wsHub.BroadcastToTenant(tenantID, event)
		uc.logger.Info("order.created event broadcast",
			zap.String("order_id", newOrder.ID.String()),
			zap.String("tenant_id", tenantID.String()),
		)
	}

	if uc.publisher != nil {
		if err := uc.publisher.PublishJSON("", KDSEventsQueue, event); err != nil {
			uc.logger.Error("failed to publish order.created event to kds queue",
				zap.Error(err),
				zap.String("order_id", newOrder.ID.String()),
				zap.String("tenant_id", tenantID.String()),
			)
		} else {
			uc.logger.Info("order.created event published to kds queue",
				zap.String("order_id", newOrder.ID.String()),
				zap.String("tenant_id", tenantID.String()),
				zap.String("queue", KDSEventsQueue),
			)
		}
	}
}

func uuidPointerString(value *uuid.UUID) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func validateSelectedOptions(menuItem *menu.Item, selected []order.SelectedOption) ([]order.SelectedOption, float64, error) {
	groups := menuItem.EnsureOptionGroups()
	if len(groups) == 0 {
		if len(selected) == 0 {
			return nil, 0, nil
		}
		return nil, 0, fmt.Errorf("item does not accept selected options")
	}

	if len(selected) == 0 {
		for _, group := range groups {
			if group.MinSelect > 0 {
				return nil, 0, fmt.Errorf("required option group %s is missing", group.Name)
			}
		}
		return nil, 0, nil
	}

	groupCounts := make(map[string]int, len(groups))
	seenOptions := make(map[string]struct{}, len(selected))
	normalized := make([]order.SelectedOption, 0, len(selected))
	totalExtras := 0.0

	for _, selection := range selected {
		groupName := strings.TrimSpace(selection.GroupName)
		optionName := strings.TrimSpace(selection.OptionName)
		if groupName == "" || optionName == "" {
			return nil, 0, fmt.Errorf("option group and option name are required")
		}

		group, option, found := findMenuItemSelectedOption(groups, groupName, optionName)
		if !found {
			return nil, 0, fmt.Errorf("selected option %s/%s not found", groupName, optionName)
		}
		if !option.Available {
			return nil, 0, fmt.Errorf("selected option %s/%s is unavailable", group.Name, option.Name)
		}

		signature := strings.ToLower(strings.TrimSpace(group.Name)) + "::" + strings.ToLower(strings.TrimSpace(option.Name))
		if _, exists := seenOptions[signature]; exists {
			return nil, 0, fmt.Errorf("duplicate selected option %s/%s", group.Name, option.Name)
		}
		seenOptions[signature] = struct{}{}

		groupCounts[group.Name]++
		totalExtras += option.PriceDelta
		normalized = append(normalized, order.SelectedOption{
			GroupName:  group.Name,
			OptionName: option.Name,
			PriceDelta: option.PriceDelta,
		})
	}

	for _, group := range groups {
		count := groupCounts[group.Name]
		if count < group.MinSelect {
			return nil, 0, fmt.Errorf("group %s requires at least %d option(s)", group.Name, group.MinSelect)
		}
		if count > group.MaxSelect {
			return nil, 0, fmt.Errorf("group %s allows at most %d option(s)", group.Name, group.MaxSelect)
		}
	}

	return normalized, totalExtras, nil
}

func findMenuItemSelectedOption(
	groups []menu.OptionGroup,
	groupName string,
	optionName string,
) (menu.OptionGroup, menu.Option, bool) {
	groupLookup := strings.TrimSpace(strings.ToLower(groupName))
	optionLookup := strings.TrimSpace(strings.ToLower(optionName))
	for _, group := range groups {
		if strings.TrimSpace(strings.ToLower(group.Name)) != groupLookup {
			continue
		}
		for _, option := range group.Options {
			if strings.TrimSpace(strings.ToLower(option.Name)) == optionLookup {
				return group, option, true
			}
		}
	}

	return menu.OptionGroup{}, menu.Option{}, false
}
