import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'order_id' })
    orderId!: string;

    @Column('uuid', { name: 'menu_item_id' })
    menuItemId!: string;

    @Column({ type: 'int' })
    quantity!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_price' })
    unitPrice!: number;

    @Column({ type: 'text', nullable: true })
    observations!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'item_name_snapshot', nullable: true })
    itemNameSnapshot!: string | null;

    @Column({ type: 'int', name: 'voided_quantity', default: 0 })
    voidedQuantity!: number;

    @Column({ type: 'text', name: 'voided_reason', nullable: true })
    voidedReason!: string | null;

    @Column({ name: 'voided_at', nullable: true })
    voidedAt!: Date | null;

    @Column('uuid', { name: 'voided_by_user_id', nullable: true })
    voidedByUserId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'voided_by_user_name', nullable: true })
    voidedByUserName!: string | null;

    @Column({ type: 'jsonb', name: 'selected_options', nullable: true })
    selectedOptions!: Array<{ groupName: string; optionName: string; priceDelta: number }> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => Order, (order) => order.items)
    @JoinColumn({ name: 'order_id' })
    order!: Order;
}
