package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func TestTenantScopeRejectsDifferentTenant(t *testing.T) {
	tokenTenant := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	otherTenant := uuid.MustParse("550e8400-e29b-41d4-a716-446655440001")

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("tenant_id", tokenTenant)
		return c.Next()
	})
	app.Get("/orders", TenantScope, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

	request := httptest.NewRequest("GET", "/orders?tenant_id="+otherTenant.String(), nil)
	resp, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("TenantScope() status = %d, want %d", resp.StatusCode, fiber.StatusForbidden)
	}
}

func TestTenantScopeAcceptsMatchingHeaderAndSetsLegacyLocal(t *testing.T) {
	tokenTenant := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("tenant_id", tokenTenant)
		return c.Next()
	})
	app.Get("/payments", TenantScope, func(c *fiber.Ctx) error {
		if got, ok := c.Locals("tenantID").(uuid.UUID); !ok || got != tokenTenant {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	request := httptest.NewRequest("GET", "/payments", nil)
	request.Header.Set("X-Tenant-Id", tokenTenant.String())
	resp, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("TenantScope() status = %d, want %d", resp.StatusCode, fiber.StatusOK)
	}
}
