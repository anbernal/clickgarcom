import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_pin_challenges')
@Index('idx_delivery_pin_challenges_expiration', ['expiresAt'])
export class DeliveryPinChallenge {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'pin_digest', type: 'varchar', length: 128 }) pinDigest: string;
    @Column({ name: 'secret_version', type: 'varchar', length: 32 }) secretVersion: string;
    @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount: number;
    @Column({ name: 'max_attempts', type: 'integer', default: 5 }) maxAttempts: number;
    @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil: Date | null;
    @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' }) issuedAt: Date;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
    @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true }) lastAttemptAt: Date | null;
    @Column({ name: 'replaced_at', type: 'timestamptz', nullable: true }) replacedAt: Date | null;
}
