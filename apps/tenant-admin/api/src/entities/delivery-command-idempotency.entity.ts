import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_command_idempotency')
@Index('idx_delivery_command_idempotency_expiration', ['expiresAt'])
export class DeliveryCommandIdempotency {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid', nullable: true }) deliveryId: string | null;
    @Column({ type: 'varchar', length: 80 }) scope: string;
    @Column({ name: 'idempotency_key', type: 'varchar', length: 255 }) idempotencyKey: string;
    @Column({ name: 'actor_type', type: 'varchar', length: 30 }) actorType: string;
    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
    @Column({ name: 'request_hash', type: 'char', length: 64 }) requestHash: string;
    @Column({ name: 'response_status', type: 'integer', nullable: true }) responseStatus: number | null;
    @Column({ name: 'response_body', type: 'jsonb', nullable: true }) responseBody: Record<string, unknown> | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
}
