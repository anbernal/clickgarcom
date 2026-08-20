import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_driver_sessions')
@Index('idx_delivery_driver_sessions_active', ['tenantId', 'driverProfileId', 'expiresAt'])
export class DeliveryDriverSession {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ name: 'token_hash', type: 'char', length: 64, unique: true }) tokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
    @Column({ name: 'shift_open', type: 'boolean', default: true }) shiftOpen: boolean;
    @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' }) lastSeenAt: Date;
    @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent: string | null;
    @Column({ name: 'ip_address', type: 'inet', nullable: true }) ipAddress: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
