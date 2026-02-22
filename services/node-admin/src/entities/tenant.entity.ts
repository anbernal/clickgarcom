import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class Tenant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    slug: string;

    @Column({ name: 'whatsapp_number', type: 'varchar', length: 20, unique: true })
    whatsappNumber: string;

    @Column({ type: 'simple-json', nullable: true })
    settings: Record<string, any>;

    @Column({ default: true })
    active: boolean;

    @Column({ name: 'is_open', default: false })
    isOpen: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
