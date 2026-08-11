import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_fulfillments')
@Index('idx_delivery_fulfillments_active', ['tenantId', 'status', 'updatedAt'])
export class DeliveryFulfillment {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ type: 'varchar', length: 20 }) mode: string;
    @Column({ type: 'varchar', length: 40, nullable: true }) provider: string | null;
    @Column({ type: 'varchar', length: 40 }) status: string;
    @Column({ name: 'quote_id', type: 'uuid', nullable: true }) quoteId: string | null;
    @Column({ name: 'external_delivery_id', type: 'varchar', length: 255, nullable: true }) externalDeliveryId: string | null;
    @Column({ name: 'tracking_url', type: 'text', nullable: true }) trackingUrl: string | null;
    @Column({ name: 'quoted_cost', type: 'numeric', precision: 10, scale: 2, nullable: true }) quotedCost: string | null;
    @Column({ name: 'actual_cost', type: 'numeric', precision: 10, scale: 2, nullable: true }) actualCost: string | null;
    @Column({ type: 'varchar', length: 3, default: 'BRL' }) currency: string;
    @Column({ name: 'cycle_number', type: 'integer', default: 0 }) cycleNumber: number;
    @Column({ name: 'is_current', type: 'boolean', default: true }) isCurrent: boolean;
    @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
    @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true }) assignedAt: Date | null;
    @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true }) pickedUpAt: Date | null;
    @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
    @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt: Date | null;
    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true }) canceledAt: Date | null;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @Column({ name: 'override_reason', type: 'text', nullable: true }) overrideReason: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
