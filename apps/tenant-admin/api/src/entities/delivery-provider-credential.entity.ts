import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_provider_credentials')
@Index('uq_delivery_provider_credentials_tenant_config', ['tenantId', 'providerConfigId'], { unique: true })
export class DeliveryProviderCredential {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'provider_config_id', type: 'uuid' }) providerConfigId: string;
    @Column({ name: 'encrypted_payload', type: 'bytea' }) encryptedPayload: Buffer;
    @Column({ name: 'key_version', type: 'varchar', length: 80 }) keyVersion: string;
    @Column({ type: 'bytea' }) nonce: Buffer;
    @Column({ name: 'auth_tag', type: 'bytea' }) authTag: Buffer;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true }) rotatedAt: Date | null;
    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
}
