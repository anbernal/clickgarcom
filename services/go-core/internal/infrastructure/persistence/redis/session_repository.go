package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/anbernal/clickgarcom/internal/domain/inbox/session"
)

type SessionRepository struct {
	client *redis.Client
}

func NewSessionRepository(client *redis.Client) session.Repository {
	return &SessionRepository{client: client}
}

func (r *SessionRepository) getKey(userPhone, tenantID string) string {
	return fmt.Sprintf("session:%s:%s", tenantID, userPhone)
}

func (r *SessionRepository) Save(ctx context.Context, sess *session.Session) error {
	key := r.getKey(sess.UserPhone, sess.TenantID.String())

	data, err := json.Marshal(sess)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	ttl := time.Until(sess.ExpiresAt)
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}

	return r.client.Set(ctx, key, data, ttl).Err()
}

func (r *SessionRepository) Find(ctx context.Context, userPhone string, tenantID string) (*session.Session, error) {
	key := r.getKey(userPhone, tenantID)

	data, err := r.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil // Sessão não encontrada
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	var sess session.Session
	if err := json.Unmarshal([]byte(data), &sess); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session: %w", err)
	}

	// Verificar se expirou
	if sess.IsExpired() {
		r.Delete(ctx, userPhone, tenantID)
		return nil, nil
	}

	return &sess, nil
}

func (r *SessionRepository) Delete(ctx context.Context, userPhone string, tenantID string) error {
	key := r.getKey(userPhone, tenantID)
	return r.client.Del(ctx, key).Err()
}

func (r *SessionRepository) Extend(ctx context.Context, userPhone string, tenantID string, duration time.Duration) error {
	key := r.getKey(userPhone, tenantID)
	return r.client.Expire(ctx, key, duration).Err()
}
