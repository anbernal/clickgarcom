import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('appointment_services')
@Index('idx_appointment_services_tenant_active', ['tenantId', 'active', 'displayOrder'])
export class AppointmentService {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null;
    @Column({ type: 'varchar', length: 140 }) name: string;
    @Column({ type: 'text', nullable: true }) description: string | null;
    @Column({ name: 'image_url', type: 'text', nullable: true }) imageUrl: string | null;
    @Column({ type: 'varchar', length: 16, nullable: true }) icon: string | null;
    @Column({ type: 'varchar', length: 16, nullable: true }) color: string | null;
    @Column({ name: 'duration_minutes', type: 'integer' }) durationMinutes: number;
    @Column({ name: 'buffer_minutes', type: 'integer', default: 0 }) bufferMinutes: number;
    @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) price: string;
    @Column({ name: 'confirmation_mode', type: 'varchar', length: 30, default: 'AUTO_CONFIRM' }) confirmationMode: string;
    @Column({ name: 'min_notice_minutes', type: 'integer', default: 120 }) minNoticeMinutes: number;
    @Column({ name: 'max_advance_days', type: 'integer', default: 60 }) maxAdvanceDays: number;
    @Column({ name: 'daily_limit', type: 'integer', nullable: true }) dailyLimit: number | null;
    @Column({ type: 'boolean', default: true }) active: boolean;
    @Column({ name: 'display_order', type: 'integer', default: 0 }) displayOrder: number;
    @Column({ type: 'integer', default: 1 }) version: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
