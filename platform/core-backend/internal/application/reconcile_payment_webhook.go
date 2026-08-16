package application

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/orderbatch"
	"github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	whatsappDomain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	nodeadmin "github.com/anbernal/clickgarcom/internal/infrastructure/nodeadmin"
	infraMP "github.com/anbernal/clickgarcom/internal/infrastructure/payment"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type ReconcilePaymentWebhookUseCase struct {
	paymentRepo        payment.Repository
	paymentAttemptRepo payment.AttemptRepository
	tenantRepo         tenant.Repository
	mpClient           *infraMP.MercadoPagoClient
	settlementClient   *nodeadmin.SettlementClient
	deliveryPayment    *DeliveryPaymentCoordinator
	orderBatchRepo     orderbatch.Repository
	whatsappSender     WhatsAppSender
	logger             *zap.Logger
}

func (uc *ReconcilePaymentWebhookUseCase) SetDeliveryPaymentCoordinator(coordinator *DeliveryPaymentCoordinator) {
	uc.deliveryPayment = coordinator
}

// SetDeliveryPaymentNotification wires the customer notification boundary
// without coupling the payment webhook constructor to WhatsApp infrastructure.
// Delivery confirmations are sent from the persisted order batch, so they do
// not depend on an active WhatsApp session.
func (uc *ReconcilePaymentWebhookUseCase) SetDeliveryPaymentNotification(batchRepo orderbatch.Repository, sender WhatsAppSender) {
	uc.orderBatchRepo = batchRepo
	uc.whatsappSender = sender
}

type paymentWebhookPayload struct {
	PaymentID string `json:"payment_id"`
	AttemptID string `json:"attempt_id"`
	MpID      string `json:"mp_id"`
	TenantID  string `json:"tenant_id"`
	TabID     string `json:"tab_id"`
	Action    string `json:"action"`
}

func NewReconcilePaymentWebhookUseCase(
	paymentRepo payment.Repository,
	paymentAttemptRepo payment.AttemptRepository,
	tenantRepo tenant.Repository,
	mpClient *infraMP.MercadoPagoClient,
	settlementClient *nodeadmin.SettlementClient,
	logger *zap.Logger,
) *ReconcilePaymentWebhookUseCase {
	return &ReconcilePaymentWebhookUseCase{
		paymentRepo:        paymentRepo,
		paymentAttemptRepo: paymentAttemptRepo,
		tenantRepo:         tenantRepo,
		mpClient:           mpClient,
		settlementClient:   settlementClient,
		logger:             logger,
	}
}

func (uc *ReconcilePaymentWebhookUseCase) Execute(ctx context.Context, body []byte) error {
	var payload paymentWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payment webhook payload: %w", err)
	}

	paymentID, err := uuid.Parse(strings.TrimSpace(payload.PaymentID))
	if err != nil {
		return fmt.Errorf("invalid payment_id: %w", err)
	}

	localPayment, err := uc.paymentRepo.FindByID(ctx, paymentID)
	if err != nil || localPayment == nil {
		return fmt.Errorf("payment not found for reconciliation: %w", err)
	}

	var attempt *payment.Attempt
	if attemptIDText := strings.TrimSpace(payload.AttemptID); attemptIDText != "" {
		if attemptID, parseErr := uuid.Parse(attemptIDText); parseErr == nil {
			attempt, _ = uc.paymentAttemptRepo.FindByID(ctx, attemptID)
		}
	}
	if attempt == nil {
		attempt, err = uc.paymentAttemptRepo.FindLatestByPaymentID(ctx, localPayment.ID)
		if err != nil {
			return fmt.Errorf("failed to load payment attempt: %w", err)
		}
	}

	if attempt == nil {
		return fmt.Errorf("payment attempt not found for payment %s", localPayment.ID.String())
	}

	tnt, err := uc.tenantRepo.FindByID(ctx, localPayment.TenantID)
	if err != nil || tnt == nil {
		return fmt.Errorf("tenant payment gateway config not found for tenant %s", localPayment.TenantID.String())
	}
	gateway, err := infraMP.ResolveTenantGateway(tnt.Settings)
	if err != nil || gateway.Provider != payment.ProviderMercadoPago {
		return fmt.Errorf("tenant payment gateway config not found for tenant %s", localPayment.TenantID.String())
	}

	providerPaymentID := strings.TrimSpace(payload.MpID)
	if providerPaymentID == "" {
		providerPaymentID = payment.ValueOrEmpty(attempt.ProviderPaymentID)
	}
	if providerPaymentID == "" {
		providerPaymentID = strings.TrimSpace(localPayment.ExternalReference)
	}
	if providerPaymentID == "" {
		return fmt.Errorf("provider payment id missing for payment %s", localPayment.ID.String())
	}

	providerDetails, err := uc.mpClient.GetPayment(ctx, gateway.AccessToken, providerPaymentID)
	if err != nil {
		return fmt.Errorf("failed to fetch provider payment status: %w", err)
	}

	now := time.Now()
	attempt.ProviderPaymentID = payment.OptionalString(providerPaymentID)
	attempt.ProviderStatus = strings.TrimSpace(providerDetails.Status)
	attempt.ProviderStatusInfo = strings.TrimSpace(providerDetails.StatusDetail)
	attempt.Status = mapWebhookProviderStatusToAttempt(providerDetails.Status)
	attempt.ResponsePayload = payment.JSONMap{
		"id":                 providerDetails.ID,
		"status":             providerDetails.Status,
		"status_detail":      providerDetails.StatusDetail,
		"external_reference": providerDetails.ExternalReference,
		"qr_code":            providerDetails.PointOfInteraction.TransactionData.QRCode,
		"qr_code_base64":     providerDetails.PointOfInteraction.TransactionData.QRCodeBase64,
	}
	attempt.ReconciledAt = &now

	localPayment.ExternalReference = providerPaymentID
	if qrCode := strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCode); qrCode != "" {
		localPayment.PixQRCode = qrCode
	}
	if qrCodeBase64 := strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCodeBase64); qrCodeBase64 != "" {
		localPayment.PixQRCodeImage = qrCodeBase64
	}
	localPayment.Status = mapWebhookProviderStatusToPayment(providerDetails.Status)
	if localPayment.Status == payment.StatusConfirmed && localPayment.PaidAt == nil {
		localPayment.PaidAt = &now
	}

	if err := uc.paymentAttemptRepo.Update(ctx, attempt); err != nil {
		return fmt.Errorf("failed to update payment attempt after reconciliation: %w", err)
	}
	if err := uc.paymentRepo.Update(ctx, localPayment); err != nil {
		return fmt.Errorf("failed to update payment after reconciliation: %w", err)
	}

	deliveryPaymentConfirmed := false
	if localPayment.Status == payment.StatusConfirmed {
		if checkoutKey, batchID, present, metadataErr := deliveryPaymentMetadata(localPayment.Metadata); present {
			if metadataErr != nil {
				return metadataErr
			}
			if uc.deliveryPayment == nil {
				return fmt.Errorf("delivery payment coordinator is not configured")
			}
			eventID := uuid.NewSHA1(uuid.NameSpaceOID, []byte("delivery-payment:"+localPayment.ID.String()))
			if err := uc.deliveryPayment.ConfirmPaid(ctx, DeliveryPaidPaymentInput{
				TenantID: localPayment.TenantID, CheckoutKey: checkoutKey, OrderBatchID: batchID,
				PaymentReference: providerPaymentID, PaidAmount: localPayment.Amount, EventID: eventID,
			}); err != nil {
				return fmt.Errorf("failed to confirm delivery checkout after payment: %w", err)
			}
			deliveryPaymentConfirmed = true
			if err := uc.notifyDeliveryPayment(ctx, localPayment, batchID, providerPaymentID); err != nil {
				return fmt.Errorf("failed to notify delivery payment: %w", err)
			}
		}
	}
	// Delivery has its own customer-facing lifecycle. Do not pass it through
	// the dine-in settlement path, which would emit a second generic payment
	// message and can project it into the kitchen station.
	if deliveryPaymentConfirmed {
		attempt.LastError = ""
		attempt.SettledAt = &now
		if err := uc.paymentAttemptRepo.Update(ctx, attempt); err != nil && uc.logger != nil {
			uc.logger.Warn("failed to mark delivery payment attempt as settled", zap.Error(err), zap.String("attempt_id", attempt.ID.String()))
		}
		return nil
	}

	if localPayment.Status != payment.StatusConfirmed || localPayment.TabID == nil {
		return nil
	}
	if attempt.SettledAt != nil {
		return nil
	}

	if err := uc.settlementClient.FinalizeApprovedPayment(ctx, nodeadmin.FinalizeApprovedPaymentInput{
		TenantID:          localPayment.TenantID,
		TabID:             *localPayment.TabID,
		PaymentID:         localPayment.ID,
		ProviderPaymentID: providerPaymentID,
	}); err != nil {
		attempt.LastError = strings.TrimSpace(err.Error())
		_ = uc.paymentAttemptRepo.Update(ctx, attempt)
		return err
	}

	attempt.LastError = ""
	attempt.SettledAt = &now
	if err := uc.paymentAttemptRepo.Update(ctx, attempt); err != nil {
		uc.logger.Warn("failed to mark payment attempt as settled",
			zap.Error(err),
			zap.String("attempt_id", attempt.ID.String()),
		)
	}

	return nil
}

func (uc *ReconcilePaymentWebhookUseCase) notifyDeliveryPayment(ctx context.Context, localPayment *payment.Payment, batchID uuid.UUID, providerPaymentID string) error {
	if uc == nil || localPayment == nil || uc.orderBatchRepo == nil || uc.whatsappSender == nil {
		return nil
	}
	if strings.EqualFold(strings.TrimSpace(fmt.Sprint(localPayment.Metadata["delivery_confirmation_sent"])), "true") {
		return nil
	}
	batch, err := uc.orderBatchRepo.FindByID(ctx, batchID, localPayment.TenantID)
	if err != nil {
		return err
	}
	if batch == nil || strings.TrimSpace(batch.CustomerPhone) == "" {
		if uc.logger != nil {
			uc.logger.Warn("delivery payment confirmed without customer phone", zap.String("batch_id", batchID.String()))
		}
		return nil
	}
	customerName := deliveryCustomerNameFromSnapshot(batch.DeliveryAddressSnapshot)
	prefix := ""
	if customerName != "" {
		prefix = customerName + ",\n\n"
	}
	body := prefix + fmt.Sprintf("✅ *Pagamento aprovado!*\n\nSeu pedido para entrega foi enviado ao restaurante.\nValor pago: *R$ %.2f*\nCódigo da transação: *%s*\n\nVocê receberá as próximas atualizações por aqui. 🛵", localPayment.Amount, strings.TrimSpace(providerPaymentID))
	if err := uc.whatsappSender.SendText(whatsappDomain.WithTenantID(ctx, localPayment.TenantID), strings.TrimSpace(batch.CustomerPhone), body); err != nil {
		return err
	}
	if localPayment.Metadata == nil {
		localPayment.Metadata = payment.JSONMap{}
	}
	localPayment.Metadata["delivery_confirmation_sent"] = true
	return uc.paymentRepo.Update(ctx, localPayment)
}

func deliveryCustomerNameFromSnapshot(snapshot json.RawMessage) string {
	if len(snapshot) == 0 {
		return ""
	}
	var values map[string]interface{}
	if err := json.Unmarshal(snapshot, &values); err != nil {
		return ""
	}
	name := strings.Join(strings.Fields(strings.TrimSpace(fmt.Sprint(values["customer_name"]))), " ")
	if len([]rune(name)) < 2 || len([]rune(name)) > 120 {
		return ""
	}
	return name
}

func deliveryPaymentMetadata(metadata payment.JSONMap) (string, uuid.UUID, bool, error) {
	rawCheckout, checkoutPresent := metadata["delivery_checkout_key"]
	rawBatch, batchPresent := metadata["delivery_order_batch_id"]
	if !checkoutPresent && !batchPresent {
		return "", uuid.Nil, false, nil
	}
	checkoutKey := strings.TrimSpace(fmt.Sprint(rawCheckout))
	batchID, err := uuid.Parse(strings.TrimSpace(fmt.Sprint(rawBatch)))
	if checkoutKey == "" || err != nil || batchID == uuid.Nil {
		return "", uuid.Nil, true, fmt.Errorf("delivery payment metadata is incomplete")
	}
	return checkoutKey, batchID, true, nil
}

func mapWebhookProviderStatusToPayment(status string) payment.Status {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "approved":
		return payment.StatusConfirmed
	case "expired":
		return payment.StatusExpired
	case "rejected", "cancelled", "canceled":
		return payment.StatusCanceled
	default:
		return payment.StatusPending
	}
}

func mapWebhookProviderStatusToAttempt(status string) payment.AttemptStatus {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "approved":
		return payment.AttemptStatusApproved
	case "rejected":
		return payment.AttemptStatusRejected
	case "cancelled", "canceled":
		return payment.AttemptStatusCanceled
	case "expired":
		return payment.AttemptStatusExpired
	case "in_process", "processing":
		return payment.AttemptStatusProcessing
	case "pending":
		return payment.AttemptStatusPending
	default:
		return payment.AttemptStatusPending
	}
}
