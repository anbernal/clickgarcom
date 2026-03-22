package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/menu"
)

type MenuHandler struct {
	menuRepo menu.Repository
	logger   *zap.Logger
}

func NewMenuHandler(menuRepo menu.Repository, logger *zap.Logger) *MenuHandler {
	return &MenuHandler{
		menuRepo: menuRepo,
		logger:   logger,
	}
}

// GetFullMenu retorna todas as categorias com seus itens
// GET /menu?tenant_id=xxx
func (h *MenuHandler) GetFullMenu(c *fiber.Ctx) error {
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

	// Buscar menu completo (categorias com itens)
	categories, err := h.menuRepo.FindMenuByTenant(c.Context(), tenantID, true)
	if err != nil {
		h.logger.Error("failed to fetch menu", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to fetch menu",
		})
	}

	return c.JSON(fiber.Map{
		"categories": categories,
	})
}

// GetCategories retorna apenas as categorias
// GET /menu/categories?tenant_id=xxx
func (h *MenuHandler) GetCategories(c *fiber.Ctx) error {
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

	categories, err := h.menuRepo.FindCategoriesByTenant(c.Context(), tenantID)
	if err != nil {
		h.logger.Error("failed to fetch categories", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to fetch categories",
		})
	}

	return c.JSON(fiber.Map{
		"categories": categories,
	})
}

// GetItems retorna apenas os itens disponíveis
// GET /menu/items?tenant_id=xxx&category_id=yyy (category_id opcional)
func (h *MenuHandler) GetItems(c *fiber.Ctx) error {
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

	categoryIDStr := c.Query("category_id")
	var items []*menu.Item

	if categoryIDStr != "" {
		// Filtrar por categoria
		categoryID, err := uuid.Parse(categoryIDStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid category_id format",
			})
		}

		items, err = h.menuRepo.FindItemsByCategory(c.Context(), categoryID, tenantID, true)
		if err != nil {
			h.logger.Error("failed to fetch items by category", zap.Error(err))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to fetch items",
			})
		}
	} else {
		// Todos os itens disponíveis
		items, err = h.menuRepo.FindItemsByTenant(c.Context(), tenantID, true)
		if err != nil {
			h.logger.Error("failed to fetch items", zap.Error(err))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to fetch items",
			})
		}
	}

	return c.JSON(fiber.Map{
		"items": items,
	})
}
