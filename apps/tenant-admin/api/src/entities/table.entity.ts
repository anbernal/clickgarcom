import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tables')
export class Table {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'int', default: 4 })
    capacity!: number;

    @Column({ type: 'text', name: 'qr_token', nullable: true })
    qrToken!: string | null;

    @Column({ name: 'qr_expires_at', nullable: true })
    qrExpiresAt!: Date | null;

    @Column({ type: 'varchar', length: 20, default: 'AVAILABLE' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
