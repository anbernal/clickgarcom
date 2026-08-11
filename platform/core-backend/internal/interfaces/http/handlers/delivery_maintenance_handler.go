package handlers

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// DeliveryMaintenanceHandler owns the Redis part of delivery cleanup. The
// Node Admin remains the authority for PostgreSQL retention; this endpoint is
// deliberately narrow and only scans explicitly configured delivery key
// prefixes.
type DeliveryMaintenanceHandler struct {
	client *redis.Client
}

func NewDeliveryMaintenanceHandler(client *redis.Client) *DeliveryMaintenanceHandler {
	return &DeliveryMaintenanceHandler{client: client}
}

func (h *DeliveryMaintenanceHandler) Cleanup(c *fiber.Ctx) error {
	if h == nil || h.client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "redis maintenance unavailable"})
	}
	var request struct {
		TenantID string `json:"tenant_id"`
	}
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&request); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
		}
	}
	prefixes := configuredPrefixes()
	removed := int64(0)
	ctx := c.Context()
	for _, pattern := range prefixes {
		iter := h.client.Scan(ctx, 0, pattern, 250).Iterator()
		batch := make([]string, 0, 250)
		for iter.Next(ctx) {
			key := iter.Val()
			if request.TenantID != "" && !strings.Contains(key, request.TenantID) {
				continue
			}
			batch = append(batch, key)
			if len(batch) == 250 {
				count, err := h.client.Del(ctx, batch...).Result()
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "redis cleanup failed"})
				}
				removed += count
				batch = batch[:0]
			}
		}
		if err := iter.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "redis scan failed"})
		}
		if len(batch) > 0 {
			count, err := h.client.Del(ctx, batch...).Result()
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "redis cleanup failed"})
			}
			removed += count
		}
	}
	return c.JSON(fiber.Map{"removed": removed, "tenant_id": request.TenantID})
}

func configuredPrefixes() []string {
	raw := strings.TrimSpace(os.Getenv("DELIVERY_REDIS_KEY_PREFIXES"))
	if raw == "" {
		return []string{"delivery:tracking:*", "delivery:realtime:*", "delivery:location:*"}
	}
	result := make([]string, 0, 3)
	for _, item := range strings.Split(raw, ",") {
		if value := strings.TrimSpace(item); value != "" {
			result = append(result, value)
		}
	}
	return result
}
