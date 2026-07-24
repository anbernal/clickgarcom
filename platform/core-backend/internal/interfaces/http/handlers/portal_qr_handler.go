package handlers

import (
	"net/url"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	qrcode "github.com/skip2/go-qrcode"
	"go.uber.org/zap"
)

// PortalQRCodeHandler renders a QR that carries an opaque, revocable portal credential.
type PortalQRCodeHandler struct {
	logger *zap.Logger
}

func NewPortalQRCodeHandler(logger *zap.Logger) *PortalQRCodeHandler {
	return &PortalQRCodeHandler{logger: logger}
}

func (h *PortalQRCodeHandler) GetPortalQRCode(c *fiber.Ctx) error {
	accessToken := strings.TrimSpace(c.Query("access_token"))
	if len(accessToken) < 32 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid portal access token"})
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_ADMIN_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = c.Protocol() + "://" + c.Hostname()
	}

	fragment := url.Values{}
	fragment.Set("access_token", accessToken)
	portalURL := baseURL + "/portal.html#" + fragment.Encode()
	image, err := qrcode.Encode(portalURL, qrcode.Medium, 512)
	if err != nil {
		h.logger.Error("failed to generate portal QR code", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate portal QR code"})
	}

	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "no-store, private")
	c.Set("Content-Disposition", "inline; filename=qr-comanda.png")
	return c.Send(image)
}
