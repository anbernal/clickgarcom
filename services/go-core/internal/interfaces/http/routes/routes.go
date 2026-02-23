package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/application/auth"
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

	// Menu routes
	menu := app.Group("/menu")
	{
		menu.Get("/", menuHandler.GetFullMenu)
		menu.Get("/categories", menuHandler.GetCategories)
		menu.Get("/items", menuHandler.GetItems)
	}

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
