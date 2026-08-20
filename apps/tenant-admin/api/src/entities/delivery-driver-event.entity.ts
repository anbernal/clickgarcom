import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_driver_events')
@Index('idx_delivery_driver_events_driver_created', ['tenantId', 'driverProfileId', 'createdAt'])
export class DeliveryDriverEvent {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ name: 'delivery_id', type: 'uuid', nullable: true }) deliveryId: string | null;
    @Column({ name: 'event_type', type: 'varchar', length: 60 }) eventType: string;
    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, unknown>;
    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
