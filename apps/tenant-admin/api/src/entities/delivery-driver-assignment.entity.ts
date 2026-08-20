import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_driver_assignments')
@Index('idx_delivery_driver_assignments_driver_queue', ['tenantId', 'driverProfileId', 'status', 'position'])
export class DeliveryDriverAssignment {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ type: 'integer', default: 1 }) position: number;
    @Column({ type: 'varchar', length: 20, default: 'ACTIVE' }) status: string;
    @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' }) assignedAt: Date;
    @Column({ name: 'unassigned_at', type: 'timestamptz', nullable: true }) unassignedAt: Date | null;
    @Column({ name: 'assigned_by', type: 'uuid', nullable: true }) assignedBy: string | null;
    @Column({ type: 'text', nullable: true }) reason: string | null;
    @Column({ type: 'integer', default: 1 }) version: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
