import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_quotes')
@Index('idx_delivery_quotes_checkout', ['tenantId', 'checkoutKey', 'createdAt'])
@Index('idx_delivery_quotes_expiry', ['expiresAt'])
export class DeliveryQuote {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'checkout_key', type: 'varchar', length: 255 }) checkoutKey: string;
    @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
    @Column({ name: 'customer_address_id', type: 'uuid' }) customerAddressId: string;
    @Column({ name: 'delivery_id', type: 'uuid', nullable: true }) deliveryId: string | null;
    @Column({ type: 'varchar', length: 40 }) provider: string;
    @Column({ name: 'external_quote_id', type: 'varchar', length: 255, nullable: true }) externalQuoteId: string | null;
    @Column({ type: 'varchar', length: 20, default: 'VALID' }) status: string;
    @Column({ name: 'quoted_cost', type: 'numeric', precision: 10, scale: 2 }) quotedCost: string;
    @Column({ name: 'customer_delivery_fee', type: 'numeric', precision: 10, scale: 2 }) customerDeliveryFee: string;
    @Column({ type: 'varchar', length: 3, default: 'BRL' }) currency: string;
    @Column({ name: 'distance_meters', type: 'integer', nullable: true }) distanceMeters: number | null;
    @Column({ name: 'estimated_minutes', type: 'integer', nullable: true }) estimatedMinutes: number | null;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'request_hash', type: 'char', length: 64, nullable: true }) requestHash: string | null;
    @Column({ name: 'provider_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) providerSnapshot: Record<string, unknown>;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
}
