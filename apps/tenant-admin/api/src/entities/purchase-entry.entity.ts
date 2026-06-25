import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export type PurchaseEntryItem = {
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    notes?: string | null;
};

@Entity('purchase_entries')
export class PurchaseEntry {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'varchar', length: 180, name: 'supplier_name' })
    supplierName!: string;

    @Column({ type: 'varchar', length: 40, name: 'supplier_document', nullable: true })
    supplierDocument!: string | null;

    @Column({ type: 'varchar', length: 80, name: 'invoice_number', nullable: true })
    invoiceNumber!: string | null;

    @Column({ type: 'date', name: 'purchase_date' })
    purchaseDate!: string;

    @Column({ type: 'jsonb' })
    items!: PurchaseEntryItem[];

    @Column({ type: 'decimal', precision: 12, scale: 2, name: 'total_amount' })
    totalAmount!: number;

    @Column({ type: 'text', nullable: true })
    notes!: string | null;

    @Column({ type: 'uuid', name: 'created_by_user_id', nullable: true })
    createdByUserId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'created_by_user_name', nullable: true })
    createdByUserName!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
