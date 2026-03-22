package application

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
)

func TestAggregateOrderBatchStatus(t *testing.T) {
	tests := []struct {
		name   string
		orders []*order.Order
		want   orderbatch.Status
	}{
		{
			name: "pending while any child is pending",
			orders: []*order.Order{
				{Status: order.StatusPending},
				{Status: order.StatusAccepted},
			},
			want: orderbatch.StatusPending,
		},
		{
			name: "accepted when all active children left pending",
			orders: []*order.Order{
				{Status: order.StatusAccepted},
				{Status: order.StatusAccepted},
			},
			want: orderbatch.StatusAccepted,
		},
		{
			name: "ready partial when only part of batch is ready",
			orders: []*order.Order{
				{Status: order.StatusReady},
				{Status: order.StatusAccepted},
			},
			want: orderbatch.StatusReadyPartial,
		},
		{
			name: "ready when all active children are ready or delivered",
			orders: []*order.Order{
				{Status: order.StatusReady},
				{Status: order.StatusDelivered},
			},
			want: orderbatch.StatusReady,
		},
		{
			name: "delivered when all active children are delivered",
			orders: []*order.Order{
				{Status: order.StatusDelivered},
				{Status: order.StatusCanceled},
			},
			want: orderbatch.StatusDelivered,
		},
		{
			name: "canceled when all children are canceled",
			orders: []*order.Order{
				{Status: order.StatusCanceled},
				{Status: order.StatusCanceled},
			},
			want: orderbatch.StatusCanceled,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := aggregateOrderBatchStatus(tt.orders); got != tt.want {
				t.Fatalf("aggregateOrderBatchStatus() = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestUpdateOrderStatusExecuteSyncsBatchStatus(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	batchID := uuid.New()
	orderID := uuid.New()
	peerOrderID := uuid.New()

	repo := &testUpdateOrderStatusRepo{
		ordersByID: map[uuid.UUID]*order.Order{
			orderID: {
				ID:       orderID,
				TenantID: tenantID,
				BatchID:  &batchID,
				Status:   order.StatusAccepted,
			},
			peerOrderID: {
				ID:       peerOrderID,
				TenantID: tenantID,
				BatchID:  &batchID,
				Status:   order.StatusAccepted,
			},
		},
		ordersByBatch: map[uuid.UUID][]*order.Order{},
	}
	repo.ordersByBatch[batchID] = []*order.Order{
		repo.ordersByID[orderID],
		repo.ordersByID[peerOrderID],
	}

	batchRepo := &testUpdateOrderBatchRepo{
		batchesByID: map[uuid.UUID]*orderbatch.OrderBatch{
			batchID: {
				ID:       batchID,
				TenantID: tenantID,
				Status:   orderbatch.StatusAccepted,
			},
		},
	}

	uc := NewUpdateOrderStatusUseCase(repo, batchRepo, nil, nil, zap.NewNop())

	updatedOrder, err := uc.Execute(ctx, UpdateOrderStatusInput{
		OrderID:   orderID,
		TenantID:  tenantID,
		NewStatus: order.StatusReady,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	if updatedOrder.Status != order.StatusReady {
		t.Fatalf("expected updated order status READY, got %s", updatedOrder.Status)
	}

	updatedBatch := batchRepo.updated[batchID]
	if updatedBatch == nil {
		t.Fatal("expected batch to be updated")
	}
	if updatedBatch.Status != orderbatch.StatusReadyPartial {
		t.Fatalf("expected batch status READY_PARTIAL, got %s", updatedBatch.Status)
	}
	if updatedBatch.AcceptedAt == nil {
		t.Fatal("expected batch acceptedAt to be set")
	}
	if updatedBatch.ReadyAt != nil {
		t.Fatal("expected batch readyAt to remain nil while batch is partial")
	}
}

type testUpdateOrderStatusRepo struct {
	ordersByID    map[uuid.UUID]*order.Order
	ordersByBatch map[uuid.UUID][]*order.Order
}

func (r *testUpdateOrderStatusRepo) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	return r.FindByIDWithItems(ctx, id, tenantID)
}

func (r *testUpdateOrderStatusRepo) FindByIDWithItems(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*order.Order, error) {
	current := r.ordersByID[id]
	if current == nil || current.TenantID != tenantID {
		return nil, nil
	}
	cloned := *current
	cloned.Items = append([]order.OrderItem(nil), current.Items...)
	return &cloned, nil
}

func (r *testUpdateOrderStatusRepo) FindByBatchID(ctx context.Context, batchID uuid.UUID, tenantID uuid.UUID) ([]*order.Order, error) {
	current := r.ordersByBatch[batchID]
	if len(current) == 0 {
		return nil, nil
	}

	orders := make([]*order.Order, 0, len(current))
	for _, existing := range current {
		if existing == nil || existing.TenantID != tenantID {
			continue
		}
		cloned := *existing
		cloned.Items = append([]order.OrderItem(nil), existing.Items...)
		orders = append(orders, &cloned)
	}
	return orders, nil
}

func (r *testUpdateOrderStatusRepo) FindByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*order.Order, error) {
	return nil, nil
}

func (r *testUpdateOrderStatusRepo) FindByDestinationAndStatus(ctx context.Context, destination order.Destination, status order.Status, tenantID uuid.UUID) ([]*order.Order, error) {
	return nil, nil
}

func (r *testUpdateOrderStatusRepo) ListByFilters(ctx context.Context, tenantID uuid.UUID, statuses []order.Status, destination string) ([]*order.Order, error) {
	return nil, nil
}

func (r *testUpdateOrderStatusRepo) Create(ctx context.Context, current *order.Order) error {
	return nil
}

func (r *testUpdateOrderStatusRepo) Update(ctx context.Context, updated *order.Order) error {
	cloned := *updated
	cloned.Items = append([]order.OrderItem(nil), updated.Items...)
	r.ordersByID[updated.ID] = &cloned

	if updated.BatchID != nil {
		orders := r.ordersByBatch[*updated.BatchID]
		for index, existing := range orders {
			if existing != nil && existing.ID == updated.ID {
				snapshot := cloned
				orders[index] = &snapshot
			}
		}
		r.ordersByBatch[*updated.BatchID] = orders
	}

	return nil
}

type testUpdateOrderBatchRepo struct {
	batchesByID map[uuid.UUID]*orderbatch.OrderBatch
	updated     map[uuid.UUID]*orderbatch.OrderBatch
}

func (r *testUpdateOrderBatchRepo) FindByID(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*orderbatch.OrderBatch, error) {
	current := r.batchesByID[id]
	if current == nil || current.TenantID != tenantID {
		return nil, nil
	}
	cloned := *current
	return &cloned, nil
}

func (r *testUpdateOrderBatchRepo) ListByTab(ctx context.Context, tabID uuid.UUID, tenantID uuid.UUID) ([]*orderbatch.OrderBatch, error) {
	return nil, nil
}

func (r *testUpdateOrderBatchRepo) Create(ctx context.Context, batch *orderbatch.OrderBatch) error {
	return nil
}

func (r *testUpdateOrderBatchRepo) Update(ctx context.Context, batch *orderbatch.OrderBatch) error {
	if r.updated == nil {
		r.updated = make(map[uuid.UUID]*orderbatch.OrderBatch)
	}
	cloned := *batch
	r.updated[batch.ID] = &cloned
	r.batchesByID[batch.ID] = &cloned
	return nil
}
