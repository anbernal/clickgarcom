import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_own_capacity_reservations')
@Index('idx_delivery_own_capacity_expiry', ['expiresAt'])
export class DeliveryOwnCapacityReservation {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'checkout_key', type: 'varchar', length: 255 }) checkoutKey: string;
    @Column({ name: 'delivery_id', type: 'uuid', nullable: true }) deliveryId: string | null;
    @Column({ type: 'varchar', length: 20, default: 'HELD' }) status: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true }) confirmedAt: Date | null;
    @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt: Date | null;
    @Column({ name: 'release_reason', type: 'varchar', length: 80, nullable: true }) releaseReason: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
