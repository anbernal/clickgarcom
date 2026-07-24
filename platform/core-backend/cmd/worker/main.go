package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/config"
	domainconversation "github.com/anbernal/clickgarcom/internal/domain/conversation"
	infraConversation "github.com/anbernal/clickgarcom/internal/infrastructure/conversation"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
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

	var metricsServer *http.Server
	if cfg.Metrics.Enabled {
		metricsServer = metrics.StartServer(cfg.Metrics.Port, "go-worker", logger.Log)
	}

	// 5. Repositories
	inboxRepo := postgres.NewInboxRepository(db.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)
	sessionRepo := redisRepo.NewSessionRepository(redisClient.Client)
	botConfigRepo := postgres.NewBotConfigRepository(db.DB)
	menuRepo := postgres.NewMenuRepository(db.DB)
	tabRepo := postgres.NewTabRepository(db.DB)
	orderRepo := postgres.NewOrderRepository(db.DB)
	orderBatchRepo := postgres.NewOrderBatchRepository(db.DB)
	tableRepo := postgres.NewTableRepository(db.DB)
	serviceRequestRepo := postgres.NewServiceRequestRepository(db.DB)
	waiterChatRepo := postgres.NewWaiterChatRepository(db.DB)
	paymentRepo := postgres.NewPaymentRepository(db.DB)
	paymentAttemptRepo := postgres.NewPaymentAttemptRepository(db.DB)
	portalConversationOutputStore := postgres.NewPortalConversationEventRepository(db.DB)
	portalConversationInputStore := postgres.NewPortalConversationInputRepository(db.DB)

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
	portalAccessClient := adminclient.NewPortalAccessClient(
		resolveNodeAdminInternalBaseURL(),
		resolveInternalServiceToken(),
		logger.Log,
	)

	// 7. Use Cases
	createOrderUC := application.NewCreateOrderUseCase(
		orderRepo,
		orderBatchRepo,
		tabRepo,
		menuRepo,
		nil, // wsHub not available in worker
		rabbitPublisher,
		logger.Log,
	)

	handleWhatsAppMsg := application.NewHandleWhatsAppMessageUseCase(
		sessionRepo,
		tenantRepo,
		botConfigRepo,
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
		portalAccessClient,
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

	handlePortalConversation := func(ctx context.Context, body []byte) error {
		var input domainconversation.Input
		if err := json.Unmarshal(body, &input); err != nil {
			return fmt.Errorf("failed to unmarshal portal conversation input: %w", err)
		}
		if input.TabID == nil {
			return fmt.Errorf("portal conversation input missing tab_id")
		}

		portalSender := infraConversation.NewPortalSender(portalConversationOutputStore, input.TenantID, *input.TabID)
		portalHandleUC := application.NewHandleWhatsAppMessageUseCase(
			sessionRepo,
			tenantRepo,
			botConfigRepo,
			menuRepo,
			tabRepo,
			tableRepo,
			serviceRequestRepo,
			waiterChatRepo,
			createOrderUC,
			portalSender,
			resolvePublicCheckoutBaseURL(),
			logger.Log,
		)

		if err := portalHandleUC.ExecutePortal(ctx, input, portalConversationInputStore); err != nil {
			return err
		}

		notifyPortalConversationUpdated(ctx, input.TenantID, *input.TabID, logger.Log)
		return nil
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

	if err := consumer.Consume("portal.conversation.inputs", handlePortalConversation); err != nil {
		logger.Fatal("Failed to start portal conversation consumer", zap.Error(err))
	}

	logger.Info("Worker is running, waiting for messages...")

	// 10. Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	logger.Info("Shutting down worker...")
	metrics.ShutdownServer(metricsServer, logger.Log, "go-worker")
}

func resolvePublicCheckoutBaseURL() string {
	candidates := []string{
		os.Getenv("PUBLIC_ADMIN_BASE_URL"),
		os.Getenv("PUBLIC_WEB_BASE_URL"),
		os.Getenv("PUBLIC_WEBHOOK_BASE_URL"),
		os.Getenv("NGROK_PUBLIC_URL"),
	}

	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base != "" {
			return base
		}
	}

	if ngrokBase := resolveNgrokPublicBaseURL(); ngrokBase != "" {
		return ngrokBase
	}

	return "http://localhost:3002"
}

func resolveNgrokPublicBaseURL() string {
	apiCandidates := []string{
		os.Getenv("NGROK_API_URL"),
		"http://ngrok:4040",
		"http://localhost:4040",
	}

	client := &http.Client{Timeout: 2 * time.Second}
	for _, candidate := range apiCandidates {
		apiBase := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if apiBase == "" {
			continue
		}

		tunnelsURL := apiBase
		if !strings.HasSuffix(strings.ToLower(tunnelsURL), "/api/tunnels") {
			tunnelsURL += "/api/tunnels"
		}

		req, err := http.NewRequest(http.MethodGet, tunnelsURL, nil)
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		var payload struct {
			Tunnels []struct {
				PublicURL string `json:"public_url"`
			} `json:"tunnels"`
		}
		err = json.NewDecoder(resp.Body).Decode(&payload)
		resp.Body.Close()
		if err != nil {
			continue
		}

		for _, tunnel := range payload.Tunnels {
			publicURL := strings.TrimRight(strings.TrimSpace(tunnel.PublicURL), "/")
			if strings.HasPrefix(strings.ToLower(publicURL), "https://") {
				return publicURL
			}
		}

		for _, tunnel := range payload.Tunnels {
			publicURL := strings.TrimRight(strings.TrimSpace(tunnel.PublicURL), "/")
			if publicURL != "" {
				return publicURL
			}
		}
	}

	return ""
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

func resolveGoCoreInternalBaseURL() string {
	candidates := []string{
		os.Getenv("GO_CORE_BASE_URL"),
		"http://go-api:8080",
		"http://localhost:8080",
	}

	for _, candidate := range candidates {
		base := strings.TrimRight(strings.TrimSpace(candidate), "/")
		if base != "" {
			return base
		}
	}

	return "http://go-api:8080"
}

func notifyPortalConversationUpdated(ctx context.Context, tenantID, tabID uuid.UUID, logger *zap.Logger) {
	payload, err := json.Marshal(map[string]string{
		"tenant_id": tenantID.String(),
		"tab_id":    tabID.String(),
		"type":      "conversation.updated",
	})
	if err != nil {
		logger.Warn("failed to marshal portal realtime payload", zap.Error(err))
		return
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		resolveGoCoreInternalBaseURL()+"/internal/portal/events",
		bytes.NewReader(payload),
	)
	if err != nil {
		logger.Warn("failed to create portal realtime request", zap.Error(err))
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", resolveInternalServiceToken())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logger.Warn("failed to notify portal realtime update", zap.Error(err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Warn("portal realtime notifier returned non-success status", zap.Int("status", resp.StatusCode))
	}
}

func resolveInternalServiceToken() string {
	token := strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN"))
	if token == "" {
		return "clickgarcom-internal-token"
	}
	return token
}
