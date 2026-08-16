import { DELIVERY_ERROR_HTTP_STATUS, DeliveryErrorCode } from './delivery-errors';
import {
    DeliveryAcceptanceMode,
    DeliveryAttemptStatus,
    DeliveryDriverAvailability,
    DeliveryFulfillmentMode,
    DeliveryFulfillmentStatus,
    DeliveryPricingMode,
    DeliveryProviderCode,
    DeliveryProviderErrorCode,
    DeliveryQuoteStatus,
    DeliveryStatus,
} from './delivery-enums';

type OpenApiSchema = Record<string, unknown>;
type OpenApiPath = Record<string, unknown>;

function errorResponse(description: string, code: DeliveryErrorCode): OpenApiSchema {
    return {
        description,
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorEnvelope' },
                examples: {
                    error: {
                        value: {
                            success: false,
                            error: {
                                status_code: DELIVERY_ERROR_HTTP_STATUS[code],
                                code,
                                message: description,
                            },
                        },
                    },
                },
            },
        },
    };
}

function authorizedResponses(successDescription: string, successSchema: OpenApiSchema): OpenApiSchema {
    return {
        '200': {
            description: successDescription,
            content: {
                'application/json': {
                    schema: {
                        allOf: [
                            { $ref: '#/components/schemas/ApiSuccessEnvelope' },
                            { type: 'object', properties: { data: successSchema } },
                        ],
                    },
                },
            },
        },
        '400': errorResponse('Dados inválidos.', DeliveryErrorCode.InvalidCommand),
        '401': errorResponse('Sessão inválida ou expirada.', DeliveryErrorCode.TrackingAccessInvalid),
        '403': errorResponse('Perfil sem permissão.', DeliveryErrorCode.AssignmentNotAllowed),
        '404': errorResponse('Entrega não encontrada.', DeliveryErrorCode.NotFound),
        '409': errorResponse('Conflito de versão ou idempotência.', DeliveryErrorCode.VersionConflict),
        '422': errorResponse('Comando não pode ser aplicado.', DeliveryErrorCode.InvalidStatusTransition),
        '429': errorResponse('Limite de requisições excedido.', DeliveryErrorCode.RateLimited),
    };
}

export function buildDeliveryOpenApiSchemas(): Record<string, OpenApiSchema> {
    return {
        DeliveryStatus: { type: 'string', enum: Object.values(DeliveryStatus) },
        DeliveryAcceptanceMode: { type: 'string', enum: Object.values(DeliveryAcceptanceMode) },
        DeliveryDriverAvailability: { type: 'string', enum: Object.values(DeliveryDriverAvailability) },
        DeliveryFulfillmentMode: { type: 'string', enum: Object.values(DeliveryFulfillmentMode) },
        DeliveryFulfillmentStatus: { type: 'string', enum: Object.values(DeliveryFulfillmentStatus) },
        DeliveryQuoteStatus: { type: 'string', enum: Object.values(DeliveryQuoteStatus) },
        DeliveryAttemptStatus: { type: 'string', enum: Object.values(DeliveryAttemptStatus) },
        DeliveryProviderCode: { type: 'string', enum: Object.values(DeliveryProviderCode) },
        DeliveryPricingMode: { type: 'string', enum: Object.values(DeliveryPricingMode) },
        DeliveryProviderErrorCode: { type: 'string', enum: Object.values(DeliveryProviderErrorCode) },
        DeliveryCustomer: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'tenant_id', 'phone_normalized'],
            properties: {
                id: { type: 'string', format: 'uuid' },
                tenant_id: { type: 'string', format: 'uuid' },
                phone_normalized: { type: 'string', pattern: '^[0-9]{10,15}$' },
                active: { type: 'boolean' },
            },
        },
        DeliveryCustomerAddress: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'customer_id', 'label', 'postal_code', 'street', 'address_number', 'city', 'state', 'confirmed_at'],
            properties: {
                id: { type: 'string', format: 'uuid' },
                customer_id: { type: 'string', format: 'uuid' },
                label: { type: 'string', maxLength: 80 },
                postal_code: { type: 'string', pattern: '^[0-9]{8}$' },
                street: { type: 'string', maxLength: 255 },
                address_number: { type: 'string', maxLength: 30 },
                address_complement: { type: 'string', maxLength: 255 },
                neighborhood: { type: 'string', maxLength: 255 },
                city: { type: 'string', maxLength: 255 },
                state: { type: 'string', minLength: 2, maxLength: 2 },
                address_reference: { type: 'string', maxLength: 500 },
                formatted_address: { type: 'string' },
                latitude: { type: 'number', minimum: -90, maximum: 90 },
                longitude: { type: 'number', minimum: -180, maximum: 180 },
                geocode_quality: { type: 'string' },
                is_default: { type: 'boolean' },
                last_used_at: { type: 'string', format: 'date-time', nullable: true },
                confirmed_at: { type: 'string', format: 'date-time' },
            },
        },
        DeliveryFinancialSnapshot: {
            type: 'object',
            additionalProperties: false,
            required: ['currency', 'customer_delivery_fee'],
            properties: {
                currency: { type: 'string', enum: ['BRL'] },
                customer_delivery_fee: { type: 'number', minimum: 0 },
                provider_quoted_cost: { type: 'number', minimum: 0, nullable: true },
                provider_actual_cost: { type: 'number', minimum: 0, nullable: true },
                restaurant_adjustment: { type: 'number', nullable: true },
            },
        },
        DeliveryLocationPoint: {
            type: 'object',
            additionalProperties: false,
            required: ['event_id', 'lat', 'lng', 'recorded_at'],
            properties: {
                event_id: { type: 'string', format: 'uuid' },
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 },
                accuracy_m: { type: 'number', minimum: 0 },
                speed_mps: { type: 'number', minimum: 0 },
                heading_deg: { type: 'number', minimum: 0, maximum: 360 },
                recorded_at: { type: 'string', format: 'date-time' },
            },
        },
        DeliverySummary: {
            type: 'object',
            required: ['id', 'status', 'display_code', 'version'],
            properties: {
                id: { type: 'string', format: 'uuid' },
                display_code: { type: 'string', maxLength: 20 },
                status: { $ref: '#/components/schemas/DeliveryStatus' },
                version: { type: 'integer', minimum: 0 },
                assigned_driver_id: { type: 'string', format: 'uuid', nullable: true },
                eta_seconds: { type: 'integer', minimum: 0, nullable: true },
                last_location_at: { type: 'string', format: 'date-time', nullable: true },
            },
        },
        DeliveryAssignRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['driver_id', 'expected_version'],
            properties: {
                driver_id: { type: 'string', format: 'uuid' },
                expected_version: { type: 'integer', minimum: 0 },
            },
        },
        DeliveryLocationsRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['points'],
            properties: {
                points: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/components/schemas/DeliveryLocationPoint' } },
            },
        },
        DeliveryPinRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['pin'],
            properties: { pin: { type: 'string', pattern: '^[0-9]{6}$' } },
        },
        DeliveryExceptionRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['reason_code'],
            properties: {
                reason_code: { type: 'string' },
                notes: { type: 'string', maxLength: 500 },
            },
        },
        DeliveryOverrideRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['reason_code', 'notes'],
            properties: {
                reason_code: { type: 'string' },
                notes: { type: 'string', maxLength: 1000 },
                evidence_id: { type: 'string', format: 'uuid' },
            },
        },
        DeliveryOwnOperationRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['expected_version'],
            properties: {
                expected_version: { type: 'integer', minimum: 1 },
                notes: { type: 'string', maxLength: 500 },
            },
        },
        ApiSuccessEnvelope: {
            type: 'object',
            required: ['success', 'data', 'meta'],
            properties: {
                success: { const: true },
                data: {},
                meta: { $ref: '#/components/schemas/ApiEnvelopeMeta' },
            },
        },
        ApiErrorEnvelope: {
            type: 'object',
            required: ['success', 'error', 'meta'],
            properties: {
                success: { const: false },
                error: {
                    type: 'object',
                    required: ['status_code', 'code', 'message'],
                    properties: {
                        status_code: { type: 'integer' },
                        code: { type: 'string', pattern: '^DELIVERY_[A-Z0-9_]+$' },
                        message: { type: 'string' },
                        details: {},
                    },
                },
                meta: { $ref: '#/components/schemas/ApiEnvelopeMeta' },
            },
        },
    };
}

/**
 * Route skeleton consumed by the existing OpenAPI document builder. Keeping
 * paths here makes the HTTP surface reviewable before controllers are added.
 */
export function buildDeliveryOpenApiPaths(): Record<string, OpenApiPath> {
    const bearer = [{ bearerAuth: [] }];
    const routes: Record<string, OpenApiPath> = {};
    const adminBase = '/admin/api/v1';

    routes[`${adminBase}/delivery/settings`] = {
        get: {
            tags: ['Delivery'],
            summary: 'Lê a política de delivery do tenant',
            security: bearer,
            responses: authorizedResponses('Configuração de delivery.', { type: 'object' }),
        },
        put: {
            tags: ['Delivery'],
            summary: 'Atualiza a política de delivery do tenant',
            security: bearer,
            requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
            responses: authorizedResponses('Configuração atualizada.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/delivery/providers/{provider}/test-connection`] = {
        post: {
            tags: ['Delivery Providers'],
            summary: 'Testa a configuração do operador sem expor credenciais',
            security: bearer,
            parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['IFOOD'] } }],
            responses: authorizedResponses('Resultado do teste de conexão.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/delivery/capacity/reservations`] = {
        get: {
            tags: ['Delivery Capacity'],
            summary: 'Lista reservas de capacidade própria do tenant',
            security: bearer,
            parameters: [{ name: 'include_history', in: 'query', schema: { type: 'boolean', default: false } }],
            responses: authorizedResponses('Reservas de capacidade.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/deliveries`] = {
        get: {
            tags: ['Delivery'],
            summary: 'Lista entregas do tenant',
            security: bearer,
            responses: authorizedResponses('Entregas paginadas.', { type: 'array', items: { $ref: '#/components/schemas/DeliverySummary' } }),
        },
    };

    routes[`${adminBase}/deliveries/operations/summary`] = {
        get: {
            tags: ['Delivery'],
            summary: 'Resumo operacional das entregas',
            security: bearer,
            responses: authorizedResponses('Contadores e SLA.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/deliveries/quote`] = {
        get: {
            tags: ['Delivery'],
            summary: 'Calcula a taxa de entrega antes da confirmação',
            security: bearer,
            parameters: [
                { name: 'distance_meters', in: 'query', schema: { type: 'number', minimum: 0 } },
                { name: 'destination_lat', in: 'query', schema: { type: 'number', minimum: -90, maximum: 90 } },
                { name: 'destination_lng', in: 'query', schema: { type: 'number', minimum: -180, maximum: 180 } },
            ],
            responses: authorizedResponses('Cotação calculada.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/deliveries/reports/summary`] = {
        get: {
            tags: ['Delivery Reports'],
            summary: 'Resumo de SLA e operação de delivery',
            security: bearer,
            parameters: [
                { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                { name: 'driver_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
                { name: 'mode', in: 'query', schema: { type: 'string', enum: ['OWN', 'EXTERNAL'] } },
                { name: 'provider', in: 'query', schema: { type: 'string', maxLength: 40 } },
                { name: 'status', in: 'query', schema: { type: 'string', example: 'DELIVERED,DELIVERY_FAILED' } },
            ],
            responses: authorizedResponses('Relatório operacional.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/deliveries/reports/summary.csv`] = {
        get: {
            tags: ['Delivery Reports'],
            summary: 'Exporta resumo financeiro e operacional em CSV',
            security: bearer,
            parameters: [
                { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                { name: 'driver_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
                { name: 'mode', in: 'query', schema: { type: 'string', enum: ['OWN', 'EXTERNAL'] } },
                { name: 'provider', in: 'query', schema: { type: 'string', maxLength: 40 } },
                { name: 'status', in: 'query', schema: { type: 'string', example: 'DELIVERED,DELIVERY_FAILED' } },
            ],
            responses: authorizedResponses('Arquivo CSV do relatório.', { type: 'string', format: 'binary' }),
        },
    };

    for (const [action, summary] of [
        ['restart-cycle', 'Reinicia o ciclo externo atual'],
        ['convert-to-own', 'Converte a entrega para operação própria'],
    ] as Array<[string, string]>) {
        routes[`${adminBase}/delivery/fulfillments/{deliveryId}/${action}`] = {
            post: {
                tags: ['Delivery Fulfillment'],
                summary,
                security: bearer,
                parameters: [{ name: 'deliveryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } },
                        },
                    },
                },
                responses: authorizedResponses('Fallback aplicado.', { type: 'object' }),
            },
        };
    }

    routes[`${adminBase}/deliveries/{id}`] = {
        get: {
            tags: ['Delivery'],
            summary: 'Detalha uma entrega e sua timeline',
            security: bearer,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
            responses: authorizedResponses('Detalhe da entrega.', { $ref: '#/components/schemas/DeliverySummary' }),
        },
    };

    routes[`${adminBase}/deliveries/{id}/tracking-link`] = {
        post: {
            tags: ['Delivery'],
            summary: 'Emite um link autenticado de acompanhamento',
            security: bearer,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
            responses: authorizedResponses('Link de acompanhamento emitido.', {
                type: 'object',
                required: ['token', 'expires_at', 'tracking_url'],
                properties: {
                    token: { type: 'string' },
                    expires_at: { type: 'string', format: 'date-time' },
                    tracking_url: { type: 'string', format: 'uri' },
                },
            }),
        },
        delete: {
            tags: ['Delivery'],
            summary: 'Revoga o link de acompanhamento',
            security: bearer,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
            responses: authorizedResponses('Link revogado.', { type: 'object' }),
        },
    };

    routes['/admin/api/public/deliveries/track/{token}'] = {
        get: {
            tags: ['Delivery'],
            summary: 'Consulta o snapshot público da entrega',
            parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
                '200': { description: 'Snapshot público da entrega.' },
                '401': errorResponse('Link inválido.', DeliveryErrorCode.TrackingAccessInvalid),
            },
        },
    };

    routes['/admin/api/public/deliveries/track/session'] = {
        post: {
            tags: ['Delivery'],
            summary: 'Troca o token do fragmento por sessão HttpOnly',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 40, maxLength: 100 } } } } },
            },
            responses: { '200': { description: 'Sessão criada e snapshot inicial retornado.' }, '401': errorResponse('Link inválido.', DeliveryErrorCode.TrackingAccessInvalid), '429': errorResponse('Limite excedido.', DeliveryErrorCode.RateLimited) },
        },
        delete: {
            tags: ['Delivery'],
            summary: 'Encerra a sessão pública de tracking',
            responses: { '200': { description: 'Sessão encerrada.' } },
        },
    };

    routes['/admin/api/public/deliveries/track'] = {
        get: {
            tags: ['Delivery'],
            summary: 'Consulta snapshot usando sessão HttpOnly',
            responses: { '200': { description: 'Snapshot público da entrega.' }, '401': errorResponse('Sessão inválida.', DeliveryErrorCode.TrackingAccessInvalid) },
        },
    };

    const mutationRoutes: Array<[string, string]> = [
        ['accept', 'Aceita uma entrega pendente'],
        ['reject', 'Rejeita uma entrega pendente'],
        ['assign', 'Atribui a entrega a um driver'],
        ['reassign', 'Reatribui a entrega'],
        ['cancel', 'Cancela uma entrega'],
        ['start-return', 'Inicia o retorno da entrega ao restaurante'],
        ['complete-return', 'Confirma que a entrega retornou ao restaurante'],
        ['override-delivery', 'Conclui uma entrega por override'],
        ['reissue-tracking', 'Revoga e reemite acesso de tracking'],
    ];
    for (const [action, summary] of mutationRoutes) {
        routes[`${adminBase}/deliveries/{id}/${action}`] = {
            post: {
                tags: ['Delivery'],
                summary,
                security: bearer,
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                    { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 16, maxLength: 255 } },
                ],
                responses: authorizedResponses('Operação aplicada.', { $ref: '#/components/schemas/DeliverySummary' }),
            },
        };
    }

    for (const [action, summary] of [
        ['own/start', 'Inicia a saída de uma entrega própria'],
        ['own/ready', 'Marca o preparo como pronto para saída'],
        ['own/complete', 'Conclui uma entrega própria'],
    ] as Array<[string, string]>) {
        routes[`${adminBase}/deliveries/{id}/${action}`] = {
            post: {
                tags: ['Delivery'],
                summary,
                security: bearer,
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                    { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 16, maxLength: 255 } },
                ],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeliveryOwnOperationRequest' } } } },
                responses: authorizedResponses('Operação própria aplicada.', { $ref: '#/components/schemas/DeliverySummary' }),
            },
        };
    }

    routes[`${adminBase}/driver/deliveries/active`] = {
        get: {
            tags: ['Delivery Driver'],
            summary: 'Obtém a entrega ativa do driver autenticado',
            security: bearer,
            responses: authorizedResponses('Entrega ativa.', { $ref: '#/components/schemas/DeliverySummary' }),
        },
    };

    routes[`${adminBase}/driver/deliveries/{id}/locations`] = {
        post: {
            tags: ['Delivery Driver'],
            summary: 'Publica pontos de localização da entrega atribuída',
            security: bearer,
            requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeliveryLocationsRequest' } } } },
            responses: authorizedResponses('Pontos processados.', { type: 'object' }),
        },
    };

    routes[`${adminBase}/driver/deliveries/{id}/confirm-pin`] = {
        post: {
            tags: ['Delivery Driver'],
            summary: 'Confirma a entrega com o PIN do cliente',
            security: bearer,
            requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeliveryPinRequest' } } } },
            responses: authorizedResponses('Entrega concluída.', { $ref: '#/components/schemas/DeliverySummary' }),
        },
    };

    routes[`${adminBase}/driver/deliveries/{id}/exception`] = {
        post: {
            tags: ['Delivery Driver'],
            summary: 'Registra uma ocorrência da entrega',
            security: bearer,
            requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeliveryExceptionRequest' } } } },
            responses: authorizedResponses('Ocorrência registrada.', { $ref: '#/components/schemas/DeliverySummary' }),
        },
    };

    return routes;
}
