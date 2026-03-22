import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity('menu_items')
export class MenuItem {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column('uuid', { name: 'category_id', nullable: true })
    categoryId!: string | null;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price!: number;

    @Column({ type: 'text', name: 'image_url', nullable: true })
    imageUrl!: string | null;

    @Column({ type: 'varchar', length: 80, name: 'whatsapp_short_name', nullable: true })
    whatsappShortName!: string | null;

    @Column({ type: 'varchar', length: 160, name: 'whatsapp_short_description', nullable: true })
    whatsappShortDescription!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'KITCHEN' })
    destination!: string;

    @Column({ type: 'int', name: 'prep_time_minutes', default: 15 })
    prepTimeMinutes!: number;

    @Column({ type: 'boolean', default: true })
    available!: boolean;

    @Column({ type: 'int', name: 'display_order', default: 0 })
    displayOrder!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => MenuCategory, { nullable: true, eager: false })
    @JoinColumn({ name: 'category_id' })
    category?: MenuCategory;
}
