import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createHash, randomInt, randomUUID } from 'crypto';

import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { OrderBatch } from '../../entities/order-batch.entity';
import { Order } from '../../entities/order.entity';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { DeliveryProviderAttempt } from '../../entities/delivery-provider-attempt.entity';
import { DeliveryEvent } from '../../entities/delivery-event.entity';
import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { DeliveryCommandIdempotency } from '../../entities/delivery-command-idempotency.entity';
import { DeliveryPinChallenge } from '../../entities/delivery-pin-challenge.entity';
import { DeliveryPolicyService } from './delivery-policy.service';
import { DeliveryPinFailure, DeliveryPinService } from './delivery-pin.service';
import { DeliveryNotificationService, DeliveryNotificationMilestone } from './delivery-notification.service';
import { DeliveryFeeService } from './delivery-fee.service';
import { DeliveryAddressSnapshotService } from './delivery-address-snapshot.service';
import { DeliveryFulfillmentService } from './delivery-fulfillment.service';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { AmqpService } from '../amqp/amqp.service';
import { DELIVERY_MAPS_PROVIDER, DeliveryMapsProvider, DeliveryRouteResult } from './maps/maps-provider';
import {
    canTransitionDeliveryStatus,
    DeliveryAcceptanceMode,
    DeliveryActorType,
    DeliveryDriverAvailability,
    DeliveryEventType,
    DeliveryStatus,
    DELIVERY_TERMINAL_STATUSES,
} from './contracts';
import {
    DeliveryAssignDto,
    DeliveryAcceptDto,
    DeliveryCancelDto,
    DeliveryCompleteReturnDto,
    DeliveryConfirmPinDto,
    DeliveryCreateInternalDto,
    DeliveryExceptionDto,
    DeliveryFeeQuoteQueryDto,
    DeliveryOrderEventDto,
    DeliveryOverrideDto,
    DeliveryOwnOperationDto,
    DeliveryRejectDto,
    DeliveryStartReturnDto,
    ListDeliveriesQueryDto,
} from './dto/delivery-commands.dto';

type Actor = {
    id?: string;
    name?: string;
    role?: string;
    type?: DeliveryActorType;
};

type DeliverySnapshot = {
    id: string;
    tenant_id: string;
    batch_id: string;
    tab_id: string;
    display_code: string;
    status: string;
    version: number;
    service_type: string;
    customer_name: string | null;
    customer_id: string | null;
    customer_address_id: string | null;
    customer_phone: string | null;
    formatted_address: string | null;
    postal_code: string | null;
    street: string | null;
    address_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    address_reference: string | null;
    destination_lat: number | null;
    destination_lng: number | null;
    delivery_fee: number;
    customer_delivery_fee: number;
    default_fulfillment_mode: string | null;
    assigned_driver_id: string | null;
    eta_seconds: number | null;
    accepted_at: Date | null;
    ready_for_dispatch_at: Date | null;
    picked_up_at: Date | null;
    in_transit_at: Date | null;
    arrived_at: Date | null;
    delivered_at: Date | null;
    created_at: Date;
    updated_at: Date;
    // The delivery board needs the order items to render its operational card.
    // Keeping this compact projection on the delivery endpoint avoids a second,
    // tenant-wide orders query every time the board is refreshed.
    orders?: Array<{
        id: string;
        batch_id: string | null;
        status: string;
        items: Array<{
            id: string;
            quantity: number;
            unit_price: number;
            item_name_snapshot: string | null;
            menu_item_id: string;
        }>;
    }>;
};

const ACTIVE_STATUSES = [
    DeliveryStatus.Accepted,
    DeliveryStatus.Preparing,
    DeliveryStatus.ReadyForDispatch,
    DeliveryStatus.Assigned,
    DeliveryStatus.PickedUp,
    DeliveryStatus.InTransit,
    DeliveryStatus.Arrived,
    DeliveryStatus.DeliveryFailed,
    DeliveryStatus.Returning,
];

@Injectable()
export class DeliveryService {
    constructor(
        @InjectRepository(Delivery)
        private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryEvent)
        private readonly eventRepository: Repository<DeliveryEvent>,
        @InjectRepository(DomainOutboxEvent)
        private readonly outboxRepository: Repository<DomainOutboxEvent>,
        @InjectRepository(DeliveryCommandIdempotency)
        private readonly idempotencyRepository: Repository<DeliveryCommandIdempotency>,
        @InjectRepository(DeliveryFulfillment)
        private readonly fulfillmentRepository: Repository<DeliveryFulfillment>,
        @InjectRepository(OrderBatch)
        private readonly batchRepository: Repository<OrderBatch>,
        @InjectRepository(Order)
        private readonly orderRepository: Repository<Order>,
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly dataSource: DataSource,
        private readonly policyService: DeliveryPolicyService,
        private readonly pinService: DeliveryPinService,
        private readonly trackingService: DeliveryTrackingService,
        private readonly notificationService: DeliveryNotificationService,
        private readonly amqpService: AmqpService,
        private readonly feeService: DeliveryFeeService,
        private readonly addressSnapshotService: DeliveryAddressSnapshotService,
        private readonly fulfillmentService: DeliveryFulfillmentService,
        private readonly capacityService: DeliveryCapacityService,
        @Inject(DELIVERY_MAPS_PROVIDER)
        private readonly mapsProvider: DeliveryMapsProvider,
    ) { }

    async list(tenantId: string, query: ListDeliveriesQueryDto) {
        const statuses = String(query.status || '')
            .split(',')
            .map((status) => status.trim())
            .filter(Boolean);
        const page = Math.max(1, Number(query.page || 1));
        const limit = Math.min(100, Math.max(1, Number(query.limit || 30)));
        const qb = this.deliveryRepository.createQueryBuilder('delivery')
            .where('delivery.tenant_id = :tenantId', { tenantId })
            .orderBy('delivery.created_at', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (statuses.length === 1) qb.andWhere('delivery.status = :status', { status: statuses[0] });
        if (statuses.length > 1) qb.andWhere('delivery.status IN (:...statuses)', { statuses });
        if (query.driver_id) qb.andWhere('delivery.assigned_driver_id = :driverId', { driverId: query.driver_id });
        if (query.code) qb.andWhere('delivery.display_code ILIKE :code', { code: `%${query.code.trim()}%` });

        const [rows, total] = await qb.getManyAndCount();
        const batchIds = [...new Set(rows.map((delivery) => delivery.batchId).filter(Boolean))];
        const orders = batchIds.length
            ? await this.orderRepository.find({
                where: { tenantId, batchId: In(batchIds) },
                order: { createdAt: 'ASC' },
            })
            : [];
        const ordersByBatch = new Map<string, Order[]>();
        orders.forEach((order) => {
            if (!order.batchId) return;
            const batchOrders = ordersByBatch.get(order.batchId) || [];
            batchOrders.push(order);
            ordersByBatch.set(order.batchId, batchOrders);
        });
        return {
            data: rows.map((delivery) => this.toSnapshot(delivery, ordersByBatch.get(delivery.batchId) || [])),
            page,
            limit,
            total,
            has_more: page * limit < total,
        };
    }

    async summary(tenantId: string) {
        const rows = await this.deliveryRepository
            .createQueryBuilder('delivery')
            .select('delivery.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('delivery.tenant_id = :tenantId', { tenantId })
            .andWhere('delivery.status NOT IN (:...terminal)', { terminal: DELIVERY_TERMINAL_STATUSES })
            .groupBy('delivery.status')
            .getRawMany<{ status: string; count: string }>();
        const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
        return {
            tenant_id: tenantId,
            counts,
            active_total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        };
    }

    async quoteFee(tenantId: string, query: DeliveryFeeQuoteQueryDto) {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Restaurante não encontrado.');
        const deliverySettings = ((tenant.settings || {}) as any).delivery || {};
        let distanceMeters = query.distance_meters;
        if (distanceMeters === undefined && query.destination_lat !== undefined && query.destination_lng !== undefined) {
            const origin = deliverySettings.origin || {};
            distanceMeters = this.distanceMeters(Number(origin.lat), Number(origin.lng), query.destination_lat, query.destination_lng);
        }
        const quote = this.feeService.quote(distanceMeters, deliverySettings.fees || deliverySettings.own_delivery?.pricing);
        return {
            tenant_id: tenantId,
            distance_meters: Number.isFinite(Number(distanceMeters)) ? Number(distanceMeters) : null,
            delivery_fee: quote.amount,
            fee_rule: quote.rule,
        };
    }

    async findOne(tenantId: string, deliveryId: string): Promise<DeliverySnapshot> {
        const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId, tenantId } });
        if (!delivery) throw new NotFoundException('Entrega não encontrada.');
        return this.toSnapshot(delivery);
    }

    /**
     * The dispatch board needs a small, explicit projection instead of the
     * privileged user-management endpoint. Availability is conservative:
     * an active assignment makes a driver BUSY until a dedicated availability
     * signal is introduced.
     */
    async listEligibleDrivers(tenantId: string) {
        const drivers = await this.userRepository.find({
            where: { tenantId, active: true, role: 'DRIVER' as any },
            order: { name: 'ASC' },
        });
        const activeStatuses = ACTIVE_STATUSES;
        const activeAssignments = drivers.length
            ? await this.deliveryRepository.createQueryBuilder('delivery')
                .select('delivery.assigned_driver_id', 'driver_id')
                .addSelect('COUNT(*)', 'active_count')
                .where('delivery.tenant_id = :tenantId', { tenantId })
                .andWhere('delivery.assigned_driver_id IN (:...driverIds)', { driverIds: drivers.map((driver) => driver.id) })
                .andWhere('delivery.status IN (:...statuses)', { statuses: activeStatuses })
                .groupBy('delivery.assigned_driver_id')
                .getRawMany<{ driver_id: string; active_count: string }>()
            : [];
        const activeByDriver = new Map(activeAssignments.map((item) => [item.driver_id, Number(item.active_count)]));
        return {
            drivers: drivers.map((driver) => {
                const activeDeliveries = activeByDriver.get(driver.id) || 0;
                return {
                    id: driver.id,
                    name: driver.name,
                    availability: activeDeliveries > 0 ? DeliveryDriverAvailability.Busy : DeliveryDriverAvailability.Available,
                    active_deliveries: activeDeliveries,
                    last_activity_at: null,
                };
            }),
        };
    }

    /** Returns a sanitized, chronological audit projection for dispatch. */
    async timeline(tenantId: string, deliveryId: string) {
        const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId, tenantId } });
        if (!delivery) throw new NotFoundException('Entrega não encontrada.');
        const events = await this.eventRepository.find({
            where: { tenantId, deliveryId },
            order: { createdAt: 'ASC' },
        });
        const fulfillment = await this.fulfillmentRepository.findOne({ where: { tenantId, deliveryId, isCurrent: true } });
        const attempts = fulfillment
            ? await this.dataSource.getRepository(DeliveryProviderAttempt).find({ where: { tenantId, fulfillmentId: fulfillment.id }, order: { attemptNumber: 'ASC' } })
            : [];
        return {
            delivery: this.toSnapshot(delivery),
            events: events.map((event) => this.toTimelineEvent(event)),
            fulfillment: fulfillment ? {
                id: fulfillment.id,
                mode: fulfillment.mode,
                provider: fulfillment.provider,
                status: fulfillment.status,
                quoted_cost: fulfillment.quotedCost === null ? null : Number(fulfillment.quotedCost),
                actual_cost: fulfillment.actualCost === null ? null : Number(fulfillment.actualCost),
                tracking_url: fulfillment.mode === 'EXTERNAL' ? fulfillment.trackingUrl : null,
                cycle_number: fulfillment.cycleNumber,
                started_at: fulfillment.startedAt,
                assigned_at: fulfillment.assignedAt,
                delivered_at: fulfillment.deliveredAt,
            } : null,
            attempts: attempts.map((attempt) => ({
                attempt_number: attempt.attemptNumber,
                status: attempt.status,
                scheduled_at: attempt.scheduledAt,
                started_at: attempt.startedAt,
                finished_at: attempt.finishedAt,
                error_code: attempt.providerErrorCode,
            })),
        };
    }

    async createFromBatch(input: DeliveryCreateInternalDto): Promise<DeliverySnapshot> {
        const existing = await this.deliveryRepository.findOne({ where: { tenantId: input.tenant_id, batchId: input.batch_id } });
        if (existing) return this.toSnapshot(existing);

        const [batch, tenant] = await Promise.all([
            this.batchRepository.findOne({ where: { id: input.batch_id, tenantId: input.tenant_id } }),
            this.tenantRepository.findOne({ where: { id: input.tenant_id } }),
        ]);
        if (!batch) throw new NotFoundException('Lote não encontrado.');
        if (batch.serviceType !== 'DELIVERY') throw new UnprocessableEntityException('O lote não está configurado para delivery.');
        if (!tenant) throw new NotFoundException('Restaurante não encontrado.');

        const rawSettings = ((tenant.settings || {}) as any).delivery || {};
        const settings = this.policyService.normalizeSettings(rawSettings);
        const origin = rawSettings.origin || {};
        let routeResult: DeliveryRouteResult | null = null;
        if ([origin.lat, origin.lng, input.destination_lat, input.destination_lng].every((value) => Number.isFinite(Number(value)))) {
            try {
                routeResult = await this.mapsProvider.route({
                    origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
                    destination: { lat: input.destination_lat, lng: input.destination_lng },
                });
            } catch (_error) {
                // A provider outage must not block order creation; Haversine
                // remains the deterministic service-area fallback.
            }
        }
        // Haversine is retained only for service-area pre-validation. It is
        // never passed to the pricing service as a road-distance quote.
        const areaDistanceMeters = routeResult?.distance_meters
            ?? this.distanceMeters(Number(origin.lat), Number(origin.lng), input.destination_lat, input.destination_lng);
        const distanceMeters = routeResult?.distance_meters ?? Number.NaN;
        const radiusKm = Number(rawSettings.service_area?.radius_km || 8);
        const addressConfirmed = input.address_confirmed !== false && Boolean(input.geocode_quality || input.formatted_address);
        const pricingSettings = rawSettings.fees || rawSettings.own_delivery?.pricing || {};
        const pricingNeedsRoute = ['DISTANCE_BANDS', 'PER_KM', 'HYBRID'].includes(String(pricingSettings.mode || '').toUpperCase());
        const insideServiceArea = Number.isFinite(areaDistanceMeters)
            && areaDistanceMeters <= radiusKm * 1000
            && (!pricingNeedsRoute || Boolean(routeResult));
        const activeDeliveries = await this.deliveryRepository.count({ where: { tenantId: input.tenant_id, status: In(ACTIVE_STATUSES) } });
        const decision = this.policyService.decide(settings, {
            now: new Date(),
            tenantIsActive: tenant.active,
            tenantIsOpen: tenant.isOpen,
            addressConfirmed,
            insideServiceArea,
            itemsAvailable: input.items_available !== false,
            paymentConfirmed: input.payment_confirmed === true,
            activeDeliveries,
            manuallyBlocked: false,
        });
        const feeQuote = this.feeService.quote(distanceMeters, pricingSettings);
        const addressSnapshot = this.addressSnapshotService.build(input);

        const delivery = this.deliveryRepository.create({
            tenantId: input.tenant_id,
            tabId: input.tab_id,
            batchId: input.batch_id,
            displayCode: await this.generateDisplayCode(input.tenant_id),
            serviceType: 'DELIVERY',
            status: decision.result === 'AUTO_ACCEPTED' ? DeliveryStatus.Accepted : DeliveryStatus.PendingRestaurantAcceptance,
            version: 1,
            customerName: input.customer_name || null,
            customerPhone: input.customer_phone || batch.customerPhone || null,
            customerId: input.customer_id || null,
            customerAddressId: input.customer_address_id || null,
            postalCode: (addressSnapshot.postal_code as string | null) || null,
            street: input.street || null,
            addressNumber: input.address_number || null,
            addressComplement: input.address_complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state: (addressSnapshot.state as string | null) || null,
            addressReference: input.address_reference || null,
            formattedAddress: (addressSnapshot.formatted_address as string | null) || null,
            addressSnapshot,
            defaultFulfillmentModeSnapshot: String(rawSettings.default_fulfillment_mode || 'OWN').toUpperCase(),
            customerDeliveryFee: feeQuote.amount.toFixed(2),
            providerQuotedCost: null,
            providerActualCost: null,
            restaurantAdjustment: '0.00',
            currency: 'BRL',
            destinationLat: String(input.destination_lat),
            destinationLng: String(input.destination_lng),
            geocodeProvider: input.geocode_provider || null,
            geocodeProviderId: input.geocode_provider_id || null,
            geocodeQuality: input.geocode_quality || null,
            originLat: Number.isFinite(Number(origin.lat)) ? String(origin.lat) : null,
            originLng: Number.isFinite(Number(origin.lng)) ? String(origin.lng) : null,
            distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
            etaSeconds: routeResult?.duration_seconds ?? null,
            etaUpdatedAt: routeResult ? new Date() : null,
            routePolyline: routeResult?.polyline || null,
            deliveryFee: feeQuote.amount.toFixed(2),
            feeRuleSnapshot: {
                ...feeQuote.rule,
                route_provider: routeResult?.provider || 'UNAVAILABLE',
                service_area_prevalidation_distance_meters: Number.isFinite(areaDistanceMeters) ? areaDistanceMeters : null,
            },
            policySnapshot: decision,
            acceptanceMode: decision.result === 'AUTO_ACCEPTED' ? DeliveryAcceptanceMode.Auto : DeliveryAcceptanceMode.Manual,
            acceptedAt: decision.result === 'AUTO_ACCEPTED' ? new Date() : null,
        });

        const snapshot = await this.dataSource.transaction(async (manager) => {
            const currentBatch = await manager.getRepository(OrderBatch).findOne({
                where: { id: input.batch_id, tenantId: input.tenant_id },
            });
            if (currentBatch && !currentBatch.deliveryAddressSnapshot) {
                currentBatch.deliveryAddressSnapshot = addressSnapshot;
                await manager.getRepository(OrderBatch).save(currentBatch);
            }
            const saved = await manager.getRepository(Delivery).save(delivery);
            // The tenant setting is snapshotted on the delivery and determines
            // the per-order fulfillment from the moment the delivery exists.
            // OWN does not need a provider quote, so its operational record is
            // created here instead of waiting for a KDS action.
            if (saved.defaultFulfillmentModeSnapshot === 'OWN') {
                await this.ensureOwnFulfillment(manager, saved);
                await manager.getRepository(Delivery).save(saved);
            }
            await this.appendEvent(manager, saved, DeliveryEventType.Created, null, saved.status, { acceptance_mode: saved.acceptanceMode });
            if (decision.result === 'AUTO_ACCEPTED') {
                await this.appendEvent(manager, saved, DeliveryEventType.Accepted, null, saved.status, { policy: decision });
            } else {
                await this.appendEvent(manager, saved, DeliveryEventType.ManualAcceptanceRequired, null, saved.status, { policy: decision });
            }
            return this.toSnapshot(saved);
        });
        // A paid delivery deliberately does not emit order.created: that event
        // belongs to the dine-in kitchen queue. Emit its own KDS refresh signal
        // as soon as its operational projection exists instead.
        await this.publishTrackingStatus(snapshot);
        return snapshot;
    }

    /**
     * Reconciles the logistics projection with the current order_batch state.
     * The command is intentionally level-triggered: callers may replay an
     * order event or run a periodic sweep and the same batch will produce no
     * additional transition once the target state has been reached.
     */
    async reconcileOrderBatch(input: DeliveryOrderEventDto) {
        const tenantId = input.tenant_id;
        const batchId = input.batch_id;
        const batch = await this.batchRepository.findOne({ where: { id: batchId, tenantId } });
        if (!batch) throw new NotFoundException('Lote não encontrado.');

        if (batch.serviceType !== 'DELIVERY') {
            return {
                batch_id: batchId,
                delivery_id: null,
                ignored: true,
                reason: 'BATCH_NOT_DELIVERY',
            };
        }

        let delivery = await this.deliveryRepository.findOne({ where: { tenantId, batchId } });
        const deliveryInput = input.delivery || this.deliveryInputFromBatch(batch);
        if (!delivery && deliveryInput) {
            const createInput = {
                ...deliveryInput,
                tenant_id: tenantId,
                tab_id: batch.tabId,
                batch_id: batchId,
                customer_phone: deliveryInput.customer_phone || batch.customerPhone || undefined,
            } as DeliveryCreateInternalDto;
            try {
                await this.createFromBatch(createInput);
            } catch (error) {
                // The unique (tenant_id, batch_id) constraint makes creation
                // safe under concurrent event delivery. If another request
                // won the race, use its row and continue reconciliation.
                delivery = await this.deliveryRepository.findOne({ where: { tenantId, batchId } });
                if (!delivery) throw error;
            }
            delivery ||= await this.deliveryRepository.findOne({ where: { tenantId, batchId } });
        }

        if (!delivery) {
            return {
                batch_id: batchId,
                delivery_id: null,
                ignored: true,
                reason: 'DELIVERY_NOT_CREATED',
            };
        }

        const orders = await this.orderRepository.find({
            where: { tenantId, batchId },
            order: { createdAt: 'ASC' },
        });
        const activeOrders = orders.filter((order) => order.status !== 'CANCELED');
        const allAccepted = activeOrders.length > 0 && activeOrders.every((order) => order.status !== 'PENDING');
        const allReady = activeOrders.length > 0 && activeOrders.every((order) => order.status === 'READY' || order.status === 'DELIVERED');
        const transitions: string[] = [];
        const eventMetadata = {
            source: 'ORDER_BATCH_PROJECTOR',
            event_id: input.event_id || null,
            order_id: input.order_id || null,
            batch_id: batchId,
        };

        if (delivery.status === DeliveryStatus.Accepted && allAccepted) {
            delivery = await this.transition(
                tenantId,
                delivery.id,
                DeliveryStatus.Preparing,
                { type: DeliveryActorType.System },
                'ORDER_BATCH_ACCEPTED',
                undefined,
                'ORDER_BATCH_PROJECTOR',
                eventMetadata,
            ) as unknown as Delivery;
            transitions.push(`${DeliveryStatus.Accepted}->${DeliveryStatus.Preparing}`);
        }

        if (delivery.status === DeliveryStatus.Preparing && allReady) {
            delivery = await this.transition(
                tenantId,
                delivery.id,
                DeliveryStatus.ReadyForDispatch,
                { type: DeliveryActorType.System },
                'ORDER_BATCH_READY',
                undefined,
                'ORDER_BATCH_PROJECTOR',
                eventMetadata,
            ) as unknown as Delivery;
            transitions.push(`${DeliveryStatus.Preparing}->${DeliveryStatus.ReadyForDispatch}`);
        }

        const current = await this.deliveryRepository.findOne({ where: { id: delivery.id, tenantId } });
        if (current?.status === DeliveryStatus.Preparing) {
            await this.fulfillmentService.startExternalCycle(tenantId, current.id);
        }
        return {
            batch_id: batchId,
            delivery_id: current?.id || delivery.id,
            ignored: transitions.length === 0,
            reason: transitions.length ? 'STATE_RECONCILED' : 'NO_STATE_CHANGE',
            event_id: input.event_id || null,
            order_summary: {
                total: orders.length,
                active: activeOrders.length,
                canceled: orders.length - activeOrders.length,
                all_accepted: allAccepted,
                all_ready: allReady,
            },
            transitions,
            delivery: current ? this.toSnapshot(current) : null,
        };
    }

    private deliveryInputFromBatch(batch: OrderBatch): DeliveryCreateInternalDto | undefined {
        const snapshot = (batch.deliveryAddressSnapshot || {}) as Record<string, unknown>;
        const destinationLat = Number(snapshot.destination_lat ?? snapshot.lat);
        const destinationLng = Number(snapshot.destination_lng ?? snapshot.lng);
        if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) return undefined;

        return {
            tenant_id: batch.tenantId,
            tab_id: batch.tabId,
            batch_id: batch.id,
            customer_name: typeof snapshot.customer_name === 'string' ? snapshot.customer_name : undefined,
            customer_phone: batch.customerPhone || undefined,
            postal_code: typeof snapshot.postal_code === 'string' ? snapshot.postal_code : undefined,
            street: typeof snapshot.street === 'string' ? snapshot.street : undefined,
            address_number: typeof snapshot.address_number === 'string' ? snapshot.address_number : undefined,
            address_complement: typeof snapshot.address_complement === 'string' ? snapshot.address_complement : undefined,
            neighborhood: typeof snapshot.neighborhood === 'string' ? snapshot.neighborhood : undefined,
            city: typeof snapshot.city === 'string' ? snapshot.city : undefined,
            state: typeof snapshot.state === 'string' ? snapshot.state : undefined,
            address_reference: typeof snapshot.address_reference === 'string' ? snapshot.address_reference : undefined,
            formatted_address: typeof snapshot.formatted_address === 'string' ? snapshot.formatted_address : undefined,
            destination_lat: destinationLat,
            destination_lng: destinationLng,
            geocode_provider: typeof snapshot.geocode_provider === 'string' ? snapshot.geocode_provider : undefined,
            geocode_provider_id: typeof snapshot.geocode_provider_id === 'string' ? snapshot.geocode_provider_id : undefined,
            geocode_quality: typeof snapshot.geocode_quality === 'string' ? snapshot.geocode_quality : undefined,
            address_confirmed: snapshot.address_confirmed !== false,
        };
    }

    async accept(tenantId: string, id: string, command: DeliveryAcceptDto, actor: Actor, idempotencyKey?: string) {
        return this.runIdempotent(tenantId, id, 'accept', idempotencyKey, actor, command as unknown as Record<string, unknown>, async () => {
            const snapshot = await this.dataSource.transaction(async (manager) => {
                const repository = manager.getRepository(Delivery);
                const delivery = await repository.createQueryBuilder('delivery')
                    .where('delivery.id = :id AND delivery.tenant_id = :tenantId', { id, tenantId })
                    .setLock('pessimistic_write')
                    .getOne();
                if (!delivery) throw new NotFoundException('Entrega não encontrada.');
                const currentFulfillment = await manager.getRepository(DeliveryFulfillment).createQueryBuilder('fulfillment')
                    .where('fulfillment.delivery_id = :id AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { id, tenantId })
                    .setLock('pessimistic_write')
                    .getOne();
                if (!currentFulfillment && delivery.defaultFulfillmentModeSnapshot === 'OWN') {
                    await this.ensureOwnFulfillment(manager, delivery);
                }
                if (![DeliveryStatus.PendingRestaurantAcceptance, DeliveryStatus.Accepted].includes(delivery.status as DeliveryStatus)) {
                    throw new UnprocessableEntityException('A previsão só pode ser definida antes do início do preparo.');
                }

                const previousStatus = delivery.status;
                const previousEtaSeconds = delivery.etaSeconds;
                const now = new Date();
                delivery.etaSeconds = command.estimated_minutes * 60;
                delivery.etaUpdatedAt = now;
                if (delivery.status === DeliveryStatus.PendingRestaurantAcceptance) {
                    delivery.status = DeliveryStatus.Accepted;
                    this.applyTimestamp(delivery, DeliveryStatus.Accepted);
                    await this.appendEvent(
                        manager,
                        delivery,
                        DeliveryEventType.Accepted,
                        actor,
                        delivery.status,
                        {
                            previous_status: previousStatus,
                            estimated_minutes: command.estimated_minutes,
                            reason_code: 'PREPARATION_ESTIMATE_SET',
                        },
                        'KDS_DELIVERY',
                    );
                }
                // The KDS action is explicitly “iniciar preparo”. Advance the
                // delivery projection in the same command instead of waiting
                // for a separate Core event that may be delivered later.
                if (delivery.status === DeliveryStatus.Accepted) {
                    delivery.status = DeliveryStatus.Preparing;
                    this.applyTimestamp(delivery, DeliveryStatus.Preparing);
                }
                delivery.version += 1;
                const saved = await repository.save(delivery);
                await this.appendEvent(
                    manager,
                    saved,
                    DeliveryEventType.StatusChanged,
                    actor,
                    saved.status,
                    {
                        previous_status: previousStatus,
                        previous_eta_seconds: previousEtaSeconds,
                        estimated_minutes: command.estimated_minutes,
                        reason_code: 'PREPARATION_ESTIMATE_SET',
                    },
                    'KDS_DELIVERY',
                );
                // The accept action starts preparation in the same command.
                // Keep the customer notification transactional with the status
                // change, just like the generic transition path.
                await this.enqueueMilestoneForStatus(manager, saved, saved.status as DeliveryStatus);
                return this.toSnapshot(saved);
            });
            if (snapshot.status === DeliveryStatus.Preparing) {
                // Starting an external cycle is best effort here; maintenance
                // reconciliation remains the durable fallback if the provider
                // is temporarily unavailable. OWN deliveries are a no-op.
                try {
                    await this.fulfillmentService.startExternalCycle(tenantId, snapshot.id);
                } catch (_error) {
                    // Keep the preparation transition successful; the retrying
                    // maintenance worker will handle provider allocation.
                }
            }
            await this.publishTrackingStatus(snapshot);
            return snapshot;
        });
    }

    async reject(tenantId: string, id: string, command: DeliveryRejectDto, actor: Actor, idempotencyKey?: string) {
        return this.runIdempotent(tenantId, id, 'reject', idempotencyKey, actor, command as unknown as Record<string, unknown>, async () => {
            const snapshot = await this.transition(tenantId, id, DeliveryStatus.Rejected, actor, command.reason_code, command.reason);
            await this.capacityService.releaseForDelivery(tenantId, id, 'DELIVERY_REJECTED');
            return snapshot;
        });
    }

    async cancel(tenantId: string, id: string, command: DeliveryCancelDto, actor: Actor, idempotencyKey?: string) {
        return this.runIdempotent(tenantId, id, 'cancel', idempotencyKey, actor, command as unknown as Record<string, unknown>, async () => {
            const snapshot = await this.transition(tenantId, id, DeliveryStatus.Canceled, actor, command.reason_code, command.reason);
            // Own capacity is linked by delivery_id, so cancellation can
            // release it without exposing the checkout key to operators.
            await this.capacityService.releaseForDelivery(tenantId, id, 'DELIVERY_CANCELED');
            return snapshot;
        });
    }

    /** Marks the restaurant-owned preparation as ready for dispatch. */
    async readyOwn(
        tenantId: string,
        id: string,
        actor: Actor,
        command: DeliveryOwnOperationDto,
        idempotencyKey?: string,
    ) {
        return this.runIdempotent(
            tenantId,
            id,
            'own-ready',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            async () => {
                const snapshot = await this.dataSource.transaction(async (manager) => {
                    const deliveryRepository = manager.getRepository(Delivery);
                    const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                    const delivery = await deliveryRepository.createQueryBuilder('delivery')
                        .where('delivery.id = :id AND delivery.tenant_id = :tenantId', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!delivery) throw new NotFoundException('Entrega não encontrada.');
                    let fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                        .where('fulfillment.delivery_id = :id AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!fulfillment && delivery.defaultFulfillmentModeSnapshot === 'OWN') {
                        fulfillment = await this.ensureOwnFulfillment(manager, delivery);
                    }
                    if (!fulfillment || fulfillment.mode !== 'OWN') throw new UnprocessableEntityException('A entrega não está configurada para operação própria.');
                    if (delivery.status === DeliveryStatus.ReadyForDispatch && fulfillment.status === 'WAITING_DISPATCH') return this.toSnapshot(delivery);
                    if (delivery.version !== command.expected_version) throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
                    if (delivery.status !== DeliveryStatus.Preparing) throw new UnprocessableEntityException('A entrega própria ainda não está em preparo.');
                    const previousStatus = delivery.status;
                    delivery.status = DeliveryStatus.ReadyForDispatch;
                    delivery.version += 1;
                    this.applyTimestamp(delivery, DeliveryStatus.ReadyForDispatch);
                    fulfillment.status = 'WAITING_DISPATCH';
                    const saved = await deliveryRepository.save(delivery);
                    await fulfillmentRepository.save(fulfillment);
                    await this.appendEvent(manager, saved, DeliveryEventType.ReadyForDispatch, actor, saved.status, {
                        previous_status: previousStatus,
                        fulfillment_mode: 'OWN',
                        reason: command.notes || null,
                    }, 'OWN_OPERATION');
                    return this.toSnapshot(saved);
                });
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    /**
     * Starts a restaurant-owned delivery. There is deliberately no driver
     * assignment, pickup, PIN or tracking side effect in this path: the
     * aggregate moves directly from READY_FOR_DISPATCH to IN_TRANSIT and the
     * own fulfillment mirrors that state.
     */
    async startOwn(
        tenantId: string,
        id: string,
        actor: Actor,
        command: DeliveryOwnOperationDto,
        idempotencyKey?: string,
    ) {
        return this.runIdempotent(
            tenantId,
            id,
            'own-start',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            async () => {
                const snapshot = await this.dataSource.transaction(async (manager) => {
                    const deliveryRepository = manager.getRepository(Delivery);
                    const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                    const delivery = await deliveryRepository.createQueryBuilder('delivery')
                        .where('delivery.id = :id AND delivery.tenant_id = :tenantId', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!delivery) throw new NotFoundException('Entrega não encontrada.');
                    const fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                        .where('fulfillment.delivery_id = :id AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!fulfillment || fulfillment.mode !== 'OWN') throw new UnprocessableEntityException('A entrega não está configurada para operação própria.');
                    if (delivery.status === DeliveryStatus.InTransit && fulfillment.status === 'IN_TRANSIT') return this.toSnapshot(delivery);
                    if (delivery.version !== command.expected_version) throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
                    if (delivery.assignedDriverId) throw new ConflictException('Entrega própria não permite entregador individual.');
                    if (delivery.status !== DeliveryStatus.ReadyForDispatch || !['WAITING_DISPATCH', 'WAITING_PREPARATION'].includes(fulfillment.status)) {
                        throw new UnprocessableEntityException('A entrega própria ainda não está aguardando saída.');
                    }
                    const previousStatus = delivery.status;
                    const now = new Date();
                    delivery.status = DeliveryStatus.InTransit;
                    delivery.version += 1;
                    this.applyTimestamp(delivery, DeliveryStatus.InTransit);
                    fulfillment.status = 'IN_TRANSIT';
                    fulfillment.startedAt = fulfillment.startedAt || now;
                    const saved = await deliveryRepository.save(delivery);
                    await fulfillmentRepository.save(fulfillment);
                    await this.appendEvent(manager, saved, DeliveryEventType.StatusChanged, actor, saved.status, {
                        previous_status: previousStatus,
                        fulfillment_mode: 'OWN',
                        reason: command.notes || null,
                    }, 'OWN_OPERATION');
                    await this.enqueueMilestoneForStatus(manager, saved, DeliveryStatus.InTransit);
                    return this.toSnapshot(saved);
                });
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    /** Completes an own delivery and releases its capacity reservation once. */
    async completeOwn(
        tenantId: string,
        id: string,
        actor: Actor,
        command: DeliveryOwnOperationDto,
        idempotencyKey?: string,
    ) {
        return this.runIdempotent(
            tenantId,
            id,
            'own-complete',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            async () => {
                const snapshot = await this.dataSource.transaction(async (manager) => {
                    const deliveryRepository = manager.getRepository(Delivery);
                    const fulfillmentRepository = manager.getRepository(DeliveryFulfillment);
                    const delivery = await deliveryRepository.createQueryBuilder('delivery')
                        .where('delivery.id = :id AND delivery.tenant_id = :tenantId', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!delivery) throw new NotFoundException('Entrega não encontrada.');
                    const fulfillment = await fulfillmentRepository.createQueryBuilder('fulfillment')
                        .where('fulfillment.delivery_id = :id AND fulfillment.tenant_id = :tenantId AND fulfillment.is_current = TRUE', { id, tenantId })
                        .setLock('pessimistic_write')
                        .getOne();
                    if (!fulfillment || fulfillment.mode !== 'OWN') throw new UnprocessableEntityException('A entrega não está configurada para operação própria.');
                    if (delivery.status === DeliveryStatus.Delivered && fulfillment.status === 'DELIVERED') return this.toSnapshot(delivery);
                    if (delivery.version !== command.expected_version) throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
                    if (delivery.status !== DeliveryStatus.InTransit || fulfillment.status !== 'IN_TRANSIT') {
                        throw new UnprocessableEntityException('A entrega própria ainda não saiu para entrega.');
                    }
                    const previousStatus = delivery.status;
                    delivery.status = DeliveryStatus.Delivered;
                    delivery.version += 1;
                    this.applyTimestamp(delivery, DeliveryStatus.Delivered);
                    fulfillment.status = 'DELIVERED';
                    fulfillment.deliveredAt = fulfillment.deliveredAt || new Date();
                    const saved = await deliveryRepository.save(delivery);
                    await fulfillmentRepository.save(fulfillment);
                    await this.appendEvent(manager, saved, DeliveryEventType.Completed, actor, saved.status, {
                        previous_status: previousStatus,
                        fulfillment_mode: 'OWN',
                        reason: command.notes || null,
                    }, 'OWN_OPERATION');
                    await this.enqueueMilestoneForStatus(manager, saved, DeliveryStatus.Delivered);
                    return this.toSnapshot(saved);
                });
                await this.capacityService.releaseForDelivery(tenantId, id, 'DELIVERY_COMPLETED');
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    async activeForDriver(tenantId: string, driverId: string): Promise<DeliverySnapshot | null> {
        const delivery = await this.deliveryRepository.findOne({
            where: { tenantId, assignedDriverId: driverId, status: In([DeliveryStatus.Assigned, DeliveryStatus.PickedUp, DeliveryStatus.InTransit, DeliveryStatus.Arrived]) },
            order: { updatedAt: 'DESC' },
        });
        return delivery ? this.toSnapshot(delivery) : null;
    }

    async pickupForDriver(tenantId: string, deliveryId: string, driverId: string, idempotencyKey?: string): Promise<DeliverySnapshot> {
        return this.runIdempotent(
            tenantId,
            deliveryId,
            'pickup',
            idempotencyKey,
            { id: driverId, type: DeliveryActorType.Driver },
            {},
            async () => {
                const snapshot = await this.pickupInternal(tenantId, deliveryId, driverId);
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    private async pickupInternal(tenantId: string, deliveryId: string, driverId: string): Promise<DeliverySnapshot> {
        return this.dataSource.transaction(async (manager) => {
            const delivery = await manager.getRepository(Delivery)
                .createQueryBuilder('delivery')
                .where('delivery.id = :deliveryId', { deliveryId })
                .andWhere('delivery.tenant_id = :tenantId', { tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!delivery || delivery.assignedDriverId !== driverId) throw new NotFoundException('Entrega não encontrada.');
            if (delivery.status === DeliveryStatus.PickedUp) return this.toSnapshot(delivery);
            if (delivery.status !== DeliveryStatus.Assigned) throw new UnprocessableEntityException('A entrega não está aguardando retirada.');

            const previousStatus = delivery.status;
            delivery.status = DeliveryStatus.PickedUp;
            delivery.version += 1;
            this.applyTimestamp(delivery, DeliveryStatus.PickedUp);
            const saved = await manager.getRepository(Delivery).save(delivery);

            // The plaintext PIN is intentionally discarded here. A future
            // notification adapter may consume it in-process; it never enters
            // the HTTP response, domain event or outbox payload.
            const issued = await this.pinService.issueChallenge(manager, tenantId, deliveryId);
            const tracking = await this.trackingService.issueLinkInTransaction(manager, tenantId, deliveryId, driverId);
            await this.notificationService.enqueuePickup(manager, saved, tracking.tracking_url, issued.pin);
            await this.appendEvent(manager, saved, DeliveryEventType.PickedUp, {
                id: driverId,
                type: DeliveryActorType.Driver,
            }, saved.status, {
                previous_status: previousStatus,
                pin_challenge_id: issued.challenge.id,
            });
            return this.toSnapshot(saved);
        });
    }

    async arriveForDriver(tenantId: string, deliveryId: string, driverId: string) {
        const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId, tenantId } });
        if (!delivery || delivery.assignedDriverId !== driverId) throw new NotFoundException('Entrega não encontrada.');
        if (![DeliveryStatus.InTransit, DeliveryStatus.Arrived].includes(delivery.status as DeliveryStatus)) {
            throw new UnprocessableEntityException('A entrega ainda não está em rota.');
        }
        if (delivery.status === DeliveryStatus.Arrived) return this.toSnapshot(delivery);
        return this.transition(tenantId, deliveryId, DeliveryStatus.Arrived, { id: driverId, type: DeliveryActorType.Driver }, 'DRIVER_ARRIVED');
    }

    async confirmPinForDriver(
        tenantId: string,
        deliveryId: string,
        driverId: string,
        command: DeliveryConfirmPinDto,
        idempotencyKey?: string,
    ): Promise<DeliverySnapshot> {
        return this.runIdempotent(
            tenantId,
            deliveryId,
            'confirm-pin',
            idempotencyKey,
            { id: driverId, type: DeliveryActorType.Driver },
            { pin_fingerprint: this.pinService.fingerprint(command.pin) },
            () => this.confirmPinInternal(tenantId, deliveryId, driverId, command.pin),
        );
    }

    private async confirmPinInternal(tenantId: string, deliveryId: string, driverId: string, pin: string): Promise<DeliverySnapshot> {
        const result = await this.dataSource.transaction(async (manager) => {
            const delivery = await manager.getRepository(Delivery)
                .createQueryBuilder('delivery')
                .where('delivery.id = :deliveryId', { deliveryId })
                .andWhere('delivery.tenant_id = :tenantId', { tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!delivery || delivery.assignedDriverId !== driverId) throw new NotFoundException('Entrega não encontrada.');
            if (delivery.status === DeliveryStatus.Delivered) return { snapshot: this.toSnapshot(delivery) };
            if (![DeliveryStatus.InTransit, DeliveryStatus.Arrived].includes(delivery.status as DeliveryStatus)) {
                throw new UnprocessableEntityException('A entrega não está aguardando confirmação.');
            }

            const verification = await this.pinService.verifyChallenge(manager, tenantId, deliveryId, pin);
            if (verification.valid === false) return { failure: verification.failure };

            const previousStatus = delivery.status;
            delivery.status = DeliveryStatus.Delivered;
            delivery.version += 1;
            this.applyTimestamp(delivery, DeliveryStatus.Delivered);
            const saved = await manager.getRepository(Delivery).save(delivery);
            await this.appendEvent(manager, saved, DeliveryEventType.Completed, {
                id: driverId,
                type: DeliveryActorType.Driver,
            }, saved.status, {
                previous_status: previousStatus,
                confirmation_method: 'PIN',
            });
            await this.enqueueMilestoneForStatus(manager, saved, DeliveryStatus.Delivered);
            return { snapshot: this.toSnapshot(saved) };
        });

        if ('snapshot' in result) {
            await this.publishTrackingStatus(result.snapshot);
            return result.snapshot;
        }
        throw this.pinFailureException(result.failure);
    }

    async openExceptionForDriver(
        tenantId: string,
        deliveryId: string,
        driverId: string,
        command: DeliveryExceptionDto,
        idempotencyKey?: string,
    ): Promise<DeliverySnapshot> {
        return this.runIdempotent(
            tenantId,
            deliveryId,
            'exception',
            idempotencyKey,
            { id: driverId, type: DeliveryActorType.Driver },
            command as unknown as Record<string, unknown>,
            async () => {
                const snapshot = await this.dataSource.transaction(async (manager) => {
                const repository = manager.getRepository(Delivery);
                const delivery = await repository.createQueryBuilder('delivery')
                    .setLock('pessimistic_write')
                    .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                    .getOne();
                if (!delivery || delivery.assignedDriverId !== driverId) throw new NotFoundException('Entrega não encontrada.');
                if (delivery.status === DeliveryStatus.DeliveryFailed) return this.toSnapshot(delivery);
                if (![DeliveryStatus.PickedUp, DeliveryStatus.InTransit, DeliveryStatus.Arrived].includes(delivery.status as DeliveryStatus)) {
                    throw new UnprocessableEntityException('A entrega não aceita ocorrência neste estado.');
                }
                const previous = delivery.status;
                delivery.status = DeliveryStatus.DeliveryFailed;
                delivery.version += 1;
                this.applyTimestamp(delivery, DeliveryStatus.DeliveryFailed);
                const saved = await repository.save(delivery);
                await this.appendEvent(manager, saved, DeliveryEventType.ExceptionOpened, {
                    id: driverId,
                    type: DeliveryActorType.Driver,
                }, saved.status, {
                    previous_status: previous,
                    reason_code: command.reason_code,
                    notes: command.notes || null,
                }, 'DRIVER_EXCEPTION');
                    return this.toSnapshot(saved);
                });
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    async overrideDelivery(
        tenantId: string,
        deliveryId: string,
        command: DeliveryOverrideDto,
        actor: Actor,
        idempotencyKey?: string,
    ): Promise<DeliverySnapshot> {
        return this.runIdempotent(
            tenantId,
            deliveryId,
            'override',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            async () => {
                const snapshot = await this.dataSource.transaction(async (manager) => {
                const repository = manager.getRepository(Delivery);
                const delivery = await repository.createQueryBuilder('delivery')
                    .setLock('pessimistic_write')
                    .where('delivery.id = :deliveryId AND delivery.tenant_id = :tenantId', { deliveryId, tenantId })
                    .getOne();
                if (!delivery) throw new NotFoundException('Entrega não encontrada.');
                if (delivery.status === DeliveryStatus.Delivered) return this.toSnapshot(delivery);
                if (![DeliveryStatus.InTransit, DeliveryStatus.Arrived, DeliveryStatus.DeliveryFailed].includes(delivery.status as DeliveryStatus)) {
                    throw new UnprocessableEntityException('Override não permitido neste estado.');
                }
                const previous = delivery.status;
                delivery.status = DeliveryStatus.Delivered;
                delivery.version += 1;
                this.applyTimestamp(delivery, DeliveryStatus.Delivered);
                const saved = await repository.save(delivery);
                await this.appendEvent(manager, saved, DeliveryEventType.Completed, actor, saved.status, {
                    previous_status: previous,
                    override: true,
                    reason_code: command.reason_code,
                    notes: command.notes,
                    evidence_id: command.evidence_id || null,
                }, 'MANAGER_OVERRIDE');
                await this.notificationService.enqueueMilestone(manager, saved, DeliveryNotificationMilestone.Delivered);
                    return this.toSnapshot(saved);
                });
                await this.publishTrackingStatus(snapshot);
                return snapshot;
            },
        );
    }

    private pinFailureException(failure: DeliveryPinFailure): Error {
        if (failure === 'LOCKED') return new HttpException('PIN bloqueado por excesso de tentativas.', HttpStatus.TOO_MANY_REQUESTS);
        if (failure === 'EXPIRED') return new UnprocessableEntityException('PIN expirado.');
        if (failure === 'MISSING') return new UnprocessableEntityException('Nenhum PIN ativo para esta entrega.');
        return new UnprocessableEntityException('PIN inválido.');
    }

    async assign(tenantId: string, id: string, command: DeliveryAssignDto, actor: Actor, idempotencyKey?: string) {
        return this.runIdempotent(tenantId, id, 'assign', idempotencyKey, actor, command as unknown as Record<string, unknown>, () => this.assignInternal(tenantId, id, command, actor));
    }

    async startReturn(
        tenantId: string,
        id: string,
        command: DeliveryStartReturnDto,
        actor: Actor,
        idempotencyKey?: string,
    ) {
        return this.runIdempotent(
            tenantId,
            id,
            'start-return',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            () => this.transition(
                tenantId,
                id,
                DeliveryStatus.Returning,
                actor,
                command.reason_code,
                command.notes,
                'DELIVERY_RETURN',
                {},
                command.expected_version,
            ),
        );
    }

    async completeReturn(
        tenantId: string,
        id: string,
        command: DeliveryCompleteReturnDto,
        actor: Actor,
        idempotencyKey?: string,
    ) {
        return this.runIdempotent(
            tenantId,
            id,
            'complete-return',
            idempotencyKey,
            actor,
            command as unknown as Record<string, unknown>,
            () => this.transition(
                tenantId,
                id,
                DeliveryStatus.Returned,
                actor,
                'RETURN_CONFIRMED',
                command.notes,
                'DELIVERY_RETURN',
                {},
                command.expected_version,
            ),
        );
    }

    private async assignInternal(tenantId: string, id: string, command: DeliveryAssignDto, actor: Actor) {
        const delivery = await this.deliveryRepository.findOne({ where: { id, tenantId } });
        if (!delivery) throw new NotFoundException('Entrega não encontrada.');
        if (delivery.version !== command.expected_version) throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
        if (![DeliveryStatus.ReadyForDispatch, DeliveryStatus.Assigned, DeliveryStatus.DeliveryFailed].includes(delivery.status as DeliveryStatus)) {
            throw new UnprocessableEntityException('A entrega não está disponível para atribuição.');
        }

        const driver = await this.userRepository.findOne({ where: { id: command.driver_id, tenantId, active: true } });
        if (!driver || driver.role !== 'DRIVER') throw new UnprocessableEntityException('Entregador não encontrado ou inativo.');
        const busy = await this.deliveryRepository.count({ where: { tenantId, assignedDriverId: command.driver_id, status: In(ACTIVE_STATUSES) } });
        if (busy > 0 && delivery.assignedDriverId !== command.driver_id) throw new ConflictException('Entregador já possui uma entrega ativa.');

        const snapshot = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Delivery);
            const current = await repository.findOne({ where: { id, tenantId } });
            if (!current || current.version !== command.expected_version) throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
            const previousDriver = current.assignedDriverId;
            current.assignedDriverId = command.driver_id;
            current.assignedAt = new Date();
            current.status = DeliveryStatus.Assigned;
            current.version += 1;
            const saved = await repository.save(current);
            await this.appendEvent(manager, saved, DeliveryEventType.Assigned, actor, saved.status, { driver_id: command.driver_id, previous_driver_id: previousDriver, reason: command.reason });
            return this.toSnapshot(saved);
        });
        await this.publishTrackingStatus(snapshot);
        return snapshot;
    }

    private async runIdempotent(
        tenantId: string,
        deliveryId: string,
        scope: string,
        idempotencyKey: string | undefined,
        actor: Actor,
        command: Record<string, unknown>,
        operation: () => Promise<DeliverySnapshot>,
    ): Promise<DeliverySnapshot> {
        const key = String(idempotencyKey || '').trim();
        if (!key) return operation();
        if (key.length < 16 || key.length > 255) throw new BadRequestException('Idempotency-Key inválido.');
        const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
        const scopeKey = `${scope}:${deliveryId}`;
        const previous = await this.idempotencyRepository.findOne({ where: { tenantId, scope: scopeKey, idempotencyKey: key } });
        if (previous) {
            if (previous.requestHash !== requestHash) throw new ConflictException('A chave de idempotência foi reutilizada para outro comando.');
            if (previous.responseBody) return previous.responseBody as unknown as DeliverySnapshot;
        }

        const result = await operation();
        try {
            await this.idempotencyRepository.save(this.idempotencyRepository.create({
                tenantId,
                deliveryId,
                scope: scopeKey,
                idempotencyKey: key,
                actorType: actor.type || DeliveryActorType.User,
                actorUserId: actor.id || null,
                requestHash,
                responseStatus: 200,
                responseBody: result as unknown as Record<string, unknown>,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }));
        } catch (_error) {
            const concurrent = await this.idempotencyRepository.findOne({ where: { tenantId, scope: scopeKey, idempotencyKey: key } });
            if (concurrent?.requestHash === requestHash && concurrent.responseBody) return concurrent.responseBody as unknown as DeliverySnapshot;
        }
        return result;
    }

    private async transition(
        tenantId: string,
        id: string,
        next: DeliveryStatus,
        actor: Actor,
        reasonCode: string,
        reason?: string,
        source = 'DELIVERY_SERVICE',
        extraMetadata: Record<string, unknown> = {},
        expectedVersion?: number,
    ) {
        const snapshot = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Delivery);
            const current = await repository.createQueryBuilder('delivery')
                .setLock('pessimistic_write')
                .where('delivery.id = :id AND delivery.tenant_id = :tenantId', { id, tenantId })
                .getOne();
            if (!current) throw new NotFoundException('Entrega não encontrada.');
            if (expectedVersion !== undefined && current.version !== expectedVersion) {
                throw new ConflictException('A entrega foi alterada. Atualize e tente novamente.');
            }
            if (!canTransitionDeliveryStatus(current.status as DeliveryStatus, next)) {
                throw new UnprocessableEntityException(`Não é possível mudar de ${current.status} para ${next}.`);
            }
            const previous = current.status;
            current.status = next;
            current.version += 1;
            this.applyTimestamp(current, next);
            const saved = await repository.save(current);
            await this.appendEvent(manager, saved, this.eventTypeFor(next), actor, next, {
                reason_code: reasonCode,
                reason: reason || null,
                previous_status: previous,
                ...extraMetadata,
            }, source);
            await this.enqueueMilestoneForStatus(manager, saved, next);
            return this.toSnapshot(saved);
        });
        await this.publishTrackingStatus(snapshot);
        return snapshot;
    }

    private async enqueueMilestoneForStatus(manager: any, delivery: Delivery, status: DeliveryStatus): Promise<void> {
        const milestones: Partial<Record<DeliveryStatus, DeliveryNotificationMilestone>> = {
            [DeliveryStatus.Preparing]: DeliveryNotificationMilestone.Preparing,
            [DeliveryStatus.InTransit]: DeliveryNotificationMilestone.InTransit,
            [DeliveryStatus.Rejected]: DeliveryNotificationMilestone.Rejected,
            [DeliveryStatus.Delivered]: DeliveryNotificationMilestone.Delivered,
        };
        const milestone = milestones[status];
        if (milestone) await this.notificationService.enqueueMilestone(manager, delivery, milestone);
    }

    private async ensureOwnFulfillment(manager: any, delivery: Delivery): Promise<DeliveryFulfillment> {
        const repository = manager.getRepository(DeliveryFulfillment);
        const own = repository.create({
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            mode: 'OWN',
            provider: null,
            status: 'WAITING_PREPARATION',
            quoteId: null,
            externalDeliveryId: null,
            trackingUrl: null,
            quotedCost: null,
            actualCost: '0.00',
            currency: delivery.currency || 'BRL',
            cycleNumber: 0,
            isCurrent: true,
            startedAt: null,
            assignedAt: null,
            pickedUpAt: null,
            deliveredAt: null,
            failedAt: null,
            canceledAt: null,
            createdBy: null,
            overrideReason: 'OWN_FULFILLMENT_INITIALIZED_ON_PREPARATION',
        });
        const saved = await repository.save(own);
        delivery.currentFulfillmentId = saved.id;
        return saved;
    }

    private async publishTrackingStatus(snapshot: DeliverySnapshot) {
        const eventType = snapshot.status === DeliveryStatus.Delivered
            ? 'delivery.completed.v1'
            : 'delivery.status_changed.v1';
        await this.amqpService.publishDeliveryRealtimeEvent({
            version: 1,
            event_id: randomUUID(),
            type: eventType,
            tenant_id: snapshot.tenant_id,
            aggregate_id: snapshot.id,
            delivery_id: snapshot.id,
            occurred_at: new Date().toISOString(),
            data: {
                status: snapshot.status,
                eta_seconds: snapshot.eta_seconds,
                eta_updated_at: snapshot.updated_at,
            },
        }).catch(() => undefined);
        await this.publishKDSDeliveryRefresh(snapshot);
    }

    /**
     * The generic KDS socket is tenant-scoped. Delivery tracking uses a
     * separate, customer-scoped socket, so it cannot update the operational
     * Delivery board. Broadcast a tiny invalidation event to the KDS hub and
     * let the browser fetch the authoritative delivery snapshot.
     */
    private async publishKDSDeliveryRefresh(snapshot: DeliverySnapshot) {
        const payload = {
            type: 'delivery.updated',
            timestamp: new Date().toISOString(),
            tenant_id: snapshot.tenant_id,
            data: {
                id: snapshot.id,
                tenant_id: snapshot.tenant_id,
                status: snapshot.status,
                version: snapshot.version,
                batch_id: snapshot.batch_id,
            },
        };

        const token = String(process.env.INTERNAL_SERVICE_TOKEN || 'clickgarcom-internal-token').trim()
            || 'clickgarcom-internal-token';
        const baseUrls = [...new Set([
            String(process.env.GO_CORE_BASE_URL || '').trim(),
            'http://go-api:8080',
            'http://localhost:8080',
        ].filter(Boolean))];

        const relay = async () => {
            for (const baseUrl of baseUrls) {
                try {
                    const response = await fetch(`${baseUrl}/internal/kds/events/broadcast`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Internal-Token': token,
                        },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(2000),
                    });
                    if (response.ok) return;
                } catch (_error) {
                    // AMQP below remains the durable fallback for a briefly
                    // unavailable go-api process.
                }
            }
        };

        await Promise.all([
            relay(),
            this.amqpService.publishKDSEvent(payload, 'delivery.updated').catch(() => undefined),
        ]);
    }

    private async appendEvent(
        manager: any,
        delivery: Delivery,
        eventType: DeliveryEventType,
        actor: Actor | null,
        currentStatus: string,
        metadata: Record<string, unknown>,
        source = 'DELIVERY_SERVICE',
    ) {
        const event = manager.getRepository(DeliveryEvent).create({
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            eventType,
            previousStatus: null,
            currentStatus,
            actorType: actor?.type || DeliveryActorType.System,
            actorUserId: actor?.id || null,
            actorName: actor?.name || null,
            source,
            correlationId: randomUUID(),
            metadata,
        });
        await manager.getRepository(DeliveryEvent).save(event);
        await manager.getRepository(DomainOutboxEvent).save(manager.getRepository(DomainOutboxEvent).create({
            eventId: event.id,
            tenantId: delivery.tenantId,
            aggregateType: 'DELIVERY',
            aggregateId: delivery.id,
            eventType,
            payload: {
                version: 1,
                event_id: event.id,
                type: eventType,
                tenant_id: delivery.tenantId,
                aggregate_id: delivery.id,
                correlation_id: event.correlationId,
                occurred_at: event.createdAt?.toISOString() || new Date().toISOString(),
                data: {
                    delivery_id: delivery.id,
                    status: currentStatus,
                    previous_status: metadata.previous_status || null,
                    recipient: delivery.customerPhone || undefined,
                    display_code: delivery.displayCode,
                    mode: metadata.fulfillment_mode || undefined,
                    ...metadata,
                },
            },
            occurredAt: new Date(),
        }));
    }

    private eventTypeFor(status: DeliveryStatus): DeliveryEventType {
        if (status === DeliveryStatus.Accepted) return DeliveryEventType.Accepted;
        if (status === DeliveryStatus.ReadyForDispatch) return DeliveryEventType.ReadyForDispatch;
        if (status === DeliveryStatus.Assigned) return DeliveryEventType.Assigned;
        if (status === DeliveryStatus.PickedUp) return DeliveryEventType.PickedUp;
        if (status === DeliveryStatus.Arrived) return DeliveryEventType.Arrived;
        if (status === DeliveryStatus.Delivered) return DeliveryEventType.Completed;
        if (status === DeliveryStatus.Returned) return DeliveryEventType.Returned;
        if (status === DeliveryStatus.InTransit) return DeliveryEventType.StatusChanged;
        return DeliveryEventType.StatusChanged;
    }

    private applyTimestamp(delivery: Delivery, status: DeliveryStatus) {
        const now = new Date();
        if (status === DeliveryStatus.Accepted) delivery.acceptedAt = now;
        if (status === DeliveryStatus.Preparing) delivery.preparingAt = now;
        if (status === DeliveryStatus.ReadyForDispatch) delivery.readyForDispatchAt = now;
        if (status === DeliveryStatus.Assigned) delivery.assignedAt = now;
        if (status === DeliveryStatus.PickedUp) delivery.pickedUpAt = now;
        if (status === DeliveryStatus.InTransit) delivery.inTransitAt = now;
        if (status === DeliveryStatus.Arrived) delivery.arrivedAt = now;
        if (status === DeliveryStatus.Delivered) delivery.deliveredAt = now;
        if (status === DeliveryStatus.DeliveryFailed) delivery.deliveryFailedAt = now;
        if (status === DeliveryStatus.Returning) delivery.returningAt = now;
        if (status === DeliveryStatus.Returned) delivery.returnedAt = now;
        if (status === DeliveryStatus.Canceled) delivery.canceledAt = now;
    }

    private async generateDisplayCode(tenantId: string): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const code = String(randomInt(100000, 1000000));
            const found = await this.deliveryRepository.findOne({ where: { tenantId, displayCode: code } });
            if (!found) return code;
        }
        throw new ConflictException('Não foi possível gerar o código da entrega.');
    }

    private distanceMeters(originLat: number, originLng: number, destinationLat: number, destinationLng: number): number {
        if (![originLat, originLng, destinationLat, destinationLng].every(Number.isFinite)) return Number.NaN;
        const earthRadius = 6371000;
        const toRadians = (value: number) => value * Math.PI / 180;
        const deltaLat = toRadians(destinationLat - originLat);
        const deltaLng = toRadians(destinationLng - originLng);
        const a = Math.sin(deltaLat / 2) ** 2
            + Math.cos(toRadians(originLat)) * Math.cos(toRadians(destinationLat)) * Math.sin(deltaLng / 2) ** 2;
        return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    private toSnapshot(delivery: Delivery, orders: Order[] = []): DeliverySnapshot {
        return {
            id: delivery.id,
            tenant_id: delivery.tenantId,
            batch_id: delivery.batchId,
            tab_id: delivery.tabId,
            display_code: delivery.displayCode,
            status: delivery.status,
            version: delivery.version,
            service_type: delivery.serviceType,
            customer_name: delivery.customerName,
            customer_id: delivery.customerId,
            customer_address_id: delivery.customerAddressId,
            customer_phone: delivery.customerPhone,
            formatted_address: delivery.formattedAddress,
            postal_code: delivery.postalCode,
            street: delivery.street,
            address_number: delivery.addressNumber,
            address_complement: delivery.addressComplement,
            neighborhood: delivery.neighborhood,
            city: delivery.city,
            state: delivery.state,
            address_reference: delivery.addressReference,
            destination_lat: delivery.destinationLat === null ? null : Number(delivery.destinationLat),
            destination_lng: delivery.destinationLng === null ? null : Number(delivery.destinationLng),
            delivery_fee: Number(delivery.deliveryFee || 0),
            customer_delivery_fee: Number(delivery.customerDeliveryFee ?? delivery.deliveryFee ?? 0),
            default_fulfillment_mode: delivery.defaultFulfillmentModeSnapshot,
            assigned_driver_id: delivery.assignedDriverId,
            eta_seconds: delivery.etaSeconds,
            accepted_at: delivery.acceptedAt,
            ready_for_dispatch_at: delivery.readyForDispatchAt,
            picked_up_at: delivery.pickedUpAt,
            in_transit_at: delivery.inTransitAt,
            arrived_at: delivery.arrivedAt,
            delivered_at: delivery.deliveredAt,
            created_at: delivery.createdAt,
            updated_at: delivery.updatedAt,
            orders: orders.map((order) => ({
                id: order.id,
                batch_id: order.batchId,
                status: order.status,
                items: (order.items || []).map((item) => ({
                    id: item.id,
                    quantity: Number(item.quantity || 0),
                    unit_price: Number(item.unitPrice || 0),
                    item_name_snapshot: item.itemNameSnapshot || null,
                    menu_item_id: item.menuItemId,
                })),
            })),
        };
    }

    private toTimelineEvent(event: DeliveryEvent) {
        const metadata = event.metadata || {};
        const reasonCode = typeof metadata.reason_code === 'string' ? metadata.reason_code : null;
        const reason = typeof metadata.reason === 'string' ? metadata.reason : null;
        return {
            id: event.id,
            type: event.eventType,
            previous_status: event.previousStatus,
            current_status: event.currentStatus,
            actor: {
                type: event.actorType,
                name: event.actorName,
            },
            source: event.source,
            reason_code: reasonCode,
            reason,
            occurred_at: event.createdAt,
        };
    }
}
