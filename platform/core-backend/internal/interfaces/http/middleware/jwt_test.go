package middleware

import (
	"net/http/httptest"
	"testing"

	applicationauth "github.com/anbernal/clickgarcom/internal/application/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func TestInternalOrJWTAuthAcceptsScopedInternalRequest(t *testing.T) {
	tenantID := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	app := fiber.New()
	app.Post("/payments/card", InternalOrJWTAuth(applicationauth.NewService(nil, "jwt-secret", 0), "internal-secret"), TenantScope, func(c *fiber.Ctx) error {
		if got, ok := c.Locals("tenant_id").(uuid.UUID); !ok || got != tenantID {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	request := httptest.NewRequest("POST", "/payments/card", nil)
	request.Header.Set("X-Internal-Token", "internal-secret")
	request.Header.Set("X-Tenant-Id", tenantID.String())
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("InternalOrJWTAuth() status = %d, want %d", response.StatusCode, fiber.StatusOK)
	}
}

func TestInternalOrJWTAuthRejectsInvalidInternalToken(t *testing.T) {
	app := fiber.New()
	app.Post("/payments/card", InternalOrJWTAuth(applicationauth.NewService(nil, "jwt-secret", 0), "internal-secret"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	request := httptest.NewRequest("POST", "/payments/card", nil)
	request.Header.Set("X-Internal-Token", "wrong-secret")
	request.Header.Set("X-Tenant-Id", "550e8400-e29b-41d4-a716-446655440000")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("InternalOrJWTAuth() status = %d, want %d", response.StatusCode, fiber.StatusUnauthorized)
	}
}

func TestInternalOrJWTAuthRequiresTenantForInternalRequest(t *testing.T) {
	app := fiber.New()
	app.Post("/payments/card", InternalOrJWTAuth(applicationauth.NewService(nil, "jwt-secret", 0), "internal-secret"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	request := httptest.NewRequest("POST", "/payments/card", nil)
	request.Header.Set("X-Internal-Token", "internal-secret")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if response.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("InternalOrJWTAuth() status = %d, want %d", response.StatusCode, fiber.StatusUnauthorized)
	}
}
