package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

func TestGetExitQRCodeGeneratesPNGForSignedTabToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "exit-qr-test-secret")
	t.Setenv("PUBLIC_ADMIN_BASE_URL", "https://clickgarcom.example")

	tabID := uuid.New().String()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":  exitQRCodeAccessScope,
		"tab_id": tabID,
		"exp":    time.Now().Add(time.Minute).Unix(),
	}).SignedString([]byte("exit-qr-test-secret"))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}

	app := fiber.New()
	app.Get("/api/exit/:tabId/qr.png", NewExitQRCodeHandler(zap.NewNop()).GetExitQRCode)
	request := httptest.NewRequest("GET", "/api/exit/"+tabID+"/qr.png?access_token="+token, nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusOK)
	}
	if !strings.HasPrefix(response.Header.Get("Content-Type"), "image/png") {
		t.Fatalf("content type = %q, want image/png", response.Header.Get("Content-Type"))
	}
}

func TestIsValidExitQRCodeTokenRejectsAnotherTab(t *testing.T) {
	t.Setenv("JWT_SECRET", "exit-qr-test-secret")
	tabID := uuid.New().String()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"scope":  exitQRCodeAccessScope,
		"tab_id": tabID,
		"exp":    time.Now().Add(time.Minute).Unix(),
	}).SignedString([]byte("exit-qr-test-secret"))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}

	if isValidExitQRCodeToken(token, uuid.New().String()) {
		t.Fatal("token for another tab was accepted")
	}
}
