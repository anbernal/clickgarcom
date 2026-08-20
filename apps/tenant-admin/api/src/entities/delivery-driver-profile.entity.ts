import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_driver_profiles')
@Index('idx_delivery_driver_profiles_active', ['tenantId', 'active', 'availability'])
export class DeliveryDriverProfile {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ type: 'varchar', length: 120 }) name: string;
    @Column({ name: 'cpf_ciphertext', type: 'bytea' }) cpfCiphertext: Buffer;
    @Column({ name: 'cpf_nonce', type: 'bytea' }) cpfNonce: Buffer;
    @Column({ name: 'cpf_auth_tag', type: 'bytea' }) cpfAuthTag: Buffer;
    @Column({ name: 'cpf_hmac', type: 'char', length: 64 }) cpfHmac: string;
    @Column({ name: 'cpf_last4', type: 'char', length: 4 }) cpfLast4: string;
    @Column({ type: 'varchar', length: 8 }) plate: string;
    @Column({ name: 'pin_hash', type: 'text', nullable: true }) pinHash: string | null;
    @Column({ type: 'varchar', length: 20, nullable: true }) phone: string | null;
    @Column({ name: 'delivery_limit', type: 'integer', default: 1 }) deliveryLimit: number;
    @Column({ type: 'boolean', default: true }) active: boolean;
    @Column({ type: 'varchar', length: 20, default: 'OFFLINE' }) availability: string;
    @Column({ name: 'deactivation_reason', type: 'text', nullable: true }) deactivationReason: string | null;
    @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true }) deactivatedAt: Date | null;
    @Column({ name: 'last_access_at', type: 'timestamptz', nullable: true }) lastAccessAt: Date | null;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @Column({ name: 'updated_by', type: 'uuid', nullable: true }) updatedBy: string | null;
    @Column({ type: 'integer', default: 1 }) version: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
