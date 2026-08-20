import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { AmqpService } from '../amqp/amqp.service';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryLocationSample } from '../../entities/delivery-location-sample.entity';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DELIVERY_MAPS_PROVIDER, DeliveryMapsProvider } from './maps/maps-provider';
import { DeliveryStatus } from './contracts';

@Injectable()
export class DeliveryEtaService implements OnModuleDestroy {
    private readonly logger = new Logger(DeliveryEtaService.name);
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readonly debounceMs: number;

    constructor(
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryLocationSample) private readonly locationRepository: Repository<DeliveryLocationSample>,
        private readonly dataSource: DataSource,
        @Inject(DELIVERY_MAPS_PROVIDER) private readonly mapsProvider: DeliveryMapsProvider,
        private readonly amqpService: AmqpService,
    ) {
        const configured = Number(process.env.DELIVERY_ETA_DEBOUNCE_MS || 5000);
        this.debounceMs = Number.isFinite(configured) ? Math.min(60_000, Math.max(500, configured)) : 5000;
    }

    schedule(tenantId: string, deliveryId: string, reason = 'LOCATION_UPDATED'): void {
        const key = `${tenantId}:${deliveryId}`;
        const previous = this.timers.get(key);
        if (previous) clearTimeout(previous);
        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            void this.recalculate(tenantId, deliveryId, reason).catch((error) => {
                this.logger.warn(`delivery ETA recalculation failed for ${deliveryId}: ${(error as Error).message}`);
            });
        }, this.debounceMs));
    }

    async recalculate(tenantId: string, deliveryId: string, reason = 'MANUAL'): Promise<{ updated: boolean; eta_seconds: number | null }> {
        const delivery = await this.deliveryRepository.findOne({ where: { tenantId, id: deliveryId } });
        if (!delivery || !(delivery.assignedDriverId || delivery.assignedDriverProfileId) || ![
            DeliveryStatus.Assigned,
            DeliveryStatus.PickedUp,
            DeliveryStatus.InTransit,
            DeliveryStatus.Arrived,
        ].includes(delivery.status as DeliveryStatus)) {
            return { updated: false, eta_seconds: delivery?.etaSeconds ?? null };
        }
        if (delivery.destinationLat === null || delivery.destinationLng === null) {
            return { updated: false, eta_seconds: delivery.etaSeconds ?? null };
        }
        const latest = await this.locationRepository.findOne({
            where: { tenantId, deliveryId },
            order: { deviceRecordedAt: 'DESC' },
        });
        const origin = latest
            ? { lat: Number(latest.lat), lng: Number(latest.lng) }
            : delivery.originLat !== null && delivery.originLng !== null
                ? { lat: Number(delivery.originLat), lng: Number(delivery.originLng) }
                : null;
        if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
            return { updated: false, eta_seconds: delivery.etaSeconds ?? null };
        }

        const route = await this.mapsProvider.route({
            origin,
            destination: { lat: Number(delivery.destinationLat), lng: Number(delivery.destinationLng) },
        });
        const updated = await this.dataSource.transaction(async (manager) => {
            const current = await manager.getRepository(Delivery).createQueryBuilder('delivery')
                .setLock('pessimistic_write')
                .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                .getOne();
            if (!current || ![
                DeliveryStatus.Assigned,
                DeliveryStatus.PickedUp,
                DeliveryStatus.InTransit,
                DeliveryStatus.Arrived,
            ].includes(current.status as DeliveryStatus)) return null;
            current.etaSeconds = route.duration_seconds;
            current.etaUpdatedAt = new Date();
            current.routePolyline = route.polyline || current.routePolyline;
            const saved = await manager.getRepository(Delivery).save(current);
            const eventId = randomUUID();
            await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                id: eventId,
                eventId,
                tenantId,
                aggregateType: 'DELIVERY',
                aggregateId: deliveryId,
                eventType: 'delivery.eta_updated.v1',
                payload: {
                    version: 1,
                    event_id: eventId,
                    type: 'delivery.eta_updated.v1',
                    delivery_id: deliveryId,
                    tenant_id: tenantId,
                    aggregate_id: deliveryId,
                    correlation_id: eventId,
                    occurred_at: new Date().toISOString(),
                    eta_seconds: route.duration_seconds,
                    distance_meters: route.distance_meters,
                    provider: route.provider,
                    reason,
                },
                occurredAt: new Date(),
            }));
            return saved;
        });
        if (updated) {
            await this.amqpService.publishDeliveryRealtimeEvent({
                version: 1,
                event_id: randomUUID(),
                type: 'delivery.eta_updated.v1',
                tenant_id: tenantId,
                aggregate_id: deliveryId,
                delivery_id: deliveryId,
                occurred_at: new Date().toISOString(),
                data: {
                    eta_seconds: updated.etaSeconds,
                    eta_updated_at: updated.etaUpdatedAt,
                },
            }).catch(() => undefined);
        }
        return { updated: Boolean(updated), eta_seconds: updated?.etaSeconds ?? delivery.etaSeconds ?? null };
    }

    onModuleDestroy(): void {
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
    }
}
