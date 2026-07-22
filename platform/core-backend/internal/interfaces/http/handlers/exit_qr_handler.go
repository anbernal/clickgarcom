package handlers

import (
	"net/url"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"
	"go.uber.org/zap"
)

const exitQRCodeAccessScope = "checkout_public"

type ExitQRCodeHandler struct {
	logger *zap.Logger
}

func NewExitQRCodeHandler(logger *zap.Logger) *ExitQRCodeHandler {
	return &ExitQRCodeHandler{logger: logger}
}

func (h *ExitQRCodeHandler) GetExitQRCode(c *fiber.Ctx) error {
	tabID := strings.TrimSpace(c.Params("tabId"))
	if _, err := uuid.Parse(tabID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tab id"})
	}

	accessToken := strings.TrimSpace(c.Query("access_token"))
	if !isValidExitQRCodeToken(accessToken, tabID) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid exit QR token"})
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_ADMIN_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = c.Protocol() + "://" + c.Hostname()
	}

	exitQuery := url.Values{}
	exitQuery.Set("tab_id", tabID)
	exitQuery.Set("access_token", accessToken)
	exitURL := baseURL + "/exit.html#" + exitQuery.Encode()

	image, err := qrcode.Encode(exitURL, qrcode.Medium, 512)
	if err != nil {
		h.logger.Error("failed to generate exit QR code", zap.Error(err), zap.String("tab_id", tabID))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate exit QR code"})
	}

	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "no-store, private")
	c.Set("Content-Disposition", "inline; filename=qr-saida.png")
	return c.Send(image)
}

func isValidExitQRCodeToken(rawToken, tabID string) bool {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		secret = "super-secret-key-clg-2024"
	}

	token, err := jwt.Parse(rawToken, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || token == nil || !token.Valid {
		return false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return false
	}

	scope, _ := claims["scope"].(string)
	claimTabID, _ := claims["tab_id"].(string)
	return scope == exitQRCodeAccessScope && strings.TrimSpace(claimTabID) == strings.TrimSpace(tabID)
}
