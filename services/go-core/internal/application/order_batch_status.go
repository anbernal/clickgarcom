package application

import (
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
)

func aggregateOrderBatchStatus(orders []*order.Order) orderbatch.Status {
	total := len(orders)
	if total == 0 {
		return orderbatch.StatusPending
	}

	pendingCount := 0
	canceledCount := 0
	readyCount := 0
	deliveredCount := 0

	for _, current := range orders {
		if current == nil {
			continue
		}

		switch current.Status {
		case order.StatusPending:
			pendingCount++
		case order.StatusReady:
			readyCount++
		case order.StatusDelivered:
			deliveredCount++
		case order.StatusCanceled:
			canceledCount++
		}
	}

	activeCount := total - canceledCount
	if canceledCount == total {
		return orderbatch.StatusCanceled
	}
	if activeCount > 0 && deliveredCount == activeCount {
		return orderbatch.StatusDelivered
	}
	if activeCount > 0 && readyCount+deliveredCount == activeCount {
		return orderbatch.StatusReady
	}
	if readyCount+deliveredCount > 0 {
		return orderbatch.StatusReadyPartial
	}
	if activeCount > 0 && pendingCount == 0 {
		return orderbatch.StatusAccepted
	}

	return orderbatch.StatusPending
}

func applyAggregatedOrderBatchState(batch *orderbatch.OrderBatch, orders []*order.Order) bool {
	if batch == nil {
		return false
	}

	nextStatus := aggregateOrderBatchStatus(orders)
	now := time.Now()
	changed := false

	if batch.Status != nextStatus {
		batch.Status = nextStatus
		changed = true
	}

	if allActiveOrdersAccepted(orders) && batch.AcceptedAt == nil {
		batch.AcceptedAt = &now
		changed = true
	}

	if allActiveOrdersReady(orders) && batch.ReadyAt == nil {
		batch.ReadyAt = &now
		changed = true
	}

	if allActiveOrdersDelivered(orders) && batch.DeliveredAt == nil {
		batch.DeliveredAt = &now
		changed = true
	}

	if allOrdersCanceled(orders) {
		if batch.CanceledAt == nil {
			batch.CanceledAt = &now
			changed = true
		}
		if batch.CancelReason == "" {
			for _, current := range orders {
				if current == nil {
					continue
				}
				if reason := current.CancelReason; reason != "" {
					batch.CancelReason = reason
					changed = true
					break
				}
			}
		}
	}

	return changed
}

func allActiveOrdersAccepted(orders []*order.Order) bool {
	hasActive := false
	for _, current := range orders {
		if current == nil || current.Status == order.StatusCanceled {
			continue
		}
		hasActive = true
		if current.Status == order.StatusPending {
			return false
		}
	}
	return hasActive
}

func allActiveOrdersReady(orders []*order.Order) bool {
	hasActive := false
	for _, current := range orders {
		if current == nil || current.Status == order.StatusCanceled {
			continue
		}
		hasActive = true
		if current.Status != order.StatusReady && current.Status != order.StatusDelivered {
			return false
		}
	}
	return hasActive
}

func allActiveOrdersDelivered(orders []*order.Order) bool {
	hasActive := false
	for _, current := range orders {
		if current == nil || current.Status == order.StatusCanceled {
			continue
		}
		hasActive = true
		if current.Status != order.StatusDelivered {
			return false
		}
	}
	return hasActive
}

func allOrdersCanceled(orders []*order.Order) bool {
	if len(orders) == 0 {
		return false
	}
	for _, current := range orders {
		if current == nil || current.Status != order.StatusCanceled {
			return false
		}
	}
	return true
}
