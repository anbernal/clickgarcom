import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum BotFlowDefinitionStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

@Entity('bot_flow_definitions')
export class BotFlowDefinition {
    @PrimaryColumn('uuid')
    id!: string;

    @Column('uuid', { name: 'tenant_id' })
    tenantId!: string;

    @Column({ name: 'flow_key', type: 'varchar', length: 100 })
    key!: string;

    @Column({ type: 'varchar', length: 30, default: 'whatsapp' })
    channel!: string;

    @Column({
        type: 'varchar',
        length: 20,
        default: BotFlowDefinitionStatus.DRAFT,
    })
    status!: BotFlowDefinitionStatus;

    @Column({ type: 'int' })
    version!: number;

    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
    definition!: Record<string, any>;

    @Column('uuid', { name: 'created_by', nullable: true })
    createdBy!: string | null;

    @Column('uuid', { name: 'updated_by', nullable: true })
    updatedBy!: string | null;

    @Column({ name: 'published_at', nullable: true })
    publishedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
