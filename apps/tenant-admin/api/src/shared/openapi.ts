import {
    ADMIN_API_BASE_PATH,
    ADMIN_API_VERSION,
    ADMIN_API_VERSIONED_BASE_PATH,
    ADMIN_PUBLIC_API_VERSIONED_BASE_PATH,
} from './api-contract';
import { buildTenantRoleMetadata } from '../modules/auth/roles';

export function buildTenantAdminOpenApiDocument() {
    const roleMetadata = buildTenantRoleMetadata();

    return {
        openapi: '3.1.0',
        info: {
            title: 'ClickGarcom Tenant Admin API',
            version: ADMIN_API_VERSION,
            description: [
                'Contrato versionado da API reutilizavel pelo admin web atual e por futuros clientes mobile.',
                'As rotas versionadas vivem sob `/admin/api/v1` e as rotas publicas de checkout sob `/admin/api/public/v1`.',
                'Rotas tenant-bound derivam o tenant do JWT; `tenant_id` legado enviado pelo frontend web nao define escopo.',
            ].join('\n\n'),
        },
        servers: [
            {
                url: '/',
                description: 'Relative server root',
            },
        ],
        tags: [
            { name: 'Discovery' },
            { name: 'Auth' },
            { name: 'Menu' },
            { name: 'Categories' },
            { name: 'Orders' },
            { name: 'Reports' },
            { name: 'Tables' },
            { name: 'Wallet' },
            { name: 'Bot Config' },
            { name: 'Public Checkout' },
        ],
        paths: {
            [`${ADMIN_API_VERSIONED_BASE_PATH}/health`]: {
                get: {
                    tags: ['Discovery'],
                    summary: 'Health check da API tenant admin',
                    responses: {
                        '200': versionedSuccessResponse('Status da API.', {
                            $ref: '#/components/schemas/HealthResponse',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/meta`]: {
                get: {
                    tags: ['Discovery'],
                    summary: 'Metadados de descoberta da API',
                    responses: {
                        '200': versionedSuccessResponse('Metadados da API, RBAC e KDS.', {
                            $ref: '#/components/schemas/ApiMetadata',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/openapi.json`]: {
                get: {
                    tags: ['Discovery'],
                    summary: 'Documento OpenAPI bruto',
                    responses: {
                        '200': {
                            description: 'Documento OpenAPI 3.1.0.',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        additionalProperties: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/auth/login`]: {
                post: {
                    tags: ['Auth'],
                    summary: 'Autentica um usuario tenant admin',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/LoginRequest',
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Sessao autenticada.', {
                            $ref: '#/components/schemas/LoginResponse',
                        }),
                        '401': versionedErrorResponse('Credenciais invalidas.'),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/auth/me`]: {
                get: {
                    tags: ['Auth'],
                    summary: 'Retorna o usuario autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Usuario autenticado.', {
                            $ref: '#/components/schemas/AuthUser',
                        }),
                        '401': versionedErrorResponse('Token invalido ou expirado.'),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/auth/status`]: {
                patch: {
                    tags: ['Auth'],
                    summary: 'Abre ou fecha o expediente do tenant',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        currentStatus: { type: 'boolean' },
                                        is_open: { type: 'boolean' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Status do tenant atualizado.', {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                is_open: { type: 'boolean' },
                                message: { type: 'string' },
                            },
                        }),
                        '403': versionedErrorResponse('Perfil sem permissao.'),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/auth/messages`]: {
                get: {
                    tags: ['Auth'],
                    summary: 'Lista templates de mensagem do tenant',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Templates de mensagem.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
                put: {
                    tags: ['Auth'],
                    summary: 'Atualiza templates de mensagem do tenant',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'string',
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Templates atualizados.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/menu`]: {
                get: {
                    tags: ['Menu'],
                    summary: 'Lista itens do menu',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'category_id',
                            in: 'query',
                            schema: { type: 'string', format: 'uuid' },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Itens do menu.', {
                            type: 'array',
                            items: { $ref: '#/components/schemas/MenuItem' },
                        }),
                    },
                },
                post: {
                    tags: ['Menu'],
                    summary: 'Cria item de menu',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/MenuItemWriteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Item criado.', {
                            $ref: '#/components/schemas/MenuItem',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/menu/{id}`]: {
                get: {
                    tags: ['Menu'],
                    summary: 'Busca item de menu',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do item de menu')],
                    responses: {
                        '200': versionedSuccessResponse('Item do menu.', {
                            $ref: '#/components/schemas/MenuItem',
                        }),
                    },
                },
                put: {
                    tags: ['Menu'],
                    summary: 'Atualiza item de menu',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do item de menu')],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/MenuItemWriteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Item atualizado.', {
                            $ref: '#/components/schemas/MenuItem',
                        }),
                    },
                },
                delete: {
                    tags: ['Menu'],
                    summary: 'Remove item de menu',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do item de menu')],
                    responses: {
                        '200': versionedSuccessResponse('Item removido.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/menu/{id}/toggle`]: {
                patch: {
                    tags: ['Menu'],
                    summary: 'Alterna disponibilidade do item',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do item de menu')],
                    responses: {
                        '200': versionedSuccessResponse('Disponibilidade atualizada.', {
                            $ref: '#/components/schemas/MenuItem',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/categories`]: {
                get: {
                    tags: ['Categories'],
                    summary: 'Lista categorias',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Categorias do tenant.', {
                            type: 'array',
                            items: { $ref: '#/components/schemas/MenuCategory' },
                        }),
                    },
                },
                post: {
                    tags: ['Categories'],
                    summary: 'Cria categoria',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CategoryWriteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Categoria criada.', {
                            $ref: '#/components/schemas/MenuCategory',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/categories/{id}`]: {
                get: {
                    tags: ['Categories'],
                    summary: 'Busca categoria',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da categoria')],
                    responses: {
                        '200': versionedSuccessResponse('Categoria.', {
                            $ref: '#/components/schemas/MenuCategory',
                        }),
                    },
                },
                put: {
                    tags: ['Categories'],
                    summary: 'Atualiza categoria',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da categoria')],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CategoryWriteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Categoria atualizada.', {
                            $ref: '#/components/schemas/MenuCategory',
                        }),
                    },
                },
                delete: {
                    tags: ['Categories'],
                    summary: 'Remove categoria',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da categoria')],
                    responses: {
                        '200': versionedSuccessResponse('Categoria removida.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/orders`]: {
                get: {
                    tags: ['Orders'],
                    summary: 'Lista pedidos do tenant',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'status',
                            in: 'query',
                            schema: {
                                type: 'string',
                                description: 'Lista CSV de status, ex: PENDING,ACCEPTED,READY',
                            },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Pedidos ativos.', {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Order' },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/orders/{id}`]: {
                get: {
                    tags: ['Orders'],
                    summary: 'Busca pedido',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do pedido')],
                    responses: {
                        '200': versionedSuccessResponse('Pedido.', {
                            $ref: '#/components/schemas/Order',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/orders/{id}/status`]: {
                patch: {
                    tags: ['Orders'],
                    summary: 'Atualiza status operacional do pedido',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID do pedido')],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/OrderStatusUpdateRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Pedido atualizado.', {
                            $ref: '#/components/schemas/Order',
                        }),
                        '400': versionedErrorResponse('Transicao invalida de status.'),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/reports/stats`]: {
                get: {
                    tags: ['Reports'],
                    summary: 'Resumo do dashboard do tenant autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Metricas resumidas.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/reports/sales`]: {
                get: {
                    tags: ['Reports'],
                    summary: 'Relatorio de vendas do tenant autenticado',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'start_date',
                            in: 'query',
                            schema: { type: 'string', format: 'date' },
                        },
                        {
                            name: 'end_date',
                            in: 'query',
                            schema: { type: 'string', format: 'date' },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Relatorio de vendas.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/reports/top-items`]: {
                get: {
                    tags: ['Reports'],
                    summary: 'Itens mais vendidos do tenant autenticado',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'limit',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, maximum: 100 },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Itens mais vendidos.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/reports/weekly`]: {
                get: {
                    tags: ['Reports'],
                    summary: 'Serie semanal de vendas do tenant autenticado',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Serie semanal.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista mesas do tenant',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Mesas.', {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Table' },
                        }),
                    },
                },
                post: {
                    tags: ['Tables'],
                    summary: 'Cria mesa',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TableWriteRequest' },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Mesa criada.', {
                            $ref: '#/components/schemas/Table',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/stats`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Estatisticas de mesas/comandas',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Resumo de mesas.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/{id}/status`]: {
                patch: {
                    tags: ['Tables'],
                    summary: 'Atualiza status da mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da mesa')],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status'],
                                    properties: {
                                        status: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Mesa atualizada.', {
                            $ref: '#/components/schemas/Table',
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/{id}`]: {
                delete: {
                    tags: ['Tables'],
                    summary: 'Remove mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da mesa')],
                    responses: {
                        '200': versionedSuccessResponse('Mesa removida.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/requests/pending`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista solicitacoes pendentes de mesa',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Solicitacoes pendentes.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/requests/{id}/approve`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Aprova solicitacao de mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da solicitacao')],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        tableId: { type: 'string', format: 'uuid' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Solicitacao aprovada.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/requests/{id}/reject`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Rejeita solicitacao de mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da solicitacao')],
                    responses: {
                        '200': versionedSuccessResponse('Solicitacao rejeitada.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/requests/manual`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Cria solicitacao manual de mesa',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ManualTableRequest',
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Solicitacao criada.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/waiter/close-requests`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista pedidos de fechamento pendentes',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Pedidos de fechamento.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/waiter/close-requests/{id}/finalize`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Finaliza fechamento solicitado pelo salao/caixa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da solicitacao de fechamento')],
                    responses: {
                        '200': versionedSuccessResponse('Fechamento finalizado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/waiter/chats/open`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista chats abertos de atendimento',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Chats abertos.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/waiter/chats/{chatId}/messages`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista mensagens de um chat de atendimento',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('chatId', 'ID do chat')],
                    responses: {
                        '200': versionedSuccessResponse('Mensagens do chat.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
                post: {
                    tags: ['Tables'],
                    summary: 'Envia mensagem em chat de atendimento',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('chatId', 'ID do chat')],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['message'],
                                    properties: {
                                        message: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Mensagem enviada.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/waiter/chats/{chatId}/close`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Fecha chat de atendimento',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('chatId', 'ID do chat')],
                    responses: {
                        '200': versionedSuccessResponse('Chat encerrado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/tabs/{tabId}/finalize`]: {
                post: {
                    tags: ['Tables'],
                    summary: 'Finaliza diretamente uma comanda',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('tabId', 'ID da comanda')],
                    responses: {
                        '200': versionedSuccessResponse('Comanda finalizada.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/{id}/tab`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Busca a comanda principal da mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da mesa')],
                    responses: {
                        '200': versionedSuccessResponse('Comanda da mesa.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/tables/{id}/tabs`]: {
                get: {
                    tags: ['Tables'],
                    summary: 'Lista comandas relacionadas a mesa',
                    security: [{ bearerAuth: [] }],
                    parameters: [uuidPathParam('id', 'ID da mesa')],
                    responses: {
                        '200': versionedSuccessResponse('Comandas da mesa.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/wallet/balance`]: {
                get: {
                    tags: ['Wallet'],
                    summary: 'Consulta saldo/carteira do tenant',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Saldo da carteira.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/wallet/messages/statement`]: {
                get: {
                    tags: ['Wallet'],
                    summary: 'Lista o extrato paginado de mensagens contabilizadas',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'page',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, default: 1 },
                        },
                        {
                            name: 'limit',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Extrato de mensagens.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/payments/pix`]: {
                post: {
                    tags: ['Wallet'],
                    summary: 'Cria pagamento PIX interno do tenant',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Pagamento PIX criado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/bot-config/flows`]: {
                get: {
                    tags: ['Bot Config'],
                    summary: 'Lista flows publicados do tenant',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'channel',
                            in: 'query',
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Flows publicados.', {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/bot-config/flows/{key}`]: {
                get: {
                    tags: ['Bot Config'],
                    summary: 'Busca flow publicado do tenant',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'key',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                        {
                            name: 'channel',
                            in: 'query',
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Flow publicado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/bot-config/flows/{key}/default`]: {
                get: {
                    tags: ['Bot Config'],
                    summary: 'Busca flow default do sistema',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'key',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        '200': versionedSuccessResponse('Flow default.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_API_VERSIONED_BASE_PATH}/bot-config/flows/{key}/published`]: {
                put: {
                    tags: ['Bot Config'],
                    summary: 'Publica flow para o tenant',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'key',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                        {
                            name: 'channel',
                            in: 'query',
                            schema: { type: 'string' },
                        },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Flow publicado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_PUBLIC_API_VERSIONED_BASE_PATH}/tables/tabs/{tabId}`]: {
                get: {
                    tags: ['Public Checkout'],
                    summary: 'Consulta dados publicos de comanda via token de acesso',
                    parameters: [
                        uuidPathParam('tabId', 'ID da comanda'),
                        accessTokenQueryParam(),
                    ],
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Comanda publica.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                        '401': versionedErrorResponse('Token ausente, invalido ou expirado.'),
                    },
                },
            },
            [`${ADMIN_PUBLIC_API_VERSIONED_BASE_PATH}/tables/tabs/{tabId}/payments/pix`]: {
                post: {
                    tags: ['Public Checkout'],
                    summary: 'Cria pagamento PIX publico da comanda',
                    parameters: [
                        uuidPathParam('tabId', 'ID da comanda'),
                        accessTokenQueryParam(),
                    ],
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Pagamento PIX criado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_PUBLIC_API_VERSIONED_BASE_PATH}/tables/tabs/{tabId}/payments/card`]: {
                post: {
                    tags: ['Public Checkout'],
                    summary: 'Cria pagamento com cartao publico da comanda',
                    parameters: [
                        uuidPathParam('tabId', 'ID da comanda'),
                        accessTokenQueryParam(),
                    ],
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    responses: {
                        '200': versionedSuccessResponse('Pagamento com cartao processado.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
            [`${ADMIN_PUBLIC_API_VERSIONED_BASE_PATH}/tables/tabs/{tabId}/payments/{paymentId}/status`]: {
                get: {
                    tags: ['Public Checkout'],
                    summary: 'Consulta status do pagamento publico',
                    parameters: [
                        uuidPathParam('tabId', 'ID da comanda'),
                        uuidPathParam('paymentId', 'ID do pagamento'),
                        accessTokenQueryParam(),
                    ],
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': versionedSuccessResponse('Status do pagamento.', {
                            type: 'object',
                            additionalProperties: true,
                        }),
                    },
                },
            },
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'ok' },
                        service: { type: 'string', example: 'node-admin' },
                        runtime_mode: { type: 'string', enum: ['hybrid', 'api'] },
                        admin_web_enabled: { type: 'boolean' },
                        current_api_version: { type: 'string', example: ADMIN_API_VERSION },
                        versioned_base_path: { type: 'string', example: ADMIN_API_VERSIONED_BASE_PATH },
                    },
                    required: ['status', 'service', 'runtime_mode', 'admin_web_enabled', 'current_api_version', 'versioned_base_path'],
                },
                ApiMetadata: {
                    type: 'object',
                    properties: {
                        service: { type: 'string' },
                        runtime_mode: { type: 'string' },
                        admin_web_enabled: { type: 'boolean' },
                        api: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        public_api: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        clients: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        docs: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        authorization: {
                            type: 'object',
                            additionalProperties: true,
                            example: roleMetadata,
                        },
                        kds: {
                            type: 'object',
                            additionalProperties: true,
                        },
                    },
                    additionalProperties: false,
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string' },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    required: ['access_token', 'user'],
                    properties: {
                        access_token: { type: 'string' },
                        user: { $ref: '#/components/schemas/AuthUser' },
                    },
                },
                AuthUser: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string', enum: [...roleMetadata.supported_roles] },
                        tenant_id: { type: 'string', format: 'uuid' },
                        tenant_name: { type: 'string' },
                    },
                    required: ['id', 'email', 'role', 'tenant_id'],
                },
                MenuItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        price: { type: 'number' },
                        category_id: { type: 'string', format: 'uuid' },
                        destination: { type: 'string', enum: ['KITCHEN', 'BAR'] },
                        prep_time_minutes: { type: 'integer' },
                        image_url: { type: 'string' },
                        whatsapp_short_name: { type: 'string' },
                        whatsapp_short_description: { type: 'string' },
                        available: { type: 'boolean' },
                        display_order: { type: 'integer' },
                    },
                },
                MenuItemWriteRequest: {
                    type: 'object',
                    required: ['name', 'price', 'category_id'],
                    properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                        price: { type: 'number' },
                        category_id: { type: 'string', format: 'uuid' },
                        destination: { type: 'string', enum: ['KITCHEN', 'BAR'] },
                        prep_time_minutes: { type: 'integer' },
                        image_url: { type: 'string' },
                        whatsapp_short_name: { type: 'string' },
                        whatsapp_short_description: { type: 'string' },
                        available: { type: 'boolean' },
                        display_order: { type: 'integer' },
                    },
                },
                MenuCategory: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        image_url: { type: 'string' },
                        display_order: { type: 'integer' },
                        active: { type: 'boolean' },
                    },
                },
                CategoryWriteRequest: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                        image_url: { type: 'string' },
                        display_order: { type: 'integer' },
                        active: { type: 'boolean' },
                    },
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        tenant_id: { type: 'string', format: 'uuid' },
                        tab_id: { type: 'string', format: 'uuid' },
                        batch_id: { type: 'string', format: 'uuid', nullable: true },
                        destination: { type: 'string', enum: ['KITCHEN', 'BAR'] },
                        status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELED'] },
                        notes: { type: 'string' },
                        created_at: { type: 'string', format: 'date-time' },
                        accepted_at: { type: 'string', format: 'date-time', nullable: true },
                        ready_at: { type: 'string', format: 'date-time', nullable: true },
                        delivered_at: { type: 'string', format: 'date-time', nullable: true },
                        canceled_at: { type: 'string', format: 'date-time', nullable: true },
                        cancel_reason: { type: 'string' },
                        items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/OrderItem' },
                        },
                    },
                },
                OrderItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        order_id: { type: 'string', format: 'uuid' },
                        menu_item_id: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer' },
                        unit_price: { type: 'number' },
                        observations: { type: 'string' },
                    },
                },
                OrderStatusUpdateRequest: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                        status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELED'] },
                        prep_minutes: { type: 'integer' },
                        cancel_reason: { type: 'string' },
                    },
                },
                Table: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        number: { type: 'integer' },
                        capacity: { type: 'integer' },
                        status: { type: 'string' },
                    },
                },
                TableWriteRequest: {
                    type: 'object',
                    required: ['number', 'capacity'],
                    properties: {
                        number: { type: 'integer' },
                        capacity: { type: 'integer' },
                    },
                },
                ManualTableRequest: {
                    type: 'object',
                    properties: {
                        table_id: { type: 'string', format: 'uuid' },
                        user_phone: { type: 'string' },
                        customer_name: { type: 'string' },
                        pax_count: { type: 'integer' },
                    },
                },
                VersionedSuccessEnvelope: {
                    type: 'object',
                    required: ['success', 'data', 'meta'],
                    properties: {
                        success: { type: 'boolean', enum: [true] },
                        data: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        meta: { $ref: '#/components/schemas/EnvelopeMeta' },
                    },
                },
                VersionedErrorEnvelope: {
                    type: 'object',
                    required: ['success', 'error', 'meta'],
                    properties: {
                        success: { type: 'boolean', enum: [false] },
                        error: {
                            type: 'object',
                            required: ['status_code', 'code', 'message'],
                            properties: {
                                status_code: { type: 'integer' },
                                code: { type: 'string' },
                                message: { type: 'string' },
                                details: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                        meta: { $ref: '#/components/schemas/EnvelopeMeta' },
                    },
                },
                EnvelopeMeta: {
                    type: 'object',
                    required: ['api_version', 'path', 'timestamp'],
                    properties: {
                        api_version: { type: 'string', example: ADMIN_API_VERSION },
                        path: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    };
}

function versionedSuccessResponse(description: string, dataSchema: Record<string, unknown>) {
    return {
        description,
        content: {
            'application/json': {
                schema: {
                    allOf: [
                        { $ref: '#/components/schemas/VersionedSuccessEnvelope' },
                        {
                            type: 'object',
                            properties: {
                                data: dataSchema,
                            },
                        },
                    ],
                },
            },
        },
    };
}

function versionedErrorResponse(description: string) {
    return {
        description,
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/VersionedErrorEnvelope',
                },
            },
        },
    };
}

function uuidPathParam(name: string, description: string) {
    return {
        name,
        in: 'path',
        required: true,
        description,
        schema: {
            type: 'string',
            format: 'uuid',
        },
    };
}

function accessTokenQueryParam() {
    return {
        name: 'access_token',
        in: 'query',
        required: false,
        schema: {
            type: 'string',
        },
        description: 'Fallback para clientes sem suporte a Authorization header. Prefira Bearer token.',
    };
}
