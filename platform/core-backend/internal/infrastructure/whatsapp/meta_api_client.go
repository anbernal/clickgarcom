package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/anbernal/clickgarcom/internal/domain/whatsapp"
)

type MetaAPIClient struct {
	apiToken      string
	phoneNumberID string
	httpClient    *http.Client
	logger        *zap.Logger
}

func NewMetaAPIClient(apiToken, phoneNumberID string, logger *zap.Logger) *MetaAPIClient {
	return &MetaAPIClient{
		apiToken:      apiToken,
		phoneNumberID: phoneNumberID,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

type SendTextMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	RecipientType    string `json:"recipient_type"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Text             struct {
		PreviewURL bool   `json:"preview_url"`
		Body       string `json:"body"`
	} `json:"text"`
}

type SendImageMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	RecipientType    string `json:"recipient_type"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Image            struct {
		Link    string `json:"link"`
		Caption string `json:"caption,omitempty"`
	} `json:"image"`
}

type SendMessageResponse struct {
	MessagingProduct string `json:"messaging_product"`
	Contacts         []struct {
		Input string `json:"input"`
		WaID  string `json:"wa_id"`
	} `json:"contacts"`
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages"`
}

func (c *MetaAPIClient) SendTextMessage(ctx context.Context, to, message string) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)

	reqBody := SendTextMessageRequest{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               to,
		Type:             "text",
	}
	reqBody.Text.PreviewURL = false
	reqBody.Text.Body = message

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	c.logger.Debug("sending whatsapp message",
		zap.String("to", to),
		zap.String("message", message),
	)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		c.logger.Error("whatsapp api error",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(body)),
		)
		return "", fmt.Errorf("api error: %d - %s", resp.StatusCode, string(body))
	}

	var apiResp SendMessageResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if len(apiResp.Messages) == 0 {
		return "", fmt.Errorf("no message id in response")
	}

	messageID := apiResp.Messages[0].ID

	c.logger.Info("whatsapp message sent",
		zap.String("to", to),
		zap.String("message_id", messageID),
	)

	return messageID, nil
}

func (c *MetaAPIClient) SendImage(ctx context.Context, to, imageURL, caption string) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)

	reqBody := SendImageMessageRequest{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               to,
		Type:             "image",
	}
	reqBody.Image.Link = imageURL
	reqBody.Image.Caption = caption

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal image request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create image request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send image request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read image response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		c.logger.Error("whatsapp api error image",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(body)),
		)
		return "", fmt.Errorf("api error: %d - %s", resp.StatusCode, string(body))
	}

	var apiResp SendMessageResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal image response: %w", err)
	}
	if len(apiResp.Messages) == 0 {
		return "", fmt.Errorf("no message id in image response")
	}

	return apiResp.Messages[0].ID, nil
}

// SendTemplateMessage dispara templates aprovados (necessário para iniciar conversas / burlar o bloqueio de 24h na Sandbox)
type SendTemplateMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Template         struct {
		Name     string `json:"name"`
		Language struct {
			Code string `json:"code"`
		} `json:"language"`
	} `json:"template"`
}

func (c *MetaAPIClient) SendTemplateMessage(ctx context.Context, to, templateName string) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)

	reqBody := SendTemplateMessageRequest{
		MessagingProduct: "whatsapp",
		To:               to,
		Type:             "template",
	}
	reqBody.Template.Name = templateName
	reqBody.Template.Language.Code = "en_US"

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal template request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create template request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send template request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		c.logger.Error("whatsapp api error template",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return "", fmt.Errorf("api error: %d - %s", resp.StatusCode, string(respBody))
	}

	var apiResp SendMessageResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal template response: %w", err)
	}

	if len(apiResp.Messages) == 0 {
		return "", fmt.Errorf("no message id in template response")
	}

	c.logger.Info("whatsapp template message sent",
		zap.String("to", to),
		zap.String("template", templateName),
		zap.String("message_id", apiResp.Messages[0].ID),
	)

	return apiResp.Messages[0].ID, nil
}

// Fase 11: Eventos Nativos
func (c *MetaAPIClient) MarkAsRead(ctx context.Context, messageID string) error {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)
	reqBody := map[string]string{
		"messaging_product": "whatsapp",
		"status":            "read",
		"message_id":        messageID,
	}

	jsonData, _ := json.Marshal(reqBody)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to mark read: HTTP %d", resp.StatusCode)
	}
	return nil
}

// Fase 14: Interactive Buttons (Comandas Compartilhadas)

type SendInteractiveMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	RecipientType    string `json:"recipient_type"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Interactive      struct {
		Type string `json:"type"`
		Body struct {
			Text string `json:"text"`
		} `json:"body"`
		Action struct {
			Buttons []whatsapp.InteractiveButton `json:"buttons"`
		} `json:"action"`
	} `json:"interactive"`
}

type SendInteractiveListMessageRequest struct {
	MessagingProduct string `json:"messaging_product"`
	RecipientType    string `json:"recipient_type"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Interactive      struct {
		Type string `json:"type"`
		Body struct {
			Text string `json:"text"`
		} `json:"body"`
		Action struct {
			Button   string                            `json:"button"`
			Sections []whatsapp.InteractiveListSection `json:"sections"`
		} `json:"action"`
	} `json:"interactive"`
}

func (c *MetaAPIClient) SendInteractiveButtons(ctx context.Context, to, bodyText string, buttons []whatsapp.InteractiveButton) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)

	reqBody := SendInteractiveMessageRequest{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               to,
		Type:             "interactive",
	}
	reqBody.Interactive.Type = "button"
	reqBody.Interactive.Body.Text = bodyText
	reqBody.Interactive.Action.Buttons = buttons

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal interactive request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	c.logger.Debug("sending interactive buttons", zap.String("to", to), zap.Int("buttons", len(buttons)))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send interactive request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		c.logger.Error("whatsapp api error interactive",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return "", fmt.Errorf("api error: %d - %s", resp.StatusCode, string(respBody))
	}

	var apiResp SendMessageResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal interactive response: %w", err)
	}

	if len(apiResp.Messages) == 0 {
		return "", fmt.Errorf("no message id in interactive response")
	}

	return apiResp.Messages[0].ID, nil
}

func (c *MetaAPIClient) SendInteractiveList(
	ctx context.Context,
	to, bodyText, buttonText string,
	sections []whatsapp.InteractiveListSection,
) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)

	reqBody := SendInteractiveListMessageRequest{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               to,
		Type:             "interactive",
	}
	reqBody.Interactive.Type = "list"
	reqBody.Interactive.Body.Text = bodyText
	reqBody.Interactive.Action.Button = buttonText
	reqBody.Interactive.Action.Sections = sections

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal interactive list request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	c.logger.Debug("sending interactive list", zap.String("to", to), zap.Int("sections", len(sections)))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send interactive list request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		c.logger.Error("whatsapp api error interactive list",
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return "", fmt.Errorf("api error: %d - %s", resp.StatusCode, string(respBody))
	}

	var apiResp SendMessageResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal interactive list response: %w", err)
	}

	if len(apiResp.Messages) == 0 {
		return "", fmt.Errorf("no message id in interactive list response")
	}

	return apiResp.Messages[0].ID, nil
}

// Fase 11: Eventos Nativos
func (c *MetaAPIClient) SendTypingIndicator(ctx context.Context, messageID string) error {
	if messageID == "" {
		return nil
	}

	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", c.phoneNumberID)
	reqBody := map[string]interface{}{
		"messaging_product": "whatsapp",
		"status":            "read",
		"message_id":        messageID,
		"typing_indicator": map[string]string{
			"type": "text",
		},
	}

	jsonData, _ := json.Marshal(reqBody)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to send typing indicator: HTTP %d - %s", resp.StatusCode, string(body))
	}

	return nil
}
