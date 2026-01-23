package database

import (
    "context"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
)

type RedisClient struct {
    Client *redis.Client
}

// NewRedisConnection cria conexão com Redis
func NewRedisConnection(addr string, password string, db int) (*RedisClient, error) {
    client := redis.NewClient(&redis.Options{
        Addr:         addr,
        Password:     password,
        DB:           db,
        DialTimeout:  5 * time.Second,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        PoolSize:     10,
        PoolTimeout:  4 * time.Second,
    })

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    // Testar conexão
    if err := client.Ping(ctx).Err(); err != nil {
        return nil, fmt.Errorf("failed to connect to redis: %w", err)
    }

    return &RedisClient{Client: client}, nil
}

// Close fecha a conexão
func (r *RedisClient) Close() error {
    return r.Client.Close()
}

// HealthCheck verifica se o Redis está saudável
func (r *RedisClient) HealthCheck(ctx context.Context) error {
    return r.Client.Ping(ctx).Err()
}

// Set armazena valor com TTL
func (r *RedisClient) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
    return r.Client.Set(ctx, key, value, ttl).Err()
}

// Get recupera valor
func (r *RedisClient) Get(ctx context.Context, key string) (string, error) {
    return r.Client.Get(ctx, key).Result()
}

// Delete remove chave
func (r *RedisClient) Delete(ctx context.Context, keys ...string) error {
    return r.Client.Del(ctx, keys...).Err()
}

// Exists verifica se chave existe
func (r *RedisClient) Exists(ctx context.Context, keys ...string) (int64, error) {
    return r.Client.Exists(ctx, keys...).Result()
}