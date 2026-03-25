package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/anbernal/clickgarcom/internal/application/receipt"
	"github.com/anbernal/clickgarcom/internal/domain/menu"
	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/tab"
	"github.com/anbernal/clickgarcom/internal/domain/table"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

type ReceiptHandler struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewReceiptHandler(db *gorm.DB, logger *zap.Logger) *ReceiptHandler {
	return &ReceiptHandler{db: db, logger: logger}
}

func (h *ReceiptHandler) GetReceiptImage(c *fiber.Ctx) error {
	tabIDStr := c.Params("tabId")
	tabID, err := uuid.Parse(tabIDStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid tab id"})
	}

	ctx := c.Context()

	// 1. Load the tab
	var t tab.Tab
	if err := h.db.WithContext(ctx).First(&t, "id = ?", tabID).Error; err != nil {
		h.logger.Warn("receipt: tab not found", zap.String("tab_id", tabIDStr), zap.Error(err))
		return c.Status(404).JSON(fiber.Map{"error": "tab not found"})
	}

	// 2. Load the tenant
	var tenant tenant.Tenant
	if err := h.db.WithContext(ctx).First(&tenant, "id = ?", t.TenantID).Error; err != nil {
		h.logger.Warn("receipt: tenant not found", zap.String("tenant_id", t.TenantID.String()), zap.Error(err))
		return c.Status(404).JSON(fiber.Map{"error": "tenant not found"})
	}

	// 3. Load all orders for this tab with items
	var orders []order.Order
	if err := h.db.WithContext(ctx).
		Preload("Items").
		Where("tab_id = ? AND status != ?", tabID, order.StatusCanceled).
		Find(&orders).Error; err != nil {
		h.logger.Error("receipt: failed to load orders", zap.Error(err))
		return c.Status(500).JSON(fiber.Map{"error": "failed to load orders"})
	}

	// 4. Collect all menu item IDs
	menuItemIDSet := make(map[uuid.UUID]bool)
	for _, o := range orders {
		for _, item := range o.Items {
			menuItemIDSet[item.MenuItemID] = true
		}
	}

	menuItemIDs := make([]uuid.UUID, 0, len(menuItemIDSet))
	for id := range menuItemIDSet {
		menuItemIDs = append(menuItemIDs, id)
	}

	// 5. Load menu item names
	var menuItems []menu.Item
	if len(menuItemIDs) > 0 {
		h.db.WithContext(ctx).Where("id IN ?", menuItemIDs).Find(&menuItems)
	}
	menuNameMap := make(map[uuid.UUID]string, len(menuItems))
	for _, mi := range menuItems {
		menuNameMap[mi.ID] = mi.Name
	}

	// 6. Build receipt items (aggregate duplicates)
	type itemKey struct {
		MenuItemID uuid.UUID
		UnitPrice  float64
	}
	aggregated := make(map[itemKey]*receipt.ReceiptItem)
	var aggregatedOrder []itemKey

	for _, o := range orders {
		for _, item := range o.Items {
			key := itemKey{MenuItemID: item.MenuItemID, UnitPrice: item.UnitPrice}
			if existing, ok := aggregated[key]; ok {
				existing.Quantity += item.Quantity
			} else {
				name := menuNameMap[item.MenuItemID]
				if name == "" {
					name = "Item"
				}
				aggregated[key] = &receipt.ReceiptItem{
					Name:     name,
					Quantity: item.Quantity,
					Price:    item.UnitPrice,
				}
				aggregatedOrder = append(aggregatedOrder, key)
			}
		}
	}

	receiptItems := make([]receipt.ReceiptItem, 0, len(aggregated))
	for _, key := range aggregatedOrder {
		receiptItems = append(receiptItems, *aggregated[key])
	}

	// 7. Table number (if available)
	tableNumber := ""
	if t.TableID != nil {
		var tbl table.Table
		if err := h.db.WithContext(ctx).First(&tbl, "id = ?", *t.TableID).Error; err == nil {
			tableNumber = tbl.Number
		}
	}

	// 8. Service fee percent
	servicePct := 10.0
	if tenant.Settings.ServiceFeePercent > 0 {
		servicePct = tenant.Settings.ServiceFeePercent
	}

	// 9. Generate the image
	data := receipt.ReceiptData{
		RestaurantName: tenant.Name,
		TableNumber:    tableNumber,
		TabID:          t.ID.String(),
		Items:          receiptItems,
		Subtotal:       t.Subtotal,
		ServiceFee:     t.ServiceFee,
		ServicePercent: servicePct,
		Total:          t.Total,
		GeneratedAt:    time.Now(),
	}

	imgBytes, err := receipt.GenerateReceiptImage(data)
	if err != nil {
		h.logger.Error("receipt: failed to generate image", zap.Error(err))
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate receipt image"})
	}

	// 10. Set cache headers (short-lived, receipts change)
	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "public, max-age=30")
	c.Set("Content-Disposition", fmt.Sprintf("inline; filename=comanda-%s.png", tabIDStr[:8]))

	return c.Send(imgBytes)
}
