export interface BotFlowActionDefinition {
    id: string;
    label?: string;
    accepted_inputs?: string[];
}

export interface BotFlowDefinitionPayload {
    type: string;
    key: string;
    channel: string;
    title?: string;
    body: string;
    presentation?: string;
    use_welcome_template?: boolean;
    placeholders?: string[];
    actions?: BotFlowActionDefinition[];
    fallback?: Record<string, any>;
}

export const DEFAULT_BOT_FLOW_DEFINITIONS: Record<string, BotFlowDefinitionPayload> = {
    welcome_menu: {
        type: 'menu',
        key: 'welcome_menu',
        channel: 'whatsapp',
        title: 'Boas-vindas',
        presentation: 'reply_buttons',
        use_welcome_template: true,
        body: '',
        placeholders: [],
        actions: [
            {
                id: 'request_table',
                label: 'Solicitar mesa',
                accepted_inputs: ['1', 'request_table', 'sim', 'quero mesa', 'solicitar mesa'],
            },
        ],
        fallback: {
            invalid_message_key: 'msg_invalid_option',
        },
    },
};

export function getDefaultBotFlowDefinition(key: string): BotFlowDefinitionPayload | null {
    const definition = DEFAULT_BOT_FLOW_DEFINITIONS[String(key || '').trim()];
    if (!definition) {
        return null;
    }

    return JSON.parse(JSON.stringify(definition)) as BotFlowDefinitionPayload;
}
