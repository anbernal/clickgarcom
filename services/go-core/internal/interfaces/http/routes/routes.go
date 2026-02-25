package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/application/auth"
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
) {
	// Repositories
	inboxRepo := postgres.NewInboxRepository(db.DB)
	menuRepo := postgres.NewMenuRepository(db.DB)
	orderRepo := postgres.NewOrderRepository(db.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)
	logRepo := postgres.NewMessageLogRepository(db.DB)
	paymentRepo := postgres.NewPaymentRepository(db.DB)

	// Payment Client
	mpClient := infraMP.NewMercadoPagoClient(logger)

	// WhatsApp sender
	whatsappSender := whatsapp.NewSender(db.DB, apiClient, logger)

	// Use cases
	updateOrderStatusUC := application.NewUpdateOrderStatusUseCase(orderRepo, whatsappSender, wsHub, logger)

	// Handlers
	whatsappHandler := handlers.NewWhatsAppWebhookHandler(inboxRepo, tenantRepo, logRepo, rabbitMQ, logger)
	paymentHandler := handlers.NewPaymentHandler(paymentRepo, tenantRepo, mpClient, rabbitMQ, logger)
	menuHandler := handlers.NewMenuHandler(menuRepo, logger)
	orderHandler := handlers.NewOrderHandler(updateOrderStatusUC, logger)
	listOrdersHandler := handlers.NewListOrdersHandler(orderRepo, logger)
	authHandler := NewAuthHandler(authService)

	// Middleware para passar verify token
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("whatsapp_verify_token", whatsappVerifyToken)
		return c.Next()
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
	payments := app.Group("/payments")
	{
		payments.Post("/pix", paymentHandler.CreatePixPayment)
		payments.Post("/card", paymentHandler.CreateCardPayment)
	}

	// Wallet routes (Phase 13)
	wallet := app.Group("/wallet")
	{
		wallet.Get("/balance", paymentHandler.GetWalletBalance)
	}

	// Metrics route
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// Meta API Testing route (Super Admin)
	app.Post("/admin/test-whatsapp", func(c *fiber.Ctx) error {
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

	// Menu routes
	menu := app.Group("/menu")
	{
		menu.Get("/", menuHandler.GetFullMenu)
		menu.Get("/categories", menuHandler.GetCategories)
		menu.Get("/items", menuHandler.GetItems)
	}

	// ─── Fase 16: Customizable Message Templates ───

	app.Get("/api/tenants/:id/messages", func(c *fiber.Ctx) error {
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

	app.Put("/api/tenants/:id/messages", func(c *fiber.Ctx) error {
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

	// Middleware JWT
	jwtAuth := middleware.JWTAuth(authService)

	// Order routes (Protected)
	orders := app.Group("/orders", jwtAuth)
	{
		orders.Get("/", listOrdersHandler.ListOrders)
		orders.Patch("/:id/status", orderHandler.UpdateOrderStatus)
	}

	// WebSocket routes
	ws := app.Group("/ws")
	wsHandler := handlers.NewWebSocketHandler(wsHub, logger)
	{
		// Upgrade middleware para WebSocket com validação JWT
		ws.Use("/kds", jwtAuth, func(c *fiber.Ctx) error {
			if fiberws.IsWebSocketUpgrade(c) {
				return c.Next()
			}
			return fiber.ErrUpgradeRequired
		})
		ws.Get("/kds", wsHandler.HandleKDS, fiberws.New(wsHandler.HandleKDSConnection, fiberws.Config{
			EnableCompression: true,
		}))
	}
}
