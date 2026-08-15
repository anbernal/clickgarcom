package application

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/events"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
	"github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
	"github.com/anbernal/clickgarcom/internal/infrastructure/websocket"
)

var (
	ErrOrderNotFound = errors.New("order not found")
)

// UpdateOrderStatusInput representa os dados de entrada
type UpdateOrderStatusInput struct {
	OrderID      uuid.UUID
	TenantID     uuid.UUID
	NewStatus    order.Status
	CancelReason string // Opcional, apenas para CANCELED
}

// UpdateOrderStatusUseCase implementa a lógica de atualização de status
type UpdateOrderStatusUseCase struct {
	orderRepo      order.Repository
	orderBatchRepo orderbatch.Repository
	deliveryBatch  DeliveryOrderBatchGateway
	whatsappSender WhatsAppSender
	wsHub          *websocket.Hub
	logger         *zap.Logger
}

// SetDeliveryOrderBatchGateway wires the level-triggered NestJS projection
// boundary. The status update itself remains authoritative in Core; failures
// from this optional integration are logged and retried by the delivery
// maintenance/reconciliation flow instead of blocking kitchen operations.
func (uc *UpdateOrderStatusUseCase) SetDeliveryOrderBatchGateway(gateway DeliveryOrderBatchGateway) {
	uc.deliveryBatch = gateway
}

func NewUpdateOrderStatusUseCase(
	orderRepo order.Repository,
	orderBatchRepo orderbatch.Repository,
	whatsappSender WhatsAppSender,
	wsHub *websocket.Hub,
	logger *zap.Logger,
) *UpdateOrderStatusUseCase {
	return &UpdateOrderStatusUseCase{
		orderRepo:      orderRepo,
		orderBatchRepo: orderBatchRepo,
		whatsappSender: whatsappSender,
		wsHub:          wsHub,
		logger:         logger,
	}
}

func (uc *UpdateOrderStatusUseCase) Execute(ctx context.Context, input UpdateOrderStatusInput) (*order.Order, error) {
	// 1. Buscar pedido
	existingOrder, err := uc.orderRepo.FindByIDWithItems(ctx, input.OrderID, input.TenantID)
	if err != nil {
		uc.logger.Error("order not found", zap.Error(err), zap.String("order_id", input.OrderID.String()))
		return nil, ErrOrderNotFound
	}

	// 2. Validar transição de status
	previousStatus := existingOrder.Status
	if err := existingOrder.CanTransitionTo(input.NewStatus); err != nil {
		uc.logger.Warn("invalid status transition",
			zap.String("order_id", input.OrderID.String()),
			zap.String("current_status", string(existingOrder.Status)),
			zap.String("new_status", string(input.NewStatus)),
			zap.Error(err),
		)
		return nil, err
	}

	// 3. Atualizar status (já atualiza timestamps automaticamente)
	if err := existingOrder.UpdateStatus(input.NewStatus); err != nil {
		return nil, err
	}

	// 4. Se for cancelamento, adicionar motivo
	if input.NewStatus == order.StatusCanceled && input.CancelReason != "" {
		existingOrder.CancelReason = input.CancelReason
	}

	// 5. Persistir mudanças
	if err := uc.orderRepo.Update(ctx, existingOrder); err != nil {
		uc.logger.Error("failed to update order", zap.Error(err))
		return nil, fmt.Errorf("failed to update order: %w", err)
	}

	uc.logger.Info("order status updated",
		zap.String("order_id", existingOrder.ID.String()),
		zap.String("old_status", string(previousStatus)),
		zap.String("new_status", string(input.NewStatus)),
	)

	// 6. Recalcular status agregado do batch quando aplicável
	batch, batchChanged, err := uc.syncOrderBatch(ctx, existingOrder)
	if err != nil {
		uc.logger.Error("failed to sync order batch", zap.Error(err), zap.String("order_id", existingOrder.ID.String()))
		return nil, fmt.Errorf("failed to sync order batch: %w", err)
	}
	if batchChanged && batch != nil && batch.ServiceType == orderbatch.ServiceTypeDelivery && (batch.Status == orderbatch.StatusAccepted || batch.Status == orderbatch.StatusReady) {
		uc.publishDeliveryBatchReconcile(existingOrder, batch)
	}

	// 7. Broadcast evento WebSocket
	if uc.wsHub != nil {
		event := events.NewOrderStatusChangedEvent(existingOrder)
		uc.wsHub.BroadcastToTenant(existingOrder.TenantID, event)
		uc.logger.Info("order.status_changed event broadcast",
			zap.String("order_id", existingOrder.ID.String()),
			zap.String("status", string(existingOrder.Status)),
		)
	}

	// 8. Enviar notificação WhatsApp (assíncrono, não bloqueia)
	go uc.sendStatusNotification(existingOrder)

	return existingOrder, nil
}

func (uc *UpdateOrderStatusUseCase) syncOrderBatch(ctx context.Context, currentOrder *order.Order) (*orderbatch.OrderBatch, bool, error) {
	if uc.orderBatchRepo == nil || currentOrder == nil || currentOrder.BatchID == nil || *currentOrder.BatchID == uuid.Nil {
		return nil, false, nil
	}

	batch, err := uc.orderBatchRepo.FindByID(ctx, *currentOrder.BatchID, currentOrder.TenantID)
	if err != nil || batch == nil {
		return batch, false, err
	}

	orders, err := uc.orderRepo.FindByBatchID(ctx, *currentOrder.BatchID, currentOrder.TenantID)
	if err != nil {
		return batch, false, err
	}

	if !applyAggregatedOrderBatchState(batch, orders) {
		return batch, false, nil
	}

	if err := uc.orderBatchRepo.Update(ctx, batch); err != nil {
		return batch, false, err
	}
	return batch, true, nil
}

func (uc *UpdateOrderStatusUseCase) publishDeliveryBatchReconcile(currentOrder *order.Order, batch *orderbatch.OrderBatch) {
	if uc.deliveryBatch == nil || currentOrder == nil || batch == nil {
		return
	}
	// A stable UUID makes retries/replays of the same aggregate transition
	// idempotent. Include the batch state so ACCEPTED (preparing) and READY
	// (dispatch) are independent level-triggered reconciliations.
	eventID := uuid.NewSHA1(uuid.Nil, []byte(fmt.Sprintf("delivery-batch:%s:%s:%s:%s", batch.TenantID, batch.ID, currentOrder.ID, batch.Status)))
	input := nodeadmin.DeliveryOrderBatchReconcileInput{
		TenantID: batch.TenantID,
		BatchID:  batch.ID,
		OrderID:  currentOrder.ID,
		EventID:  eventID,
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := uc.deliveryBatch.Reconcile(ctx, input); err != nil {
			uc.logger.Warn("delivery batch reconciliation failed", zap.Error(err), zap.String("tenant_id", input.TenantID.String()), zap.String("batch_id", input.BatchID.String()), zap.String("event_id", input.EventID.String()))
		}
	}()
}

func (uc *UpdateOrderStatusUseCase) sendStatusNotification(o *order.Order) {
	// TODO: buscar telefone do cliente da tab
	// Por enquanto, apenas loga
	message := uc.buildStatusMessage(o)

	uc.logger.Info("order status notification",
		zap.String("order_id", o.ID.String()),
		zap.String("status", string(o.Status)),
		zap.String("message", message),
	)

	// Quando tiver o telefone do cliente:
	// ctx := context.Background()
	// _ = uc.whatsappSender.SendMessage(ctx, phoneNumber, message)
}

func (uc *UpdateOrderStatusUseCase) buildStatusMessage(o *order.Order) string {
	switch o.Status {
	case order.StatusAccepted:
		return fmt.Sprintf("✅ *Pedido aceito!*\n\n"+
			"Seu pedido foi aceito e está sendo preparado.\n"+
			"Pedido: %s", o.ID.String()[:8])

	case order.StatusReady:
		return fmt.Sprintf("🔔 *Pedido pronto!*\n\n"+
			"Seu pedido está pronto para ser servido.\n"+
			"Pedido: %s", o.ID.String()[:8])

	case order.StatusDelivered:
		total := o.CalculateTotal()
		return fmt.Sprintf("✅ *Pedido entregue!*\n\n"+
			"Pedido: %s\n"+
			"Total: R$ %.2f\n\n"+
			"Bom apetite! 🍽️", o.ID.String()[:8], total)

	case order.StatusCanceled:
		msg := fmt.Sprintf("❌ *Pedido cancelado*\n\n"+
			"Pedido: %s", o.ID.String()[:8])
		if o.CancelReason != "" {
			msg += fmt.Sprintf("\nMotivo: %s", o.CancelReason)
		}
		return msg

	default:
		return fmt.Sprintf("📋 Status do pedido atualizado: %s", o.Status)
	}
}
