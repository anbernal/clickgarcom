package payment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

type MercadoPagoClient struct {
	httpClient *http.Client
	logger     *zap.Logger
	baseURL    string
}

type APIError struct {
	Status           int
	Message          string
	ErrorCode        string
	CauseCode        int
	CauseDescription string
	ResponseBody     string
}

func (e *APIError) Error() string {
	if e == nil {
		return "mercadopago returned unknown error"
	}
	if msg := strings.TrimSpace(e.ProviderMessage()); msg != "" {
		return fmt.Sprintf("mercadopago returned status %d: %s", e.Status, msg)
	}
	return fmt.Sprintf("mercadopago returned status %d", e.Status)
}

func (e *APIError) ProviderMessage() string {
	if e == nil {
		return ""
	}
	if msg := strings.TrimSpace(e.CauseDescription); msg != "" {
		return msg
	}
	return strings.TrimSpace(e.Message)
}

func NewMercadoPagoClient(logger *zap.Logger) *MercadoPagoClient {
	return &MercadoPagoClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		logger:     logger,
		baseURL:    "https://api.mercadopago.com",
	}
}

type ProviderID string

func (id ProviderID) String() string {
	return string(id)
}

func (id *ProviderID) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*id = ProviderID(text)
		return nil
	}
	var number json.Number
	if err := json.Unmarshal(data, &number); err != nil {
		return err
	}
	*id = ProviderID(number.String())
	return nil
}

// ==========================================
// PIX (QR Code & CopiaCola)
// ==========================================

type PixPaymentRequest struct {
	TransactionAmount float64 `json:"transaction_amount"`
	Description       string  `json:"description"`
	PaymentMethodID   string  `json:"payment_method_id"` // "pix"
	ExternalReference string  `json:"external_reference,omitempty"`
	Payer             struct {
		Email          string `json:"email"`
		FirstName      string `json:"first_name"`
		LastName       string `json:"last_name"`
		Identification struct {
			Type   string `json:"type"`
			Number string `json:"number"`
		} `json:"identification"`
	} `json:"payer"`
}

type PixPaymentResponse struct {
	ID                 ProviderID `json:"id"`
	Status             string     `json:"status"` // "pending", "approved", etc
	StatusDetail       string     `json:"status_detail"`
	ExternalReference  string     `json:"external_reference"`
	PointOfInteraction struct {
		TransactionData struct {
			QRCode       string `json:"qr_code"`
			QRCodeBase64 string `json:"qr_code_base64"`
		} `json:"transaction_data"`
	} `json:"point_of_interaction"`
}

func (client *MercadoPagoClient) CreatePixPayment(ctx context.Context, accessToken string, idempotencyKey string, req PixPaymentRequest) (*PixPaymentResponse, error) {
	url := client.baseURL + "/v1/payments"

	req.PaymentMethodID = "pix"

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))

	httpReq.Header.Set("Authorization", "Bearer "+accessToken)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Idempotency-Key", idempotencyKey)

	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp api error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		client.logger.Error("MercadoPago PIX creation failed",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(errorBody)),
		)
		apiErr := parseAPIError(resp.StatusCode, errorBody)
		if shouldUseOrdersAPI(apiErr) {
			return client.createPixOrder(ctx, accessToken, idempotencyKey, req)
		}
		return nil, apiErr
	}

	var pixResp PixPaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&pixResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp pix response: %w", err)
	}

	return &pixResp, nil
}

// CreatePixSandboxPayment uses the Orders API test scenario documented by
// Mercado Pago. In that scenario payer.first_name=APRO creates a PIX order in
// action_required and the provider promotes it automatically to approved.
// This method must only be selected by an explicitly TEST-configured gateway.
func (client *MercadoPagoClient) CreatePixSandboxPayment(ctx context.Context, accessToken string, idempotencyKey string, req PixPaymentRequest) (*PixPaymentResponse, error) {
	req.Payer.FirstName = "APRO"
	req.Payer.Email = "test_user_br@testuser.com"
	req.Payer.Identification.Type = ""
	req.Payer.Identification.Number = ""
	return client.createPixOrder(ctx, accessToken, idempotencyKey, req)
}

type PaymentStatusResponse struct {
	ID                 ProviderID `json:"id"`
	Status             string     `json:"status"`
	StatusDetail       string     `json:"status_detail"`
	ExternalReference  string     `json:"external_reference"`
	PointOfInteraction struct {
		TransactionData struct {
			QRCode       string `json:"qr_code"`
			QRCodeBase64 string `json:"qr_code_base64"`
		} `json:"transaction_data"`
	} `json:"point_of_interaction"`
}

func (client *MercadoPagoClient) GetPayment(ctx context.Context, accessToken string, paymentID string) (*PaymentStatusResponse, error) {
	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(paymentID)), "ORD") {
		return client.getOrder(ctx, accessToken, paymentID)
	}
	url := fmt.Sprintf("%s/v1/payments/%s", client.baseURL, paymentID)

	httpReq, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp api error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		client.logger.Error("MercadoPago payment lookup failed",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(errorBody)),
			zap.String("payment_id", paymentID),
		)
		apiErr := parseAPIError(resp.StatusCode, errorBody)
		return nil, apiErr
	}

	var paymentResp PaymentStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&paymentResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp payment response: %w", err)
	}

	return &paymentResp, nil
}

// ==========================================
// Cartão de Crédito / Débito (Tokenizado)
// ==========================================

type CardPaymentRequest struct {
	TransactionAmount float64 `json:"transaction_amount"`
	Token             string  `json:"token"` // PCI Compliant Token generated by MP Frontend SDK
	Description       string  `json:"description"`
	Installments      int     `json:"installments"`
	PaymentMethodID   string  `json:"payment_method_id"` // "visa", "master", "debvisa"...
	IssuerID          string  `json:"issuer_id,omitempty"`
	ExternalReference string  `json:"external_reference,omitempty"`
	Payer             struct {
		Email          string `json:"email"`
		Identification struct {
			Type   string `json:"type"`
			Number string `json:"number"`
		} `json:"identification"`
	} `json:"payer"`
}

type CardPaymentResponse struct {
	ID                ProviderID `json:"id"`
	Status            string     `json:"status"` // "approved", "rejected", "in_process"
	StatusDetail      string     `json:"status_detail"`
	ExternalReference string     `json:"external_reference"`
}

func (client *MercadoPagoClient) CreateCardPayment(ctx context.Context, accessToken string, idempotencyKey string, req CardPaymentRequest) (*CardPaymentResponse, error) {
	url := client.baseURL + "/v1/payments"

	bodyBytes, _ := json.Marshal(req)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))

	httpReq.Header.Set("Authorization", "Bearer "+accessToken)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Idempotency-Key", idempotencyKey)

	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp api error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		client.logger.Error("MercadoPago Card payment failed",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(errorBody)),
		)
		apiErr := parseAPIError(resp.StatusCode, errorBody)
		if shouldUseOrdersAPI(apiErr) {
			return client.createCardOrder(ctx, accessToken, idempotencyKey, req)
		}
		return nil, apiErr
	}

	var cardResp CardPaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&cardResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp card response: %w", err)
	}

	return &cardResp, nil
}

type orderPaymentMethod struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Token        string `json:"token,omitempty"`
	Installments int    `json:"installments,omitempty"`
	IssuerID     string `json:"issuer_id,omitempty"`
	QRCode       string `json:"qr_code"`
	QRCodeBase64 string `json:"qr_code_base64"`
}

type orderPayment struct {
	ID            ProviderID         `json:"id"`
	Amount        string             `json:"amount"`
	Status        string             `json:"status"`
	StatusDetail  string             `json:"status_detail"`
	PaymentMethod orderPaymentMethod `json:"payment_method"`
}

type orderResponse struct {
	ID                ProviderID `json:"id"`
	Status            string     `json:"status"`
	StatusDetail      string     `json:"status_detail"`
	ExternalReference string     `json:"external_reference"`
	Transactions      struct {
		Payments []orderPayment `json:"payments"`
	} `json:"transactions"`
}

func shouldUseOrdersAPI(err error) bool {
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.Status != http.StatusUnauthorized {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(apiErr.ProviderMessage()))
	return apiErr.CauseCode == 7 || strings.Contains(message, "unauthorized use of live credentials")
}

func (client *MercadoPagoClient) createCardOrder(
	ctx context.Context,
	accessToken string,
	idempotencyKey string,
	req CardPaymentRequest,
) (*CardPaymentResponse, error) {
	amount := formatOrderAmount(req.TransactionAmount)
	paymentType := "credit_card"
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(req.PaymentMethodID)), "deb") {
		paymentType = "debit_card"
	}
	payload := map[string]any{
		"type":               "online",
		"external_reference": req.ExternalReference,
		"total_amount":       amount,
		"capture_mode":       "automatic",
		"processing_mode":    "automatic",
		"description":        req.Description,
		"transactions": map[string]any{"payments": []any{map[string]any{
			"amount": amount,
			"payment_method": map[string]any{
				"id":           req.PaymentMethodID,
				"type":         paymentType,
				"token":        req.Token,
				"installments": req.Installments,
			},
		}}},
		"payer": map[string]any{
			"email":       req.Payer.Email,
			"entity_type": "individual",
			"identification": map[string]any{
				"type": req.Payer.Identification.Type, "number": req.Payer.Identification.Number,
			},
		},
	}
	if strings.TrimSpace(req.IssuerID) != "" {
		payments := payload["transactions"].(map[string]any)["payments"].([]any)
		method := payments[0].(map[string]any)["payment_method"].(map[string]any)
		method["issuer_id"] = req.IssuerID
	}

	order, err := client.postOrder(ctx, accessToken, idempotencyKey, payload)
	if err != nil {
		return nil, err
	}
	status, detail := normalizeOrderStatus(order)
	return &CardPaymentResponse{
		ID: order.ID, Status: status, StatusDetail: detail, ExternalReference: order.ExternalReference,
	}, nil
}

func (client *MercadoPagoClient) createPixOrder(
	ctx context.Context,
	accessToken string,
	idempotencyKey string,
	req PixPaymentRequest,
) (*PixPaymentResponse, error) {
	amount := formatOrderAmount(req.TransactionAmount)
	payer := map[string]any{
		"email":      req.Payer.Email,
		"first_name": req.Payer.FirstName,
	}
	if strings.TrimSpace(req.Payer.Identification.Type) != "" && strings.TrimSpace(req.Payer.Identification.Number) != "" {
		payer["identification"] = map[string]any{
			"type": req.Payer.Identification.Type, "number": req.Payer.Identification.Number,
		}
	}
	payload := map[string]any{
		"type":               "online",
		"external_reference": req.ExternalReference,
		"total_amount":       amount,
		"processing_mode":    "automatic",
		"description":        req.Description,
		"transactions": map[string]any{"payments": []any{map[string]any{
			"amount":         amount,
			"payment_method": map[string]any{"id": "pix", "type": "bank_transfer"},
		}}},
		"payer": payer,
	}
	order, err := client.postOrder(ctx, accessToken, idempotencyKey, payload)
	if err != nil {
		return nil, err
	}
	status, detail := normalizeOrderStatus(order)
	response := &PixPaymentResponse{
		ID: order.ID, Status: status, StatusDetail: detail, ExternalReference: order.ExternalReference,
	}
	if len(order.Transactions.Payments) > 0 {
		method := order.Transactions.Payments[0].PaymentMethod
		response.PointOfInteraction.TransactionData.QRCode = method.QRCode
		response.PointOfInteraction.TransactionData.QRCodeBase64 = method.QRCodeBase64
	}
	return response, nil
}

func (client *MercadoPagoClient) postOrder(
	ctx context.Context,
	accessToken string,
	idempotencyKey string,
	payload map[string]any,
) (*orderResponse, error) {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode mp order request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL+"/v1/orders", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create mp order request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Idempotency-Key", idempotencyKey)

	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp orders api error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		client.logger.Error("MercadoPago Order creation failed",
			zap.Int("status", resp.StatusCode), zap.String("response", string(errorBody)))
		return nil, parseAPIError(resp.StatusCode, errorBody)
	}
	var order orderResponse
	if err := json.NewDecoder(resp.Body).Decode(&order); err != nil {
		return nil, fmt.Errorf("failed to decode mp order response: %w", err)
	}
	return &order, nil
}

func (client *MercadoPagoClient) getOrder(ctx context.Context, accessToken string, orderID string) (*PaymentStatusResponse, error) {
	endpoint := fmt.Sprintf("%s/v1/orders/%s", client.baseURL, url.PathEscape(strings.TrimSpace(orderID)))
	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp orders api error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		return nil, parseAPIError(resp.StatusCode, errorBody)
	}
	var order orderResponse
	if err := json.NewDecoder(resp.Body).Decode(&order); err != nil {
		return nil, fmt.Errorf("failed to decode mp order response: %w", err)
	}
	return paymentStatusFromOrder(&order), nil
}

func paymentStatusFromOrder(order *orderResponse) *PaymentStatusResponse {
	if order == nil {
		return nil
	}
	status, detail := normalizeOrderStatus(order)
	response := &PaymentStatusResponse{
		ID: order.ID, Status: status, StatusDetail: detail, ExternalReference: order.ExternalReference,
	}
	if len(order.Transactions.Payments) > 0 {
		method := order.Transactions.Payments[0].PaymentMethod
		response.PointOfInteraction.TransactionData.QRCode = method.QRCode
		response.PointOfInteraction.TransactionData.QRCodeBase64 = method.QRCodeBase64
	}
	return response
}

func normalizeOrderStatus(order *orderResponse) (string, string) {
	status, detail := strings.ToLower(strings.TrimSpace(order.Status)), strings.TrimSpace(order.StatusDetail)
	if len(order.Transactions.Payments) > 0 {
		payment := order.Transactions.Payments[0]
		if strings.TrimSpace(payment.Status) != "" {
			status = strings.ToLower(strings.TrimSpace(payment.Status))
		}
		if strings.TrimSpace(payment.StatusDetail) != "" {
			detail = strings.TrimSpace(payment.StatusDetail)
		}
	}
	switch status {
	case "processed", "approved":
		return "approved", detail
	case "action_required", "pending":
		return "pending", detail
	case "processing", "in_process":
		return "in_process", detail
	case "failed", "rejected":
		return "rejected", detail
	case "cancelled", "canceled", "expired":
		return status, detail
	default:
		return status, detail
	}
}

func formatOrderAmount(amount float64) string {
	return strconv.FormatFloat(amount, 'f', 2, 64)
}

type PaymentSearchResponse struct {
	Results []PaymentStatusResponse `json:"results"`
}

func (client *MercadoPagoClient) SearchPaymentsByExternalReference(
	ctx context.Context,
	accessToken string,
	externalReference string,
) (*PaymentStatusResponse, error) {
	if externalReference == "" {
		return nil, nil
	}

	query := url.Values{}
	query.Set("external_reference", externalReference)
	query.Set("sort", "date_created")
	query.Set("criteria", "desc")
	query.Set("limit", "1")

	endpoint := fmt.Sprintf("%s/v1/payments/search?%s", client.baseURL, query.Encode())
	httpReq, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp api error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		client.logger.Error("MercadoPago payment search failed",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(errorBody)),
			zap.String("external_reference", externalReference),
		)
		apiErr := parseAPIError(resp.StatusCode, errorBody)
		if shouldUseOrdersAPI(apiErr) {
			return client.searchOrdersByExternalReference(ctx, accessToken, externalReference)
		}
		return nil, apiErr
	}

	var searchResp PaymentSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp payment search response: %w", err)
	}
	if len(searchResp.Results) == 0 {
		return nil, nil
	}

	return &searchResp.Results[0], nil
}

func (client *MercadoPagoClient) searchOrdersByExternalReference(
	ctx context.Context,
	accessToken string,
	externalReference string,
) (*PaymentStatusResponse, error) {
	query := url.Values{}
	query.Set("begin_date", time.Now().AddDate(0, 0, -7).UTC().Format(time.RFC3339Nano))
	query.Set("end_date", time.Now().Add(5*time.Minute).UTC().Format(time.RFC3339Nano))
	query.Set("external_reference", externalReference)
	query.Set("type", "online")
	query.Set("page", "1")
	query.Set("page_size", "1")
	query.Set("sort_by", "created_date")
	query.Set("sort_order", "desc")

	endpoint := fmt.Sprintf("%s/v1/orders?%s", client.baseURL, query.Encode())
	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := client.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mp orders api error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		errorBody, _ := io.ReadAll(resp.Body)
		return nil, parseAPIError(resp.StatusCode, errorBody)
	}
	var result struct {
		Data []orderResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode mp order search response: %w", err)
	}
	if len(result.Data) == 0 {
		return nil, nil
	}
	return paymentStatusFromOrder(&result.Data[0]), nil
}

func parseAPIError(status int, body []byte) error {
	responseBody := strings.TrimSpace(string(body))
	if responseBody == "" {
		return &APIError{Status: status}
	}

	var payload struct {
		Message string `json:"message"`
		Error   string `json:"error"`
		Cause   []struct {
			Code        int    `json:"code"`
			Description string `json:"description"`
		} `json:"cause"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		return &APIError{
			Status:       status,
			ResponseBody: responseBody,
		}
	}

	apiErr := &APIError{
		Status:       status,
		Message:      strings.TrimSpace(payload.Message),
		ErrorCode:    strings.TrimSpace(payload.Error),
		ResponseBody: responseBody,
	}

	if len(payload.Cause) > 0 {
		apiErr.CauseCode = payload.Cause[0].Code
		apiErr.CauseDescription = strings.TrimSpace(payload.Cause[0].Description)
	}

	return apiErr
}
