package middleware

import (
	"crypto/subtle"
	"strings"

	"github.com/anbernal/clickgarcom/internal/application/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// InternalOrJWTAuth authenticates service-to-service requests with the shared
// internal token while preserving the regular JWT flow for user requests.
// Internal callers must explicitly provide the tenant header; this prevents a
// trusted service request from running without a bounded tenant scope.
func InternalOrJWTAuth(authService *auth.Service, internalToken string) fiber.Handler {
	jwtHandler := JWTAuth(authService)
	expectedInternalToken := strings.TrimSpace(internalToken)

	return func(c *fiber.Ctx) error {
		providedInternalToken := strings.TrimSpace(c.Get("X-Internal-Token"))
		if providedInternalToken == "" {
			return jwtHandler(c)
		}
		if expectedInternalToken == "" || len(providedInternalToken) != len(expectedInternalToken) ||
			subtle.ConstantTimeCompare([]byte(providedInternalToken), []byte(expectedInternalToken)) != 1 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}

		tenantID, err := uuid.Parse(strings.TrimSpace(c.Get("X-Tenant-Id")))
		if err != nil || tenantID == uuid.Nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "internal tenant missing or invalid"})
		}

		c.Locals("user_id", uuid.Nil)
		c.Locals("tenant_id", tenantID)
		c.Locals("role", "INTERNAL_SERVICE")
		return c.Next()
	}
}

func JWTAuth(authService *auth.Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Pega token do Header Authorization: Bearer <token>
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			// Suporte alternativo: Query param ?token= para WebSockets
			authHeader = c.Query("token")
		}

		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authorization token"})
		}

		parts := strings.Split(authHeader, " ")
		var tokenStr string
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			tokenStr = parts[1]
		} else {
			tokenStr = authHeader // caso tenha vindo na query
		}

		claims, err := authService.ValidateToken(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		// Injetar dados do usuário no contexto
		userID, _ := uuid.Parse(claims.UserID)
		tenantID, _ := uuid.Parse(claims.TenantID)

		c.Locals("user_id", userID)
		c.Locals("tenant_id", tenantID)
		c.Locals("role", claims.Role)

		return c.Next()
	}
}
