import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('customer_addresses')
@Index('idx_customer_addresses_active', ['tenantId', 'customerId', 'lastUsedAt'])
export class CustomerAddress {
    @PrimaryGeneratedColumn('uuid') id: string;

    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
    @Column({ type: 'varchar', length: 80 }) label: string;
    @Column({ name: 'postal_code', type: 'varchar', length: 8 }) postalCode: string;
    @Column({ type: 'varchar', length: 255 }) street: string;
    @Column({ name: 'address_number', type: 'varchar', length: 30 }) addressNumber: string;
    @Column({ name: 'address_complement', type: 'varchar', length: 255, nullable: true }) addressComplement: string | null;
    @Column({ type: 'varchar', length: 255 }) neighborhood: string;
    @Column({ type: 'varchar', length: 255 }) city: string;
    @Column({ type: 'varchar', length: 2 }) state: string;
    @Column({ name: 'address_reference', type: 'text', nullable: true }) addressReference: string | null;
    @Column({ name: 'formatted_address', type: 'text' }) formattedAddress: string;
    @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) latitude: string | null;
    @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) longitude: string | null;
    @Column({ name: 'postal_code_provider', type: 'varchar', length: 80, nullable: true }) postalCodeProvider: string | null;
    @Column({ name: 'postal_code_provider_ref', type: 'varchar', length: 255, nullable: true }) postalCodeProviderRef: string | null;
    @Column({ name: 'postal_code_lookup_status', type: 'varchar', length: 30, nullable: true }) postalCodeLookupStatus: string | null;
    @Column({ name: 'geocode_provider', type: 'varchar', length: 80, nullable: true }) geocodeProvider: string | null;
    @Column({ name: 'geocode_provider_id', type: 'varchar', length: 255, nullable: true }) geocodeProviderId: string | null;
    @Column({ name: 'geocode_quality', type: 'varchar', length: 30, nullable: true }) geocodeQuality: string | null;
    @Column({ name: 'confirmed_at', type: 'timestamptz' }) confirmedAt: Date;
    @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
    @Column({ name: 'is_default', type: 'boolean', default: false }) isDefault: boolean;
    @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
