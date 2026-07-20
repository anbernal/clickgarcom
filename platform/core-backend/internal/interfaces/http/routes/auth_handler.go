package routes

import (
	"github.com/anbernal/clickgarcom/internal/application/auth"
	"github.com/gofiber/fiber/v2"
)

type AuthHandler struct {
	authService *auth.Service
}

func NewAuthHandler(authService *auth.Service) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type RegisterRequest struct {
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	// User provisioning must happen through an authenticated tenant or super-admin flow.
	// Accepting tenant_id and role from an anonymous request allows cross-tenant account creation.
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "public user registration is disabled; provision users from the tenant admin or super admin",
	})
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	token, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"token": token,
	})
}
