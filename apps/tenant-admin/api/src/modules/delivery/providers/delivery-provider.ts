export type ProviderTenantContext = {
    tenantId: string;
    providerConfigId?: string;
    externalMerchantId?: string | null;
};

export type DeliveryProviderQuoteRequest = ProviderTenantContext & {
    quoteKey: string;
    address: { formattedAddress: string; latitude: number; longitude: number };
    orderTotal: number;
};

export type DeliveryProviderQuote = {
    provider: string;
    externalQuoteId: string;
    quotedCost: number;
    estimatedMinutes: number;
    expiresAt: Date;
    currency: 'BRL';
};

export type DeliveryProviderCreateRequest = ProviderTenantContext & {
    externalQuoteId: string;
    idempotencyKey: string;
    orderReference: string;
    address: DeliveryProviderQuoteRequest['address'];
};

export type DeliveryProviderDelivery = {
    provider: string;
    externalDeliveryId: string;
    trackingUrl: string | null;
    confirmationCode: string | null;
    status: 'REQUESTING' | 'COURIER_ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
    actualCost: number | null;
};

export type DeliveryProviderError = {
    code: string;
    retryable: boolean;
    message: string;
};

export interface DeliveryProvider {
    code(): string;
    quote(request: DeliveryProviderQuoteRequest): Promise<DeliveryProviderQuote>;
    createDelivery(request: DeliveryProviderCreateRequest): Promise<DeliveryProviderDelivery>;
    getDelivery(context: ProviderTenantContext & { externalDeliveryId: string }): Promise<DeliveryProviderDelivery>;
    cancelDelivery(context: ProviderTenantContext & { externalDeliveryId: string; reason?: string }): Promise<void>;
}

export const DELIVERY_PROVIDER = Symbol('DELIVERY_PROVIDER');
