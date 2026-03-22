package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/config"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
	"github.com/anbernal/clickgarcom/internal/infrastructure/persistence/postgres"
	"github.com/anbernal/clickgarcom/internal/infrastructure/whatsapp"
	"github.com/anbernal/clickgarcom/pkg/database"
	"github.com/anbernal/clickgarcom/pkg/logger"
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

	logger.Info("Starting ClickGarçom Outbox Worker",
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

	var metricsServer *http.Server
	if cfg.Metrics.Enabled {
		metricsServer = metrics.StartServer(cfg.Metrics.Port, "go-outbox", logger.Log)
	}
	defer metrics.ShutdownServer(metricsServer, logger.Log, "go-outbox")

	// 4. Criar WhatsApp API Client
	whatsappAPI := whatsapp.NewMetaAPIClient(
		cfg.WhatsApp.APIToken,
		cfg.WhatsApp.PhoneNumberID,
		logger.Log,
	)

	// 5. Criar Outbox Processor com Telemetry Repositories Phase 11 & Phase 13 (Billing)
	logRepo := postgres.NewMessageLogRepository(db.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)

	processor := whatsapp.NewOutboxProcessor(
		db.DB,
		whatsappAPI,
		logRepo,
		tenantRepo,
		logger.Log,
	)

	// 6. Processar loop
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-quit
		logger.Info("Shutting down outbox worker...")
		cancel()
		metrics.ShutdownServer(metricsServer, logger.Log, "go-outbox")
	}()

	logger.Info("Outbox worker is running...")

	// 7. Loop de processamento
	ticker := time.NewTicker(5 * time.Second) // Processar a cada 5 segundos
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Outbox worker stopped")
			return
		case <-ticker.C:
			if err := processor.ProcessPending(ctx); err != nil {
				logger.Error("failed to process outbox", zap.Error(err))
			}
		}
	}
}
