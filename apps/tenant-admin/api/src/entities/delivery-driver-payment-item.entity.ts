import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_driver_payment_items')
@Index('idx_delivery_driver_payment_items_batch', ['tenantId', 'batchId'])
export class DeliveryDriverPaymentItem {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'batch_id', type: 'uuid' }) batchId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ name: 'delivery_code', type: 'varchar', length: 20 }) deliveryCode: string;
    @Column({ name: 'delivered_at', type: 'timestamptz' }) deliveredAt: Date;
    @Column({ name: 'amount', type: 'numeric', precision: 10, scale: 2 }) amount: string;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
