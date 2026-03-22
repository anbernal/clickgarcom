import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_access_audit_logs')
export class UserAccessAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id', type: 'uuid' })
    tenantId: string;

    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
    actorUserId: string | null;

    @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true })
    actorName: string | null;

    @Column({ name: 'actor_role', type: 'varchar', length: 20, nullable: true })
    actorRole: string | null;

    @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
    targetUserId: string | null;

    @Column({ name: 'target_user_name', type: 'varchar', length: 255, nullable: true })
    targetUserName: string | null;

    @Column({ name: 'event_type', type: 'varchar', length: 60 })
    eventType: string;

    @Column({ type: 'text' })
    description: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
