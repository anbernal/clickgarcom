package application

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/inbox"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

type ProcessWhatsAppMessageUseCase struct {
	inboxRepo        inbox.Repository
	tenantRepo       tenant.Repository
	handleMsgUseCase *HandleWhatsAppMessageUseCase
	logger           *zap.Logger
}

func NewProcessWhatsAppMessageUseCase(
	inboxRepo inbox.Repository,
	tenantRepo tenant.Repository,
	handleMsgUseCase *HandleWhatsAppMessageUseCase,
	logger *zap.Logger,
) *ProcessWhatsAppMessageUseCase {
	return &ProcessWhatsAppMessageUseCase{
		inboxRepo:        inboxRepo,
		tenantRepo:       tenantRepo,
		handleMsgUseCase: handleMsgUseCase,
		logger:           logger,
	}
}

type WhatsAppWebhookPayload struct {
	Entry []struct {
		Changes []struct {
			Value struct {
				MessagingProduct string `json:"messaging_product"`
				Metadata         struct {
					DisplayPhoneNumber string `json:"display_phone_number"`
					PhoneNumberID      string `json:"phone_number_id"`
				} `json:"metadata"`
				Messages []struct {
					ID        string `json:"id"`
					From      string `json:"from"`
					Timestamp string `json:"timestamp"`
					Type      string `json:"type"`
					Text      struct {
						Body string `json:"body"`
					} `json:"text,omitempty"`
				} `json:"messages,omitempty"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

func (uc *ProcessWhatsAppMessageUseCase) Execute(ctx context.Context, inboxID uuid.UUID) error {
	// 1. Buscar evento do inbox
	event, err := uc.inboxRepo.FindByID(ctx, inboxID)
	if err != nil {
		return fmt.Errorf("failed to find inbox event: %w", err)
	}

	// 2. Verificar se já foi processado (idempotência)
	if event.Processed {
		uc.logger.Debug("event already processed",
			zap.String("inbox_id", inboxID.String()),
		)
		return nil
	}

	// 3. Parse do payload
	uc.logger.Debug("raw payload from db", zap.String("payload", string(event.Payload)))

	var payload WhatsAppWebhookPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		uc.inboxRepo.MarkAsFailed(ctx, inboxID, fmt.Sprintf("invalid payload: %v", err))
		return fmt.Errorf("failed to parse payload: %w", err)
	}

	// 4. Extrair informações
	if len(payload.Entry) == 0 || len(payload.Entry[0].Changes) == 0 {
		uc.logger.Debug("no changes in webhook")
		uc.inboxRepo.MarkAsProcessed(ctx, inboxID)
		return nil
	}

	value := payload.Entry[0].Changes[0].Value
	displayPhoneNumber := value.Metadata.DisplayPhoneNumber

	// 5. Identificar tenant pelo número do WhatsApp
	tenant, err := uc.tenantRepo.FindByWhatsAppNumber(ctx, displayPhoneNumber)
	if err != nil {
		uc.inboxRepo.MarkAsFailed(ctx, inboxID, fmt.Sprintf("tenant not found: %v", err))
		return fmt.Errorf("tenant not found for number %s: %w", displayPhoneNumber, err)
	}

	uc.logger.Info("processing whatsapp message",
		zap.String("tenant_id", tenant.ID.String()),
		zap.String("tenant_name", tenant.Name),
	)

	// 6. Processar mensagens
	if len(value.Messages) > 0 {
		for _, msg := range value.Messages {
			uc.logger.Info("message received",
				zap.String("from", msg.From),
				zap.String("type", msg.Type),
				zap.String("text", msg.Text.Body),
			)

			// Chamar use case de handling
			if msg.Type == "text" && msg.Text.Body != "" {
				handleInput := HandleMessageInput{
					From:      msg.From,
					Text:      msg.Text.Body,
					TenantID:  tenant.ID,
					Timestamp: msg.Timestamp,
				}

				if err := uc.handleMsgUseCase.Execute(ctx, handleInput); err != nil {
					uc.logger.Error("failed to handle message",
						zap.Error(err),
					)
					// Não falha o processamento do inbox por causa disso
				}
			}
		}
	}

	// 7. Marcar como processado
	if err := uc.inboxRepo.MarkAsProcessed(ctx, inboxID); err != nil {
		return fmt.Errorf("failed to mark as processed: %w", err)
	}

	uc.logger.Info("message processed successfully",
		zap.String("inbox_id", inboxID.String()),
	)

	return nil
}
