import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('tabs')
export class Tab {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column('uuid', { name: 'table_id', nullable: true })
    tableId!: string | null;

    @Column({ name: 'user_phone', type: 'varchar', length: 30, nullable: true })
    userPhone!: string | null;

    @Column({ name: 'payment_notifier_phone', type: 'varchar', length: 30, nullable: true })
    paymentNotifierPhone!: string | null;

    @Column('uuid', { name: 'source_request_id', nullable: true })
    sourceRequestId!: string | null;

    @Column('uuid', { name: 'opened_by_user_id', nullable: true })
    openedByUserId!: string | null;

    @Column({ name: 'opened_by_user_name', type: 'varchar', length: 255, nullable: true })
    openedByUserName!: string | null;

    @Column('uuid', { name: 'closed_by_user_id', nullable: true })
    closedByUserId!: string | null;

    @Column({ name: 'closed_by_user_name', type: 'varchar', length: 255, nullable: true })
    closedByUserName!: string | null;

    @Column({ name: 'reopened_at', nullable: true })
    reopenedAt!: Date | null;

    @Column('uuid', { name: 'reopened_by_user_id', nullable: true })
    reopenedByUserId!: string | null;

    @Column({ name: 'reopened_by_user_name', type: 'varchar', length: 255, nullable: true })
    reopenedByUserName!: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    subtotal!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, name: 'service_fee', default: 0 })
    serviceFee!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, name: 'paid_amount', default: 0 })
    paidAmount!: number;

    @Column({ type: 'varchar', length: 20, default: 'OPEN' })
    status!: string;

    @Column({ name: 'service_mode', type: 'varchar', length: 20, default: 'COM_MESA' })
    serviceMode!: 'COM_MESA' | 'SEM_MESA';

    @Column({ name: 'public_code', type: 'varchar', length: 12, nullable: true })
    publicCode!: string | null;

    @Column({ name: 'exit_validated_at', nullable: true })
    exitValidatedAt!: Date | null;

    @Column('uuid', { name: 'exit_validated_by', nullable: true })
    exitValidatedBy!: string | null;

    @Column({ name: 'exit_validation_method', type: 'varchar', length: 30, nullable: true })
    exitValidationMethod!: string | null;

    @Column({ name: 'opened_at' })
    openedAt!: Date;

    @Column({ name: 'closed_at', nullable: true })
    closedAt!: Date | null;
}
