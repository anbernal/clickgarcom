import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('customers')
@Index('idx_customers_tenant_phone', ['tenantId', 'phoneNormalized'])
@Index('uq_customers_tenant_phone', ['tenantId', 'phoneNormalized'], { unique: true })
export class Customer {
    @PrimaryGeneratedColumn('uuid') id: string;

    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;

    @Column({ name: 'phone_normalized', type: 'varchar', length: 20 }) phoneNormalized: string;

    @Column({ type: 'boolean', default: true }) active: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
