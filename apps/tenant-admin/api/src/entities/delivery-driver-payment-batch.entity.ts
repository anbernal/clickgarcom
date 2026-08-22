import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_driver_payment_batches')
@Index('idx_delivery_driver_payment_batches_tenant_paid', ['tenantId', 'paidAt'])
export class DeliveryDriverPaymentBatch {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ name: 'period_start', type: 'date' }) periodStart: string;
    @Column({ name: 'period_end', type: 'date' }) periodEnd: string;
    @Column({ type: 'varchar', length: 20, default: 'PAID' }) status: string;
    @Column({ name: 'delivery_count', type: 'integer' }) deliveryCount: number;
    @Column({ name: 'total_amount', type: 'numeric', precision: 10, scale: 2 }) totalAmount: string;
    @Column({ type: 'varchar', length: 3, default: 'BRL' }) currency: string;
    @Column({ name: 'payment_method', type: 'varchar', length: 20 }) paymentMethod: string;
    @Column({ name: 'payment_reference', type: 'varchar', length: 120, nullable: true }) paymentReference: string | null;
    @Column({ type: 'text', nullable: true }) notes: string | null;
    @Column({ name: 'paid_at', type: 'timestamptz' }) paidAt: Date;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @Column({ name: 'paid_by', type: 'uuid', nullable: true }) paidBy: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
