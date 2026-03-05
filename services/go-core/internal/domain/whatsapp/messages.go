package whatsapp

import (
	"fmt"
	"strings"

	"github.com/anbernal/clickgarcom/internal/domain/tenant"
)

// Fase 14: Interactive Buttons
type InteractiveButton struct {
	Type  string `json:"type"`
	Reply struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"reply"`
}

// ─────────────────────────────────────────────────
// Helper: resolve template personalizado ou padrão
// ─────────────────────────────────────────────────

// resolveTemplate retorna o template customizado se não estiver vazio,
// caso contrário retorna o template padrão do sistema.
func resolveTemplate(custom, defaultTpl string, replacements map[string]string) string {
	tpl := defaultTpl
	if custom != "" {
		tpl = custom
	}
	for placeholder, value := range replacements {
		tpl = strings.ReplaceAll(tpl, placeholder, value)
	}
	return tpl
}

// ─────────────────────────────────────────────────
// Mensagens padrão do sistema (fallback)
// ─────────────────────────────────────────────────

const defaultWelcome = `🍽️ Oi! Seja muito bem-vindo ao *{nome_restaurante}*! 😊`

const defaultRestaurantClosed = `🚪 *O restaurante ainda não está aberto.*

Agradecemos o seu contato, mas nossas atividades estão encerradas no momento.
Aguarde, em breve abriremos!`

const defaultWelcomeTable = `🍽️ Olá! Bem-vindo ao *{nome_restaurante}*!

Vimos que você está na *Mesa {numero_mesa}*.
Para começarmos a te atender, para quantas pessoas é a mesa?

_Digite apenas o número de pessoas (ex: 2)_`

const defaultTablePending = `🙋‍♂️ *Prontinho! Já solicitei sua mesa para nossa equipe.*

Nossa equipe já está organizando tudo para liberar seu acesso ao cardápio.
Te aviso por aqui assim que estiver pronto. 🤝`

const defaultAlreadyInQueue = `🙋‍♂️ *Recebi sua mensagem!*

Você já está na fila de atendimento.
Daqui a pouquinho nossa equipe vai te chamar por aqui. 🤝`

const defaultTextOnlySupport = `No momento só entendo mensagem de texto, como posso te ajudar?`

const defaultTableApproved = `✅ *Mesa liberada!*

Você está na *Mesa {numero_mesa}*.

Você já pode acessar nosso menu principal:

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*4* - 🙋 Chamar garçom

_Digite o número da opção_`

const defaultMainMenu = `📱 *Menu Principal*

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção_`

const defaultInvalidOption = `❌ Opção inválida.

Por favor, digite um número válido do menu.`

const defaultOrderConfirmed = `✅ *Pedido confirmado!*

Número do pedido: *#{numero_pedido}*

Seu pedido está sendo preparado.
Você receberá uma notificação quando estiver pronto! 🍳`

const defaultOrderReady = `🔔 *Pedido #{numero_pedido} está pronto!*

Nosso garçom já está levando até você! 🚶`

const defaultTabSummary = `📋 *Sua Comanda*

{itens}
━━━━━━━━━━━━━━━━
Subtotal: R$ {subtotal}
Taxa de serviço (10%): R$ {taxa}
━━━━━━━━━━━━━━━━
*Total: R$ {total}*

_Use o menu para fazer mais pedidos ou fechar a conta_`

const defaultServiceRequest = `✅ *Solicitação registrada!*

Tipo: {tipo_servico}

Nosso garçom já foi avisado e virá te atender em breve! 🙋`

const defaultPaymentPending = "💰 *Fechar Conta*\n\nTotal a pagar: *R$ {total}*\n\n🔑 *Pix Copia e Cola:*\n`{codigo_pix}`\n\n_Copie o código acima e pague pelo seu app do banco_\n\nVocê receberá confirmação assim que o pagamento for identificado! ✅"

const defaultPaymentConfirmed = `✅ *Pagamento confirmado!*

Valor: R$ {total}

Obrigado pela preferência! 
Esperamos vê-lo novamente em breve! 😊

_Como foi sua experiência?_
Avalie de 0 a 10:`

// ─────────────────────────────────────────────────
// Funções públicas (com suporte a template custom)
// ─────────────────────────────────────────────────

// WelcomeMessage mensagem de boas-vindas
func WelcomeMessage(restaurantName string, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].Welcome
	}
	return resolveTemplate(custom, defaultWelcome, map[string]string{
		"{nome_restaurante}": restaurantName,
	})
}

// RestaurantClosedMessage mensagem exibida quando restaurante está fechado
func RestaurantClosedMessage(msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].RestaurantClosed
	}
	return resolveTemplate(custom, defaultRestaurantClosed, nil)
}

// WelcomeTableMessage boas vindas quando escaneia QR Code
func WelcomeTableMessage(restaurantName, tableNumber string, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].WelcomeTable
	}
	return resolveTemplate(custom, defaultWelcomeTable, map[string]string{
		"{nome_restaurante}": restaurantName,
		"{numero_mesa}":      tableNumber,
	})
}

// TableRequestPendingMessage mensagem quando aguarda aprovação
func TableRequestPendingMessage(msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].TablePending
	}
	return resolveTemplate(custom, defaultTablePending, nil)
}

// AlreadyInQueueMessage mensagem para quando o cliente já está aguardando na fila.
func AlreadyInQueueMessage() string {
	return defaultAlreadyInQueue
}

// TextOnlySupportMessage mensagem para conteúdos não suportados (imagem, áudio, etc).
func TextOnlySupportMessage() string {
	return defaultTextOnlySupport
}

// WelcomeAndTablePendingMessage combina boas-vindas + aviso de mesa pendente em uma única mensagem.
func WelcomeAndTablePendingMessage(restaurantName string, msgs ...tenant.MessageTemplates) string {
	welcome := strings.TrimSpace(WelcomeMessage(restaurantName, msgs...))
	pending := strings.TrimSpace(TableRequestPendingMessage(msgs...))

	switch {
	case welcome == "":
		return pending
	case pending == "":
		return welcome
	default:
		return welcome + "\n\n" + pending
	}
}

// TableRequestApprovedMessage mensagem quando mesa é liberada
func TableRequestApprovedMessage(tableNumber string, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].TableApproved
	}

	msg := resolveTemplate(custom, defaultTableApproved, map[string]string{
		"{numero_mesa}": tableNumber,
	})

	if tableNumber != "" && !strings.Contains(msg, tableNumber) {
		injection := fmt.Sprintf("\nVocê está na *Mesa %s*.\n", tableNumber)
		parts := strings.SplitN(msg, "\n\n", 2)
		if len(parts) == 2 {
			return parts[0] + "\n" + injection + "\n" + parts[1]
		}
		return msg + injection
	}

	return msg
}

// MainMenuMessage menu principal
func MainMenuMessage(msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].MainMenu
	}
	return resolveTemplate(custom, defaultMainMenu, nil)
}

// InvalidOptionMessage opção inválida
func InvalidOptionMessage(msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].InvalidOption
	}
	return resolveTemplate(custom, defaultInvalidOption, nil)
}

// OrderConfirmedMessage pedido confirmado
func OrderConfirmedMessage(orderNumber int, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].OrderConfirmed
	}
	return resolveTemplate(custom, defaultOrderConfirmed, map[string]string{
		"{numero_pedido}": fmt.Sprintf("%d", orderNumber),
	})
}

// OrderReadyMessage pedido pronto
func OrderReadyMessage(orderNumber int, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].OrderReady
	}
	return resolveTemplate(custom, defaultOrderReady, map[string]string{
		"{numero_pedido}": fmt.Sprintf("%d", orderNumber),
	})
}

// TabSummaryMessage resumo da comanda
func TabSummaryMessage(items []string, subtotal, serviceFee, total float64, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].TabSummary
	}

	itemsList := ""
	for _, item := range items {
		itemsList += fmt.Sprintf("• %s\n", item)
	}

	return resolveTemplate(custom, defaultTabSummary, map[string]string{
		"{itens}":    itemsList,
		"{subtotal}": fmt.Sprintf("%.2f", subtotal),
		"{taxa}":     fmt.Sprintf("%.2f", serviceFee),
		"{total}":    fmt.Sprintf("%.2f", total),
	})
}

// ServiceRequestConfirmed solicitação de garçom
func ServiceRequestConfirmed(requestType string, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].ServiceRequest
	}
	return resolveTemplate(custom, defaultServiceRequest, map[string]string{
		"{tipo_servico}": requestType,
	})
}

// PaymentPending pagamento pendente
func PaymentPending(total float64, pixCode string, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].PaymentPending
	}
	return resolveTemplate(custom, defaultPaymentPending, map[string]string{
		"{total}":      fmt.Sprintf("%.2f", total),
		"{codigo_pix}": pixCode,
	})
}

// PaymentConfirmed pagamento confirmado
func PaymentConfirmed(total float64, msgs ...tenant.MessageTemplates) string {
	custom := ""
	if len(msgs) > 0 {
		custom = msgs[0].PaymentConfirmed
	}
	return resolveTemplate(custom, defaultPaymentConfirmed, map[string]string{
		"{total}": fmt.Sprintf("%.2f", total),
	})
}

// WithRestaurantHeader adiciona o nome do restaurante como título visual da mensagem.
func WithRestaurantHeader(restaurantName, message string) string {
	body := strings.TrimSpace(message)
	if body == "" {
		return ""
	}

	name := strings.TrimSpace(restaurantName)
	if name == "" {
		return body
	}

	return fmt.Sprintf("🍽️ %s\n_______________________\n\n%s", name, body)
}

// ─────────────────────────────────────────────────
// Defaults: retorna mapa com todos os templates padrão
// (usado pela API para exibir os padrões ao admin)
// ─────────────────────────────────────────────────

func DefaultMessageTemplates() tenant.MessageTemplates {
	return tenant.MessageTemplates{
		Welcome:          defaultWelcome,
		RestaurantClosed: defaultRestaurantClosed,
		WelcomeTable:     defaultWelcomeTable,
		TablePending:     defaultTablePending,
		TableApproved:    defaultTableApproved,
		MainMenu:         defaultMainMenu,
		InvalidOption:    defaultInvalidOption,
		OrderConfirmed:   defaultOrderConfirmed,
		OrderReady:       defaultOrderReady,
		TabSummary:       defaultTabSummary,
		ServiceRequest:   defaultServiceRequest,
		PaymentPending:   defaultPaymentPending,
		PaymentConfirmed: defaultPaymentConfirmed,
	}
}
