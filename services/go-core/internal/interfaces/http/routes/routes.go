package routes

import (
    "github.com/gofiber/fiber/v2"
    "go.uber.org/zap"

    "github.com/anbernal11041983/clickgarcom/internal/infrastructure/persistence/postgres"
    "github.com/anbernal11041983/clickgarcom/internal/interfaces/http/handlers"
    "github.com/anbernal11041983/clickgarcom/pkg/database"
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
    
    // Handlers
    whatsappHandler := handlers.NewWhatsAppWebhookHandler(inboxRepo, rabbitMQ, logger)
    
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
}