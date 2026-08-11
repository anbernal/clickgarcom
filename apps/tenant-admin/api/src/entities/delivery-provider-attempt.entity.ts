import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_provider_attempts')
@Index('idx_delivery_provider_attempts_schedule', ['scheduledAt'])
export class DeliveryProviderAttempt {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'fulfillment_id', type: 'uuid' }) fulfillmentId: string;
    @Column({ name: 'cycle_number', type: 'integer' }) cycleNumber: number;
    @Column({ name: 'attempt_number', type: 'integer' }) attemptNumber: number;
    @Column({ name: 'idempotency_key', type: 'varchar', length: 255 }) idempotencyKey: string;
    @Column({ type: 'varchar', length: 20, default: 'SCHEDULED' }) status: string;
    @Column({ name: 'provider_error_code', type: 'varchar', length: 80, nullable: true }) providerErrorCode: string | null;
    @Column({ type: 'boolean', nullable: true }) retryable: boolean | null;
    @Column({ name: 'request_reference', type: 'varchar', length: 255, nullable: true }) requestReference: string | null;
    @Column({ name: 'response_reference', type: 'varchar', length: 255, nullable: true }) responseReference: string | null;
    @Column({ name: 'scheduled_at', type: 'timestamptz' }) scheduledAt: Date;
    @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
    @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
