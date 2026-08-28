import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('appointments')
@Index('idx_appointments_tenant_range', ['tenantId', 'startAt', 'status'])
@Index('idx_appointments_customer', ['tenantId', 'customerId', 'startAt'])
export class Appointment {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
    @Column({ name: 'service_id', type: 'uuid', nullable: true }) serviceId: string | null;
    @Column({ name: 'professional_id', type: 'uuid', nullable: true }) professionalId: string | null;
    @Column({ name: 'display_code', type: 'varchar', length: 16 }) displayCode: string;
    @Column({ name: 'customer_name', type: 'varchar', length: 120 }) customerName: string;
    @Column({ name: 'customer_phone', type: 'varchar', length: 20 }) customerPhone: string;
    @Column({ name: 'service_name_snapshot', type: 'varchar', length: 140 }) serviceNameSnapshot: string;
    @Column({ name: 'professional_name_snapshot', type: 'varchar', length: 140, nullable: true }) professionalNameSnapshot: string | null;
    @Column({ name: 'duration_minutes_snapshot', type: 'integer' }) durationMinutesSnapshot: number;
    @Column({ name: 'price_snapshot', type: 'numeric', precision: 12, scale: 2, default: 0 }) priceSnapshot: string;
    @Column({ name: 'confirmation_mode', type: 'varchar', length: 30 }) confirmationMode: string;
    @Column({ type: 'varchar', length: 30, default: 'WEB' }) source: string;
    @Column({ type: 'varchar', length: 40, default: 'CONFIRMED' }) status: string;
    @Column({ name: 'start_at', type: 'timestamptz' }) startAt: Date;
    @Column({ name: 'end_at', type: 'timestamptz' }) endAt: Date;
    @Column({ type: 'varchar', length: 80, default: 'America/Sao_Paulo' }) timezone: string;
    @Column({ type: 'text', nullable: true }) notes: string | null;
    @Column({ name: 'consent_at', type: 'timestamptz', nullable: true }) consentAt: Date | null;
    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true }) canceledAt: Date | null;
    @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
    @Column({ type: 'integer', default: 1 }) version: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
