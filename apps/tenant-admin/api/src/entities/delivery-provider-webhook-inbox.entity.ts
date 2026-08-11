import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_provider_webhook_inbox')
@Index('idx_delivery_provider_webhook_pending', ['nextRetryAt', 'receivedAt'])
export class DeliveryProviderWebhookInbox {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
    @Column({ type: 'varchar', length: 40 }) provider: string;
    @Column({ name: 'external_event_id', type: 'varchar', length: 255, nullable: true }) externalEventId: string | null;
    @Column({ name: 'payload_hash', type: 'char', length: 64 }) payloadHash: string;
    @Column({ name: 'signature_valid', type: 'boolean', default: false }) signatureValid: boolean;
    @Column({ name: 'headers_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) headersSnapshot: Record<string, unknown>;
    @Column({ type: 'bytea', nullable: true }) payload: Buffer | null;
    @CreateDateColumn({ name: 'received_at', type: 'timestamptz' }) receivedAt: Date;
    @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt: Date | null;
    @Column({ type: 'integer', default: 0 }) attempts: number;
    @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true }) nextRetryAt: Date | null;
    @Column({ name: 'last_error_code', type: 'varchar', length: 80, nullable: true }) lastErrorCode: string | null;
}
