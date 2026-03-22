package whatsapp

import (
	"context"
	"fmt"
	"strings"
	"time"

	tenantDomain "github.com/anbernal/clickgarcom/internal/domain/tenant"
	whatsappDomain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"

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
	tenantID, _ := whatsappDomain.TenantIDFromContext(ctx)

	outbox := &OutboxMessage{
		ID:          uuid.New(),
		TenantID:    tenantID,
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

func (s *Sender) SendImage(ctx context.Context, to, imageURL, caption string) (string, error) {
	if s.apiClient == nil {
		return "", fmt.Errorf("MetaAPIClient is not initialized")
	}

	normalizedImageURL := normalizeWhatsAppImageURL(imageURL)
	if normalizedImageURL != strings.TrimSpace(imageURL) {
		s.logger.Debug("normalized whatsapp image URL",
			zap.String("original_url", imageURL),
			zap.String("normalized_url", normalizedImageURL),
		)
	}

	billingTenant, err := s.loadTenantForBilling(ctx)
	if err != nil {
		return "", err
	}

	if billingTenant != nil && billingTenant.BillingPlan == tenantDomain.PlanPrePaid && billingTenant.WalletBalance <= 0 {
		return "", fmt.Errorf("tenant out of credits")
	}

	messageID, err := s.apiClient.SendImage(ctx, to, normalizedImageURL, caption)
	if err != nil {
		return "", err
	}

	if billingTenant != nil {
		preview := caption
		if strings.TrimSpace(preview) == "" {
			preview = normalizedImageURL
		}

		if err := s.applyImmediateBilling(ctx, billingTenant, messageID, to, preview); err != nil {
			s.logger.Warn("failed to apply image message billing",
				zap.String("tenant_id", billingTenant.ID.String()),
				zap.Error(err),
			)
		}
	}

	return messageID, nil
}

// Fase 14: Envia Botões Interativos Imediatamente, sem passar pelo Outbox (Prioridade Alta)
func (s *Sender) SendInteractiveButtons(ctx context.Context, to, bodyText string, buttons []whatsappDomain.InteractiveButton) (string, error) {
	if s.apiClient == nil {
		return "", fmt.Errorf("MetaAPIClient is not initialized")
	}

	billingTenant, err := s.loadTenantForBilling(ctx)
	if err != nil {
		return "", err
	}

	if billingTenant != nil && billingTenant.BillingPlan == tenantDomain.PlanPrePaid && billingTenant.WalletBalance <= 0 {
		return "", fmt.Errorf("tenant out of credits")
	}

	messageID, err := s.apiClient.SendInteractiveButtons(ctx, to, bodyText, buttons)
	if err != nil {
		return "", err
	}

	if billingTenant != nil {
		if err := s.applyImmediateBilling(ctx, billingTenant, messageID, to, bodyText); err != nil {
			s.logger.Warn("failed to apply interactive message billing",
				zap.String("tenant_id", billingTenant.ID.String()),
				zap.Error(err),
			)
		}
	}

	return messageID, nil
}

func (s *Sender) SendInteractiveList(
	ctx context.Context,
	to, bodyText, buttonText string,
	sections []whatsappDomain.InteractiveListSection,
) (string, error) {
	if s.apiClient == nil {
		return "", fmt.Errorf("MetaAPIClient is not initialized")
	}

	billingTenant, err := s.loadTenantForBilling(ctx)
	if err != nil {
		return "", err
	}

	if billingTenant != nil && billingTenant.BillingPlan == tenantDomain.PlanPrePaid && billingTenant.WalletBalance <= 0 {
		return "", fmt.Errorf("tenant out of credits")
	}

	messageID, err := s.apiClient.SendInteractiveList(ctx, to, bodyText, buttonText, sections)
	if err != nil {
		return "", err
	}

	if billingTenant != nil {
		if err := s.applyImmediateBilling(ctx, billingTenant, messageID, to, bodyText); err != nil {
			s.logger.Warn("failed to apply interactive list billing",
				zap.String("tenant_id", billingTenant.ID.String()),
				zap.Error(err),
			)
		}
	}

	return messageID, nil
}

// MarkAsRead envia o evento nativo "mensagem lida" sem passar pelo Outbox.
// Não gera cobrança interna pois não cria outbox nem billing log.
func (s *Sender) MarkAsRead(ctx context.Context, messageID string) error {
	if s.apiClient == nil {
		return fmt.Errorf("MetaAPIClient is not initialized")
	}
	return s.apiClient.MarkAsRead(ctx, messageID)
}

// SendTypingIndicator envia o estado nativo "digitando" sem passar pelo Outbox.
// Não gera cobrança interna pois não cria outbox nem billing log.
func (s *Sender) SendTypingIndicator(ctx context.Context, messageID string) error {
	if s.apiClient == nil {
		return fmt.Errorf("MetaAPIClient is not initialized")
	}
	return s.apiClient.SendTypingIndicator(ctx, messageID)
}

func (s *Sender) loadTenantForBilling(ctx context.Context) (*tenantDomain.Tenant, error) {
	tenantID, ok := whatsappDomain.TenantIDFromContext(ctx)
	if !ok {
		return nil, nil
	}

	var t tenantDomain.Tenant
	if err := s.db.WithContext(ctx).First(&t, "id = ?", *tenantID).Error; err != nil {
		return nil, fmt.Errorf("failed to load tenant for billing: %w", err)
	}

	return &t, nil
}

func (s *Sender) applyImmediateBilling(
	ctx context.Context,
	tenant *tenantDomain.Tenant,
	messageID string,
	userPhone string,
	messagePreview string,
) error {
	if tenant.BillingPlan == tenantDomain.PlanPrePaid {
		if err := s.db.WithContext(ctx).
			Model(&tenantDomain.Tenant{}).
			Where("id = ?", tenant.ID).
			UpdateColumn("wallet_balance", gorm.Expr("wallet_balance - ?", tenant.MessagePrice)).
			Error; err != nil {
			return fmt.Errorf("failed to deduct wallet balance: %w", err)
		}
	}

	logEntry := &tenantDomain.MessageLog{
		TenantID:       tenant.ID,
		Direction:      tenantDomain.DirectionOut,
		MessageID:      messageID,
		Status:         "SENT",
		UserPhone:      strings.TrimSpace(userPhone),
		MessagePreview: sanitizeMessagePreview(messagePreview),
	}

	if err := s.db.WithContext(ctx).Create(logEntry).Error; err != nil {
		return fmt.Errorf("failed to save message log: %w", err)
	}

	return nil
}

func sanitizeMessagePreview(value string) string {
	normalized := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if normalized == "" {
		return ""
	}

	runes := []rune(normalized)
	if len(runes) > 255 {
		return string(runes[:255])
	}

	return normalized
}
