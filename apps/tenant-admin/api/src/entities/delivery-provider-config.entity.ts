import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_provider_configs')
@Index('uq_delivery_provider_configs_tenant_provider', ['tenantId', 'provider', 'environment'], { unique: true })
export class DeliveryProviderConfig {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ type: 'varchar', length: 40 }) provider: string;
    @Column({ type: 'varchar', length: 20, default: 'SANDBOX' }) environment: string;
    @Column({ type: 'boolean', default: false }) enabled: boolean;
    @Column({ type: 'integer', default: 1 }) priority: number;
    @Column({ name: 'external_merchant_id', type: 'varchar', length: 255, nullable: true }) externalMerchantId: string | null;
    @Column({ name: 'credential_ref', type: 'varchar', length: 255, nullable: true }) credentialRef: string | null;
    @Column({ name: 'connection_status', type: 'varchar', length: 30, default: 'NOT_TESTED' }) connectionStatus: string;
    @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true }) lastTestedAt: Date | null;
    @Column({ name: 'last_error_code', type: 'varchar', length: 80, nullable: true }) lastErrorCode: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
