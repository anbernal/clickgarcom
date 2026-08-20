import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { AmqpService } from '../amqp/amqp.service';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryLocationSample } from '../../entities/delivery-location-sample.entity';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DeliveryLocationsDto } from './dto/delivery-commands.dto';
import { DeliveryStatus } from './contracts';
import { DeliveryEtaService } from './delivery-eta.service';

const LOCATION_ACCEPTED_STATUSES = [
    DeliveryStatus.Assigned,
    DeliveryStatus.PickedUp,
    DeliveryStatus.InTransit,
    DeliveryStatus.Arrived,
];

@Injectable()
export class DeliveryLocationService {
    constructor(
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryLocationSample) private readonly locationRepository: Repository<DeliveryLocationSample>,
        private readonly dataSource: DataSource,
        private readonly amqpService: AmqpService,
        private readonly etaService: DeliveryEtaService,
    ) { }

    async record(tenantId: string, deliveryId: string, driverId: string, input: DeliveryLocationsDto, profileMode = false) {
        const points = input?.points || [];
        if (points.length === 0) throw new UnprocessableEntityException('Informe ao menos um ponto de localização.');
        const accepted: Array<Record<string, unknown>> = [];
        const rejected: Array<{ event_id: string; reason: string }> = [];

        await this.dataSource.transaction(async (manager) => {
            const delivery = await manager.getRepository(Delivery).createQueryBuilder('delivery')
                .setLock('pessimistic_write')
                .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                .getOne();
            const assigned = profileMode ? delivery?.assignedDriverProfileId : delivery?.assignedDriverId;
            if (!delivery || assigned !== driverId) throw new NotFoundException('Entrega não encontrada.');
            if (!LOCATION_ACCEPTED_STATUSES.includes(delivery.status as DeliveryStatus)) {
                throw new ConflictException('A entrega não está aceitando localização.');
            }
            let latest = await manager.getRepository(DeliveryLocationSample).findOne({
                where: { tenantId, deliveryId },
                order: { deviceRecordedAt: 'DESC' },
            });
            for (const point of points) {
                const recordedAt = new Date(point.recorded_at);
                if (!Number.isFinite(recordedAt.getTime())) {
                    rejected.push({ event_id: point.event_id, reason: 'INVALID_TIMESTAMP' });
                    continue;
                }
                if (recordedAt.getTime() > Date.now() + 120_000 || recordedAt.getTime() < Date.now() - 5 * 60_000) {
                    rejected.push({ event_id: point.event_id, reason: 'TIMESTAMP_OUT_OF_RANGE' });
                    continue;
                }
                if (latest && recordedAt.getTime() < latest.deviceRecordedAt.getTime()) {
                    rejected.push({ event_id: point.event_id, reason: 'STALE_LOCATION' });
                    continue;
                }
                const duplicate = await manager.getRepository(DeliveryLocationSample).findOne({ where: { sourceEventId: point.event_id } });
                if (duplicate) continue;
                const sample = manager.getRepository(DeliveryLocationSample).create({
                    tenantId,
                    deliveryId,
                    driverId,
                    lat: String(point.lat),
                    lng: String(point.lng),
                    accuracyM: point.accuracy_m === undefined ? null : String(point.accuracy_m),
                    speedMps: point.speed_mps === undefined ? null : String(point.speed_mps),
                    headingDeg: point.heading_deg === undefined ? null : String(point.heading_deg),
                    deviceRecordedAt: recordedAt,
                    sourceEventId: point.event_id,
                    sampleReason: 'INTERVAL',
                });
                await manager.getRepository(DeliveryLocationSample).save(sample);
                await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
                    id: randomUUID(),
                    eventId: point.event_id,
                    tenantId,
                    aggregateType: 'DELIVERY',
                    aggregateId: deliveryId,
                    eventType: 'delivery.location_updated.v1',
                    payload: {
                        version: 1,
                        event_id: point.event_id,
                        tenant_id: tenantId,
                        delivery_id: deliveryId,
                        type: 'delivery.location_updated.v1',
                        occurred_at: recordedAt.toISOString(),
                        data: {
                            lat: Number(point.lat),
                            lng: Number(point.lng),
                            accuracy_m: point.accuracy_m,
                            speed_mps: point.speed_mps,
                            heading_deg: point.heading_deg,
                            recorded_at: recordedAt.toISOString(),
                            stale: false,
                        },
                    },
                    occurredAt: recordedAt,
                }));
                accepted.push({ event_id: point.event_id, recorded_at: recordedAt.toISOString(), lat: point.lat, lng: point.lng });
                latest = sample;
            }
        });

        for (const point of accepted) {
            await this.amqpService.publishDeliveryRealtimeEvent({
                version: 1,
                event_id: point.event_id,
                type: 'delivery.location_updated.v1',
                tenant_id: tenantId,
                        aggregate_id: deliveryId,
                        correlation_id: point.event_id,
                delivery_id: deliveryId,
                occurred_at: point.recorded_at,
                data: {
                    lat: point.lat,
                    lng: point.lng,
                    recorded_at: point.recorded_at,
                    stale: false,
                },
            }).catch(() => undefined);
        }
        if (accepted.length > 0) this.etaService.schedule(tenantId, deliveryId, 'LOCATION_UPDATED');
        return { accepted, rejected };
    }
}
