package application

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
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
	logger             *zap.Logger
}

func (uc *ReconcilePaymentWebhookUseCase) SetDeliveryPaymentCoordinator(coordinator *DeliveryPaymentCoordinator) {
	uc.deliveryPayment = coordinator
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
		}
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
