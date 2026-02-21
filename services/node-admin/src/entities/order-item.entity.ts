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

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => Order, (order) => order.items)
    @JoinColumn({ name: 'order_id' })
    order!: Order;
}
