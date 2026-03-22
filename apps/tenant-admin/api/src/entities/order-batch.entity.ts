import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('order_batches')
export class OrderBatch {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column('uuid', { name: 'tab_id' })
    tabId!: string;

    @Column({ type: 'varchar', length: 30, name: 'customer_phone', nullable: true })
    customerPhone!: string | null;

    @Column({ type: 'varchar', length: 20 })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @Column({ name: 'accepted_at', nullable: true })
    acceptedAt!: Date | null;

    @Column({ name: 'ready_at', nullable: true })
    readyAt!: Date | null;

    @Column({ name: 'delivered_at', nullable: true })
    deliveredAt!: Date | null;

    @Column({ name: 'canceled_at', nullable: true })
    canceledAt!: Date | null;

    @Column({ type: 'text', name: 'cancel_reason', nullable: true })
    cancelReason!: string | null;

    @Column({ type: 'varchar', length: 60, name: 'cancel_reason_code', nullable: true })
    cancelReasonCode!: string | null;

    @Column({ type: 'varchar', length: 20, name: 'cancel_category', nullable: true })
    cancelCategory!: string | null;

    @Column('uuid', { name: 'canceled_by_user_id', nullable: true })
    canceledByUserId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'canceled_by_user_name', nullable: true })
    canceledByUserName!: string | null;
}
