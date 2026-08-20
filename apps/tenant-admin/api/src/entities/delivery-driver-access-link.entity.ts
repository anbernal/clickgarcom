import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_driver_access_links')
@Index('idx_delivery_driver_access_links_active', ['tokenHash', 'expiresAt'])
export class DeliveryDriverAccessLink {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'driver_profile_id', type: 'uuid' }) driverProfileId: string;
    @Column({ name: 'token_hash', type: 'char', length: 64, unique: true }) tokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
