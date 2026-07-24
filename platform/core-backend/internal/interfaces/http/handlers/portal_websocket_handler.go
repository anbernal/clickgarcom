package handlers

import (
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type portalSocketHub struct {
	mu      sync.RWMutex
	clients map[string]map[*fiberws.Conn]struct{}
}

func newPortalSocketHub() *portalSocketHub {
	return &portalSocketHub{clients: make(map[string]map[*fiberws.Conn]struct{})}
}

func (h *portalSocketHub) add(key string, conn *fiberws.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[key] == nil {
		h.clients[key] = make(map[*fiberws.Conn]struct{})
	}
	h.clients[key][conn] = struct{}{}
}

func (h *portalSocketHub) remove(key string, conn *fiberws.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients := h.clients[key]; clients != nil {
		delete(clients, conn)
		if len(clients) == 0 {
			delete(h.clients, key)
		}
	}
}

func (h *portalSocketHub) broadcast(key string, payload []byte) {
	h.mu.RLock()
	clients := make([]*fiberws.Conn, 0, len(h.clients[key]))
	for client := range h.clients[key] {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	for _, client := range clients {
		_ = client.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := client.WriteMessage(fiberws.TextMessage, payload); err != nil {
			_ = client.Close()
		}
	}
}

// PortalWebSocketHandler exposes events only to the credential's tab room.
type PortalWebSocketHandler struct {
	db     *gorm.DB
	hub    *portalSocketHub
	logger *zap.Logger
}

func NewPortalWebSocketHandler(db *gorm.DB, logger *zap.Logger) *PortalWebSocketHandler {
	return &PortalWebSocketHandler{db: db, hub: newPortalSocketHub(), logger: logger}
}

func (h *PortalWebSocketHandler) Authorize(c *fiber.Ctx) error {
	if !sameOrigin(c) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "invalid websocket origin"})
	}

	claims, err := h.parseSession(c.Cookies("clickgarcom_portal"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid portal session"})
	}

	var active bool
	err = h.db.Raw(
		`SELECT EXISTS (
			SELECT 1
			  FROM tab_portal_access_credentials c
			  JOIN tabs tb ON tb.id = c.tab_id AND tb.tenant_id = c.tenant_id
			 WHERE c.id = ?
			   AND c.tenant_id = ?
			   AND c.tab_id = ?
			   AND c.revoked_at IS NULL
			   AND (c.expires_at IS NULL OR c.expires_at > NOW())
			   AND tb.status <> 'CLOSED'
		)`, claims.credentialID, claims.tenantID, claims.tabID,
	).Scan(&active).Error
	if err != nil || !active {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "portal access unavailable"})
	}

	if !fiberws.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}
	c.Locals("portal_room", portalRoomKey(claims.tenantID, claims.tabID))
	return c.Next()
}

func (h *PortalWebSocketHandler) HandleConnection(c *fiberws.Conn) {
	room, _ := c.Locals("portal_room").(string)
	if room == "" {
		_ = c.Close()
		return
	}
	h.hub.add(room, c)
	defer func() {
		h.hub.remove(room, c)
		_ = c.Close()
	}()

	c.SetReadLimit(256)
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *PortalWebSocketHandler) HandleInternalEvent(c *fiber.Ctx) error {
	var payload struct {
		TenantID string `json:"tenant_id"`
		TabID    string `json:"tab_id"`
		Type     string `json:"type"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event payload"})
	}
	tenantID, err := uuid.Parse(strings.TrimSpace(payload.TenantID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tenant id"})
	}
	tabID, err := uuid.Parse(strings.TrimSpace(payload.TabID))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tab id"})
	}

	event, _ := json.Marshal(fiber.Map{"type": strings.TrimSpace(payload.Type)})
	h.hub.broadcast(portalRoomKey(tenantID, tabID), event)
	return c.JSON(fiber.Map{"ok": true})
}

type portalSessionClaims struct {
	credentialID uuid.UUID
	tenantID     uuid.UUID
	tabID        uuid.UUID
}

func (h *PortalWebSocketHandler) parseSession(raw string) (portalSessionClaims, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		secret = "super-secret-key-clg-2024"
	}
	token, err := jwt.Parse(raw, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || token == nil || !token.Valid {
		return portalSessionClaims{}, jwt.ErrTokenInvalidClaims
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || strings.TrimSpace(stringValue(claims["scope"])) != "tab_portal" {
		return portalSessionClaims{}, jwt.ErrTokenInvalidClaims
	}
	credentialID, err := uuid.Parse(stringValue(claims["credential_id"]))
	if err != nil {
		return portalSessionClaims{}, err
	}
	tenantID, err := uuid.Parse(stringValue(claims["tenant_id"]))
	if err != nil {
		return portalSessionClaims{}, err
	}
	tabID, err := uuid.Parse(stringValue(claims["tab_id"]))
	if err != nil {
		return portalSessionClaims{}, err
	}
	return portalSessionClaims{credentialID: credentialID, tenantID: tenantID, tabID: tabID}, nil
}

func sameOrigin(c *fiber.Ctx) bool {
	rawOrigin := strings.TrimSpace(c.Get("Origin"))
	if rawOrigin == "" {
		return false
	}
	origin, err := url.Parse(rawOrigin)
	return err == nil && strings.EqualFold(origin.Hostname(), c.Hostname())
}

func stringValue(value interface{}) string {
	text, _ := value.(string)
	return text
}

func portalRoomKey(tenantID, tabID uuid.UUID) string {
	return tenantID.String() + ":" + tabID.String()
}
