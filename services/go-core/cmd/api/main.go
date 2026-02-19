package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/config"
	"github.com/anbernal/clickgarcom/internal/infrastructure/websocket"
	"github.com/anbernal/clickgarcom/internal/interfaces/http/routes"
	"github.com/anbernal/clickgarcom/pkg/database"
	"github.com/anbernal/clickgarcom/pkg/logger"
)

func main() {
	// 1) Carregar configurações
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// 2) Inicializar logger
	if err := logger.Initialize(cfg.Log.Level, cfg.Log.Format); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("Starting ClickGarçom API",
		zap.String("env", cfg.App.Env),
		zap.String("port", cfg.App.Port),
	)

	// 3) Conectar ao Postgres
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

	// 4) Conectar ao Redis
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

	// 5) Conectar ao RabbitMQ
	rabbitMQ, err := database.NewRabbitMQConnection(
		cfg.GetRabbitMQURL(),
		logger.Log,
	)
	if err != nil {
		logger.Fatal("Failed to connect to rabbitmq", zap.Error(err))
	}
	defer rabbitMQ.Close()
	logger.Info("Connected to RabbitMQ successfully")

	// 6) Criar aplicação Fiber
	app := fiber.New(fiber.Config{
		AppName:      cfg.App.Name,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	})

	// 7) Middlewares globais
	app.Use(recover.New())
	app.Use(cors.New())

	// 8) Inicializar WebSocket Hub (NOVO)
	wsHub := websocket.NewHub()
	go wsHub.Run() // Rodar hub em goroutine
	logger.Info("WebSocket Hub initialized and running")

	// 9) Setup routes
	routes.SetupRoutes(
		app,
		db,
		rabbitMQ,
		wsHub,
		logger.Log,
		cfg.WhatsApp.VerifyToken,
	)

	// 9) Endpoints básicos (opcional, mas útil)
	api := app.Group("")

	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":    "healthy",
			"timestamp": time.Now().Unix(),
			"database":  db.GetStats(),
		})
	})

	api.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "ClickGarçom API",
			"version": "1.0.0",
			"env":     cfg.App.Env,
		})
	})

	// 10) Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-quit
		logger.Info("Shutting down server...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := app.ShutdownWithContext(ctx); err != nil {
			logger.Error("Server forced to shutdown", zap.Error(err))
		}
	}()

	// 11) Iniciar servidor
	addr := fmt.Sprintf(":%s", cfg.App.Port)
	logger.Info("Server listening", zap.String("address", addr))

	if err := app.Listen(addr); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}
