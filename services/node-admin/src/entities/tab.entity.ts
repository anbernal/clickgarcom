import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('tabs')
export class Tab {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column('uuid', { name: 'table_id', nullable: true })
    tableId!: string | null;

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

    @Column({ name: 'opened_at' })
    openedAt!: Date;

    @Column({ name: 'closed_at', nullable: true })
    closedAt!: Date | null;
}
