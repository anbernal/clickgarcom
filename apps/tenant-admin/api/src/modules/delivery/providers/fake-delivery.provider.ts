import { Injectable } from '@nestjs/common';
import { DeliveryProvider, DeliveryProviderCreateRequest, DeliveryProviderDelivery, DeliveryProviderQuote, DeliveryProviderQuoteRequest } from './delivery-provider';

/** Deterministic provider used by tests and local development. */
@Injectable()
export class FakeDeliveryProvider implements DeliveryProvider {
    private readonly deliveries = new Map<string, DeliveryProviderDelivery>();
    private readonly failureCounters = new Map<string, number>();

    code() { return 'IFOOD'; }

    async quote(request: DeliveryProviderQuoteRequest): Promise<DeliveryProviderQuote> {
        const seed = this.hash(`${request.tenantId}:${request.quoteKey}`);
        const quotedCost = 8 + (seed % 700) / 100;
        return {
            provider: this.code(),
            externalQuoteId: `fake-quote-${seed}`,
            quotedCost: Math.round(quotedCost * 100) / 100,
            estimatedMinutes: 25 + seed % 20,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            currency: 'BRL',
        };
    }

    async createDelivery(request: DeliveryProviderCreateRequest): Promise<DeliveryProviderDelivery> {
        this.simulateFailure(request);
        const existing = this.deliveries.get(request.idempotencyKey);
        if (existing) return existing;
        const seed = this.hash(`${request.tenantId}:${request.idempotencyKey}`);
        const delivery: DeliveryProviderDelivery = {
            provider: this.code(),
            externalDeliveryId: `fake-delivery-${seed}`,
            trackingUrl: `https://tracking.invalid/${seed}`,
            confirmationCode: String(100000 + (seed % 900000)),
            status: this.mode() === 'DELIVERED' ? 'DELIVERED' : 'REQUESTING',
            actualCost: this.fakeActualCost(),
        };
        this.deliveries.set(request.idempotencyKey, delivery);
        return delivery;
    }

    async getDelivery(context: { externalDeliveryId: string }): Promise<DeliveryProviderDelivery> {
        const delivery = Array.from(this.deliveries.values()).find((item) => item.externalDeliveryId === context.externalDeliveryId);
        if (!delivery) throw new Error('provider delivery not found');
        return delivery;
    }

    async cancelDelivery(context: { externalDeliveryId: string }): Promise<void> {
        const delivery = await this.getDelivery(context);
        delivery.status = 'FAILED';
    }

    private hash(value: string) {
        let result = 0;
        for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
        return result;
    }

    private simulateFailure(request: DeliveryProviderCreateRequest) {
        const mode = this.mode();
        if (mode === 'FAIL' || mode === 'TIMEOUT') {
            throw new Error(mode === 'TIMEOUT' ? 'fake provider timeout' : 'fake provider rate limit');
        }
        if (mode !== 'FAIL_FIRST_N') return;
        const limit = Math.min(20, Math.max(1, Number(process.env.DELIVERY_FAKE_PROVIDER_FAILURES || 5)));
        const key = `${request.tenantId}:${request.orderReference}`;
        const count = (this.failureCounters.get(key) || 0) + 1;
        this.failureCounters.set(key, count);
        if (count <= limit) throw new Error('fake provider timeout');
    }

    private mode() {
        return String(process.env.DELIVERY_FAKE_PROVIDER_MODE || 'SUCCESS').trim().toUpperCase();
    }

    private fakeActualCost() {
        const configured = Number(process.env.DELIVERY_FAKE_PROVIDER_ACTUAL_COST);
        return Number.isFinite(configured) && configured >= 0 ? Math.round(configured * 100) / 100 : null;
    }
}
