package routes

import (
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/infrastructure/persistence/postgres"
	"github.com/anbernal/clickgarcom/internal/infrastructure/whatsapp"
	"github.com/anbernal/clickgarcom/internal/interfaces/http/handlers"
	"github.com/anbernal/clickgarcom/pkg/database"
)

func SetupRoutes(
	app *fiber.App,
	db *database.Database,
	rabbitMQ *database.RabbitMQClient,
	logger *zap.Logger,
	whatsappVerifyToken string,
) {
	// Repositories
	inboxRepo := postgres.NewInboxRepository(db.DB)
	menuRepo := postgres.NewMenuRepository(db.DB)
	orderRepo := postgres.NewOrderRepository(db.DB)

	// WhatsApp sender
	whatsappSender := whatsapp.NewSender(db.DB, logger)

	// Use cases
	updateOrderStatusUC := application.NewUpdateOrderStatusUseCase(orderRepo, whatsappSender, logger)

	// Handlers
	whatsappHandler := handlers.NewWhatsAppWebhookHandler(inboxRepo, rabbitMQ, logger)
	menuHandler := handlers.NewMenuHandler(menuRepo, logger)
	orderHandler := handlers.NewOrderHandler(updateOrderStatusUC, logger)

	// Middleware para passar verify token
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("whatsapp_verify_token", whatsappVerifyToken)
		return c.Next()
	})

	// Routes
	webhooks := app.Group("/webhooks")
	{
		webhooks.Get("/whatsapp", whatsappHandler.HandleVerification)
		webhooks.Post("/whatsapp", whatsappHandler.HandleWebhook)
	}

	// Menu routes
	menu := app.Group("/menu")
	{
		menu.Get("/", menuHandler.GetFullMenu)
		menu.Get("/categories", menuHandler.GetCategories)
		menu.Get("/items", menuHandler.GetItems)
	}

	// Order routes
	orders := app.Group("/orders")
	{
		orders.Patch("/:id/status", orderHandler.UpdateOrderStatus)
	}
}
