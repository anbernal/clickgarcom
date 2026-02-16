package main

import (
	"context"
	"fmt"

	"github.com/anbernal/clickgarcom/internal/application"
	"github.com/anbernal/clickgarcom/internal/config"
	"github.com/anbernal/clickgarcom/internal/infrastructure/persistence/postgres"
	"github.com/anbernal/clickgarcom/pkg/database"
	"github.com/anbernal/clickgarcom/pkg/logger"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

func main() {
	// Setup
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	// Logger
	if err := logger.Initialize(cfg.Log.Level, cfg.Log.Format); err != nil {
		panic(err)
	}
	defer logger.Sync()

	// Database
	db, err := database.NewPostgresConnection(
		cfg.GetDatabaseDSN(),
		cfg.Database.MaxConnections,
		cfg.Database.MaxIdleConns,
		cfg.Log.Level,
	)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// Repositories
	orderRepo := postgres.NewOrderRepository(db.DB)
	tabRepo := postgres.NewTabRepository(db.DB)
	menuRepo := postgres.NewMenuRepository(db.DB)

	// Use Case
	createOrderUC := application.NewCreateOrderUseCase(orderRepo, tabRepo, menuRepo, logger.Log)

	// Input (SUBSTITUA <MENU_ITEM_ID> pelo ID do item do menu)
	input := application.CreateOrderInput{
		TenantID: uuid.MustParse("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"),
		TabID:    uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		Items: []application.OrderItemInput{
			{
				MenuItemID:   uuid.MustParse("55cbe508-e48e-4472-afe9-cbcbd7f4b599"), // SUBSTITUA AQUI
				Quantity:     2,
				Observations: "Sem gelo",
			},
		},
		Notes: "Pedido de teste",
	}

	// Executar
	order, err := createOrderUC.Execute(context.Background(), input)
	if err != nil {
		logger.Error("failed to create order", zap.Error(err))
		panic(err)
	}

	fmt.Printf("\n✅ Pedido criado com sucesso!\n")
	fmt.Printf("ID: %s\n", order.ID)
	fmt.Printf("Status: %s\n", order.Status)
	fmt.Printf("Destination: %s\n", order.Destination)
	fmt.Printf("Total: R$ %.2f\n", order.CalculateTotal())
	fmt.Printf("Itens: %d\n\n", len(order.Items))
}
