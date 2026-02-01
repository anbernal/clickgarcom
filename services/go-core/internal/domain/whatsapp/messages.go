package whatsapp

import "fmt"

// WelcomeMessage mensagem de boas-vindas
func WelcomeMessage(restaurantName string) string {
    return fmt.Sprintf(`🍽️ Olá! Bem-vindo ao *%s*!

Como posso te ajudar hoje?

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção desejada_`, restaurantName)
}

// MainMenuMessage menu principal
func MainMenuMessage() string {
    return `📱 *Menu Principal*

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção_`
}

// InvalidOptionMessage opção inválida
func InvalidOptionMessage() string {
    return `❌ Opção inválida.

Por favor, digite um número válido do menu.`
}

// OrderConfirmedMessage pedido confirmado
func OrderConfirmedMessage(orderNumber int) string {
    return fmt.Sprintf(`✅ *Pedido confirmado!*

Número do pedido: *#%d*

Seu pedido está sendo preparado.
Você receberá uma notificação quando estiver pronto! 🍳`, orderNumber)
}

// OrderReadyMessage pedido pronto
func OrderReadyMessage(orderNumber int) string {
    return fmt.Sprintf(`🔔 *Pedido #%d está pronto!*

Nosso garçom já está levando até você! 🚶`, orderNumber)
}

// TabSummaryMessage resumo da comanda
func TabSummaryMessage(items []string, subtotal, serviceFee, total float64) string {
    itemsList := ""
    for _, item := range items {
        itemsList += fmt.Sprintf("• %s\n", item)
    }
    
    return fmt.Sprintf(`📋 *Sua Comanda*

%s
━━━━━━━━━━━━━━━━
Subtotal: R$ %.2f
Taxa de serviço (10%%): R$ %.2f
━━━━━━━━━━━━━━━━
*Total: R$ %.2f*

_Use o menu para fazer mais pedidos ou fechar a conta_`, 
        itemsList, subtotal, serviceFee, total)
}

// ServiceRequestConfirmed solicitação de serviço
func ServiceRequestConfirmed(requestType string) string {
    return fmt.Sprintf(`✅ *Solicitação registrada!*

Tipo: %s

Nosso garçom já foi avisado e virá te atender em breve! 🙋`, requestType)
}

// PaymentPending pagamento pendente
func PaymentPending(total float64, pixCode string) string {
    return fmt.Sprintf(`💰 *Fechar Conta*

Total a pagar: *R$ %.2f*

🔑 *Pix Copia e Cola:*
`+"`"+`%s`+"`"+`

_Copie o código acima e pague pelo seu app do banco_

Você receberá confirmação assim que o pagamento for identificado! ✅`, 
        total, pixCode)
}

// PaymentConfirmed pagamento confirmado
func PaymentConfirmed(total float64) string {
    return fmt.Sprintf(`✅ *Pagamento confirmado!*

Valor: R$ %.2f

Obrigado pela preferência! 
Esperamos vê-lo novamente em breve! 😊

_Como foi sua experiência?_
Avalie de 0 a 10:`, total)
}
