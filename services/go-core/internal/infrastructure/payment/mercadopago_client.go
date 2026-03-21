package payment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"
)

type MercadoPagoClient struct {
	httpClient *http.Client
	logger     *zap.Logger
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
	}
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
	ID                 int64  `json:"id"`
	Status             string `json:"status"` // "pending", "approved", etc
	StatusDetail       string `json:"status_detail"`
	ExternalReference  string `json:"external_reference"`
	PointOfInteraction struct {
		TransactionData struct {
			QRCode       string `json:"qr_code"`
			QRCodeBase64 string `json:"qr_code_base64"`
		} `json:"transaction_data"`
	} `json:"point_of_interaction"`
}

func (client *MercadoPagoClient) CreatePixPayment(ctx context.Context, accessToken string, idempotencyKey string, req PixPaymentRequest) (*PixPaymentResponse, error) {
	url := "https://api.mercadopago.com/v1/payments"

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
		return nil, parseAPIError(resp.StatusCode, errorBody)
	}

	var pixResp PixPaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&pixResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp pix response: %w", err)
	}

	return &pixResp, nil
}

type PaymentStatusResponse struct {
	ID                 int64  `json:"id"`
	Status             string `json:"status"`
	StatusDetail       string `json:"status_detail"`
	ExternalReference  string `json:"external_reference"`
	PointOfInteraction struct {
		TransactionData struct {
			QRCode       string `json:"qr_code"`
			QRCodeBase64 string `json:"qr_code_base64"`
		} `json:"transaction_data"`
	} `json:"point_of_interaction"`
}

func (client *MercadoPagoClient) GetPayment(ctx context.Context, accessToken string, paymentID string) (*PaymentStatusResponse, error) {
	url := fmt.Sprintf("https://api.mercadopago.com/v1/payments/%s", paymentID)

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
		return nil, parseAPIError(resp.StatusCode, errorBody)
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
	ID                int64  `json:"id"`
	Status            string `json:"status"` // "approved", "rejected", "in_process"
	StatusDetail      string `json:"status_detail"`
	ExternalReference string `json:"external_reference"`
}

func (client *MercadoPagoClient) CreateCardPayment(ctx context.Context, accessToken string, idempotencyKey string, req CardPaymentRequest) (*CardPaymentResponse, error) {
	url := "https://api.mercadopago.com/v1/payments"

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
		return nil, parseAPIError(resp.StatusCode, errorBody)
	}

	var cardResp CardPaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&cardResp); err != nil {
		return nil, fmt.Errorf("failed to decode mp card response: %w", err)
	}

	return &cardResp, nil
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

	endpoint := fmt.Sprintf("https://api.mercadopago.com/v1/payments/search?%s", query.Encode())
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
		return nil, parseAPIError(resp.StatusCode, errorBody)
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
