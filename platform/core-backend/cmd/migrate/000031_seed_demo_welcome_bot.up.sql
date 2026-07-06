INSERT INTO bot_flow_definitions (
    id,
    tenant_id,
    flow_key,
    channel,
    status,
    version,
    definition,
    change_reason,
    created_by,
    updated_by,
    published_at,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'welcome_menu',
    'whatsapp',
    'PUBLISHED',
    1,
    $${
        "type": "menu",
        "key": "welcome_menu",
        "channel": "whatsapp",
        "title": "Boas-vindas",
        "presentation": "reply_buttons",
        "use_welcome_template": false,
        "body": "🍽️ Olá! Seja bem-vindo ao *{nome_restaurante}*.\n\nEscolha uma opção para começar:",
        "placeholders": ["{nome_restaurante}"],
        "actions": [
            {
                "id": "request_table",
                "label": "Solicitar mesa",
                "accepted_inputs": ["1", "request_table", "sim", "quero mesa", "solicitar mesa", "mesa"]
            },
            {
                "id": "order_now",
                "label": "Fazer pedido",
                "accepted_inputs": ["2", "order_now", "fazer pedido", "pedido", "cardapio", "cardápio"]
            },
            {
                "id": "call_waiter",
                "label": "Chamar garçom",
                "accepted_inputs": ["3", "call_waiter", "chamar garçom", "chamar garcom", "ajuda", "atendente"]
            }
        ],
        "fallback": {
            "invalid_message_key": "msg_invalid_option"
        }
    }$$::jsonb,
    'Seed initial welcome bot flow',
    NULL,
    NULL,
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM bot_flow_definitions
    WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid
      AND flow_key = 'welcome_menu'
      AND channel = 'whatsapp'
      AND status = 'PUBLISHED'
);
