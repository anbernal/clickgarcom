package middleware

import (
	"strings"

	"github.com/anbernal/clickgarcom/internal/application/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

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
