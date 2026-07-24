package routes

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/application/auth"
	"github.com/anbernal/clickgarcom/internal/domain/events"
	sessiondomain "github.com/anbernal/clickgarcom/internal/domain/inbox/session"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	whatsappDomain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	infraMP "github.com/anbernal/clickgarcom/internal/infrastructure/payment"
	"github.com/anbernal/clickgarcom/internal/infrastructure/persistence/postgres"
	"github.com/anbernal/clickgarcom/internal/infrastructure/websocket"
	"github.com/anbernal/clickgarcom/internal/infrastructure/whatsapp"
	"github.com/anbernal/clickgarcom/internal/interfaces/http/handlers"
	"github.com/anbernal/clickgarcom/internal/interfaces/http/middleware"
	"github.com/anbernal/clickgarcom/pkg/database"
)

func SetupRoutes(
	app *fiber.App,
	db *database.Database,
	rabbitMQ *database.RabbitMQClient,
	wsHub *websocket.Hub,
	logger *zap.Logger,
	authService *auth.Service,
	whatsappVerifyToken string,
	apiClient *whatsapp.MetaAPIClient,
	redisClient *database.RedisClient,
) {
	// Repositories
	inboxRepo := postgres.NewInboxRepository(db.DB)
	menuRepo := postgres.NewMenuRepository(db.DB)
	orderRepo := postgres.NewOrderRepository(db.DB)
	orderBatchRepo := postgres.NewOrderBatchRepository(db.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)
	logRepo := postgres.NewMessageLogRepository(db.DB)
	paymentRepo := postgres.NewPaymentRepository(db.DB)
	paymentAttemptRepo := postgres.NewPaymentAttemptRepository(db.DB)

	// Payment Client
	mpClient := infraMP.NewMercadoPagoClient(logger)

	// WhatsApp sender
	whatsappSender := whatsapp.NewSender(db.DB, apiClient, logger)

	// Use cases
	updateOrderStatusUC := application.NewUpdateOrderStatusUseCase(orderRepo, orderBatchRepo, whatsappSender, wsHub, logger)

	// Handlers
	whatsappHandler := handlers.NewWhatsAppWebhookHandler(inboxRepo, tenantRepo, logRepo, rabbitMQ, logger)
	paymentHandler := handlers.NewPaymentHandler(paymentRepo, paymentAttemptRepo, orderRepo, tenantRepo, mpClient, rabbitMQ, logger)
	menuHandler := handlers.NewMenuHandler(menuRepo, logger)
	orderHandler := handlers.NewOrderHandler(updateOrderStatusUC, logger)
	listOrdersHandler := handlers.NewListOrdersHandler(orderRepo, logger)
	authHandler := NewAuthHandler(authService)

	// Middleware para passar verify token
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("whatsapp_verify_token", whatsappVerifyToken)
		return c.Next()
	})

	internalToken := strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN"))
	if internalToken == "" {
		internalToken = "clickgarcom-internal-token"
	}

	// Tenant-scoped routes must derive scope from the authenticated JWT.
	jwtAuth := middleware.JWTAuth(authService)

	registerPublicCheckoutProxyRoutes(app, logger)
	portalWebSocketHandler := handlers.NewPortalWebSocketHandler(db.DB, logger)
	app.Post("/internal/portal/events", func(c *fiber.Ctx) error {
		if strings.TrimSpace(c.Get("X-Internal-Token")) != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}
		return portalWebSocketHandler.HandleInternalEvent(c)
	})

	// Auth routes
	authGrp := app.Group("/auth")
	{
		authGrp.Post("/register", authHandler.Register)
		authGrp.Post("/login", authHandler.Login)
	}

	// Routes
	webhooks := app.Group("/webhooks")
	{
		webhooks.Get("/whatsapp", whatsappHandler.HandleVerification)
		webhooks.Post("/whatsapp", whatsappHandler.HandleWebhook)
		webhooks.Post("/mercadopago", paymentHandler.HandleWebhook)
	}

	// Payments routes
	payments := app.Group("/payments", jwtAuth, middleware.TenantScope)
	{
		payments.Post("/pix", paymentHandler.CreatePixPayment)
		payments.Post("/card", paymentHandler.CreateCardPayment)
		payments.Get("/:paymentId/status", paymentHandler.GetPaymentStatus)
		payments.Get("/mp/:mpID/status", paymentHandler.GetMercadoPagoPaymentStatus)
	}

	// Wallet routes (Phase 13)
	wallet := app.Group("/wallet", jwtAuth, middleware.TenantScope)
	{
		wallet.Get("/balance", paymentHandler.GetWalletBalance)
	}

	// Metrics route
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// Meta API Testing route (Super Admin)
	app.Post("/admin/test-whatsapp", func(c *fiber.Ctx) error {
		if strings.TrimSpace(c.Get("X-Internal-Token")) != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}
		var req struct {
			Phone string `json:"phone"`
		}
		_ = c.BodyParser(&req)

		if req.Phone == "" {
			req.Phone = "5511975062841" // Default test number specified by user
		}

		_, err := apiClient.SendTemplateMessage(c.Context(), req.Phone, "hello_world")
		if err != nil {
			logger.Error("failed to send test msg", zap.Error(err))
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"status": "delivered", "to": req.Phone})
	})

	// Debug route to clear WhatsApp sessions
	app.Post("/admin/api/debug/clear-sessions", func(c *fiber.Ctx) error {
		if strings.TrimSpace(c.Get("X-Internal-Token")) != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}
		ctx := c.Context()
		iter := redisClient.Client.Scan(ctx, 0, "session:*", 0).Iterator()
		count := 0
		for iter.Next(ctx) {
			key := iter.Val()
			if err := redisClient.Client.Del(ctx, key).Err(); err == nil {
				count++
			}
		}
		if err := iter.Err(); err != nil {
			logger.Error("failed to scan redis sessions", zap.Error(err))
			return c.Status(500).JSON(fiber.Map{"error": "Failed to clear sessions"})
		}
		return c.JSON(fiber.Map{"status": "success", "cleared": count})
	})

	app.Post("/internal/sessions/release", func(c *fiber.Ctx) error {
		if strings.TrimSpace(c.Get("X-Internal-Token")) != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}

		var req struct {
			TenantID  string `json:"tenant_id"`
			UserPhone string `json:"user_phone"`
			TabID     string `json:"tab_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
		}

		tenantID := strings.TrimSpace(req.TenantID)
		userPhone := strings.TrimSpace(req.UserPhone)
		tabIDRaw := strings.TrimSpace(req.TabID)
		if tenantID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tenant_id is required"})
		}
		if userPhone == "" && tabIDRaw == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_phone or tab_id is required"})
		}

		var targetTabID uuid.UUID
		hasTabID := false
		if tabIDRaw != "" {
			parsedTabID, err := uuid.Parse(tabIDRaw)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tab_id"})
			}
			targetTabID = parsedTabID
			hasTabID = true
		}

		ctx := c.Context()
		iter := redisClient.Client.Scan(ctx, 0, "session:"+tenantID+":*", 0).Iterator()
		scanned := 0
		cleared := 0

		for iter.Next(ctx) {
			key := iter.Val()
			scanned++

			rawSession, err := redisClient.Client.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}

			var sess sessiondomain.Session
			if err := json.Unmarshal(rawSession, &sess); err != nil {
				continue
			}

			matchesPhone := userPhone != "" && strings.TrimSpace(sess.UserPhone) == userPhone
			matchesTab := hasTabID && sess.TabID != nil && *sess.TabID == targetTabID
			if !matchesPhone && !matchesTab {
				continue
			}

			if err := redisClient.Client.Del(ctx, key).Err(); err == nil {
				cleared++
			}
		}

		if err := iter.Err(); err != nil {
			logger.Error("failed to scan redis sessions for targeted release", zap.Error(err))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to release sessions"})
		}

		return c.JSON(fiber.Map{
			"status":    "success",
			"tenant_id": tenantID,
			"tab_id":    tabIDRaw,
			"cleared":   cleared,
			"scanned":   scanned,
		})
	})

	app.Post("/internal/kds/events/broadcast", func(c *fiber.Ctx) error {
		if strings.TrimSpace(c.Get("X-Internal-Token")) != internalToken {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid internal token"})
		}

		var event events.OrderEvent
		if err := c.BodyParser(&event); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
		}
		if event.TenantID == uuid.Nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tenant_id is required"})
		}
		if event.Data == nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "data is required"})
		}

		wsHub.BroadcastToTenant(event.TenantID, &event)
		logger.Debug("internal kds event broadcast",
			zap.String("tenant_id", event.TenantID.String()),
			zap.String("event_type", string(event.Type)),
		)

		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Menu routes
	menu := app.Group("/menu")
	{
		menu.Get("/", menuHandler.GetFullMenu)
		menu.Get("/categories", menuHandler.GetCategories)
		menu.Get("/items", menuHandler.GetItems)
	}

	// ─── Fase 16: Customizable Message Templates ───

	app.Get("/api/tenants/:id/messages", jwtAuth, middleware.TenantParamScope("id"), func(c *fiber.Ctx) error {
		tenantID, err := uuid.Parse(c.Params("id"))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid tenant id"})
		}

		t, err := tenantRepo.FindByID(c.Context(), tenantID)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "tenant not found"})
		}

		// Merge: retorna o custom se existir, senão o default
		defaults := whatsappDomain.DefaultMessageTemplates()
		custom := t.Settings.Messages

		merged := defaults
		if custom.Welcome != "" {
			merged.Welcome = custom.Welcome
		}
		if custom.RestaurantClosed != "" {
			merged.RestaurantClosed = custom.RestaurantClosed
		}
		if custom.WelcomeTable != "" {
			merged.WelcomeTable = custom.WelcomeTable
		}
		if custom.TablePending != "" {
			merged.TablePending = custom.TablePending
		}
		if custom.TableApproved != "" {
			merged.TableApproved = custom.TableApproved
		}
		if custom.MainMenu != "" {
			merged.MainMenu = custom.MainMenu
		}
		if custom.InvalidOption != "" {
			merged.InvalidOption = custom.InvalidOption
		}
		if custom.OrderConfirmed != "" {
			merged.OrderConfirmed = custom.OrderConfirmed
		}
		if custom.OrderReady != "" {
			merged.OrderReady = custom.OrderReady
		}
		if custom.TabSummary != "" {
			merged.TabSummary = custom.TabSummary
		}
		if custom.ServiceRequest != "" {
			merged.ServiceRequest = custom.ServiceRequest
		}
		if custom.PaymentPending != "" {
			merged.PaymentPending = custom.PaymentPending
		}
		if custom.PaymentConfirmed != "" {
			merged.PaymentConfirmed = custom.PaymentConfirmed
		}

		return c.JSON(fiber.Map{
			"tenant_id": t.ID,
			"messages":  merged,
			"defaults":  defaults,
		})
	})

	app.Put("/api/tenants/:id/messages", jwtAuth, middleware.TenantParamScope("id"), func(c *fiber.Ctx) error {
		tenantID, err := uuid.Parse(c.Params("id"))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid tenant id"})
		}

		t, err := tenantRepo.FindByID(c.Context(), tenantID)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "tenant not found"})
		}

		var msgs tenant.MessageTemplates
		if err := c.BodyParser(&msgs); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
		}

		// Atualizar somente os messages dentro das settings
		t.Settings.Messages = msgs

		if err := db.DB.Model(&t).Update("settings", t.Settings).Error; err != nil {
			logger.Error("failed to save tenant messages", zap.Error(err))
			return c.Status(500).JSON(fiber.Map{"error": "failed to save"})
		}

		return c.JSON(fiber.Map{
			"status":   "updated",
			"messages": t.Settings.Messages,
		})
	})

	// Receipt image (public — Meta API fetches this URL)
	receiptHandler := handlers.NewReceiptHandler(db.DB, logger)
	app.Get("/api/receipt/:tabId/image.png", receiptHandler.GetReceiptImage)

	// Exit QR image (public for Meta API, protected by the short-lived signed token)
	exitQRCodeHandler := handlers.NewExitQRCodeHandler(logger)
	app.Get("/api/exit/:tabId/qr.png", exitQRCodeHandler.GetExitQRCode)

	// Portal QR is a revocable opaque credential. The token itself is required to render it.
	portalQRCodeHandler := handlers.NewPortalQRCodeHandler(logger)
	app.Get("/api/portal/qr.png", portalQRCodeHandler.GetPortalQRCode)

	// Order routes (Protected)
	orders := app.Group("/orders", jwtAuth, middleware.TenantScope)
	{
		orders.Get("/", listOrdersHandler.ListOrders)
		orders.Patch("/:id/status", orderHandler.UpdateOrderStatus)
	}

	// WebSocket routes
	ws := app.Group("/ws")
	wsHandler := handlers.NewWebSocketHandler(wsHub, logger)
	{
		// Upgrade middleware para WebSocket com validação JWT
		ws.Use("/kds", jwtAuth, middleware.TenantScope, func(c *fiber.Ctx) error {
			if fiberws.IsWebSocketUpgrade(c) {
				return c.Next()
			}
			return fiber.ErrUpgradeRequired
		})
		ws.Get("/kds", wsHandler.HandleKDS, fiberws.New(wsHandler.HandleKDSConnection, fiberws.Config{
			EnableCompression: true,
		}))
		ws.Use("/portal", portalWebSocketHandler.Authorize)
		ws.Get("/portal", fiberws.New(portalWebSocketHandler.HandleConnection, fiberws.Config{
			EnableCompression: true,
		}))
	}
}

func registerPublicCheckoutProxyRoutes(app *fiber.App, logger *zap.Logger) {
	webBaseURL := strings.TrimRight(resolvePublicWebProxyBaseURL(), "/")
	adminAPIBaseURL := strings.TrimRight(resolvePublicAdminAPIProxyBaseURL(), "/")

	webHandler := func(c *fiber.Ctx) error {
		targetURL := webBaseURL + c.OriginalURL()
		if err := proxy.Do(c, targetURL); err != nil {
			logger.Warn("failed to proxy public web request",
				zap.Error(err),
				zap.String("path", c.OriginalURL()),
			)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error": "public_web_unavailable",
			})
		}
		return nil
	}

	adminAPIHandler := func(c *fiber.Ctx) error {
		targetURL := adminAPIBaseURL + c.OriginalURL()
		if err := proxy.Do(c, targetURL); err != nil {
			logger.Warn("failed to proxy public admin api request",
				zap.Error(err),
				zap.String("path", c.OriginalURL()),
			)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error": "checkout_public_unavailable",
			})
		}
		return nil
	}

	app.All("/checkout.html", webHandler)
	app.All("/portal.html", webHandler)
	app.All("/css/*", webHandler)
	app.All("/js/*", webHandler)
	app.All("/assets/*", webHandler)
	app.All("/data/*", webHandler)
	app.All("/_config.js", webHandler)
	app.All("/admin/api/public/tables", adminAPIHandler)
	app.All("/admin/api/public/tables/*", adminAPIHandler)
}

func resolvePublicWebProxyBaseURL() string {
	candidates := []string{
		os.Getenv("PUBLIC_WEB_INTERNAL_BASE_URL"),
		os.Getenv("WEB_ADMIN_INTERNAL_BASE_URL"),
		"http://web-admin:3004",
		"http://localhost:3004",
	}

	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base != "" {
			return base
		}
	}

	return "http://web-admin:3004"
}

func resolvePublicAdminAPIProxyBaseURL() string {
	candidates := []string{
		os.Getenv("PUBLIC_ADMIN_INTERNAL_BASE_URL"),
		os.Getenv("ADMIN_INTERNAL_BASE_URL"),
		"http://node-admin:3002",
		"http://localhost:3002",
	}

	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base != "" {
			return base
		}
	}

	return "http://node-admin:3002"
}
