package main

import (
    "context"
    "encoding/json"
    "fmt"
    "os"
    "os/signal"
    "syscall"

    "github.com/google/uuid"
    "go.uber.org/zap"

    "github.com/anbernal11041983/clickgarcom/internal/application"
    "github.com/anbernal11041983/clickgarcom/internal/config"
    "github.com/anbernal11041983/clickgarcom/internal/infrastructure/persistence/postgres"
    "github.com/anbernal11041983/clickgarcom/internal/infrastructure/queue/rabbitmq"
    "github.com/anbernal11041983/clickgarcom/pkg/database"
    "github.com/anbernal11041983/clickgarcom/pkg/logger"
)

func main() {
    // 1. Carregar configurações
    cfg, err := config.Load()
    if err != nil {
        fmt.Printf("Failed to load config: %v\n", err)
        os.Exit(1)
    }

    // 2. Inicializar logger
    if err := logger.Initialize(cfg.Log.Level, cfg.Log.Format); err != nil {
        fmt.Printf("Failed to initialize logger: %v\n", err)
        os.Exit(1)
    }
    defer logger.Sync()

    logger.Info("Starting ClickGarçom Worker",
        zap.String("env", cfg.App.Env),
    )

    // 3. Conectar ao Postgres
    db, err := database.NewPostgresConnection(
        cfg.GetDatabaseDSN(),
        cfg.Database.MaxConnections,
        cfg.Database.MaxIdleConns,
        cfg.Log.Level,
    )
    if err != nil {
        logger.Fatal("Failed to connect to database", zap.Error(err))
    }
    defer db.Close()
    logger.Info("Connected to PostgreSQL successfully")

    // 4. Conectar ao RabbitMQ
    rabbitMQClient, err := database.NewRabbitMQConnection(
        cfg.GetRabbitMQURL(),
        logger.Log,
    )
    if err != nil {
        logger.Fatal("Failed to connect to rabbitmq", zap.Error(err))
    }
    defer rabbitMQClient.Close()
    logger.Info("Connected to RabbitMQ successfully")

    // 5. Repositories
    inboxRepo := postgres.NewInboxRepository(db.DB)
    tenantRepo := postgres.NewTenantRepository(db.DB)

    // 6. Use Cases
    processWhatsAppMsg := application.NewProcessWhatsAppMessageUseCase(
        inboxRepo,
        tenantRepo,
        logger.Log,
    )

    // 7. Consumer
    consumer := rabbitmq.NewConsumer(rabbitMQClient.GetChannel(), logger.Log)

    // 8. Handler de mensagens do WhatsApp
    handleWhatsAppMessage := func(ctx context.Context, body []byte) error {
        var payload struct {
            InboxID string `json:"inbox_id"`
            WAMID   string `json:"wamid"`
        }

        if err := json.Unmarshal(body, &payload); err != nil {
            return fmt.Errorf("failed to unmarshal payload: %w", err)
        }

        inboxID, err := uuid.Parse(payload.InboxID)
        if err != nil {
            return fmt.Errorf("invalid inbox_id: %w", err)
        }

        logger.Debug("processing whatsapp message",
            zap.String("inbox_id", payload.InboxID),
            zap.String("wamid", payload.WAMID),
        )

        return processWhatsAppMsg.Execute(ctx, inboxID)
    }

    // 9. Iniciar consumer
    if err := consumer.Consume("whatsapp.messages", handleWhatsAppMessage); err != nil {
        logger.Fatal("Failed to start consumer", zap.Error(err))
    }

    logger.Info("Worker is running, waiting for messages...")

    // 10. Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

    <-quit
    logger.Info("Shutting down worker...")
}