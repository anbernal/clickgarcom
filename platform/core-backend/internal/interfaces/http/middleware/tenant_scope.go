package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// TenantScope ensures legacy request selectors cannot escape the JWT tenant.
func TenantScope(c *fiber.Ctx) error {
	tokenTenant, ok := c.Locals("tenant_id").(uuid.UUID)
	if !ok || tokenTenant == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authenticated tenant missing"})
	}

	requested := strings.TrimSpace(c.Query("tenant_id"))
	if requested == "" {
		requested = strings.TrimSpace(c.Get("X-Tenant-Id"))
	}
	if requested != "" {
		requestedTenant, err := uuid.Parse(requested)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
		}
		if requestedTenant != tokenTenant {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "tenant scope mismatch"})
		}
	}

	// Compatibility local used by legacy payment handlers.
	c.Locals("tenantID", tokenTenant)
	return c.Next()
}

func TenantParamScope(paramName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenTenant, ok := c.Locals("tenant_id").(uuid.UUID)
		if !ok || tokenTenant == uuid.Nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authenticated tenant missing"})
		}

		requestedTenant, err := uuid.Parse(strings.TrimSpace(c.Params(paramName)))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
		}
		if requestedTenant != tokenTenant {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "tenant scope mismatch"})
		}
		return c.Next()
	}
}
