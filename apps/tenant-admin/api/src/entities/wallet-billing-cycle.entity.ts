import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wallet_billing_cycles')
export class WalletBillingCycle {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id', type: 'uuid' })
    tenantId: string;

    @Column({ name: 'reference_month', type: 'varchar', length: 7 })
    referenceMonth: string;

    @Column({ name: 'billing_mode', type: 'varchar', length: 20 })
    billingMode: string;

    @Column({ type: 'varchar', length: 30 })
    status: string;

    @Column({ name: 'charged_messages', type: 'int', default: 0 })
    chargedMessages: number;

    @Column({ name: 'charged_amount', type: 'numeric', precision: 10, scale: 2, default: 0 })
    chargedAmount: number;

    @Column({ name: 'received_amount', type: 'numeric', precision: 10, scale: 2, default: 0 })
    receivedAmount: number;

    @Column({ name: 'received_count', type: 'int', default: 0 })
    receivedCount: number;

    @Column({ name: 'amount_covered_by_balance', type: 'numeric', precision: 10, scale: 2, default: 0 })
    amountCoveredByBalance: number;

    @Column({ name: 'outstanding_amount', type: 'numeric', precision: 10, scale: 2, default: 0 })
    outstandingAmount: number;

    @Column({ name: 'opening_balance', type: 'numeric', precision: 10, scale: 2, nullable: true })
    openingBalance: number | null;

    @Column({ name: 'closing_balance', type: 'numeric', precision: 10, scale: 2, nullable: true })
    closingBalance: number | null;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    @Column({ name: 'synced_at', type: 'timestamp', nullable: true })
    syncedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
