package whatsapp

import (
	"context"
	"fmt"
	"time"

	domain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type OutboxProcessor struct {
	db        *gorm.DB
	apiClient *MetaAPIClient
	logger    *zap.Logger
	batchSize int
}

func NewOutboxProcessor(db *gorm.DB, apiClient *MetaAPIClient, logger *zap.Logger) *OutboxProcessor {
	return &OutboxProcessor{
		db:        db,
		apiClient: apiClient,
		logger:    logger,
		batchSize: 10, // Processar 10 mensagens por vez
	}
}

func (p *OutboxProcessor) ProcessPending(ctx context.Context) error {
	// 1. Buscar mensagens pendentes
	var messages []domain.OutboxMessage

	err := p.db.WithContext(ctx).
		Where("sent = ? AND attempts < max_attempts", false).
		Where("next_retry_at IS NULL OR next_retry_at <= ?", time.Now()).
		Order("created_at ASC").
		Limit(p.batchSize).
		Find(&messages).Error

	if err != nil {
		return fmt.Errorf("failed to fetch pending messages: %w", err)
	}

	if len(messages) == 0 {
		return nil // Nada a processar
	}

	p.logger.Info("processing outbox messages",
		zap.Int("count", len(messages)),
	)

	// 2. Processar cada mensagem
	for _, msg := range messages {
		if err := p.processMessage(ctx, &msg); err != nil {
			p.logger.Error("failed to process message",
				zap.String("id", msg.ID.String()),
				zap.Error(err),
			)
		}
	}

	return nil
}

func (p *OutboxProcessor) processMessage(ctx context.Context, msg *domain.OutboxMessage) error {
	// 1. Incrementar tentativas
	msg.Attempts++

	// 2. Tentar enviar
	messageID, err := p.apiClient.SendTextMessage(ctx, msg.Recipient, msg.Payload)

	if err != nil {
		// Falhou - atualizar erro e próximo retry
		msg.LastError = err.Error()

		if msg.Attempts >= msg.MaxAttempts {
			p.logger.Warn("max attempts reached, giving up",
				zap.String("id", msg.ID.String()),
				zap.String("recipient", msg.Recipient),
			)
		} else {
			// Backoff exponencial: 5min, 15min, 45min
			retryDelay := time.Duration(5*msg.Attempts*msg.Attempts) * time.Minute
			nextRetry := time.Now().Add(retryDelay)
			msg.NextRetryAt = &nextRetry

			p.logger.Info("scheduling retry",
				zap.String("id", msg.ID.String()),
				zap.Int("attempt", msg.Attempts),
				zap.Time("next_retry", nextRetry),
			)
		}

		return p.db.Save(msg).Error
	}

	// 3. Sucesso - marcar como enviado
	now := time.Now()
	msg.Sent = true
	msg.SentAt = &now
	msg.LastError = "" // Limpar erro anterior

	p.logger.Info("message sent successfully",
		zap.String("id", msg.ID.String()),
		zap.String("recipient", msg.Recipient),
		zap.String("whatsapp_message_id", messageID),
	)

	return p.db.Save(msg).Error
}
