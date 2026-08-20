package whatsapp

import (
	"testing"

	tenantdomain "github.com/anbernal/clickgarcom/internal/domain/tenant"
	domain "github.com/anbernal/clickgarcom/internal/domain/whatsapp"
	"github.com/stretchr/testify/require"
)

func TestComposeInteractiveMainMenuBodyRemovesTextualMenu(t *testing.T) {
	processor := &OutboxProcessor{}
	tenantObj := &tenantdomain.Tenant{
		Name: "Anderson's Restaurant",
	}

	payload := `Seu pedido já está pronto! 😊🍽️

Nossa equipe já vai levar até você aí na mesa. 🚶‍♂️✨

` + domain.MainMenuMessage()

	body := processor.composeInteractiveMainMenuBody(payload, tenantObj)

	require.Contains(t, body, "Seu pedido já está pronto! 😊🍽️")
	require.Contains(t, body, "Nossa equipe já vai levar até você aí na mesa. 🚶‍♂️✨")
	require.Contains(t, body, "📱 *Menu Principal*")
	require.NotContains(t, body, "*1* - 🛒 Fazer pedido")
	require.NotContains(t, body, "_Digite o número da opção_")
	require.Contains(t, body, "🍽️ Anderson's Restaurant")
}

func TestComposeInteractiveMainMenuBodyFallsBackToPayloadWhenNoMenuMatch(t *testing.T) {
	processor := &OutboxProcessor{}
	payload := "Mensagem livre sem menu embutido."

	body := processor.composeInteractiveMainMenuBody(payload, nil)

	require.Equal(t, payload, body)
}

func TestSanitizeMessagePreviewRedactsDeliveryPIN(t *testing.T) {
	preview := sanitizeMessagePreview("Código de recebimento: 042391. Acompanhe em tempo real.")
	require.NotContains(t, preview, "042391")
	require.Contains(t, preview, "[REDACTED]")
}

func TestParseDeliveryConfirmationURLButton(t *testing.T) {
	payload, err := parseOutboxURLButtonPayload(`{"type":"url_button","body":"Pedido em rota","button_text":"Finalizar entrega","url":"https://clickgarcom.example/tracking.html#token=abc"}`)
	require.NoError(t, err)
	require.Equal(t, "Pedido em rota", payload.Body)
	require.Equal(t, "Finalizar entrega", payload.ButtonText)
}

func TestSanitizeMessagePreviewRedactsHexDeliveryCode(t *testing.T) {
	preview := sanitizeMessagePreview("Código para confirmar o recebimento: *A3F9*")
	require.NotContains(t, preview, "A3F9")
	require.Contains(t, preview, "[REDACTED]")
}
