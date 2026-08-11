import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_tracking_credentials')
@Index('idx_delivery_tracking_credentials_active_hash', ['tokenHash'])
export class DeliveryTrackingCredential {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'token_hash', type: 'char', length: 64, unique: true }) tokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
    @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
}
