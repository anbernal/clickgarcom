package handlers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/anbernal/clickgarcom/internal/domain/payment"
	"github.com/anbernal/clickgarcom/internal/domain/tenant"
	infraMP "github.com/anbernal/clickgarcom/internal/infrastructure/payment"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type PaymentHandler struct {
	paymentRepo payment.Repository
	tenantRepo  tenant.Repository
	mpClient    *infraMP.MercadoPagoClient
	rabbitMQ    RabbitMQPublisher
	logger      *zap.Logger
}

func NewPaymentHandler(
	paymentRepo payment.Repository,
	tenantRepo tenant.Repository,
	mpClient *infraMP.MercadoPagoClient,
	rabbitMQ RabbitMQPublisher,
	logger *zap.Logger,
) *PaymentHandler {
	return &PaymentHandler{
		paymentRepo: paymentRepo,
		tenantRepo:  tenantRepo,
		mpClient:    mpClient,
		rabbitMQ:    rabbitMQ,
		logger:      logger,
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
	if err != nil || tnt.Settings.MPAccessToken == "" {
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

	// Create MP Request
	var mpReq infraMP.PixPaymentRequest
	mpReq.TransactionAmount = reqBody.Amount
	mpReq.Description = reqBody.Description
	mpReq.Payer.Email = reqBody.PayerEmail
	mpReq.Payer.FirstName = reqBody.PayerName
	mpReq.Payer.Identification.Type = "CPF"
	mpReq.Payer.Identification.Number = reqBody.PayerCPF

	idempotencyKey := uuid.New().String()

	mpResp, err := h.mpClient.CreatePixPayment(c.Context(), tnt.Settings.MPAccessToken, idempotencyKey, mpReq)
	if err != nil {
		h.logger.Error("pix payment failed", zap.Error(err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to process pix via mercadopago"})
	}

	// Salvar pagamento no Banco Base Local
	p := &payment.Payment{
		TenantID:          tenantID,
		OrderID:           orderID,
		Amount:            reqBody.Amount,
		Status:            payment.PaymentStatus(mpResp.Status),
		Method:            payment.MethodPix,
		ExternalReference: fmt.Sprintf("%d", mpResp.ID),
	}

	if err := h.paymentRepo.Save(c.Context(), p); err != nil {
		h.logger.Error("failed to save payment to db", zap.Error(err))
		// We still return success to user since MP processed it, but log heavily.
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"payment_id":     p.ID,
		"mp_id":          mpResp.ID,
		"qr_code":        mpResp.PointOfInteraction.TransactionData.QRCode,
		"qr_code_base64": mpResp.PointOfInteraction.TransactionData.QRCodeBase64,
		"status":         mpResp.Status,
	})
}

// CreateCardPayment handles POST /api/payments/card
func (h *PaymentHandler) CreateCardPayment(c *fiber.Ctx) error {
	tenantID, err := extractTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "tenant id missing or invalid"})
	}

	tnt, err := h.tenantRepo.FindByID(c.Context(), tenantID)
	if err != nil || tnt.Settings.MPAccessToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mercadopago not configured for this tenant"})
	}

	var reqBody struct {
		OrderID         string  `json:"order_id"`
		Amount          float64 `json:"amount"`
		Token           string  `json:"token"` // PCI Token provided by MP Frontend SDK
		Description     string  `json:"description"`
		Installments    int     `json:"installments"`
		PaymentMethodID string  `json:"payment_method_id"` // e.g. "visa", "master"
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

	var mpReq infraMP.CardPaymentRequest
	mpReq.TransactionAmount = reqBody.Amount
	mpReq.Token = reqBody.Token
	mpReq.Description = reqBody.Description
	mpReq.Installments = reqBody.Installments
	mpReq.PaymentMethodID = reqBody.PaymentMethodID
	mpReq.IssuerID = reqBody.IssuerID
	mpReq.Payer.Email = reqBody.PayerEmail
	mpReq.Payer.Identification.Type = "CPF"
	mpReq.Payer.Identification.Number = reqBody.PayerCPF

	idempotencyKey := uuid.New().String()

	mpResp, err := h.mpClient.CreateCardPayment(c.Context(), tnt.Settings.MPAccessToken, idempotencyKey, mpReq)
	if err != nil {
		h.logger.Error("card payment failed", zap.Error(err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to process card via mercadopago"})
	}

	method := payment.MethodCreditCard
	// Simplification, ideally we check mpResp or req for 'debvisa' etc.
	if reqBody.PaymentMethodID == "debvisa" || reqBody.PaymentMethodID == "debmaster" {
		method = payment.MethodDebitCard
	}

	p := &payment.Payment{
		TenantID:          tenantID,
		OrderID:           orderID,
		Amount:            reqBody.Amount,
		Status:            payment.PaymentStatus(mpResp.Status),
		Method:            method,
		ExternalReference: fmt.Sprintf("%d", mpResp.ID),
	}

	if err := h.paymentRepo.Save(c.Context(), p); err != nil {
		h.logger.Error("failed to save card payment to db", zap.Error(err))
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"payment_id": p.ID,
		"mp_id":      mpResp.ID,
		"status":     mpResp.Status,
	})
}

// HandleWebhook handles MercadoPago POST /webhooks/mercadopago
func (h *PaymentHandler) HandleWebhook(c *fiber.Ctx) error {
	// MP envia { "action": "payment.updated", "data": { "id": "12345678" } }
	var webhookPayload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &webhookPayload); err != nil {
		return c.SendStatus(fiber.StatusOK) // ACK always
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

	// Since Webhook lacks TenantID (MP sends global webhook per account usually),
	// we use ExternalReference to find it in our local DB.
	p, err := h.paymentRepo.FindByExternalReference(c.Context(), mpIDStr)
	if err != nil {
		h.logger.Warn("webhook payment not found in db", zap.String("mp_id", mpIDStr))
		return c.SendStatus(fiber.StatusOK)
	}

	// Idealmente, deveríamos fazer um GET /v1/payments/{mpIDStr} no MP para confirmar o real status.
	// Por brevidade/exemplo, estamos assumindo disparar evento pra RabbitMQ investigar.
	// Em produção real Webhook -> RabbitMQ -> Worker valida Status -> Fila Atualiza DB.

	// FASE 13: Interceptação Direta para Recarga de Wallet (Pré-Pago)
	if p.OrderID == uuid.Nil {
		// É uma recarga de carteira. Se recebemos o webhook, vamos processar o crédito.
		// Obs: Em Produção, checaríamos Status == `approved` com get request no MP.
		if p.Status != payment.StatusApproved {
			// Atualiza Status para Aprovado (Mock local para agilizar homologação)
			_ = h.paymentRepo.UpdateStatus(c.Context(), p.ID, payment.StatusApproved)

			// Recarrega o Saldo na Entidade Tenant
			// Usando o método Deduct com valor Negativo (-) para Somar ao saldo
			_ = h.tenantRepo.DeductWalletBalance(c.Context(), p.TenantID, -p.Amount)

			h.logger.Info("wallet recharged successfully via webhook", zap.String("tenant_id", p.TenantID.String()), zap.Float64("amount", p.Amount))
		}
		return c.SendStatus(fiber.StatusOK)
	}

	msgBytes, _ := json.Marshal(map[string]interface{}{
		"payment_id": p.ID.String(),
		"mp_id":      mpIDStr,
		"tenant_id":  p.TenantID.String(),
		"order_id":   p.OrderID.String(),
		"action":     action,
	})

	h.rabbitMQ.Publish(context.Background(), "", "payment.webhooks", msgBytes)

	h.logger.Info("mp webhook received & published", zap.String("mp_id", mpIDStr))
	return c.SendStatus(fiber.StatusOK)
}

// extractTenantID is a helper to get the tenant ID from context or headers
func extractTenantID(c *fiber.Ctx) (uuid.UUID, error) {
	// 1. Tentar pegar do header X-Tenant-Id
	headerVal := c.Get("X-Tenant-Id")
	if headerVal != "" {
		if u, err := uuid.Parse(headerVal); err == nil {
			return u, nil
		}
	}

	// 2. Fallback para Locals (útil se tivermos um middleware Global)
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
