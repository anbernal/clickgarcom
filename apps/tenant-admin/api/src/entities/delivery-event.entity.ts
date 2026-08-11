import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_events')
@Index('idx_delivery_events_delivery_created', ['tenantId', 'deliveryId', 'createdAt'])
export class DeliveryEvent {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'event_type', type: 'varchar', length: 80 }) eventType: string;
    @Column({ name: 'previous_status', type: 'varchar', length: 40, nullable: true }) previousStatus: string | null;
    @Column({ name: 'current_status', type: 'varchar', length: 40, nullable: true }) currentStatus: string | null;
    @Column({ name: 'actor_type', type: 'varchar', length: 30 }) actorType: string;
    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
    @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true }) actorName: string | null;
    @Column({ type: 'varchar', length: 30 }) source: string;
    @Column({ name: 'correlation_id', type: 'uuid', nullable: true }) correlationId: string | null;
    @Column({ name: 'idempotency_key', type: 'varchar', length: 255, nullable: true }) idempotencyKey: string | null;
    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, unknown>;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
