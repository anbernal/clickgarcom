package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/domain/order"
)

type OrderHandler struct {
	updateStatusUC *application.UpdateOrderStatusUseCase
	logger         *zap.Logger
}

func NewOrderHandler(
	updateStatusUC *application.UpdateOrderStatusUseCase,
	logger *zap.Logger,
) *OrderHandler {
	return &OrderHandler{
		updateStatusUC: updateStatusUC,
		logger:         logger,
	}
}

type UpdateStatusRequest struct {
	Status       string `json:"status"`
	CancelReason string `json:"cancel_reason,omitempty"`
}

// UpdateOrderStatus atualiza o status de um pedido
// PATCH /orders/:id/status?tenant_id=xxx
func (h *OrderHandler) UpdateOrderStatus(c *fiber.Ctx) error {
	// Parse order ID
	orderIDStr := c.Params("id")
	orderID, err := uuid.Parse(orderIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid order_id format",
		})
	}

	// Parse tenant ID
	tenantIDStr := c.Query("tenant_id")
	if tenantIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "tenant_id is required",
		})
	}

	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid tenant_id format",
		})
	}

	// Parse request body
	var req UpdateStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	// Validar status
	newStatus := order.Status(req.Status)
	validStatuses := []order.Status{
		order.StatusAccepted,
		order.StatusReady,
		order.StatusDelivered,
		order.StatusCanceled,
	}

	isValid := false
	for _, s := range validStatuses {
		if newStatus == s {
			isValid = true
			break
		}
	}

	if !isValid {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid status. Valid values: ACCEPTED, READY, DELIVERED, CANCELED",
		})
	}

	// Executar use case
	input := application.UpdateOrderStatusInput{
		OrderID:      orderID,
		TenantID:     tenantID,
		NewStatus:    newStatus,
		CancelReason: req.CancelReason,
	}

	updatedOrder, err := h.updateStatusUC.Execute(c.Context(), input)
	if err != nil {
		h.logger.Error("failed to update order status", zap.Error(err))

		// Retornar erro específico
		if err == application.ErrOrderNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "order not found",
			})
		}

		if err == order.ErrInvalidTransition {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid status transition",
			})
		}

		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to update order status",
		})
	}

	return c.JSON(fiber.Map{
		"order": updatedOrder,
	})
}
