import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('domain_outbox_events')
@Index('idx_domain_outbox_events_pending', ['nextRetryAt', 'occurredAt'])
@Index('idx_domain_outbox_events_aggregate', ['tenantId', 'aggregateType', 'aggregateId', 'occurredAt'])
export class DomainOutboxEvent {
    @PrimaryGeneratedColumn('uuid') id: string;
    /** Stable public event identity. Relays may retry a row without publishing it twice. */
    @Column({ name: 'event_id', type: 'uuid', unique: true }) eventId: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'aggregate_type', type: 'varchar', length: 80 }) aggregateType: string;
    @Column({ name: 'aggregate_id', type: 'uuid' }) aggregateId: string;
    @Column({ name: 'event_type', type: 'varchar', length: 120 }) eventType: string;
    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) payload: Record<string, unknown>;
    @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'NOW()' }) occurredAt: Date;
    @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
    @Column({ type: 'integer', default: 0 }) attempts: number;
    @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true }) nextRetryAt: Date | null;
    @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
