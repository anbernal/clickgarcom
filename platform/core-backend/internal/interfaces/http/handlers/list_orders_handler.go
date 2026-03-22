package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/order"
)

type ListOrdersHandler struct {
	orderRepo order.Repository
	logger    *zap.Logger
}

func NewListOrdersHandler(orderRepo order.Repository, logger *zap.Logger) *ListOrdersHandler {
	return &ListOrdersHandler{
		orderRepo: orderRepo,
		logger:    logger,
	}
}

// ListOrders retorna pedidos filtrados por tenant, status e destino
// GET /orders?tenant_id=xxx&status=PENDING,ACCEPTED&destination=BAR
func (h *ListOrdersHandler) ListOrders(c *fiber.Ctx) error {
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

	// Parse status filter (comma-separated)
	var statuses []order.Status
	statusStr := c.Query("status")
	if statusStr != "" {
		for _, s := range strings.Split(statusStr, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				statuses = append(statuses, order.Status(s))
			}
		}
	}

	// Parse destination filter
	destination := c.Query("destination")

	orders, err := h.orderRepo.ListByFilters(c.Context(), tenantID, statuses, destination)
	if err != nil {
		h.logger.Error("failed to list orders", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to list orders",
		})
	}

	return c.JSON(fiber.Map{
		"orders": orders,
		"count":  len(orders),
	})
}
