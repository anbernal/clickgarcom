package application

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
)

const (
	// ServiceFeePercent é a taxa de serviço padrão (10%)
	ServiceFeePercent = 10.0
)

var (
	ErrTabNotFound      = errors.New("tab not found")
	ErrTabNotOpen       = errors.New("tab is not open")
	ErrInvalidItems     = errors.New("invalid items")
	ErrItemNotAvailable = errors.New("item not available")
	ErrInvalidQuantity  = errors.New("quantity must be greater than 0")
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
	MenuItemID   uuid.UUID
	Quantity     int
	Observations string
}

// CreateOrderUseCase implementa a lógica de criação de pedidos
type CreateOrderUseCase struct {
	orderRepo order.Repository
	tabRepo   tab.Repository
	menuRepo  menu.Repository
	logger    *zap.Logger
}

func NewCreateOrderUseCase(
	orderRepo order.Repository,
	tabRepo tab.Repository,
	menuRepo menu.Repository,
	logger *zap.Logger,
) *CreateOrderUseCase {
	return &CreateOrderUseCase{
		orderRepo: orderRepo,
		tabRepo:   tabRepo,
		menuRepo:  menuRepo,
		logger:    logger,
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

	// 4. Validar cada item e construir order items
	orderItems := make([]order.OrderItem, 0, len(input.Items))
	var primaryDestination order.Destination
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
		if !menuItem.Available {
			uc.logger.Warn("menu item not available",
				zap.String("menu_item_id", inputItem.MenuItemID.String()),
				zap.String("name", menuItem.Name),
			)
			return nil, ErrItemNotAvailable
		}

		// Criar order item
		orderItem := order.OrderItem{
			ID:           uuid.New(),
			MenuItemID:   menuItem.ID,
			Quantity:     inputItem.Quantity,
			UnitPrice:    menuItem.Price,
			Observations: inputItem.Observations,
			CreatedAt:    time.Now(),
		}
		orderItems = append(orderItems, orderItem)

		// Contar destinations para determinar o principal
		dest := order.Destination(menuItem.Destination)
		destinationCounts[dest]++
	}

	// 5. Determinar destination principal (onde há mais itens)
	maxCount := 0
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

	// 6. Criar o pedido
	newOrder := &order.Order{
		ID:          uuid.New(),
		TenantID:    input.TenantID,
		TabID:       input.TabID,
		Destination: primaryDestination,
		Status:      order.StatusPending,
		Notes:       input.Notes,
		Items:       orderItems,
		CreatedAt:   time.Now(),
	}

	// 7. Salvar no banco
	if err := uc.orderRepo.Create(ctx, newOrder); err != nil {
		uc.logger.Error("failed to create order", zap.Error(err))
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	// 8. Atualizar totais da tab
	orderTotal := newOrder.CalculateTotal()
	existingTab.AddOrderTotal(orderTotal)
	existingTab.CalculateTotal(ServiceFeePercent)

	if err := uc.tabRepo.Update(ctx, existingTab); err != nil {
		uc.logger.Error("failed to update tab totals", zap.Error(err))
		// Não retorna erro pois o pedido já foi criado
		// TODO: considerar usar transação no futuro
	} else {
		uc.logger.Info("tab totals updated",
			zap.String("tab_id", existingTab.ID.String()),
			zap.Float64("subtotal", existingTab.Subtotal),
			zap.Float64("service_fee", existingTab.ServiceFee),
			zap.Float64("total", existingTab.Total),
		)
	}

	uc.logger.Info("order created successfully",
		zap.String("order_id", newOrder.ID.String()),
		zap.String("tab_id", input.TabID.String()),
		zap.String("destination", string(newOrder.Destination)),
		zap.Int("items_count", len(orderItems)),
		zap.Float64("order_total", orderTotal),
	)

	return newOrder, nil
}
