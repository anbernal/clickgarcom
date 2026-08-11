import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { DeliveryProviderConfig } from '../../entities/delivery-provider-config.entity';
import { DeliveryProviderWebhookInbox } from '../../entities/delivery-provider-webhook-inbox.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { Delivery } from '../../entities/delivery.entity';
import { DELIVERY_PROVIDER, DeliveryProvider } from './providers/delivery-provider';
import { DeliveryNotificationService } from './delivery-notification.service';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DeliveryEventType } from './contracts';

@Injectable()
export class DeliveryWebhookService {
    constructor(
        @InjectRepository(DeliveryProviderWebhookInbox) private readonly inbox: Repository<DeliveryProviderWebhookInbox>,
        @InjectRepository(DeliveryProviderConfig) private readonly providerConfigs: Repository<DeliveryProviderConfig>,
        @InjectRepository(DeliveryFulfillment) private readonly fulfillments: Repository<DeliveryFulfillment>,
        private readonly dataSource: DataSource,
        @Inject(DELIVERY_PROVIDER) private readonly provider: DeliveryProvider,
        private readonly notificationService: DeliveryNotificationService,
    ) { }

    async receive(provider: string, rawBody: Buffer, signature: string, eventIdHeader: string, headers: Record<string, unknown>) {
        const normalizedProvider = this.providerCode(provider);
        const secret = this.secretFor(normalizedProvider);
        if (!secret || !this.verifySignature(rawBody, signature, secret)) {
            throw new UnauthorizedException('Assinatura do webhook inválida.');
        }
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
        } catch {
            throw new ConflictException('Payload do webhook inválido.');
        }
        const eventId = String(eventIdHeader || payload.event_id || payload.id || '').trim() || null;
        const payloadHash = createHash('sha256').update(rawBody).digest('hex');
        const existing = await this.inbox.findOne({ where: { provider: normalizedProvider, externalEventId: eventId, payloadHash } });
        if (existing) return { accepted: true, duplicate: true, inbox_id: existing.id };

        const merchant = payload.merchant && typeof payload.merchant === 'object'
            ? payload.merchant as Record<string, unknown>
            : null;
        const merchantId = String(payload.merchant_id || payload.store_id || merchant?.id || '').trim();
        const config = merchantId
            ? await this.providerConfigs.findOne({ where: { provider: normalizedProvider, externalMerchantId: merchantId, enabled: true } })
            : null;
        if (!config) throw new UnauthorizedException('Webhook não associado a um tenant habilitado.');

        const row = this.inbox.create({
            tenantId: config.tenantId,
            provider: normalizedProvider,
            externalEventId: eventId,
            payloadHash,
            signatureValid: true,
            headersSnapshot: this.sanitizeHeaders(headers),
            payload: rawBody,
            processedAt: null,
            attempts: 0,
            nextRetryAt: new Date(),
            lastErrorCode: null,
        });
        try {
            const saved = await this.inbox.save(row);
            return { accepted: true, duplicate: false, inbox_id: saved.id };
        } catch (error: any) {
            if (String(error?.code) === '23505') {
                const duplicate = await this.inbox.findOne({ where: { provider: normalizedProvider, externalEventId: eventId, payloadHash } });
                if (duplicate) return { accepted: true, duplicate: true, inbox_id: duplicate.id };
            }
            throw error;
        }
    }

    async processPending(options: { tenantId?: string; limit?: number; now?: Date } = {}) {
        const now = options.now || new Date();
        const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
        const query = this.inbox.createQueryBuilder('inbox')
            .where('inbox.signature_valid = TRUE AND inbox.processed_at IS NULL')
            .andWhere('(inbox.next_retry_at IS NULL OR inbox.next_retry_at <= :now)', { now })
            .orderBy('inbox.received_at', 'ASC')
            .take(limit);
        if (options.tenantId) query.andWhere('inbox.tenant_id = :tenantId', { tenantId: options.tenantId });
        const rows = await query.getMany();
        let processed = 0;
        let failed = 0;
        for (const row of rows) {
            try {
                const payload = JSON.parse((row.payload || Buffer.from('{}')).toString('utf8')) as Record<string, unknown>;
                await this.applyPayload(row.tenantId || '', row.provider, payload);
                await this.inbox.update(row.id, { processedAt: now, attempts: row.attempts + 1, nextRetryAt: null, lastErrorCode: null });
                processed += 1;
            } catch (error) {
                const attempts = row.attempts + 1;
                const permanent = attempts >= 5;
                await this.inbox.update(row.id, {
                    attempts,
                    lastErrorCode: this.errorCode(error),
                    nextRetryAt: permanent ? null : new Date(now.getTime() + Math.min(15, 2 ** attempts) * 60 * 1000),
                    processedAt: permanent ? now : null,
                });
                failed += 1;
            }
        }
        return { candidates: rows.length, processed, failed };
    }

    async reconcileStale(options: { tenantId?: string; limit?: number; now?: Date } = {}) {
        const now = options.now || new Date();
        const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
        const query = this.fulfillments.createQueryBuilder('fulfillment')
            .where('fulfillment.mode = :mode AND fulfillment.is_current = TRUE', { mode: 'EXTERNAL' })
            .andWhere('fulfillment.external_delivery_id IS NOT NULL')
            .andWhere('fulfillment.status IN (:...statuses)', { statuses: ['REQUESTING', 'COURIER_ASSIGNED', 'AT_PICKUP', 'IN_TRANSIT'] })
            .andWhere('fulfillment.updated_at <= :cutoff', { cutoff: new Date(now.getTime() - 5 * 60 * 1000) })
            .orderBy('fulfillment.updated_at', 'ASC')
            .take(limit);
        if (options.tenantId) query.andWhere('fulfillment.tenant_id = :tenantId', { tenantId: options.tenantId });
        const rows = await query.getMany();
        let reconciled = 0;
        let failed = 0;
        for (const row of rows) {
            try {
                const result = await this.provider.getDelivery({ tenantId: row.tenantId, externalDeliveryId: row.externalDeliveryId! });
                await this.applyPayload(row.tenantId, row.provider || this.provider.code(), {
                    delivery_id: row.externalDeliveryId,
                    status: result.status,
                    tracking_url: result.trackingUrl,
                    confirmation_code: result.confirmationCode,
                    actual_cost: result.actualCost,
                });
                reconciled += 1;
            } catch {
                failed += 1;
            }
        }
        return { candidates: rows.length, reconciled, failed };
    }

    private async applyPayload(tenantId: string, provider: string, payload: Record<string, unknown>) {
        const externalDeliveryId = String(payload.external_delivery_id || payload.delivery_id || payload.order_id || '').trim();
        if (!tenantId || !externalDeliveryId) throw new ConflictException('Webhook sem tenant ou entrega externa.');
        const incomingStatus = this.mapStatus(String(payload.status || payload.delivery_status || '').toUpperCase());
        if (!incomingStatus) throw new ConflictException('Status externo não reconhecido.');
        await this.dataSource.transaction(async (manager) => {
            const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
            const deliveryRepository = manager.getRepository(Delivery);
            const fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                .where('fulfillment.tenant_id = :tenantId AND fulfillment.provider = :provider AND fulfillment.external_delivery_id = :externalDeliveryId', { tenantId, provider, externalDeliveryId })
                .andWhere('fulfillment.is_current = TRUE')
                .setLock('pessimistic_write')
                .getOne();
            if (!fulfillment) throw new ConflictException('Fulfillment externo não encontrado.');
            const currentRank = this.statusRank(fulfillment.status);
            const incomingRank = this.statusRank(incomingStatus);
            const terminal = ['DELIVERED', 'CANCELED', 'CYCLE_EXHAUSTED'].includes(fulfillment.status);
            if (!terminal && incomingRank >= currentRank) {
                const statusChanged = incomingRank > currentRank;
                const actualCost = payload.actual_cost === null || payload.actual_cost === undefined ? null : this.money(payload.actual_cost);
                fulfillment.status = incomingStatus;
                fulfillment.trackingUrl = payload.tracking_url ? String(payload.tracking_url).slice(0, 2000) : fulfillment.trackingUrl;
                if (actualCost !== null) fulfillment.actualCost = actualCost.toFixed(2);
                if (incomingStatus === 'COURIER_ASSIGNED') fulfillment.assignedAt = fulfillment.assignedAt || new Date();
                if (incomingStatus === 'AT_PICKUP') fulfillment.pickedUpAt = fulfillment.pickedUpAt || new Date();
                if (incomingStatus === 'DELIVERED') fulfillment.deliveredAt = fulfillment.deliveredAt || new Date();
                await fulfillmentRepository.save(fulfillment);
                const delivery = await deliveryRepository.findOne({ where: { id: fulfillment.deliveryId, tenantId } });
                if (delivery) {
                    if (actualCost !== null) {
                        delivery.providerActualCost = actualCost.toFixed(2);
                        delivery.restaurantAdjustment = (actualCost - Number(fulfillment.quotedCost || 0)).toFixed(2);
                    }
                    if (incomingStatus === 'IN_TRANSIT') {
                        delivery.status = 'IN_TRANSIT';
                        delivery.inTransitAt = delivery.inTransitAt || new Date();
                    }
                    if (incomingStatus === 'DELIVERED') {
                        delivery.status = 'DELIVERED';
                        delivery.deliveredAt = delivery.deliveredAt || new Date();
                    }
                    await deliveryRepository.save(delivery);
                    if (statusChanged) {
                        const eventId = randomUUID();
                        const eventType = incomingStatus === 'DELIVERED' ? DeliveryEventType.Completed : DeliveryEventType.FulfillmentChanged;
                        await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                            id: eventId,
                            eventId,
                            tenantId,
                            aggregateType: 'DELIVERY_FULFILLMENT',
                            aggregateId: fulfillment.id,
                            eventType,
                            payload: {
                                version: 1,
                                event_id: eventId,
                                type: eventType,
                                occurred_at: new Date().toISOString(),
                                tenant_id: tenantId,
                                aggregate_id: fulfillment.id,
                                correlation_id: eventId,
                                data: {
                                    delivery_id: delivery.id,
                                    fulfillment_id: fulfillment.id,
                                    status: incomingStatus,
                                    mode: fulfillment.mode,
                                    provider: fulfillment.provider,
                                    recipient: delivery.customerPhone || undefined,
                                    display_code: delivery.displayCode,
                                    tracking_url: fulfillment.trackingUrl || undefined,
                                },
                            },
                            occurredAt: new Date(),
                        }));
                    }
                    if (['COURIER_ASSIGNED', 'AT_PICKUP', 'IN_TRANSIT'].includes(incomingStatus)) {
                        await this.notificationService.enqueueExternalAssignment(
                            manager,
                            delivery,
                            fulfillment.trackingUrl,
                            payload.confirmation_code ? String(payload.confirmation_code).slice(0, 80) : null,
                        );
                    }
                }
            }
        });
    }

    private mapStatus(status: string) {
        if (['REQUESTING', 'ALLOCATING', 'SEARCHING'].includes(status)) return 'REQUESTING';
        if (['ASSIGNED', 'COURIER_ASSIGNED', 'DRIVER_ASSIGNED'].includes(status)) return 'COURIER_ASSIGNED';
        if (['PICKED_UP', 'AT_PICKUP'].includes(status)) return 'AT_PICKUP';
        if (['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(status)) return 'IN_TRANSIT';
        if (['DELIVERED', 'COMPLETED'].includes(status)) return 'DELIVERED';
        if (['FAILED', 'CANCELED', 'CANCELLED'].includes(status)) return 'FAILED';
        return null;
    }

    private statusRank(status: string) {
        return { REQUESTING: 1, ALLOCATION_PENDING: 1, COURIER_ASSIGNED: 2, AT_PICKUP: 3, IN_TRANSIT: 4, DELIVERED: 5, FAILED: 5, CANCELED: 5, CYCLE_EXHAUSTED: 5 }[status] || 0;
    }

    private money(value: unknown) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) throw new ConflictException('Custo externo inválido.');
        return Math.round(parsed * 100) / 100;
    }

    private errorCode(error: unknown) {
        return error instanceof ConflictException ? 'INVALID_PROVIDER_EVENT' : 'WEBHOOK_PROCESSING_ERROR';
    }

    private providerCode(provider: string) {
        const normalized = String(provider || '').toUpperCase();
        if (normalized !== 'IFOOD') throw new UnauthorizedException('Provider de webhook não suportado.');
        return normalized;
    }

    private secretFor(provider: string) {
        const key = `DELIVERY_WEBHOOK_SECRET_${provider}`;
        return String(process.env[key] || process.env.DELIVERY_WEBHOOK_SECRET || '').trim();
    }

    private verifySignature(rawBody: Buffer, received: string, secret: string) {
        const value = String(received || '').trim().replace(/^sha256=/i, '');
        if (!/^[0-9a-f]{64}$/i.test(value)) return false;
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value, 'hex'));
    }

    private sanitizeHeaders(headers: Record<string, unknown>) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(headers || {})) {
            const normalized = key.toLowerCase();
            if (['authorization', 'x-api-key', 'cookie', 'set-cookie'].includes(normalized)) continue;
            result[normalized] = Array.isArray(value) ? value.slice(0, 5) : String(value).slice(0, 500);
        }
        return result;
    }
}
