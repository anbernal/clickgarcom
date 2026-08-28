import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('appointment_automation_versions')
export class AppointmentAutomationVersion {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ type: 'varchar', length: 20, default: 'DRAFT' }) status: string;
    @Column({ type: 'integer' }) version: number;
    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) definition: Record<string, unknown>;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
