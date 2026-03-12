package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/order"
	"github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	infraMP "github.com/anbernal/clickgarcom/internal/infrastructure/payment"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type PaymentHandler struct {
	paymentRepo        payment.Repository
	paymentAttemptRepo payment.AttemptRepository
	orderRepo          order.Repository
	tenantRepo         tenant.Repository
	mpClient           *infraMP.MercadoPagoClient
	rabbitMQ           RabbitMQPublisher
	logger             *zap.Logger
}

func NewPaymentHandler(
	paymentRepo payment.Repository,
	paymentAttemptRepo payment.AttemptRepository,
	orderRepo order.Repository,
	tenantRepo tenant.Repository,
	mpClient *infraMP.MercadoPagoClient,
	rabbitMQ RabbitMQPublisher,
	logger *zap.Logger,
) *PaymentHandler {
	return &PaymentHandler{
		paymentRepo:        paymentRepo,
		paymentAttemptRepo: paymentAttemptRepo,
		orderRepo:          orderRepo,
		tenantRepo:         tenantRepo,
		mpClient:           mpClient,
		rabbitMQ:           rabbitMQ,
		logger:             logger,
	}
}

// GetWalletBalance handles GET /api/wallet/balance
func (h *PaymentHandler) GetWalletBalance(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	tnt, err := h.tenantRepo.FindByID(c.Context(), tenantID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "tenant not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"wallet_balance": tnt.WalletBalance,
		"billing_plan":   tnt.BillingPlan,
	})
}

// CreatePixPayment handles POST /api/payments/pix
func (h *PaymentHandler) CreatePixPayment(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	tnt, err := h.tenantRepo.FindByID(c.Context(), tenantID)
	if err != nil || tnt == nil || tnt.Settings.MPAccessToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mercadopago not configured for this tenant"})
	}

	var reqBody struct {
		OrderID     string  `json:"order_id"`
		Amount      float64 `json:"amount"`
		Description string  `json:"description"`
		PayerEmail  string  `json:"payer_email"`
		PayerName   string  `json:"payer_name"`
		PayerCPF    string  `json:"payer_cpf"`
	}

	if err := c.BodyParser(&reqBody); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	orderID, err := uuid.Parse(reqBody.OrderID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid order_id"})
	}

	tabID, walletRecharge, err := h.resolvePaymentContext(c.Context(), tenantID, orderID)
	if err != nil {
		statusCode := fiber.StatusBadRequest
		if errors.Is(err, errOrderNotFound) {
			statusCode = fiber.StatusNotFound
		}
		return c.Status(statusCode).JSON(fiber.Map{"error": err.Error()})
	}

	method := payment.MethodPix
	localPayment := h.newLocalPayment(tenantID, tabID, orderID, reqBody.Amount, method, walletRecharge)
	if err := h.paymentRepo.Create(c.Context(), localPayment); err != nil {
		h.logger.Error("failed to create local pix payment", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create local payment"})
	}

	idempotencyKey := uuid.New().String()
	externalReference := localPayment.ID.String()

	var mpReq infraMP.PixPaymentRequest
	mpReq.TransactionAmount = reqBody.Amount
	mpReq.Description = reqBody.Description
	mpReq.ExternalReference = externalReference
	mpReq.Payer.Email = reqBody.PayerEmail
	mpReq.Payer.FirstName = reqBody.PayerName
	mpReq.Payer.Identification.Type = "CPF"
	mpReq.Payer.Identification.Number = reqBody.PayerCPF

	attempt := &payment.Attempt{
		PaymentID:         localPayment.ID,
		TenantID:          tenantID,
		TabID:             tabID,
		Provider:          payment.ProviderMercadoPago,
		PaymentMethod:     method,
		RequestedAmount:   reqBody.Amount,
		IdempotencyKey:    idempotencyKey,
		ExternalReference: externalReference,
		Status:            payment.AttemptStatusCreated,
		RequestPayload: payment.JSONMap{
			"amount":             reqBody.Amount,
			"description":        reqBody.Description,
			"payer_email":        reqBody.PayerEmail,
			"payer_name":         reqBody.PayerName,
			"payer_cpf":          reqBody.PayerCPF,
			"payment_method_id":  "pix",
			"wallet_recharge":    walletRecharge,
			"local_payment_id":   localPayment.ID.String(),
			"local_reference_id": externalReference,
		},
	}
	if err := h.paymentAttemptRepo.Create(c.Context(), attempt); err != nil {
		h.logger.Error("failed to create pix payment attempt", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create payment attempt"})
	}

	mpResp, err := h.mpClient.CreatePixPayment(c.Context(), tnt.Settings.MPAccessToken, idempotencyKey, mpReq)
	if err != nil {
		h.persistIndeterminateAttempt(c.Context(), attempt, err)
		if h.isIndeterminateProviderError(err) {
			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"payment_id":           localPayment.ID,
				"status":               strings.ToLower(string(payment.AttemptStatusUnknown)),
				"pending_confirmation": true,
			})
		}

		h.logger.Error("pix payment failed", zap.Error(err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to process pix via mercadopago"})
	}

	h.applyPixProviderResponse(c.Context(), localPayment, attempt, mpResp)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"payment_id":           localPayment.ID,
		"mp_id":                mpResp.ID,
		"qr_code":              mpResp.PointOfInteraction.TransactionData.QRCode,
		"qr_code_base64":       mpResp.PointOfInteraction.TransactionData.QRCodeBase64,
		"status":               strings.ToLower(strings.TrimSpace(mpResp.Status)),
		"pending_confirmation": attempt.Status == payment.AttemptStatusProcessing || attempt.Status == payment.AttemptStatusUnknown,
	})
}

// CreateCardPayment handles POST /api/payments/card
func (h *PaymentHandler) CreateCardPayment(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	tnt, err := h.tenantRepo.FindByID(c.Context(), tenantID)
	if err != nil || tnt == nil || tnt.Settings.MPAccessToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mercadopago not configured for this tenant"})
	}

	var reqBody struct {
		OrderID         string  `json:"order_id"`
		Amount          float64 `json:"amount"`
		Token           string  `json:"token"`
		Description     string  `json:"description"`
		Installments    int     `json:"installments"`
		PaymentMethodID string  `json:"payment_method_id"`
		IssuerID        string  `json:"issuer_id"`
		PayerEmail      string  `json:"payer_email"`
		PayerCPF        string  `json:"payer_cpf"`
	}

	if err := c.BodyParser(&reqBody); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	orderID, err := uuid.Parse(reqBody.OrderID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid order_id"})
	}

	tabID, walletRecharge, err := h.resolvePaymentContext(c.Context(), tenantID, orderID)
	if err != nil {
		statusCode := fiber.StatusBadRequest
		if errors.Is(err, errOrderNotFound) {
			statusCode = fiber.StatusNotFound
		}
		return c.Status(statusCode).JSON(fiber.Map{"error": err.Error()})
	}

	method := payment.MethodCreditCard
	if reqBody.PaymentMethodID == "debvisa" || reqBody.PaymentMethodID == "debmaster" {
		method = payment.MethodDebitCard
	}

	localPayment := h.newLocalPayment(tenantID, tabID, orderID, reqBody.Amount, method, walletRecharge)
	if err := h.paymentRepo.Create(c.Context(), localPayment); err != nil {
		h.logger.Error("failed to create local card payment", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create local payment"})
	}

	idempotencyKey := uuid.New().String()
	externalReference := localPayment.ID.String()

	var mpReq infraMP.CardPaymentRequest
	mpReq.TransactionAmount = reqBody.Amount
	mpReq.Token = reqBody.Token
	mpReq.Description = reqBody.Description
	mpReq.Installments = reqBody.Installments
	mpReq.PaymentMethodID = reqBody.PaymentMethodID
	mpReq.IssuerID = reqBody.IssuerID
	mpReq.ExternalReference = externalReference
	mpReq.Payer.Email = reqBody.PayerEmail
	mpReq.Payer.Identification.Type = "CPF"
	mpReq.Payer.Identification.Number = reqBody.PayerCPF

	attempt := &payment.Attempt{
		PaymentID:         localPayment.ID,
		TenantID:          tenantID,
		TabID:             tabID,
		Provider:          payment.ProviderMercadoPago,
		PaymentMethod:     method,
		RequestedAmount:   reqBody.Amount,
		IdempotencyKey:    idempotencyKey,
		ExternalReference: externalReference,
		Status:            payment.AttemptStatusCreated,
		RequestPayload: payment.JSONMap{
			"amount":             reqBody.Amount,
			"description":        reqBody.Description,
			"installments":       reqBody.Installments,
			"payment_method_id":  reqBody.PaymentMethodID,
			"issuer_id":          reqBody.IssuerID,
			"payer_email":        reqBody.PayerEmail,
			"payer_cpf":          reqBody.PayerCPF,
			"wallet_recharge":    walletRecharge,
			"local_payment_id":   localPayment.ID.String(),
			"local_reference_id": externalReference,
		},
	}
	if err := h.paymentAttemptRepo.Create(c.Context(), attempt); err != nil {
		h.logger.Error("failed to create card payment attempt", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create payment attempt"})
	}

	mpResp, err := h.mpClient.CreateCardPayment(c.Context(), tnt.Settings.MPAccessToken, idempotencyKey, mpReq)
	if err != nil {
		h.persistIndeterminateAttempt(c.Context(), attempt, err)
		if h.isIndeterminateProviderError(err) {
			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"payment_id":           localPayment.ID,
				"status":               strings.ToLower(string(payment.AttemptStatusUnknown)),
				"pending_confirmation": true,
			})
		}

		h.logger.Error("card payment failed", zap.Error(err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to process card via mercadopago"})
	}

	h.applyCardProviderResponse(c.Context(), localPayment, attempt, mpResp)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"payment_id":           localPayment.ID,
		"mp_id":                mpResp.ID,
		"status":               strings.ToLower(strings.TrimSpace(mpResp.Status)),
		"pending_confirmation": attempt.Status == payment.AttemptStatusProcessing || attempt.Status == payment.AttemptStatusUnknown,
	})
}

// GetPaymentStatus handles GET /payments/:paymentId/status
func (h *PaymentHandler) GetPaymentStatus(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	paymentID, err := uuid.Parse(c.Params("paymentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payment_id"})
	}

	localPayment, err := h.paymentRepo.FindByID(c.Context(), paymentID)
	if err != nil || localPayment == nil || localPayment.TenantID != tenantID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "payment not found"})
	}

	attempt, err := h.paymentAttemptRepo.FindLatestByPaymentID(c.Context(), localPayment.ID)
	if err != nil {
		h.logger.Warn("failed to load payment attempt", zap.Error(err), zap.String("payment_id", localPayment.ID.String()))
	}

	tnt, tenantErr := h.tenantRepo.FindByID(c.Context(), tenantID)
	if tenantErr == nil && tnt != nil && strings.TrimSpace(tnt.Settings.MPAccessToken) != "" {
		h.refreshPaymentStatus(c.Context(), tnt, localPayment, attempt)
	}

	status := h.localAPIStatus(localPayment, attempt)
	statusDetail := ""
	providerPaymentID := ""
	if attempt != nil {
		statusDetail = strings.TrimSpace(attempt.ProviderStatusInfo)
		providerPaymentID = strings.TrimSpace(attempt.ProviderPaymentID)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"payment_id":           localPayment.ID,
		"mp_id":                providerPaymentID,
		"status":               status,
		"status_detail":        statusDetail,
		"approved":             localPayment.Status == payment.StatusConfirmed,
		"pending_confirmation": attempt != nil && (attempt.Status == payment.AttemptStatusUnknown || attempt.Status == payment.AttemptStatusProcessing),
		"qr_code":              localPayment.PixQRCode,
		"qr_code_base64":       localPayment.PixQRCodeImage,
	})
}

// GetMercadoPagoPaymentStatus handles GET /payments/mp/:mpID/status
func (h *PaymentHandler) GetMercadoPagoPaymentStatus(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	mpID := strings.TrimSpace(c.Params("mpID"))
	if mpID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid mp_id"})
	}

	tnt, err := h.tenantRepo.FindByID(c.Context(), tenantID)
	if err != nil || tnt == nil || strings.TrimSpace(tnt.Settings.MPAccessToken) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mercadopago not configured for this tenant"})
	}

	mpPayment, err := h.mpClient.GetPayment(c.Context(), tnt.Settings.MPAccessToken, mpID)
	if err != nil {
		h.logger.Warn("failed to fetch mercadopago payment status",
			zap.Error(err),
			zap.String("tenant_id", tenantID.String()),
			zap.String("mp_id", mpID),
		)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to fetch payment status"})
	}

	status := strings.ToLower(strings.TrimSpace(mpPayment.Status))
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"mp_id":          mpID,
		"status":         status,
		"status_detail":  strings.TrimSpace(mpPayment.StatusDetail),
		"approved":       strings.EqualFold(status, "approved"),
		"qr_code":        strings.TrimSpace(mpPayment.PointOfInteraction.TransactionData.QRCode),
		"qr_code_base64": strings.TrimSpace(mpPayment.PointOfInteraction.TransactionData.QRCodeBase64),
	})
}

// HandleWebhook handles MercadoPago POST /webhooks/mercadopago
func (h *PaymentHandler) HandleWebhook(c *fiber.Ctx) error {
	var webhookPayload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &webhookPayload); err != nil {
		return c.SendStatus(fiber.StatusOK)
	}

	action, _ := webhookPayload["action"].(string)
	if action != "payment.updated" && action != "payment.created" {
		return c.SendStatus(fiber.StatusOK)
	}

	dataMap, ok := webhookPayload["data"].(map[string]interface{})
	if !ok {
		return c.SendStatus(fiber.StatusOK)
	}

	mpIDAny, ok := dataMap["id"]
	if !ok {
		return c.SendStatus(fiber.StatusOK)
	}

	mpIDStr := fmt.Sprintf("%v", mpIDAny)

	localPayment, err := h.paymentRepo.FindByExternalReference(c.Context(), mpIDStr)
	if err != nil {
		h.logger.Warn("webhook payment not found by external_reference", zap.String("mp_id", mpIDStr), zap.Error(err))
	}

	var attempt *payment.Attempt
	if localPayment == nil {
		attempt, err = h.paymentAttemptRepo.FindByProviderPaymentID(c.Context(), mpIDStr)
		if err != nil {
			h.logger.Warn("webhook payment attempt not found", zap.String("mp_id", mpIDStr), zap.Error(err))
			return c.SendStatus(fiber.StatusOK)
		}
		if attempt == nil {
			h.logger.Warn("webhook payment not found in db", zap.String("mp_id", mpIDStr))
			return c.SendStatus(fiber.StatusOK)
		}

		localPayment, err = h.paymentRepo.FindByID(c.Context(), attempt.PaymentID)
		if err != nil || localPayment == nil {
			h.logger.Warn("webhook payment could not load local payment",
				zap.String("mp_id", mpIDStr),
				zap.Error(err),
			)
			return c.SendStatus(fiber.StatusOK)
		}
	}

	if attempt == nil {
		attempt, err = h.paymentAttemptRepo.FindLatestByPaymentID(c.Context(), localPayment.ID)
		if err != nil {
			h.logger.Warn("failed to load payment attempt for webhook",
				zap.String("payment_id", localPayment.ID.String()),
				zap.Error(err),
			)
		}
	}

	if localPayment.ExternalReference != mpIDStr {
		localPayment.ExternalReference = mpIDStr
		_ = h.paymentRepo.Update(c.Context(), localPayment)
	}

	if localPayment.TabID == nil && (localPayment.OrderID == nil || *localPayment.OrderID == uuid.Nil) {
		if localPayment.Status != payment.StatusConfirmed {
			now := time.Now()
			localPayment.Status = payment.StatusConfirmed
			localPayment.PaidAt = &now
			if err := h.paymentRepo.Update(c.Context(), localPayment); err != nil {
				h.logger.Warn("failed to update wallet recharge status", zap.Error(err), zap.String("payment_id", localPayment.ID.String()))
			}
			_ = h.tenantRepo.DeductWalletBalance(c.Context(), localPayment.TenantID, -localPayment.Amount)
		}
		return c.SendStatus(fiber.StatusOK)
	}

	msgBytes, _ := json.Marshal(map[string]interface{}{
		"payment_id": localPayment.ID.String(),
		"attempt_id": func() string {
			if attempt == nil {
				return ""
			}
			return attempt.ID.String()
		}(),
		"mp_id":     mpIDStr,
		"tenant_id": localPayment.TenantID.String(),
		"tab_id": func() string {
			if localPayment.TabID == nil {
				return ""
			}
			return localPayment.TabID.String()
		}(),
		"action": action,
	})

	h.rabbitMQ.Publish(context.Background(), "", "payment.webhooks", msgBytes)

	h.logger.Info("mp webhook received & published", zap.String("mp_id", mpIDStr))
	return c.SendStatus(fiber.StatusOK)
}

var errOrderNotFound = errors.New("pedido nao encontrado")

func (h *PaymentHandler) resolvePaymentContext(
	ctx context.Context,
	tenantID uuid.UUID,
	orderID uuid.UUID,
) (*uuid.UUID, bool, error) {
	if orderID == uuid.Nil {
		return nil, true, nil
	}

	ord, err := h.orderRepo.FindByID(ctx, orderID, tenantID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, errOrderNotFound
		}
		return nil, false, fmt.Errorf("failed to load order: %w", err)
	}
	if ord == nil {
		return nil, false, errOrderNotFound
	}

	tabID := ord.TabID
	return &tabID, false, nil
}

func (h *PaymentHandler) newLocalPayment(
	tenantID uuid.UUID,
	tabID *uuid.UUID,
	orderID uuid.UUID,
	amount float64,
	method payment.Method,
	walletRecharge bool,
) *payment.Payment {
	var orderRef *uuid.UUID
	if !walletRecharge && orderID != uuid.Nil {
		orderRef = &orderID
	}

	return &payment.Payment{
		ID:          uuid.New(),
		TenantID:    tenantID,
		TabID:       tabID,
		OrderID:     orderRef,
		PaymentType: payment.TypeFull,
		Amount:      amount,
		Status:      payment.StatusPending,
		Method:      method,
		Metadata: payment.JSONMap{
			"provider": string(payment.ProviderMercadoPago),
			"method":   string(method),
		},
	}
}

func (h *PaymentHandler) applyPixProviderResponse(
	ctx context.Context,
	localPayment *payment.Payment,
	attempt *payment.Attempt,
	mpResp *infraMP.PixPaymentResponse,
) {
	now := time.Now()
	attempt.ProviderPaymentID = fmt.Sprintf("%d", mpResp.ID)
	attempt.ProviderStatus = strings.TrimSpace(mpResp.Status)
	attempt.ProviderStatusInfo = strings.TrimSpace(mpResp.StatusDetail)
	attempt.Status = mapProviderStatusToAttemptStatus(mpResp.Status)
	attempt.ResponsePayload = payment.JSONMap{
		"id":                 mpResp.ID,
		"status":             mpResp.Status,
		"status_detail":      mpResp.StatusDetail,
		"external_reference": mpResp.ExternalReference,
		"qr_code":            mpResp.PointOfInteraction.TransactionData.QRCode,
		"qr_code_base64":     mpResp.PointOfInteraction.TransactionData.QRCodeBase64,
	}
	attempt.ReconciledAt = &now
	_ = h.paymentAttemptRepo.Update(ctx, attempt)

	localPayment.ExternalReference = attempt.ProviderPaymentID
	localPayment.PixTxID = attempt.ProviderPaymentID
	localPayment.PixQRCode = strings.TrimSpace(mpResp.PointOfInteraction.TransactionData.QRCode)
	localPayment.PixQRCodeImage = strings.TrimSpace(mpResp.PointOfInteraction.TransactionData.QRCodeBase64)
	localPayment.Status = mapProviderStatusToPaymentStatus(mpResp.Status)
	if localPayment.Status == payment.StatusConfirmed {
		localPayment.PaidAt = &now
	}
	_ = h.paymentRepo.Update(ctx, localPayment)
}

func (h *PaymentHandler) applyCardProviderResponse(
	ctx context.Context,
	localPayment *payment.Payment,
	attempt *payment.Attempt,
	mpResp *infraMP.CardPaymentResponse,
) {
	now := time.Now()
	attempt.ProviderPaymentID = fmt.Sprintf("%d", mpResp.ID)
	attempt.ProviderStatus = strings.TrimSpace(mpResp.Status)
	attempt.ProviderStatusInfo = strings.TrimSpace(mpResp.StatusDetail)
	attempt.Status = mapProviderStatusToAttemptStatus(mpResp.Status)
	attempt.ResponsePayload = payment.JSONMap{
		"id":                 mpResp.ID,
		"status":             mpResp.Status,
		"status_detail":      mpResp.StatusDetail,
		"external_reference": mpResp.ExternalReference,
	}
	attempt.ReconciledAt = &now
	_ = h.paymentAttemptRepo.Update(ctx, attempt)

	localPayment.ExternalReference = attempt.ProviderPaymentID
	localPayment.Status = mapProviderStatusToPaymentStatus(mpResp.Status)
	if localPayment.Status == payment.StatusConfirmed {
		localPayment.PaidAt = &now
	}
	_ = h.paymentRepo.Update(ctx, localPayment)
}

func (h *PaymentHandler) persistIndeterminateAttempt(
	ctx context.Context,
	attempt *payment.Attempt,
	err error,
) {
	if attempt == nil {
		return
	}

	attempt.LastError = strings.TrimSpace(err.Error())
	if h.isIndeterminateProviderError(err) {
		attempt.Status = payment.AttemptStatusUnknown
	} else {
		attempt.Status = payment.AttemptStatusError
	}
	now := time.Now()
	attempt.ReconciledAt = &now
	if updateErr := h.paymentAttemptRepo.Update(ctx, attempt); updateErr != nil {
		h.logger.Warn("failed to persist payment attempt error",
			zap.Error(updateErr),
			zap.String("attempt_id", attempt.ID.String()),
		)
	}
}

func (h *PaymentHandler) refreshPaymentStatus(
	ctx context.Context,
	tnt *tenant.Tenant,
	localPayment *payment.Payment,
	attempt *payment.Attempt,
) {
	if tnt == nil || localPayment == nil {
		return
	}

	var providerDetails *infraMP.PaymentStatusResponse
	var err error

	if attempt != nil && strings.TrimSpace(attempt.ProviderPaymentID) != "" {
		providerDetails, err = h.mpClient.GetPayment(ctx, tnt.Settings.MPAccessToken, attempt.ProviderPaymentID)
	} else if attempt != nil && strings.TrimSpace(attempt.ExternalReference) != "" {
		providerDetails, err = h.mpClient.SearchPaymentsByExternalReference(ctx, tnt.Settings.MPAccessToken, attempt.ExternalReference)
	}

	if err != nil {
		h.logger.Warn("failed to refresh payment status from mercadopago",
			zap.Error(err),
			zap.String("payment_id", localPayment.ID.String()),
		)
		return
	}
	if providerDetails == nil {
		return
	}

	now := time.Now()
	if attempt != nil {
		attempt.ProviderPaymentID = strings.TrimSpace(fmt.Sprintf("%d", providerDetails.ID))
		attempt.ProviderStatus = strings.TrimSpace(providerDetails.Status)
		attempt.ProviderStatusInfo = strings.TrimSpace(providerDetails.StatusDetail)
		attempt.Status = mapProviderStatusToAttemptStatus(providerDetails.Status)
		attempt.ResponsePayload = payment.JSONMap{
			"id":                 providerDetails.ID,
			"status":             providerDetails.Status,
			"status_detail":      providerDetails.StatusDetail,
			"external_reference": providerDetails.ExternalReference,
			"qr_code":            providerDetails.PointOfInteraction.TransactionData.QRCode,
			"qr_code_base64":     providerDetails.PointOfInteraction.TransactionData.QRCodeBase64,
		}
		attempt.ReconciledAt = &now
		_ = h.paymentAttemptRepo.Update(ctx, attempt)
	}

	localPayment.ExternalReference = strings.TrimSpace(fmt.Sprintf("%d", providerDetails.ID))
	if strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCode) != "" {
		localPayment.PixQRCode = strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCode)
	}
	if strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCodeBase64) != "" {
		localPayment.PixQRCodeImage = strings.TrimSpace(providerDetails.PointOfInteraction.TransactionData.QRCodeBase64)
	}
	localPayment.Status = mapProviderStatusToPaymentStatus(providerDetails.Status)
	if localPayment.Status == payment.StatusConfirmed && localPayment.PaidAt == nil {
		localPayment.PaidAt = &now
	}
	_ = h.paymentRepo.Update(ctx, localPayment)
}

func (h *PaymentHandler) localAPIStatus(localPayment *payment.Payment, attempt *payment.Attempt) string {
	if attempt != nil {
		if providerStatus := strings.ToLower(strings.TrimSpace(attempt.ProviderStatus)); providerStatus != "" {
			return providerStatus
		}
		switch attempt.Status {
		case payment.AttemptStatusUnknown:
			return "unknown"
		case payment.AttemptStatusProcessing:
			return "processing"
		case payment.AttemptStatusApproved:
			return "approved"
		case payment.AttemptStatusRejected:
			return "rejected"
		case payment.AttemptStatusCanceled:
			return "cancelled"
		case payment.AttemptStatusExpired:
			return "expired"
		case payment.AttemptStatusPending:
			return "pending"
		}
	}

	switch localPayment.Status {
	case payment.StatusConfirmed:
		return "approved"
	case payment.StatusExpired:
		return "expired"
	case payment.StatusCanceled:
		return "cancelled"
	default:
		return "pending"
	}
}

func (h *PaymentHandler) isIndeterminateProviderError(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "timeout") ||
		strings.Contains(message, "context deadline exceeded") ||
		strings.Contains(message, "mp api error")
}

func mapProviderStatusToPaymentStatus(status string) payment.Status {
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

func mapProviderStatusToAttemptStatus(status string) payment.AttemptStatus {
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

// extractTenantID is a helper to get the tenant ID from context or headers
func extractTenantID(c *fiber.Ctx) (uuid.UUID, error) {
	headerVal := c.Get("X-Tenant-Id")
	if headerVal != "" {
		if u, err := uuid.Parse(headerVal); err == nil {
			return u, nil
		}
	}

	val := c.Locals("tenantID")
	if val == nil {
		return uuid.Nil, fmt.Errorf("missing tenantID from headers or locals")
	}
	if str, ok := val.(string); ok {
		return uuid.Parse(str)
	}
	if u, ok := val.(uuid.UUID); ok {
		return u, nil
	}
	return uuid.Nil, fmt.Errorf("invalid tenantID type")
}
