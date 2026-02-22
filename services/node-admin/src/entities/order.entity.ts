import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    OneToMany,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column('uuid', { name: 'tab_id' })
    tabId!: string;

    @Column({ type: 'varchar', length: 20 })
    destination!: string;

    @Column({ type: 'varchar', length: 20 })
    status!: string;

    @Column({ type: 'text', nullable: true })
    notes!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

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

    @OneToMany(() => OrderItem, (item) => item.order, { eager: true })
    items!: OrderItem[];
}
