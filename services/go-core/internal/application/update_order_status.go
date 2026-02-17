package application

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/order"
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
	whatsappSender WhatsAppSender
	logger         *zap.Logger
}

func NewUpdateOrderStatusUseCase(
	orderRepo order.Repository,
	whatsappSender WhatsAppSender,
	logger *zap.Logger,
) *UpdateOrderStatusUseCase {
	return &UpdateOrderStatusUseCase{
		orderRepo:      orderRepo,
		whatsappSender: whatsappSender,
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
		zap.String("old_status", string(existingOrder.Status)),
		zap.String("new_status", string(input.NewStatus)),
	)

	// 6. Enviar notificação WhatsApp (assíncrono, não bloqueia)
	go uc.sendStatusNotification(existingOrder)

	return existingOrder, nil
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
