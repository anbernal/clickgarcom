import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_checkouts')
@Index('idx_delivery_checkouts_expiry', ['expiresAt'])
@Index('idx_delivery_checkouts_tenant_status', ['tenantId', 'status', 'createdAt'])
export class DeliveryCheckout {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'checkout_key', type: 'varchar', length: 255 }) checkoutKey: string;
    @Column({ name: 'fulfillment_mode', type: 'varchar', length: 20 }) fulfillmentMode: string;
    @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
    @Column({ name: 'customer_address_id', type: 'uuid' }) customerAddressId: string;
    @Column({ name: 'order_batch_id', type: 'uuid', nullable: true }) orderBatchId: string | null;
    @Column({ name: 'quote_id', type: 'uuid', nullable: true }) quoteId: string | null;
    @Column({ name: 'order_total', type: 'numeric', precision: 10, scale: 2 }) orderTotal: string;
    @Column({ name: 'customer_delivery_fee', type: 'numeric', precision: 10, scale: 2 }) customerDeliveryFee: string;
    @Column({ name: 'total_amount', type: 'numeric', precision: 10, scale: 2 }) totalAmount: string;
    @Column({ type: 'varchar', length: 3, default: 'BRL' }) currency: string;
    @Column({ type: 'varchar', length: 30, default: 'PENDING_PAYMENT' }) status: string;
    @Column({ name: 'confirmation_token_hash', type: 'char', length: 64 }) confirmationTokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'payment_reference', type: 'varchar', length: 255, nullable: true }) paymentReference: string | null;
    @Column({ name: 'delivery_id', type: 'uuid', nullable: true }) deliveryId: string | null;
    @Column({ name: 'address_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) addressSnapshot: Record<string, unknown>;
    @Column({ name: 'financial_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) financialSnapshot: Record<string, unknown>;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
