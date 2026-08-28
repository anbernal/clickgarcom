import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('appointment_professionals')
@Index('idx_appointment_professionals_tenant_active', ['tenantId', 'active'])
export class AppointmentProfessional {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ type: 'varchar', length: 140 }) name: string;
    @Column({ name: 'role_label', type: 'varchar', length: 120, nullable: true }) roleLabel: string | null;
    @Column({ name: 'image_url', type: 'text', nullable: true }) imageUrl: string | null;
    @Column({ type: 'varchar', length: 8, nullable: true }) initials: string | null;
    @Column({ type: 'varchar', length: 16, nullable: true }) color: string | null;
    @Column({ name: 'concurrency_limit', type: 'integer', default: 1 }) concurrencyLimit: number;
    @Column({ type: 'boolean', default: true }) active: boolean;
    @Column({ type: 'integer', default: 1 }) version: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
