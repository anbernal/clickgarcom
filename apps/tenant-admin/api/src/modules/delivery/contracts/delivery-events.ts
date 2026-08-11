import {
    DeliveryAcceptanceMode,
    DeliveryAcceptanceReasonCode,
    DeliveryAcceptanceResult,
    DeliveryActorType,
    DeliveryDriverAvailability,
    DeliveryEventType,
    DeliveryLocationSampleReason,
    DeliveryStatus,
} from './delivery-enums';

export const DELIVERY_CONTRACT_VERSION = 'v1' as const;

export type DeliveryEventEnvelope<TType extends DeliveryEventType = DeliveryEventType, TData = unknown> = {
    event_id: string;
    type: TType;
    occurred_at: string;
    tenant_id: string;
    aggregate_id: string;
    correlation_id: string;
    data: TData;
};

export type DeliveryCreatedEventData = {
    batch_id: string;
    tab_id: string;
    display_code: string;
    status: DeliveryStatus;
    acceptance_mode: DeliveryAcceptanceMode;
    acceptance_result?: DeliveryAcceptanceResult;
    acceptance_reason_code?: DeliveryAcceptanceReasonCode;
};

export type DeliveryStatusChangedEventData = {
    previous_status: DeliveryStatus;
    current_status: DeliveryStatus;
    actor_type: DeliveryActorType;
    actor_user_id?: string;
    source: string;
    idempotency_key?: string;
    reason_code?: string;
};

export type DeliveryAssignedEventData = {
    driver_id: string;
    previous_driver_id?: string;
    reason_code?: string;
};

export type DeliveryLocationUpdatedEventData = {
    lat: number;
    lng: number;
    accuracy_m?: number;
    recorded_at: string;
    eta_seconds?: number;
    stale: boolean;
    sample_reason?: DeliveryLocationSampleReason;
};

export type DeliveryDriverAvailabilityChangedEventData = {
    driver_id: string;
    previous_availability: DeliveryDriverAvailability;
    availability: DeliveryDriverAvailability;
};

/** JSON-Schema-compatible envelope used to document all delivery events. */
export const DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://clickgarcom.local/schemas/delivery-event-envelope.v1.json',
    title: 'Delivery event envelope v1',
    type: 'object',
    additionalProperties: false,
    required: ['event_id', 'type', 'occurred_at', 'tenant_id', 'aggregate_id', 'correlation_id', 'data'],
    properties: {
        event_id: { type: 'string', format: 'uuid' },
        type: { type: 'string', pattern: '^delivery\\.[a-z_]+\\.v1$' },
        occurred_at: { type: 'string', format: 'date-time' },
        tenant_id: { type: 'string', format: 'uuid' },
        aggregate_id: { type: 'string', format: 'uuid' },
        correlation_id: { type: 'string', format: 'uuid' },
        data: { type: 'object' },
    },
} as const;

export const DELIVERY_LOCATION_UPDATED_EVENT_JSON_SCHEMA = {
    ...DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA,
    $id: 'https://clickgarcom.local/schemas/delivery-location-updated.v1.json',
    title: 'Delivery location updated event v1',
    properties: {
        ...DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA.properties,
        type: { const: DeliveryEventType.LocationUpdated },
        data: {
            type: 'object',
            additionalProperties: false,
            required: ['lat', 'lng', 'recorded_at', 'stale'],
            properties: {
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 },
                accuracy_m: { type: 'number', minimum: 0 },
                recorded_at: { type: 'string', format: 'date-time' },
                eta_seconds: { type: 'integer', minimum: 0 },
                stale: { type: 'boolean' },
                sample_reason: {
                    type: 'string',
                    enum: Object.values(DeliveryLocationSampleReason),
                },
            },
        },
    },
} as const;

export const DELIVERY_STATUS_CHANGED_EVENT_JSON_SCHEMA = {
    ...DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA,
    $id: 'https://clickgarcom.local/schemas/delivery-status-changed.v1.json',
    title: 'Delivery status changed event v1',
    properties: {
        ...DELIVERY_EVENT_ENVELOPE_JSON_SCHEMA.properties,
        type: { const: DeliveryEventType.StatusChanged },
        data: {
            type: 'object',
            additionalProperties: false,
            required: ['previous_status', 'current_status', 'actor_type', 'source'],
            properties: {
                previous_status: { type: 'string', enum: Object.values(DeliveryStatus) },
                current_status: { type: 'string', enum: Object.values(DeliveryStatus) },
                actor_type: { type: 'string', enum: Object.values(DeliveryActorType) },
                actor_user_id: { type: 'string', format: 'uuid' },
                source: { type: 'string', minLength: 1 },
                idempotency_key: { type: 'string', minLength: 1, maxLength: 255 },
                reason_code: { type: 'string', minLength: 1, maxLength: 80 },
            },
        },
    },
} as const;

