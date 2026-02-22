package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	App      AppConfig
	Database DatabaseConfig
	Redis    RedisConfig
	RabbitMQ RabbitMQConfig
	JWT      JWTConfig
	WhatsApp WhatsAppConfig
	Log      LogConfig
	Metrics  MetricsConfig
}

type AppConfig struct {
	Name string
	Env  string
	Port string
}

type DatabaseConfig struct {
	Host            string
	Port            string
	User            string
	Password        string
	Name            string
	SSLMode         string
	MaxConnections  int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

type RabbitMQConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	VHost    string
}

type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

type WhatsAppConfig struct {
	VerifyToken   string
	APIToken      string
	PhoneNumberID string
}

type LogConfig struct {
	Level  string
	Format string
}

type MetricsConfig struct {
	Enabled bool
	Port    string
}

// Load carrega as configurações do arquivo .env
func Load() (*Config, error) {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("error reading config file: %w", err)
	}

	jwtSecret := viper.GetString("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "super-secret-key-clg-2024"
	}

	config := &Config{
		App: AppConfig{
			Name: viper.GetString("APP_NAME"),
			Env:  viper.GetString("APP_ENV"),
			Port: viper.GetString("APP_PORT"),
		},
		Database: DatabaseConfig{
			Host:            viper.GetString("DATABASE_HOST"),
			Port:            viper.GetString("DATABASE_PORT"),
			User:            viper.GetString("DATABASE_USER"),
			Password:        viper.GetString("DATABASE_PASSWORD"),
			Name:            viper.GetString("DATABASE_NAME"),
			SSLMode:         viper.GetString("DATABASE_SSL_MODE"),
			MaxConnections:  viper.GetInt("DATABASE_MAX_CONNECTIONS"),
			MaxIdleConns:    viper.GetInt("DATABASE_MAX_IDLE_CONNECTIONS"),
			ConnMaxLifetime: 1 * time.Hour,
		},
		Redis: RedisConfig{
			Host:     viper.GetString("REDIS_HOST"),
			Port:     viper.GetString("REDIS_PORT"),
			Password: viper.GetString("REDIS_PASSWORD"),
			DB:       viper.GetInt("REDIS_DB"),
		},
		RabbitMQ: RabbitMQConfig{
			Host:     viper.GetString("RABBITMQ_HOST"),
			Port:     viper.GetString("RABBITMQ_PORT"),
			User:     viper.GetString("RABBITMQ_USER"),
			Password: viper.GetString("RABBITMQ_PASSWORD"),
			VHost:    viper.GetString("RABBITMQ_VHOST"),
		},
		JWT: JWTConfig{
			Secret:     jwtSecret,
			Expiration: parseDuration(viper.GetString("JWT_EXPIRATION"), 24*time.Hour),
		},
		WhatsApp: WhatsAppConfig{
			VerifyToken:   viper.GetString("WHATSAPP_VERIFY_TOKEN"),
			APIToken:      viper.GetString("WHATSAPP_API_TOKEN"),
			PhoneNumberID: viper.GetString("WHATSAPP_PHONE_NUMBER_ID"),
		},
		Log: LogConfig{
			Level:  viper.GetString("LOG_LEVEL"),
			Format: viper.GetString("LOG_FORMAT"),
		},
		Metrics: MetricsConfig{
			Enabled: viper.GetBool("METRICS_ENABLED"),
			Port:    viper.GetString("METRICS_PORT"),
		},
	}

	return config, nil
}

// GetDatabaseDSN retorna a string de conexão do Postgres
func (c *Config) GetDatabaseDSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.Name,
		c.Database.SSLMode,
	)
}

// GetRabbitMQURL retorna a URL de conexão do RabbitMQ
func (c *Config) GetRabbitMQURL() string {
	return fmt.Sprintf(
		"amqp://%s:%s@%s:%s%s",
		c.RabbitMQ.User,
		c.RabbitMQ.Password,
		c.RabbitMQ.Host,
		c.RabbitMQ.Port,
		c.RabbitMQ.VHost,
	)
}

// GetRedisAddr retorna o endereço do Redis
func (c *Config) GetRedisAddr() string {
	return fmt.Sprintf("%s:%s", c.Redis.Host, c.Redis.Port)
}

func parseDuration(s string, defaultDuration time.Duration) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return defaultDuration
	}
	return d
}
