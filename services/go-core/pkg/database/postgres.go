package database

import (
    "fmt"
    "time"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

type Database struct {
    DB *gorm.DB
}

// NewPostgresConnection cria conexão com Postgres
func NewPostgresConnection(dsn string, maxConns int, maxIdleConns int, logLevel string) (*Database, error) {
    // Configurar log level do GORM
    var gormLogLevel logger.LogLevel
    switch logLevel {
    case "debug":
        gormLogLevel = logger.Info
    case "info":
        gormLogLevel = logger.Warn
    default:
        gormLogLevel = logger.Error
    }

    db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
        Logger: logger.Default.LogMode(gormLogLevel),
        NowFunc: func() time.Time {
            return time.Now().UTC()
        },
        PrepareStmt: true, // Preparar statements para melhor performance
    })

    if err != nil {
        return nil, fmt.Errorf("failed to connect to database: %w", err)
    }

    // Configurar connection pool
    sqlDB, err := db.DB()
    if err != nil {
        return nil, fmt.Errorf("failed to get database instance: %w", err)
    }

    sqlDB.SetMaxOpenConns(maxConns)
    sqlDB.SetMaxIdleConns(maxIdleConns)
    sqlDB.SetConnMaxLifetime(1 * time.Hour)
    sqlDB.SetConnMaxIdleTime(10 * time.Minute)

    // Testar conexão
    if err := sqlDB.Ping(); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    return &Database{DB: db}, nil
}

// Close fecha a conexão
func (d *Database) Close() error {
    sqlDB, err := d.DB.DB()
    if err != nil {
        return err
    }
    return sqlDB.Close()
}

// HealthCheck verifica se o banco está saudável
func (d *Database) HealthCheck() error {
    sqlDB, err := d.DB.DB()
    if err != nil {
        return err
    }
    return sqlDB.Ping()
}

// GetStats retorna estatísticas da connection pool
func (d *Database) GetStats() map[string]interface{} {
    sqlDB, _ := d.DB.DB()
    stats := sqlDB.Stats()

    return map[string]interface{}{
        "max_open_connections": stats.MaxOpenConnections,
        "open_connections":     stats.OpenConnections,
        "in_use":               stats.InUse,
        "idle":                 stats.Idle,
    }
}