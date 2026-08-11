import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Delivery } from '../../entities/delivery.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { DeliveryQuote } from '../../entities/delivery-quote.entity';
import { DeliveryProviderAttempt } from '../../entities/delivery-provider-attempt.entity';
import { DELIVERY_PROVIDER, DeliveryProvider } from './providers/delivery-provider';
import { normalizeDeliveryProviderError } from './providers/provider-error';
import { Inject } from '@nestjs/common';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { CreateExternalFulfillmentDto } from './dto/delivery-fulfillment.dto';
import { DeliveryNotificationMilestone, DeliveryNotificationService } from './delivery-notification.service';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DeliveryEventType } from './contracts';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';

type FulfillmentActor = { id?: string; name?: string; role?: string };

@Injectable()
export class DeliveryFulfillmentService {
    constructor(
        @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
        @InjectRepository(DeliveryFulfillment) private readonly fulfillments: Repository<DeliveryFulfillment>,
        @InjectRepository(DeliveryQuote) private readonly quotes: Repository<DeliveryQuote>,
        @InjectRepository(DeliveryProviderAttempt) private readonly attempts: Repository<DeliveryProviderAttempt>,
        private readonly dataSource: DataSource,
        @Inject(DELIVERY_PROVIDER) private readonly provider: DeliveryProvider,
        private readonly capacityService: DeliveryCapacityService,
        private readonly notificationService: DeliveryNotificationService,
    ) { }

    async createExternal(tenantId: string, dto: CreateExternalFulfillmentDto) {
        return this.dataSource.transaction(async (manager) => {
            const deliveryRepository = manager.getRepository(Delivery);
            const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
            const quoteRepository = manager.getRepository(DeliveryQuote);
            const delivery = await deliveryRepository.createQueryBuilder('delivery')
                .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId: dto.delivery_id, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!delivery) throw new NotFoundException('Delivery não encontrado.');

            const current = await fulfillmentRepository.findOne({ where: { tenantId, deliveryId: delivery.id, isCurrent: true } });
            if (current) {
                if (current.mode !== 'EXTERNAL') throw new ConflictException('Delivery já possui fulfillment próprio ativo.');
                return this.view(current, delivery);
            }

            const quote = await quoteRepository.createQueryBuilder('quote')
                .where('quote.id = :quoteId AND quote.tenant_id = :tenantId', { quoteId: dto.quote_id, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!quote) throw new NotFoundException('Quote não encontrada.');
            if (quote.status !== 'USED' || quote.deliveryId !== delivery.id) {
                throw new ConflictException('A quote precisa estar usada e vinculada ao mesmo Delivery.');
            }
            if (delivery.customerId && delivery.customerId !== quote.customerId) throw new ConflictException('A quote pertence a outro cliente.');
            if (delivery.customerAddressId && delivery.customerAddressId !== quote.customerAddressId) throw new ConflictException('A quote pertence a outro endereço.');

            const fulfillment = fulfillmentRepository.create({
                tenantId,
                deliveryId: delivery.id,
                mode: 'EXTERNAL',
                provider: quote.provider,
                status: 'WAITING_PREPARATION',
                quoteId: quote.id,
                externalDeliveryId: null,
                trackingUrl: null,
                quotedCost: quote.quotedCost,
                actualCost: null,
                currency: quote.currency,
                cycleNumber: 0,
                isCurrent: true,
                startedAt: null,
                assignedAt: null,
                pickedUpAt: null,
                deliveredAt: null,
                failedAt: null,
                canceledAt: null,
                createdBy: null,
                overrideReason: null,
            });
            const saved = await fulfillmentRepository.save(fulfillment);
            delivery.currentFulfillmentId = saved.id;
            delivery.providerQuotedCost = quote.quotedCost;
            delivery.customerDeliveryFee = quote.customerDeliveryFee;
            delivery.providerActualCost = null;
            delivery.restaurantAdjustment = '0.00';
            await deliveryRepository.save(delivery);
            return this.view(saved, delivery);
        });
    }

    async findCurrent(tenantId: string, deliveryId: string) {
        const delivery = await this.deliveries.findOne({ where: { id: deliveryId, tenantId } });
        if (!delivery) throw new NotFoundException('Delivery não encontrado.');
        const fulfillment = await this.fulfillments.findOne({ where: { tenantId, deliveryId, isCurrent: true } });
        return fulfillment ? this.view(fulfillment, delivery) : null;
    }

    async startExternalCycle(tenantId: string, deliveryId: string) {
        return this.dataSource.transaction(async (manager) => {
            const deliveryRepository = manager.getRepository(Delivery);
            const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
            const attemptRepository = manager.getRepository(DeliveryProviderAttempt);
            const delivery = await deliveryRepository.createQueryBuilder('delivery')
                .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!delivery) throw new NotFoundException('Delivery não encontrado.');
            if (delivery.status !== 'PREPARING') return null;
            const fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                .where('fulfillment.delivery_id = :deliveryId AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { deliveryId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!fulfillment || fulfillment.mode !== 'EXTERNAL') return null;
            if (fulfillment.cycleNumber >= 1) return this.view(fulfillment, delivery);
            const now = new Date();
            fulfillment.cycleNumber = 1;
            fulfillment.status = 'ALLOCATION_PENDING';
            fulfillment.startedAt = now;
            await fulfillmentRepository.save(fulfillment);
            const createdAttempts: DeliveryProviderAttempt[] = [];
            for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
                createdAttempts.push(attemptRepository.create({
                    tenantId,
                    deliveryId,
                    fulfillmentId: fulfillment.id,
                    cycleNumber: 1,
                    attemptNumber,
                    idempotencyKey: `delivery:${deliveryId}:fulfillment:${fulfillment.id}:cycle:1:attempt:${attemptNumber}`,
                    status: 'SCHEDULED',
                    providerErrorCode: null,
                    retryable: null,
                    requestReference: null,
                    responseReference: null,
                    scheduledAt: new Date(now.getTime() + (attemptNumber - 1) * 3 * 60 * 1000),
                    startedAt: null,
                    finishedAt: null,
                }));
            }
            await attemptRepository.save(createdAttempts);
            return {
                fulfillment: this.view(fulfillment, delivery),
                cycle_number: 1,
                attempts: createdAttempts.map((attempt) => ({
                    id: attempt.id,
                    attempt_number: attempt.attemptNumber,
                    idempotency_key: attempt.idempotencyKey,
                    scheduled_at: attempt.scheduledAt,
                })),
            };
        });
    }

    async runScheduledAttempts(options: { tenantId?: string; now?: Date; limit?: number } = {}) {
        const now = options.now || new Date();
        const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
        const query = this.attempts.createQueryBuilder('attempt')
            .where('attempt.status = :status AND attempt.scheduled_at <= :now', { status: 'SCHEDULED', now })
            .orderBy('attempt.scheduled_at', 'ASC')
            .take(limit);
        if (options.tenantId) query.andWhere('attempt.tenant_id = :tenantId', { tenantId: options.tenantId });
        const candidates = await query.getMany();
        let succeeded = 0;
        let failed = 0;
        for (const candidate of candidates) {
            const claimed = await this.dataSource.transaction(async (manager) => {
                const repository = manager.getRepository(DeliveryProviderAttempt);
                const attempt = await repository.createQueryBuilder('attempt')
                    .where('attempt.id = :attemptId AND attempt.status = :status', { attemptId: candidate.id, status: 'SCHEDULED' })
                    .setLock('pessimistic_write')
                    .getOne();
                if (!attempt) return null;
                const fulfillment = await manager.getRepository(DeliveryFulfillment).findOne({ where: { id: attempt.fulfillmentId, tenantId: attempt.tenantId } });
                if (!fulfillment || ['COURIER_ASSIGNED', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CYCLE_EXHAUSTED', 'FAILED', 'CANCELED'].includes(fulfillment.status)) {
                    if (attempt) {
                        attempt.status = 'SKIPPED';
                        attempt.finishedAt = now;
                        await repository.save(attempt);
                    }
                    return null;
                }
                attempt.status = 'REQUESTING';
                attempt.startedAt = now;
                fulfillment.status = 'REQUESTING';
                await manager.getRepository(DeliveryFulfillment).save(fulfillment);
                return repository.save(attempt);
            });
            if (!claimed) continue;
            const context = await this.attemptContext(claimed);
            if (!context) {
                await this.dataSource.getRepository(DeliveryProviderAttempt).update(
                    { id: claimed.id, tenantId: claimed.tenantId },
                    { status: 'FAILED', providerErrorCode: 'FULFILLMENT_CONTEXT_MISSING', retryable: false, finishedAt: new Date() },
                );
                failed += 1;
                continue;
            }
            try {
                const result = await this.provider.createDelivery({
                    tenantId: claimed.tenantId,
                    providerConfigId: undefined,
                    externalMerchantId: null,
                    externalQuoteId: context.quote.externalQuoteId || '',
                    idempotencyKey: claimed.idempotencyKey,
                    orderReference: context.delivery.id,
                    address: {
                        formattedAddress: context.delivery.formattedAddress || '',
                        latitude: Number(context.delivery.destinationLat),
                        longitude: Number(context.delivery.destinationLng),
                    },
                });
                await this.dataSource.transaction(async (manager) => {
                    const attemptRepository = manager.getRepository(DeliveryProviderAttempt);
                    const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                    const deliveryRepository = manager.getRepository(Delivery);
                    const attempt = await attemptRepository.findOne({ where: { id: claimed.id, tenantId: claimed.tenantId } });
                    if (!attempt) return;
                    attempt.status = 'SUCCEEDED';
                    attempt.retryable = false;
                    attempt.finishedAt = new Date();
                    attempt.responseReference = result.externalDeliveryId;
                    await attemptRepository.save(attempt);
                    await fulfillmentRepository.update(
                        { id: claimed.fulfillmentId, tenantId: claimed.tenantId },
                        { status: result.status === 'REQUESTING' ? 'COURIER_ASSIGNED' : result.status, externalDeliveryId: result.externalDeliveryId, trackingUrl: result.trackingUrl, assignedAt: new Date() },
                    );
                    const assignedDelivery = await deliveryRepository.findOne({ where: { id: attempt.deliveryId, tenantId: attempt.tenantId } });
                    const assignedFulfillment = await fulfillmentRepository.findOne({ where: { id: attempt.fulfillmentId, tenantId: attempt.tenantId } });
                    if (assignedDelivery && assignedFulfillment) {
                        const eventId = randomUUID();
                        await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                            id: eventId,
                            eventId,
                            tenantId: attempt.tenantId,
                            aggregateType: 'DELIVERY_FULFILLMENT',
                            aggregateId: attempt.fulfillmentId,
                            eventType: result.trackingUrl ? DeliveryEventType.TrackingAvailable : DeliveryEventType.ProviderAssigned,
                            payload: {
                                version: 1,
                                event_id: eventId,
                                type: result.trackingUrl ? DeliveryEventType.TrackingAvailable : DeliveryEventType.ProviderAssigned,
                                occurred_at: new Date().toISOString(),
                                tenant_id: attempt.tenantId,
                                aggregate_id: attempt.fulfillmentId,
                                correlation_id: attempt.idempotencyKey,
                            data: {
                                delivery_id: attempt.deliveryId,
                                fulfillment_id: attempt.fulfillmentId,
                                provider: result.provider,
                                external_delivery_id: result.externalDeliveryId,
                                recipient: assignedDelivery.customerPhone || undefined,
                                display_code: assignedDelivery.displayCode,
                                mode: assignedFulfillment.mode,
                                tracking_url: result.trackingUrl,
                                    // The operator code is intentionally excluded
                                    // from domain events and admin projections.
                                },
                            },
                            occurredAt: new Date(),
                        }));
                        await this.notificationService.enqueueExternalAssignment(
                            manager,
                            assignedDelivery,
                            result.trackingUrl,
                            result.confirmationCode,
                        );
                    }
                });
                succeeded += 1;
            } catch (error) {
                const normalized = normalizeDeliveryProviderError(error);
                await this.dataSource.transaction(async (manager) => {
                    const attemptRepository = manager.getRepository(DeliveryProviderAttempt);
                    const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                    const deliveryRepository = manager.getRepository(Delivery);
                    const attempt = await attemptRepository.findOne({ where: { id: claimed.id, tenantId: claimed.tenantId } });
                    if (!attempt) return;
                    attempt.status = 'FAILED';
                    attempt.providerErrorCode = normalized.code;
                    attempt.retryable = normalized.retryable;
                    attempt.finishedAt = new Date();
                    await attemptRepository.save(attempt);
                    const failedDelivery = await deliveryRepository.findOne({ where: { id: attempt.deliveryId, tenantId: attempt.tenantId } });
                    if (failedDelivery) {
                        const failureEventId = randomUUID();
                        await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                            id: failureEventId,
                            eventId: failureEventId,
                            tenantId: attempt.tenantId,
                            aggregateType: 'DELIVERY_FULFILLMENT',
                            aggregateId: attempt.fulfillmentId,
                            eventType: DeliveryEventType.ProviderAttemptFailed,
                            payload: {
                                version: 1,
                                event_id: failureEventId,
                                type: DeliveryEventType.ProviderAttemptFailed,
                                occurred_at: new Date().toISOString(),
                                tenant_id: attempt.tenantId,
                                aggregate_id: attempt.fulfillmentId,
                                correlation_id: attempt.idempotencyKey,
                                data: {
                                    delivery_id: attempt.deliveryId,
                                    fulfillment_id: attempt.fulfillmentId,
                                    attempt_number: attempt.attemptNumber,
                                    provider_error_code: normalized.code,
                                    recipient: failedDelivery.customerPhone || undefined,
                                    display_code: failedDelivery.displayCode,
                                    mode: 'EXTERNAL',
                                },
                            },
                            occurredAt: new Date(),
                        }));
                    }
                    if (attempt.attemptNumber >= 5 || now.getTime() >= new Date((context.fulfillment.startedAt || now).getTime() + 15 * 60 * 1000).getTime()) {
                        const currentFulfillment = await fulfillmentRepository.findOne({ where: { id: attempt.fulfillmentId, tenantId: attempt.tenantId } });
                        const shouldNotify = currentFulfillment?.status !== 'CYCLE_EXHAUSTED';
                        await fulfillmentRepository.update({ id: attempt.fulfillmentId, tenantId: attempt.tenantId }, { status: 'CYCLE_EXHAUSTED', failedAt: new Date() });
                        await deliveryRepository.update({ id: attempt.deliveryId, tenantId: attempt.tenantId }, { noCourierAt: new Date() });
                        if (shouldNotify) {
                            const exhaustedDelivery = await deliveryRepository.findOne({ where: { id: attempt.deliveryId, tenantId: attempt.tenantId } });
                            if (exhaustedDelivery) {
                                const eventId = randomUUID();
                                await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                                    id: eventId,
                                    eventId,
                                    tenantId: attempt.tenantId,
                                    aggregateType: 'DELIVERY',
                                    aggregateId: attempt.deliveryId,
                                    eventType: DeliveryEventType.ProviderCycleExhausted,
                                    payload: {
                                        version: 1,
                                        event_id: eventId,
                                        type: DeliveryEventType.ProviderCycleExhausted,
                                        occurred_at: new Date().toISOString(),
                                        tenant_id: attempt.tenantId,
                                        aggregate_id: attempt.deliveryId,
                                        correlation_id: eventId,
                                        data: {
                                            delivery_id: attempt.deliveryId,
                                            fulfillment_id: attempt.fulfillmentId,
                                            attempt_number: attempt.attemptNumber,
                                            provider_error_code: normalized.code,
                                            recipient: exhaustedDelivery.customerPhone || undefined,
                                            display_code: exhaustedDelivery.displayCode,
                                            mode: 'EXTERNAL',
                                        },
                                    },
                                    occurredAt: new Date(),
                                }));
                                await this.notificationService.enqueueMilestone(manager, exhaustedDelivery, DeliveryNotificationMilestone.CycleExhausted);
                            }
                        }
                    } else {
                        await fulfillmentRepository.update({ id: attempt.fulfillmentId, tenantId: attempt.tenantId }, { status: 'ALLOCATION_PENDING' });
                    }
                });
                failed += 1;
            }
        }
        return { candidates: candidates.length, succeeded, failed };
    }

    async restartExternalCycle(tenantId: string, deliveryId: string, reason?: string, actor: FulfillmentActor = {}) {
        return this.dataSource.transaction(async (manager) => {
            const deliveryRepository = manager.getRepository(Delivery);
            const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
            const attemptRepository = manager.getRepository(DeliveryProviderAttempt);
            const delivery = await deliveryRepository.createQueryBuilder('delivery')
                .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!delivery) throw new NotFoundException('Delivery não encontrado.');
            const fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                .where('fulfillment.delivery_id = :deliveryId AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { deliveryId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!fulfillment || fulfillment.mode !== 'EXTERNAL') throw new ConflictException('Não existe fulfillment externo atual.');
            if (!['CYCLE_EXHAUSTED', 'FAILED'].includes(fulfillment.status)) throw new ConflictException('O fulfillment ainda não pode iniciar um novo ciclo.');
            const cycleNumber = fulfillment.cycleNumber + 1;
            const now = new Date();
            fulfillment.cycleNumber = cycleNumber;
            fulfillment.status = 'ALLOCATION_PENDING';
            fulfillment.startedAt = now;
            fulfillment.failedAt = null;
            fulfillment.overrideReason = reason || null;
            await fulfillmentRepository.save(fulfillment);
            const attempts: DeliveryProviderAttempt[] = [];
            for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
                attempts.push(attemptRepository.create({
                    tenantId,
                    deliveryId,
                    fulfillmentId: fulfillment.id,
                    cycleNumber,
                    attemptNumber,
                    idempotencyKey: `delivery:${deliveryId}:fulfillment:${fulfillment.id}:cycle:${cycleNumber}:attempt:${attemptNumber}`,
                    status: 'SCHEDULED',
                    providerErrorCode: null,
                    retryable: null,
                    requestReference: null,
                    responseReference: null,
                    scheduledAt: new Date(now.getTime() + (attemptNumber - 1) * 3 * 60 * 1000),
                    startedAt: null,
                    finishedAt: null,
                }));
            }
            await attemptRepository.save(attempts);
            delivery.fulfillmentOverrideAt = now;
            delivery.fulfillmentOverrideReason = reason || 'MANUAL_RESTART_EXTERNAL_CYCLE';
            await deliveryRepository.save(delivery);
            await this.audit(manager, tenantId, actor, 'DELIVERY_EXTERNAL_CYCLE_RESTARTED', { delivery_id: deliveryId, cycle_number: cycleNumber, reason_provided: Boolean(reason) });
            return { cycle_number: cycleNumber, fulfillment: this.view(fulfillment, delivery), attempts: attempts.map((attempt) => ({ id: attempt.id, attempt_number: attempt.attemptNumber, scheduled_at: attempt.scheduledAt })) };
        });
    }

    async convertToOwn(tenantId: string, deliveryId: string, reason?: string, actor: FulfillmentActor = {}) {
        const holdKey = `fallback:${deliveryId}`;
        await this.capacityService.hold(tenantId, holdKey);
        try {
            const result = await this.dataSource.transaction(async (manager) => {
                const deliveryRepository = manager.getRepository(Delivery);
                const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                const delivery = await deliveryRepository.createQueryBuilder('delivery')
                    .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                    .setLock('pessimistic_write')
                    .getOne();
                if (!delivery) throw new NotFoundException('Delivery não encontrado.');
                const current = await fulfillmentRepository.createQueryBuilder('fulfillment')
                    .where('fulfillment.delivery_id = :deliveryId AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { deliveryId, tenantId })
                    .setLock('pessimistic_write')
                    .getOne();
                if (current?.mode === 'OWN') throw new ConflictException('Delivery já está em modalidade própria.');
                if (current) {
                    current.isCurrent = false;
                    current.status = 'CANCELED';
                    current.canceledAt = new Date();
                    await fulfillmentRepository.save(current);
                }
                const own = await fulfillmentRepository.save(fulfillmentRepository.create({
                    tenantId,
                    deliveryId,
                    mode: 'OWN',
                    provider: null,
                    status: 'WAITING_DISPATCH',
                    quoteId: null,
                    externalDeliveryId: null,
                    trackingUrl: null,
                    quotedCost: null,
                    actualCost: '0.00',
                    currency: delivery.currency || 'BRL',
                    cycleNumber: 0,
                    isCurrent: true,
                    startedAt: new Date(),
                    assignedAt: null,
                    pickedUpAt: null,
                    deliveredAt: null,
                    failedAt: null,
                    canceledAt: null,
                    createdBy: null,
                    overrideReason: reason || 'MANUAL_CONVERT_TO_OWN',
                }));
                // A provider cycle starts while the kitchen is PREPARING. If
                // it is converted to own after exhaustion, the order is
                // operationally ready for dispatch; advance the aggregate so
                // the own state machine can require READY_FOR_DISPATCH.
                if (delivery.status === 'PREPARING') {
                    delivery.status = 'READY_FOR_DISPATCH';
                    delivery.version += 1;
                    delivery.readyForDispatchAt = new Date();
                }
                delivery.currentFulfillmentId = own.id;
                delivery.fulfillmentOverrideAt = new Date();
                delivery.fulfillmentOverrideReason = reason || 'MANUAL_CONVERT_TO_OWN';
                delivery.providerActualCost = '0.00';
                await deliveryRepository.save(delivery);
                await this.audit(manager, tenantId, actor, 'DELIVERY_FALLBACK_TO_OWN', { delivery_id: deliveryId, previous_mode: current?.mode || 'UNKNOWN', fulfillment_id: own.id, reason_provided: Boolean(reason) });
                return this.view(own, delivery);
            });
            await this.capacityService.confirm(tenantId, holdKey, deliveryId);
            return result;
        } catch (error) {
            await this.capacityService.release(tenantId, holdKey, 'FALLBACK_CONVERSION_FAILED');
            throw error;
        }
    }

    private async audit(manager: any, tenantId: string, actor: FulfillmentActor, eventType: string, metadata: Record<string, unknown>) {
        await manager.getRepository(UserAccessAuditLog).save(manager.getRepository(UserAccessAuditLog).create({
            tenantId,
            actorUserId: actor.id || null,
            actorName: actor.name || null,
            actorRole: actor.role || null,
            targetUserId: null,
            targetUserName: null,
            eventType,
            description: 'Operação manual de fulfillment registrada.',
            metadata,
        }));
    }

    private async attemptContext(attempt: DeliveryProviderAttempt) {
        const [delivery, fulfillment] = await Promise.all([
            this.dataSource.getRepository(Delivery).findOne({ where: { id: attempt.deliveryId, tenantId: attempt.tenantId } }),
            this.dataSource.getRepository(DeliveryFulfillment).findOne({ where: { id: attempt.fulfillmentId, tenantId: attempt.tenantId } }),
        ]);
        if (!delivery || !fulfillment || !fulfillment.quoteId) return null;
        const quote = await this.dataSource.getRepository(DeliveryQuote).findOne({ where: { id: fulfillment.quoteId, tenantId: attempt.tenantId } });
        if (!quote) return null;
        return { delivery, fulfillment, quote };
    }

    private view(fulfillment: DeliveryFulfillment, delivery: Delivery) {
        return {
            id: fulfillment.id,
            tenant_id: fulfillment.tenantId,
            delivery_id: fulfillment.deliveryId,
            mode: fulfillment.mode,
            provider: fulfillment.provider,
            status: fulfillment.status,
            quote_id: fulfillment.quoteId,
            external_delivery_id: fulfillment.externalDeliveryId,
            tracking_url: fulfillment.trackingUrl,
            quoted_cost: fulfillment.quotedCost === null ? null : Number(fulfillment.quotedCost),
            actual_cost: fulfillment.actualCost === null ? null : Number(fulfillment.actualCost),
            customer_delivery_fee: delivery.customerDeliveryFee === null ? Number(delivery.deliveryFee || 0) : Number(delivery.customerDeliveryFee),
            restaurant_adjustment: delivery.restaurantAdjustment === null ? 0 : Number(delivery.restaurantAdjustment),
            cycle_number: fulfillment.cycleNumber,
            is_current: fulfillment.isCurrent,
            created_at: fulfillment.createdAt,
            updated_at: fulfillment.updatedAt,
        };
    }
}
