package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/config"
	adminclient "github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
	infraMP "github.com/anbernal/clickgarcom/internal/infrastructure/payment"
	"github.com/anbernal/clickgarcom/internal/infrastructure/persistence/postgres"
	"github.com/anbernal/clickgarcom/internal/infrastructure/queue/rabbitmq"
	"github.com/anbernal/clickgarcom/pkg/database"
	"github.com/anbernal/clickgarcom/pkg/logger"

	redisRepo "github.com/anbernal/clickgarcom/internal/infrastructure/persistence/redis"
	infraWA "github.com/anbernal/clickgarcom/internal/infrastructure/whatsapp"
)

func main() {
	// 1. Carregar configurações
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// 2. Inicializar logger
	if err := logger.Initialize("debug", cfg.Log.Format); err != nil {
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

	// 4.1. Conectar ao Redis
	redisClient, err := database.NewRedisConnection(
		cfg.GetRedisAddr(),
		cfg.Redis.Password,
		cfg.Redis.DB,
	)
	if err != nil {
		logger.Fatal("Failed to connect to redis", zap.Error(err))
	}
	defer redisClient.Close()
	logger.Info("Connected to Redis successfully")

	// 5. Repositories
	inboxRepo := postgres.NewInboxRepository(db.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)
	sessionRepo := redisRepo.NewSessionRepository(redisClient.Client)
	menuRepo := postgres.NewMenuRepository(db.DB)
	tabRepo := postgres.NewTabRepository(db.DB)
	orderRepo := postgres.NewOrderRepository(db.DB)
	tableRepo := postgres.NewTableRepository(db.DB)
	serviceRequestRepo := postgres.NewServiceRequestRepository(db.DB)
	waiterChatRepo := postgres.NewWaiterChatRepository(db.DB)
	paymentRepo := postgres.NewPaymentRepository(db.DB)
	paymentAttemptRepo := postgres.NewPaymentAttemptRepository(db.DB)

	// 6. Infrastructure
	whatsappAPI := infraWA.NewMetaAPIClient(
		cfg.WhatsApp.APIToken,
		cfg.WhatsApp.PhoneNumberID,
		logger.Log,
	)
	whatsappSender := infraWA.NewSender(db.DB, whatsappAPI, logger.Log)
	rabbitPublisher := rabbitmq.NewPublisher(rabbitMQClient.GetChannel(), logger.Log)
	mpClient := infraMP.NewMercadoPagoClient(logger.Log)
	settlementClient := adminclient.NewSettlementClient(
		resolveNodeAdminInternalBaseURL(),
		resolveInternalServiceToken(),
		logger.Log,
	)

	// 7. Use Cases
	createOrderUC := application.NewCreateOrderUseCase(
		orderRepo,
		tabRepo,
		menuRepo,
		nil, // wsHub not available in worker
		rabbitPublisher,
		logger.Log,
	)

	handleWhatsAppMsg := application.NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		tenantRepo,
		menuRepo,
		tabRepo,
		tableRepo,
		serviceRequestRepo,
		waiterChatRepo,
		createOrderUC,
		whatsappSender,
		resolvePublicCheckoutBaseURL(),
		logger.Log,
	)
	processWhatsAppMsg := application.NewProcessWhatsAppMessageUseCase(
		inboxRepo,
		tenantRepo,
		handleWhatsAppMsg,
		logger.Log,
	)

	// 7. Consumer
	consumer := rabbitmq.NewConsumer(rabbitMQClient.GetChannel(), logger.Log)

	// 7.1 Table Event Consumer
	processTableEventUC := application.NewProcessTableEventUseCase(
		tableRepo,
		tabRepo,
		sessionRepo,
		tenantRepo,
		whatsappSender,
		logger.Log,
	)
	reconcilePaymentWebhookUC := application.NewReconcilePaymentWebhookUseCase(
		paymentRepo,
		paymentAttemptRepo,
		tenantRepo,
		mpClient,
		settlementClient,
		logger.Log,
	)

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

	// 8.1 Handler de eventos de mesa (Admin Panel)
	handleTableEvent := func(ctx context.Context, body []byte) error {
		logger.Debug("processing table event from admin")
		return processTableEventUC.Execute(ctx, body)
	}

	handlePaymentWebhook := func(ctx context.Context, body []byte) error {
		logger.Debug("processing payment webhook event")
		return reconcilePaymentWebhookUC.Execute(ctx, body)
	}

	// 9. Iniciar consumers
	if err := consumer.Consume("whatsapp.messages", handleWhatsAppMessage); err != nil {
		logger.Fatal("Failed to start whatsapp consumer", zap.Error(err))
	}

	if err := consumer.Consume("admin.table.events", handleTableEvent); err != nil {
		logger.Fatal("Failed to start admin table consumer", zap.Error(err))
	}

	if err := consumer.Consume("payment.webhooks", handlePaymentWebhook); err != nil {
		logger.Fatal("Failed to start payment webhook consumer", zap.Error(err))
	}

	logger.Info("Worker is running, waiting for messages...")

	// 10. Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	logger.Info("Shutting down worker...")
}

func resolvePublicCheckoutBaseURL() string {
	candidates := []string{
		os.Getenv("PUBLIC_ADMIN_BASE_URL"),
		os.Getenv("PUBLIC_WEB_BASE_URL"),
		os.Getenv("PUBLIC_WEBHOOK_BASE_URL"),
		os.Getenv("NGROK_PUBLIC_URL"),
		"http://localhost:3002",
	}

	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base != "" {
			return base
		}
	}

	return "http://localhost:3002"
}

func resolveNodeAdminInternalBaseURL() string {
	candidates := []string{
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

func resolveInternalServiceToken() string {
	token := strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN"))
	if token == "" {
		return "clickgarcom-internal-token"
	}
	return token
}
