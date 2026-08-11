import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('deliveries')
@Index('idx_deliveries_tenant_status_created', ['tenantId', 'status', 'createdAt'])
@Index('idx_deliveries_updated_at', ['updatedAt'])
export class Delivery {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id', type: 'uuid' })
    tenantId: string;

    @Column({ name: 'tab_id', type: 'uuid' })
    tabId: string;

    @Column({ name: 'batch_id', type: 'uuid' })
    batchId: string;

    @Column({ name: 'display_code', type: 'varchar', length: 20 })
    displayCode: string;

    @Column({ name: 'service_type', type: 'varchar', length: 20, default: 'DELIVERY' })
    serviceType: string;

    @Column({ type: 'varchar', length: 40, default: 'PENDING_RESTAURANT_ACCEPTANCE' })
    status: string;

    @Column({ type: 'integer', default: 1 })
    version: number;

    @Column({ name: 'customer_name', type: 'varchar', length: 255, nullable: true })
    customerName: string | null;

    @Column({ name: 'customer_phone', type: 'varchar', length: 30, nullable: true })
    customerPhone: string | null;

    @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
    postalCode: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    street: string | null;

    @Column({ name: 'address_number', type: 'varchar', length: 30, nullable: true })
    addressNumber: string | null;

    @Column({ name: 'address_complement', type: 'varchar', length: 255, nullable: true })
    addressComplement: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    neighborhood: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    city: string | null;

    @Column({ type: 'varchar', length: 2, nullable: true })
    state: string | null;

    @Column({ name: 'address_reference', type: 'text', nullable: true })
    addressReference: string | null;

    @Column({ name: 'formatted_address', type: 'text', nullable: true })
    formattedAddress: string | null;

    @Column({ name: 'address_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
    addressSnapshot: Record<string, unknown>;

    @Column({ name: 'customer_id', type: 'uuid', nullable: true })
    customerId: string | null;

    @Column({ name: 'customer_address_id', type: 'uuid', nullable: true })
    customerAddressId: string | null;

    @Column({ name: 'default_fulfillment_mode_snapshot', type: 'varchar', length: 20, nullable: true })
    defaultFulfillmentModeSnapshot: string | null;

    @Column({ name: 'current_fulfillment_id', type: 'uuid', nullable: true })
    currentFulfillmentId: string | null;

    @Column({ name: 'customer_delivery_fee', type: 'numeric', precision: 10, scale: 2, nullable: true })
    customerDeliveryFee: string | null;

    @Column({ name: 'provider_quoted_cost', type: 'numeric', precision: 10, scale: 2, nullable: true })
    providerQuotedCost: string | null;

    @Column({ name: 'provider_actual_cost', type: 'numeric', precision: 10, scale: 2, nullable: true })
    providerActualCost: string | null;

    @Column({ name: 'restaurant_adjustment', type: 'numeric', precision: 10, scale: 2, nullable: true })
    restaurantAdjustment: string | null;

    @Column({ type: 'varchar', length: 3, default: 'BRL' })
    currency: string;

    @Column({ name: 'no_courier_at', type: 'timestamptz', nullable: true })
    noCourierAt: Date | null;

    @Column({ name: 'fulfillment_override_at', type: 'timestamptz', nullable: true })
    fulfillmentOverrideAt: Date | null;

    @Column({ name: 'fulfillment_override_by', type: 'uuid', nullable: true })
    fulfillmentOverrideBy: string | null;

    @Column({ name: 'fulfillment_override_reason', type: 'text', nullable: true })
    fulfillmentOverrideReason: string | null;

    @Column({ name: 'destination_lat', type: 'numeric', precision: 9, scale: 6, nullable: true })
    destinationLat: string | null;

    @Column({ name: 'destination_lng', type: 'numeric', precision: 9, scale: 6, nullable: true })
    destinationLng: string | null;

    @Column({ name: 'geocode_provider', type: 'varchar', length: 40, nullable: true })
    geocodeProvider: string | null;

    @Column({ name: 'geocode_provider_id', type: 'varchar', length: 255, nullable: true })
    geocodeProviderId: string | null;

    @Column({ name: 'geocode_quality', type: 'varchar', length: 30, nullable: true })
    geocodeQuality: string | null;

    @Column({ name: 'origin_lat', type: 'numeric', precision: 9, scale: 6, nullable: true })
    originLat: string | null;

    @Column({ name: 'origin_lng', type: 'numeric', precision: 9, scale: 6, nullable: true })
    originLng: string | null;

    @Column({ name: 'distance_meters', type: 'integer', nullable: true })
    distanceMeters: number | null;

    @Column({ name: 'delivery_fee', type: 'numeric', precision: 10, scale: 2, default: 0 })
    deliveryFee: string;

    @Column({ name: 'fee_rule_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
    feeRuleSnapshot: Record<string, unknown>;

    @Column({ name: 'policy_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
    policySnapshot: Record<string, unknown>;

    @Column({ name: 'acceptance_mode', type: 'varchar', length: 20, nullable: true })
    acceptanceMode: string | null;

    @Column({ name: 'assigned_driver_id', type: 'uuid', nullable: true })
    assignedDriverId: string | null;

    @Column({ name: 'eta_seconds', type: 'integer', nullable: true })
    etaSeconds: number | null;

    @Column({ name: 'eta_updated_at', type: 'timestamptz', nullable: true })
    etaUpdatedAt: Date | null;

    @Column({ name: 'route_polyline', type: 'text', nullable: true })
    routePolyline: string | null;

    @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt: Date | null;
    @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true }) rejectedAt: Date | null;
    @Column({ name: 'preparing_at', type: 'timestamptz', nullable: true }) preparingAt: Date | null;
    @Column({ name: 'ready_for_dispatch_at', type: 'timestamptz', nullable: true }) readyForDispatchAt: Date | null;
    @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true }) assignedAt: Date | null;
    @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true }) pickedUpAt: Date | null;
    @Column({ name: 'in_transit_at', type: 'timestamptz', nullable: true }) inTransitAt: Date | null;
    @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true }) arrivedAt: Date | null;
    @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
    @Column({ name: 'delivery_failed_at', type: 'timestamptz', nullable: true }) deliveryFailedAt: Date | null;
    @Column({ name: 'returning_at', type: 'timestamptz', nullable: true }) returningAt: Date | null;
    @Column({ name: 'returned_at', type: 'timestamptz', nullable: true }) returnedAt: Date | null;
    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true }) canceledAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
