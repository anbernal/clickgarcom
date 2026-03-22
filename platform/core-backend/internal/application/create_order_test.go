package application

import (
	"context"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
)

func TestCreateOrderExecuteCreatesOrderBatchAndSplitsByDestination(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	tabID := uuid.New()
	foodID := uuid.New()
	drinkID := uuid.New()

	orderRepo := &testCreateOrderRepo{}
	orderBatchRepo := &testCreateOrderBatchRepo{}
	tabRepo := &testCreateOrderTabRepo{
		tabsByID: map[uuid.UUID]*tab.Tab{
			tabID: {
				ID:       tabID,
				TenantID: tenantID,
				Status:   tab.StatusOpen,
			},
		},
	}
	menuRepo := &testCreateOrderMenuRepo{
		itemsByID: map[uuid.UUID]*menu.Item{
			foodID: {
				ID:          foodID,
				TenantID:    tenantID,
				Name:        "Picanha",
				Price:       100,
				Available:   true,
				Destination: "KITCHEN",
			},
			drinkID: {
				ID:          drinkID,
				TenantID:    tenantID,
				Name:        "Suco",
				Price:       12,
				Available:   true,
				Destination: "BAR",
			},
		},
	}
	publisher := &testKDSEventPublisher{}

	uc := NewCreateOrderUseCase(
		orderRepo,
		orderBatchRepo,
		tabRepo,
		menuRepo,
		nil,
		publisher,
		zap.NewNop(),
	)

	representativeOrder, err := uc.Execute(ctx, CreateOrderInput{
		TenantID: tenantID,
		TabID:    tabID,
		Items: []OrderItemInput{
			{MenuItemID: foodID, Quantity: 1},
			{MenuItemID: drinkID, Quantity: 2},
		},
		Notes: "Pedido de teste",
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if representativeOrder == nil {
		t.Fatal("expected representative order")
	}
	if representativeOrder.BatchID == nil {
		t.Fatal("expected representative order to reference batch")
	}

	if got := len(orderBatchRepo.created); got != 1 {
		t.Fatalf("expected 1 order batch, got %d", got)
	}

	createdBatch := orderBatchRepo.created[0]
	if createdBatch.TabID != tabID {
		t.Fatalf("expected batch tab %s, got %s", tabID, createdBatch.TabID)
	}

	if got := len(orderRepo.created); got != 2 {
		t.Fatalf("expected 2 operational orders, got %d", got)
	}

	destinations := map[order.Destination]float64{}
	for _, createdOrder := range orderRepo.created {
		if createdOrder.BatchID == nil || *createdOrder.BatchID != createdBatch.ID {
			t.Fatalf("expected created order to point to batch %s", createdBatch.ID)
		}
		destinations[createdOrder.Destination] = createdOrder.CalculateTotal()
	}

	if total := destinations[order.DestinationKitchen]; total != 100 {
		t.Fatalf("expected kitchen total 100, got %.2f", total)
	}
	if total := destinations[order.DestinationBar]; total != 24 {
		t.Fatalf("expected bar total 24, got %.2f", total)
	}

	updatedTab := tabRepo.tabsByID[tabID]
	if updatedTab.Subtotal != 124 {
		t.Fatalf("expected tab subtotal 124, got %.2f", updatedTab.Subtotal)
	}
	if updatedTab.ServiceFee != 12.4 {
		t.Fatalf("expected service fee 12.4, got %.2f", updatedTab.ServiceFee)
	}
	if updatedTab.Total != 136.4 {
		t.Fatalf("expected total 136.4, got %.2f", updatedTab.Total)
	}

	if got := len(publisher.events); got != 2 {
		t.Fatalf("expected 2 KDS events, got %d", got)
	}
}

type testCreateOrderRepo struct {
	created []*order.Order
	byTab   map[uuid.UUID][]*order.Order
}

func (r *testCreateOrderRepo) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	return nil, nil
}

func (r *testCreateOrderRepo) FindByIDWithItems(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	return nil, nil
}

func (r *testCreateOrderRepo) FindByBatchID(ctx context.Context, batchID uuid.UUID, tenantID uuid.UUID) ([]*order.Order, error) {
	return nil, nil
}

func (r *testCreateOrderRepo) FindByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*order.Order, error) {
	orders := r.byTab[tabID]
	if len(orders) == 0 {
		return nil, nil
	}

	cloned := make([]*order.Order, 0, len(orders))
	for _, current := range orders {
		if current == nil || current.TenantID != tenantID {
			continue
		}
		orderClone := *current
		orderClone.Items = append([]order.OrderItem(nil), current.Items...)
		cloned = append(cloned, &orderClone)
	}
	return cloned, nil
}

func (r *testCreateOrderRepo) FindByDestinationAndStatus(ctx context.Context, destination order.Destination, status order.Status, tenantID uuid.UUID) ([]*order.Order, error) {
	return nil, nil
}

func (r *testCreateOrderRepo) ListByFilters(ctx context.Context, tenantID uuid.UUID, statuses []order.Status, destination string) ([]*order.Order, error) {
	return nil, nil
}

func (r *testCreateOrderRepo) Create(ctx context.Context, createdOrder *order.Order) error {
	cloned := *createdOrder
	cloned.Items = append([]order.OrderItem(nil), createdOrder.Items...)
	r.created = append(r.created, &cloned)
	return nil
}

func (r *testCreateOrderRepo) Update(ctx context.Context, updatedOrder *order.Order) error {
	return nil
}

type testCreateOrderBatchRepo struct {
	created []*orderbatch.OrderBatch
}

func (r *testCreateOrderBatchRepo) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*orderbatch.OrderBatch, error) {
	return nil, nil
}

func (r *testCreateOrderBatchRepo) ListByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*orderbatch.OrderBatch, error) {
	return nil, nil
}

func (r *testCreateOrderBatchRepo) Create(ctx context.Context, batch *orderbatch.OrderBatch) error {
	cloned := *batch
	r.created = append(r.created, &cloned)
	return nil
}

func (r *testCreateOrderBatchRepo) Update(ctx context.Context, batch *orderbatch.OrderBatch) error {
	return nil
}

type testCreateOrderTabRepo struct {
	tabsByID map[uuid.UUID]*tab.Tab
}

func (r *testCreateOrderTabRepo) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	current := r.tabsByID[id]
	if current == nil || current.TenantID != tenantID {
		return nil, nil
	}
	cloned := *current
	return &cloned, nil
}

func (r *testCreateOrderTabRepo) FindOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) (*tab.Tab, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) FindAllOpenByTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) ([]*tab.Tab, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) FindByTenantAndStatus(ctx context.Context, tenantID uuid.UUID, status tab.Status) ([]*tab.Tab, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) Create(ctx context.Context, current *tab.Tab) error {
	if r.tabsByID == nil {
		r.tabsByID = make(map[uuid.UUID]*tab.Tab)
	}
	cloned := *current
	r.tabsByID[current.ID] = &cloned
	return nil
}

func (r *testCreateOrderTabRepo) Update(ctx context.Context, updated *tab.Tab) error {
	cloned := *updated
	r.tabsByID[updated.ID] = &cloned
	return nil
}

func (r *testCreateOrderTabRepo) CreateJoinRequest(ctx context.Context, req *tab.TabJoinRequest) error {
	return nil
}

func (r *testCreateOrderTabRepo) FindPendingJoinRequestByOpener(ctx context.Context, openerPhone string, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) FindJoinRequestByID(ctx context.Context, id uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) FindApprovedSharedJoinRequestByRequestorAndTab(ctx context.Context, requestorPhone string, mainTabID uuid.UUID, tenantID uuid.UUID) (*tab.TabJoinRequest, error) {
	return nil, nil
}

func (r *testCreateOrderTabRepo) UpdateJoinRequestStatus(ctx context.Context, id uuid.UUID, status tab.JoinRequestStatus) error {
	return nil
}

type testCreateOrderMenuRepo struct {
	itemsByID      map[uuid.UUID]*menu.Item
	itemByIDLookup map[uuid.UUID]*menu.Item
	categoriesByID map[uuid.UUID]*menu.Category
}

func (r *testCreateOrderMenuRepo) FindCategoriesByTenant(ctx context.Context, tenantID uuid.UUID) ([]*menu.Category, error) {
	categories := make([]*menu.Category, 0)
	for _, category := range r.categoriesByID {
		if category == nil || category.TenantID != tenantID {
			continue
		}
		cloned := *category
		categories = append(categories, &cloned)
	}
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].DisplayOrder == categories[j].DisplayOrder {
			return categories[i].Name < categories[j].Name
		}
		return categories[i].DisplayOrder < categories[j].DisplayOrder
	})
	return categories, nil
}

func (r *testCreateOrderMenuRepo) FindCategoryByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*menu.Category, error) {
	category := r.categoriesByID[id]
	if category == nil || category.TenantID != tenantID {
		return nil, nil
	}
	cloned := *category
	return &cloned, nil
}

func (r *testCreateOrderMenuRepo) FindItemsByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*menu.Item, error) {
	items := make([]*menu.Item, 0)
	for _, item := range r.itemsByID {
		if item == nil || item.TenantID != tenantID {
			continue
		}
		if availableOnly && !item.Available {
			continue
		}
		cloned := *item
		items = append(items, &cloned)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].DisplayOrder == items[j].DisplayOrder {
			return items[i].Name < items[j].Name
		}
		return items[i].DisplayOrder < items[j].DisplayOrder
	})
	return items, nil
}

func (r *testCreateOrderMenuRepo) FindItemsByCategory(ctx context.Context, categoryID uuid.UUID, tenantID uuid.UUID, availableOnly bool) ([]*menu.Item, error) {
	items := make([]*menu.Item, 0)
	for _, item := range r.itemsByID {
		if item == nil || item.TenantID != tenantID || item.CategoryID == nil || *item.CategoryID != categoryID {
			continue
		}
		if availableOnly && !item.Available {
			continue
		}
		cloned := *item
		items = append(items, &cloned)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].DisplayOrder == items[j].DisplayOrder {
			return items[i].Name < items[j].Name
		}
		return items[i].DisplayOrder < items[j].DisplayOrder
	})
	return items, nil
}

func (r *testCreateOrderMenuRepo) FindItemByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*menu.Item, error) {
	item := r.itemsByID[id]
	if override, ok := r.itemByIDLookup[id]; ok {
		item = override
	}
	if item == nil || item.TenantID != tenantID {
		return nil, nil
	}
	cloned := *item
	return &cloned, nil
}

func (r *testCreateOrderMenuRepo) FindItemsByIDs(ctx context.Context, ids []uuid.UUID, tenantID uuid.UUID) ([]*menu.Item, error) {
	items := make([]*menu.Item, 0, len(ids))
	for _, id := range ids {
		item := r.itemsByID[id]
		if item == nil || item.TenantID != tenantID {
			continue
		}
		cloned := *item
		items = append(items, &cloned)
	}
	return items, nil
}

func (r *testCreateOrderMenuRepo) FindMenuByTenant(ctx context.Context, tenantID uuid.UUID, availableOnly bool) ([]*menu.Category, error) {
	return r.FindCategoriesByTenant(ctx, tenantID)
}

type testKDSEventPublisher struct {
	events []map[string]interface{}
}

func (p *testKDSEventPublisher) PublishJSON(exchange, routingKey string, data interface{}) error {
	p.events = append(p.events, map[string]interface{}{
		"exchange":    exchange,
		"routing_key": routingKey,
		"data":        data,
		"publishedAt": time.Now(),
	})
	return nil
}
