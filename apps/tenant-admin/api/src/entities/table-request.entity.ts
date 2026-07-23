import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Table } from './table.entity';

export enum RequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED'
}

@Entity('table_requests')
export class TableRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id', type: 'uuid' })
    tenantId: string;

    @Column({ name: 'table_id', type: 'uuid', nullable: true })
    tableId: string | null;

    @Column({ name: 'user_phone' })
    userPhone: string;

    @Column({ name: 'pax_count' })
    paxCount: number;

    @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
    approvedByUserId: string | null;

    @Column({ name: 'approved_by_user_name', nullable: true })
    approvedByUserName: string | null;

    @Column({
        type: 'varchar',
        default: RequestStatus.PENDING,
    })
    status: RequestStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Table)
    @JoinColumn({ name: 'table_id' })
    table: Table;
}
