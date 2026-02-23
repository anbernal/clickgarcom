package whatsapp

import (
	"context"
	"fmt"
	"time"

	domain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type Sender struct {
	db        *gorm.DB
	apiClient *MetaAPIClient
	logger    *zap.Logger
}

type OutboxMessage struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key"`
	TenantID    *uuid.UUID `gorm:"type:uuid"`
	Destination string     `gorm:"not null"`
	Recipient   string     `gorm:"not null"`
	Payload     string     `gorm:"type:text;not null"` // ⬅️ TEXT não JSONB
	TemplateID  string     `gorm:"type:varchar(100)"`
	Sent        bool       `gorm:"default:false"`
	Attempts    int        `gorm:"default:0"`
	MaxAttempts int        `gorm:"default:3"`
	LastError   string     `gorm:"type:text"`
	CreatedAt   time.Time
	SentAt      *time.Time
	NextRetryAt *time.Time
}

func (OutboxMessage) TableName() string {
	return "outbox_messages"
}

func NewSender(db *gorm.DB, apiClient *MetaAPIClient, logger *zap.Logger) *Sender {
	return &Sender{
		db:        db,
		apiClient: apiClient,
		logger:    logger,
	}
}

func (s *Sender) SendText(ctx context.Context, to string, message string) error {
	outbox := &OutboxMessage{
		ID:          uuid.New(),
		Destination: "whatsapp",
		Recipient:   to,
		Payload:     message,
		Sent:        false,
		Attempts:    0,
		MaxAttempts: 3,
		CreatedAt:   time.Now(),
	}

	if err := s.db.WithContext(ctx).Create(outbox).Error; err != nil {
		return fmt.Errorf("failed to create outbox message: %w", err)
	}

	s.logger.Info("message queued for sending",
		zap.String("to", to),
		zap.String("outbox_id", outbox.ID.String()),
	)

	return nil
}

// Fase 14: Envia Botões Interativos Imediatamente, sem passar pelo Outbox (Prioridade Alta)
func (s *Sender) SendInteractiveButtons(ctx context.Context, to, bodyText string, buttons []domain.InteractiveButton) (string, error) {
	if s.apiClient == nil {
		return "", fmt.Errorf("MetaAPIClient is not initialized")
	}
	return s.apiClient.SendInteractiveButtons(ctx, to, bodyText, buttons)
}
