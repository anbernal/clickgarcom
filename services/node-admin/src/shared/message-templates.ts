import { MessageTemplates } from '../entities/tenant.entity';

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
    msg_welcome: `🍽️ Olá! Bem-vindo ao *{nome_restaurante}*!

Como posso te ajudar hoje?

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção desejada_`,
    msg_restaurant_closed: `🚪 *O restaurante ainda não está aberto.*

Agradecemos o seu contato, mas nossas atividades estão encerradas no momento.
Aguarde, em breve abriremos!`,
    msg_welcome_table: `🍽️ Olá! Bem-vindo ao *{nome_restaurante}*!

Vimos que você está na *Mesa {numero_mesa}*.
Para começarmos a te atender, para quantas pessoas é a mesa?

_Digite apenas o número de pessoas (ex: 2)_`,
    msg_table_request_pending: `⏳ *Mesa solicitada!*

Aguarde um momento enquanto nossa equipe libera o acesso ao cardápio para sua mesa.`,
    msg_table_approved: `✅ *Mesa liberada!*

Você está na *Mesa {numero_mesa}*.

Você já pode acessar nosso menu principal:

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*4* - 🙋 Chamar garçom

_Digite o número da opção_`,
    msg_main_menu: `📱 *Menu Principal*

*1* - 🛒 Fazer pedido
*2* - 📋 Ver minha comanda
*3* - 🔄 Repetir última rodada
*4* - 🙋 Chamar garçom
*5* - 💰 Fechar conta

_Digite o número da opção_`,
    msg_invalid_option: `❌ Opção inválida.

Por favor, digite um número válido do menu.`,
    msg_order_confirmed: `✅ *Pedido confirmado!*

Número do pedido: *#{numero_pedido}*

Seu pedido está sendo preparado.
Você receberá uma notificação quando estiver pronto! 🍳`,
    msg_order_ready: `Seu pedido já está pronto! 😊🍽️

Nossa equipe já vai levar até você aí na mesa. 🚶‍♂️✨`,
    msg_tab_summary: `📋 *Sua Comanda*

{itens}
━━━━━━━━━━━━━━━━
Subtotal: R$ {subtotal}
Taxa de serviço (10%): R$ {taxa}
━━━━━━━━━━━━━━━━
*Total: R$ {total}*

_Use o menu para fazer mais pedidos ou fechar a conta_`,
    msg_service_request: `✅ *Solicitação registrada!*

Tipo: {tipo_servico}

Nosso garçom já foi avisado e virá te atender em breve! 🙋`,
    msg_payment_pending: "💰 *Fechar Conta*\n\nTotal a pagar: *R$ {total}*\n\n🔑 *Pix Copia e Cola:*\n`{codigo_pix}`\n\n_Copie o código acima e pague pelo seu app do banco_\n\nVocê receberá confirmação assim que o pagamento for identificado! ✅",
    msg_payment_confirmed: `✅ *Pagamento confirmado!*

Valor: R$ {total}

Obrigado pela preferência! 
Esperamos te receber novamente em breve! 😊`,
};

export const MESSAGE_TEMPLATE_KEYS: Array<keyof MessageTemplates> = [
    'msg_welcome',
    'msg_restaurant_closed',
    'msg_welcome_table',
    'msg_table_request_pending',
    'msg_table_approved',
    'msg_main_menu',
    'msg_invalid_option',
    'msg_order_confirmed',
    'msg_order_ready',
    'msg_tab_summary',
    'msg_service_request',
    'msg_payment_pending',
    'msg_payment_confirmed',
];

export function resolveMessageTemplate(
    custom: string | undefined | null,
    fallback: string,
    replacements: Record<string, string> = {},
) {
    let message = String(custom || '').trim() || fallback;

    for (const [placeholder, value] of Object.entries(replacements)) {
        message = message.split(placeholder).join(value);
    }

    return message.trim();
}
