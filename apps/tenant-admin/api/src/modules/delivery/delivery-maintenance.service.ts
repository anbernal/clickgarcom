import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Delivery } from '../../entities/delivery.entity';
import { DeliveryCommandIdempotency } from '../../entities/delivery-command-idempotency.entity';
import { DeliveryLocationSample } from '../../entities/delivery-location-sample.entity';
import { DeliveryTrackingCredential } from '../../entities/delivery-tracking-credential.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DeliveryCheckoutService } from './delivery-checkout.service';
import { DeliveryFulfillmentService } from './delivery-fulfillment.service';
import { DeliveryWebhookService } from './delivery-webhook.service';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { DeliveryProviderWebhookInbox } from '../../entities/delivery-provider-webhook-inbox.entity';
import { DeliveryOwnCapacityReservation } from '../../entities/delivery-own-capacity-reservation.entity';
import { DeliveryStatus, DELIVERY_TERMINAL_STATUSES } from './contracts';

export const DELIVERY_REDIS_MAINTENANCE = Symbol('DELIVERY_REDIS_MAINTENANCE');

export interface DeliveryRedisMaintenance {
    deleteTerminalDeliveryKeys(tenantId?: string): Promise<number>;
}

export type DeliveryMaintenanceOptions = {
    tenantId?: string;
    dryRun?: boolean;
    limit?: number;
};

@Injectable()
export class DeliveryMaintenanceService {
    private readonly logger = new Logger(DeliveryMaintenanceService.name);

    constructor(
        @InjectRepository(Delivery)
        private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryTrackingCredential)
        private readonly credentialRepository: Repository<DeliveryTrackingCredential>,
        @InjectRepository(DeliveryCommandIdempotency)
        private readonly idempotencyRepository: Repository<DeliveryCommandIdempotency>,
        @InjectRepository(DeliveryLocationSample)
        private readonly locationRepository: Repository<DeliveryLocationSample>,
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(DomainOutboxEvent)
        private readonly outboxRepository: Repository<DomainOutboxEvent>,
        @InjectRepository(DeliveryFulfillment)
        private readonly fulfillmentRepository: Repository<DeliveryFulfillment>,
        @InjectRepository(DeliveryProviderWebhookInbox)
        private readonly webhookInboxRepository: Repository<DeliveryProviderWebhookInbox>,
        @InjectRepository(DeliveryOwnCapacityReservation)
        private readonly capacityReservationRepository: Repository<DeliveryOwnCapacityReservation>,
        private readonly deliveryService: DeliveryService,
        private readonly capacityService: DeliveryCapacityService,
        private readonly quoteService: DeliveryQuoteService,
        private readonly checkoutService: DeliveryCheckoutService,
        private readonly fulfillmentService: DeliveryFulfillmentService,
        private readonly webhookService: DeliveryWebhookService,
        @Optional()
        @InjectRedisMaintenance()
        private readonly redisMaintenance?: DeliveryRedisMaintenance,
    ) { }

    async runOnce(options: DeliveryMaintenanceOptions = {}) {
        const now = new Date();
        const limit = Math.min(500, Math.max(1, Number(options.limit || 100)));
        const tenantId = options.tenantId?.trim() || undefined;
        const dryRun = options.dryRun === true;

        const reconciliation = await this.reconcileBatches({ tenantId, limit, dryRun });
        const tracking = await this.expireTracking({ tenantId, now, dryRun });
        const idempotency = await this.cleanupIdempotency({ tenantId, now, limit, dryRun });
        const locations = await this.cleanupLocations({ tenantId, now, limit, dryRun });
        const capacity = dryRun ? { expired: 0, dry_run: true } : await this.capacityService.expire(tenantId, now);
        const quotes = dryRun ? { expired: 0, dry_run: true } : await this.quoteService.expire(tenantId);
        const checkouts = dryRun ? { expired: 0, dry_run: true } : await this.checkoutService.expire(tenantId);
        const attempts = dryRun ? { candidates: 0, succeeded: 0, failed: 0, dry_run: true } : await this.fulfillmentService.runScheduledAttempts({ tenantId, now, limit });
        const webhooks = dryRun ? { candidates: 0, processed: 0, failed: 0, dry_run: true } : await this.webhookService.processPending({ tenantId, now, limit });
        const externalReconciliation = dryRun ? { candidates: 0, reconciled: 0, failed: 0, dry_run: true } : await this.webhookService.reconcileStale({ tenantId, now, limit });
        const domainOutbox = await this.cleanupDomainOutbox({ tenantId, now, limit, dryRun });
        const redis = await this.cleanupTerminalRedis(tenantId, dryRun);

        const result = {
            dry_run: dryRun,
            ran_at: now.toISOString(),
            tenant_id: tenantId || null,
            reconciliation,
            tracking,
            idempotency,
            locations,
            capacity,
            quotes,
            checkouts,
            attempts,
            webhooks,
            external_reconciliation: externalReconciliation,
            domain_outbox: domainOutbox,
            redis,
        };
        this.logger.log(`delivery maintenance completed dry_run=${dryRun} tenant_scope=${tenantId ? 'scoped' : 'all'} outbox_removed=${domainOutbox.removed}`);
        return result;
    }

    async metrics(tenantId?: string) {
        const scope = tenantId?.trim() || undefined;
        const deliveryQuery = this.deliveryRepository.createQueryBuilder('delivery');
        const fulfillmentQuery = this.fulfillmentRepository.createQueryBuilder('fulfillment');
        const webhookQuery = this.webhookInboxRepository.createQueryBuilder('webhook');
        const outboxQuery = this.outboxRepository.createQueryBuilder('event');
        const reservationQuery = this.capacityReservationRepository.createQueryBuilder('reservation');
        if (scope) {
            deliveryQuery.andWhere('delivery.tenant_id = :tenantId', { tenantId: scope });
            fulfillmentQuery.andWhere('fulfillment.tenant_id = :tenantId', { tenantId: scope });
            webhookQuery.andWhere('webhook.tenant_id = :tenantId', { tenantId: scope });
            outboxQuery.andWhere('event.tenant_id = :tenantId', { tenantId: scope });
            reservationQuery.andWhere('reservation.tenant_id = :tenantId', { tenantId: scope });
        }
        const [statusRows, modeRows, activeDeliveries, pendingWebhooks, failedWebhooks, pendingOutbox, staleExternal, activeReservations] = await Promise.all([
            deliveryQuery.clone().select('delivery.status', 'status').addSelect('COUNT(*)', 'count').groupBy('delivery.status').getRawMany<{ status: string; count: string }>(),
            deliveryQuery.clone().select('COALESCE(delivery.default_fulfillment_mode_snapshot, \'UNKNOWN\')', 'mode').addSelect('COUNT(*)', 'count').groupBy('mode').getRawMany<{ mode: string; count: string }>(),
            deliveryQuery.clone().andWhere('delivery.status NOT IN (:...terminal)', { terminal: DELIVERY_TERMINAL_STATUSES }).getCount(),
            webhookQuery.clone().andWhere('webhook.processed_at IS NULL').getCount(),
            webhookQuery.clone().andWhere('webhook.processed_at IS NULL AND webhook.attempts >= 5').getCount(),
            outboxQuery.clone().andWhere('event.published_at IS NULL').getCount(),
            fulfillmentQuery.clone().andWhere('fulfillment.mode = :mode AND fulfillment.is_current = TRUE', { mode: 'EXTERNAL' }).andWhere('fulfillment.status IN (:...statuses)', { statuses: ['REQUESTING', 'COURIER_ASSIGNED', 'AT_PICKUP', 'IN_TRANSIT'] }).andWhere('fulfillment.updated_at <= :cutoff', { cutoff: new Date(Date.now() - 5 * 60 * 1000) }).getCount(),
            reservationQuery.clone().andWhere('reservation.status IN (:...statuses)', { statuses: ['HELD', 'CONFIRMED'] }).getCount(),
        ]);
        return {
            generated_at: new Date().toISOString(),
            tenant_id: scope || null,
            deliveries: {
                active: activeDeliveries,
                by_status: statusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
                by_mode: modeRows.map((row) => ({ mode: row.mode, count: Number(row.count) })),
            },
            fulfillment: { stale_external: staleExternal },
            webhooks: { pending: pendingWebhooks, exhausted: failedWebhooks },
            outbox: { pending: pendingOutbox },
            own_capacity: { active_reservations: activeReservations },
        };
    }

    private async reconcileBatches(options: { tenantId?: string; limit: number; dryRun: boolean }) {
        const query = this.deliveryRepository.createQueryBuilder('delivery')
            .select(['delivery.id', 'delivery.tenant_id', 'delivery.batch_id', 'delivery.status'])
            .where('delivery.status IN (:...statuses)', {
                statuses: [DeliveryStatus.Accepted, DeliveryStatus.Preparing],
            })
            .orderBy('delivery.updated_at', 'ASC')
            .take(options.limit);
        if (options.tenantId) query.andWhere('delivery.tenant_id = :tenantId', { tenantId: options.tenantId });

        const candidates = await query.getMany();
        if (options.dryRun) {
            return { candidates: candidates.length, reconciled: 0, transitions: 0 };
        }

        let reconciled = 0;
        let transitions = 0;
        for (const delivery of candidates) {
            try {
                const result = await this.deliveryService.reconcileOrderBatch({
                    tenant_id: delivery.tenantId,
                    batch_id: delivery.batchId,
                });
                reconciled += 1;
                transitions += result.transitions?.length || 0;
            } catch (error) {
                // One corrupt/missing batch must not prevent other tenants from
                // being reconciled. The error remains visible to operators.
                this.logger.warn(`delivery reconciliation failed for ${delivery.id}: ${(error as Error).message}`);
            }
        }
        return { candidates: candidates.length, reconciled, transitions };
    }

    private async expireTracking(options: { tenantId?: string; now: Date; dryRun: boolean }) {
        const terminalBefore = new Date(options.now.getTime() - this.postDeliveryRetentionMs());
        const qb = this.credentialRepository.createQueryBuilder('credential')
            .where('credential.revoked_at IS NULL')
            .andWhere(`(
                credential.expires_at <= :now
                OR EXISTS (
                    SELECT 1 FROM deliveries terminal_delivery
                     WHERE terminal_delivery.id = credential.delivery_id
                       AND terminal_delivery.tenant_id = credential.tenant_id
                       AND terminal_delivery.status IN (:...terminalStatuses)
                       AND terminal_delivery.updated_at <= :terminalBefore
                )
            )`, {
                now: options.now,
                terminalBefore,
                terminalStatuses: DELIVERY_TERMINAL_STATUSES,
            });
        if (options.tenantId) qb.andWhere('credential.tenant_id = :tenantId', { tenantId: options.tenantId });

        const affected = await qb.getCount();
        if (!options.dryRun && affected > 0) {
            const update = this.credentialRepository.createQueryBuilder()
                .update(DeliveryTrackingCredential)
                .set({ revokedAt: options.now })
                .where('revoked_at IS NULL')
                .andWhere(`(
                    expires_at <= :now
                    OR EXISTS (
                        SELECT 1 FROM deliveries terminal_delivery
                         WHERE terminal_delivery.id = delivery_id
                           AND terminal_delivery.tenant_id = tenant_id
                           AND terminal_delivery.status IN (:...terminalStatuses)
                           AND terminal_delivery.updated_at <= :terminalBefore
                    )
                )`, {
                    now: options.now,
                    terminalBefore,
                    terminalStatuses: DELIVERY_TERMINAL_STATUSES,
                });
            if (options.tenantId) update.andWhere('tenant_id = :tenantId', { tenantId: options.tenantId });
            await update.execute();
        }
        return { expired: affected, terminal_retention_ms: this.postDeliveryRetentionMs() };
    }

    private async cleanupIdempotency(options: { tenantId?: string; now: Date; limit: number; dryRun: boolean }) {
        const qb = this.idempotencyRepository.createQueryBuilder('entry')
            .where('entry.expires_at <= :now', { now: options.now })
            .orderBy('entry.expires_at', 'ASC')
            .take(options.limit);
        if (options.tenantId) qb.andWhere('entry.tenant_id = :tenantId', { tenantId: options.tenantId });
        const expired = await qb.getMany();
        if (!options.dryRun && expired.length > 0) {
            await this.idempotencyRepository.remove(expired);
        }
        return { expired: expired.length };
    }

    private async cleanupLocations(options: { tenantId?: string; now: Date; limit: number; dryRun: boolean }) {
        const tenants = options.tenantId
            ? await this.tenantRepository.find({ where: { id: options.tenantId } })
            : await this.tenantRepository.find({ select: ['id', 'settings'] });
        let removed = 0;
        let candidates = 0;
        for (const tenant of tenants) {
            const settings = ((tenant.settings || {}) as any).delivery?.tracking || {};
            const days = this.locationRetentionDays(settings.location_retention_days);
            const cutoff = new Date(options.now.getTime() - days * 24 * 60 * 60 * 1000);
            const query = this.locationRepository.createQueryBuilder('location')
                .where('location.tenant_id = :tenantId', { tenantId: tenant.id })
                .andWhere('location.received_at < :cutoff', { cutoff })
                .orderBy('location.received_at', 'ASC')
                .take(options.limit);
            const rows = await query.getMany();
            candidates += rows.length;
            if (!options.dryRun && rows.length > 0) {
                await this.locationRepository.remove(rows);
                removed += rows.length;
            }
        }
        return { candidates, removed, retention_days_default: 30 };
    }

    private async cleanupTerminalRedis(tenantId: string | undefined, dryRun: boolean) {
        if (dryRun || !this.redisMaintenance) {
            return { removed: 0, deferred: !dryRun && !this.redisMaintenance };
        }
        try {
            return { removed: await this.redisMaintenance.deleteTerminalDeliveryKeys(tenantId), deferred: false };
        } catch (error) {
            this.logger.warn(`terminal delivery Redis cleanup failed: ${(error as Error).message}`);
            return { removed: 0, deferred: true };
        }
    }

    private async cleanupDomainOutbox(options: { tenantId?: string; now: Date; limit: number; dryRun: boolean }) {
        const retentionDays = this.domainOutboxRetentionDays();
        const cutoff = new Date(options.now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
        const query = this.outboxRepository.createQueryBuilder('event')
            .select(['event.id'])
            .where('event.published_at IS NOT NULL')
            .andWhere('event.published_at < :cutoff', { cutoff })
            .orderBy('event.published_at', 'ASC')
            .take(options.limit);
        if (options.tenantId) query.andWhere('event.tenant_id = :tenantId', { tenantId: options.tenantId });
        const rows = await query.getMany();
        if (!options.dryRun && rows.length > 0) {
            await this.outboxRepository.delete({ id: In(rows.map((row) => row.id)) });
        }
        return {
            candidates: rows.length,
            removed: options.dryRun ? 0 : rows.length,
            retention_days: retentionDays,
            preserves_unpublished: true,
        };
    }

    private locationRetentionDays(value: unknown) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 30;
        return Math.min(90, Math.max(1, Math.floor(parsed)));
    }

    private postDeliveryRetentionMs() {
        const parsed = Number(process.env.DELIVERY_TRACKING_POST_DELIVERY_HOURS || 2);
        const hours = Number.isFinite(parsed) ? Math.min(48, Math.max(0, parsed)) : 2;
        return hours * 60 * 60 * 1000;
    }

    private domainOutboxRetentionDays() {
        const configured = Number(process.env.DELIVERY_OUTBOX_RETENTION_DAYS || 30);
        if (!Number.isFinite(configured)) return 30;
        return Math.min(180, Math.max(7, Math.floor(configured)));
    }
}

/** Nest's @Inject decorator is kept behind a helper so consumers can provide
 * a Redis adapter without importing Redis into the tenant-admin API. */
function InjectRedisMaintenance(): ParameterDecorator {
    return Inject(DELIVERY_REDIS_MAINTENANCE);
}
