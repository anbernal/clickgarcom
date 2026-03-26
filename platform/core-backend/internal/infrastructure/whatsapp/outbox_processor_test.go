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
