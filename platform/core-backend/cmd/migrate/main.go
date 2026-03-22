package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/anbernal/clickgarcom/internal/config"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/spf13/viper"
)

func main() {
	var direction string
	flag.StringVar(&direction, "direction", "up", "Migration direction: up or down")
	flag.Parse()

	// Carregar configuração via env vars, com .env opcional em dev.
	if err := config.LoadEnvironment(); err != nil {
		log.Fatalf("Error reading config file: %v", err)
	}

	// Construir DSN
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		viper.GetString("DATABASE_USER"),
		viper.GetString("DATABASE_PASSWORD"),
		viper.GetString("DATABASE_HOST"),
		viper.GetString("DATABASE_PORT"),
		viper.GetString("DATABASE_NAME"),
		viper.GetString("DATABASE_SSL_MODE"),
	)

	m, err := migrate.New(
		"file://cmd/migrate",
		dsn,
	)
	if err != nil {
		log.Fatalf("Migration failed to initialize: %v", err)
	}

	switch direction {
	case "up":
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("Migration up failed: %v", err)
		}
		fmt.Println("✅ Migrations applied successfully!")
	case "down":
		if err := m.Down(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("Migration down failed: %v", err)
		}
		fmt.Println("✅ Migrations rolled back successfully!")
	default:
		log.Fatalf("Invalid direction: %s. Use 'up' or 'down'", direction)
	}
}
