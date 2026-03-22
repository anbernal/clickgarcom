import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('message_logs')
export class MessageLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id', type: 'uuid' })
    tenantId: string;

    @Column({ type: 'varchar', length: 10 })
    direction: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    status: string | null;

    @Column({ name: 'message_id', type: 'varchar', length: 255, nullable: true })
    messageId: string | null;

    @Column({ name: 'user_phone', type: 'varchar', length: 30, nullable: true })
    userPhone: string | null;

    @Column({ name: 'message_preview', type: 'varchar', length: 255, nullable: true })
    messagePreview: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
