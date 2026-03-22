package whatsapp

import (
	"context"
	"fmt"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	domain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	"github.com/anbernal/clickgarcom/internal/infrastructure/metrics"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type OutboxProcessor struct {
	db         *gorm.DB
	apiClient  *MetaAPIClient
	logRepo    tenant.MessageLogRepository
	tenantRepo tenant.Repository
	logger     *zap.Logger
	batchSize  int
}

func NewOutboxProcessor(db *gorm.DB, apiClient *MetaAPIClient, logRepo tenant.MessageLogRepository, tenantRepo tenant.Repository, logger *zap.Logger) *OutboxProcessor {
	return &OutboxProcessor{
		db:         db,
		apiClient:  apiClient,
		logRepo:    logRepo,
		tenantRepo: tenantRepo,
		logger:     logger,
		batchSize:  10, // Processar 10 mensagens por vez
	}
}

func (p *OutboxProcessor) ProcessPending(ctx context.Context) error {
	startedAt := time.Now()
	defer func() {
		metrics.ObserveOutboxRunDuration(time.Since(startedAt).Seconds())
		metrics.SetOutboxLastRunTimestamp(float64(time.Now().Unix()))
	}()

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

	metrics.SetOutboxPendingMessages(len(messages))
	metrics.ObserveOutboxBatchSize(len(messages))

	if len(messages) == 0 {
		return nil // Nada a processar
	}

	p.logger.Info("processing outbox messages",
		zap.Int("count", len(messages)),
	)

	// 2. Processar cada mensagem
	for _, msg := range messages {
		if err := p.processMessage(ctx, &msg); err != nil {
			metrics.IncOutboxMessagesProcessed("error")
			p.logger.Error("failed to process message",
				zap.String("id", msg.ID.String()),
				zap.Error(err),
			)
		} else {
			metrics.IncOutboxMessagesProcessed("success")
		}
	}

	return nil
}

func (p *OutboxProcessor) processMessage(ctx context.Context, msg *domain.OutboxMessage) error {
	// 1. Incrementar tentativas
	msg.Attempts++

	// Fase 13: Verificação de Pedágio (Pre-paid Check)
	if msg.TenantID != nil && p.tenantRepo != nil {
		tnt, err := p.tenantRepo.FindByID(ctx, *msg.TenantID)
		if err == nil {
			if tnt.BillingPlan == tenant.PlanPrePaid && tnt.WalletBalance <= 0 {
				p.logger.Warn("tenant out of credits, dropping outgoing message", zap.String("msg_id", msg.ID.String()))

				// Marcar a mensagem como erro definitivo (para não dar loop infinito)
				msg.LastError = "OUT OF CREDITS"
				msg.Attempts = msg.MaxAttempts
				msg.Sent = false
				return p.db.Save(msg).Error
			}
			// Assumiremos a dedução caso enviada com sucesso no passo 4
		}
	}

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

	err = p.db.Save(msg).Error

	// 4. Salvar Monitoria (Billing/Tracking Fase 11) e Deduzir Pedágio (Fase 13)
	if err == nil && msg.TenantID != nil {
		go func(tid uuid.UUID, mid string) {
			if p.tenantRepo != nil {
				tnt, err := p.tenantRepo.FindByID(context.Background(), tid)
				if err == nil && tnt.BillingPlan == tenant.PlanPrePaid {
					_ = p.tenantRepo.DeductWalletBalance(context.Background(), tid, tnt.MessagePrice)
				}
			}
			if p.logRepo != nil {
				p.logRepo.Save(context.Background(), &tenant.MessageLog{
					TenantID:  tid,
					Direction: tenant.DirectionOut,
					MessageID: mid,
					Status:    "SENT",
				})
			}
		}(*msg.TenantID, messageID)
	}

	return err
}
