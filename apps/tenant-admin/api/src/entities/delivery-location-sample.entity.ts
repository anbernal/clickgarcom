import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery_location_samples')
@Index('idx_delivery_location_samples_delivery_recorded', ['tenantId', 'deliveryId', 'deviceRecordedAt'])
export class DeliveryLocationSample {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
    @Column({ name: 'delivery_id', type: 'uuid' }) deliveryId: string;
    @Column({ name: 'driver_id', type: 'uuid' }) driverId: string;
    @Column({ type: 'numeric', precision: 9, scale: 6 }) lat: string;
    @Column({ type: 'numeric', precision: 9, scale: 6 }) lng: string;
    @Column({ name: 'accuracy_m', type: 'numeric', precision: 8, scale: 2, nullable: true }) accuracyM: string | null;
    @Column({ name: 'speed_mps', type: 'numeric', precision: 8, scale: 2, nullable: true }) speedMps: string | null;
    @Column({ name: 'heading_deg', type: 'numeric', precision: 6, scale: 2, nullable: true }) headingDeg: string | null;
    @Column({ name: 'device_recorded_at', type: 'timestamptz' }) deviceRecordedAt: Date;
    @CreateDateColumn({ name: 'received_at', type: 'timestamptz' }) receivedAt: Date;
    @Column({ name: 'source_event_id', type: 'uuid', unique: true }) sourceEventId: string;
    @Column({ name: 'sample_reason', type: 'varchar', length: 20, default: 'INTERVAL' }) sampleReason: string;
}
