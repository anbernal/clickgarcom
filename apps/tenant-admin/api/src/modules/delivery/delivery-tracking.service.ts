import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Delivery } from '../../entities/delivery.entity';
import { DeliveryLocationSample } from '../../entities/delivery-location-sample.entity';
import { DeliveryTrackingCredential } from '../../entities/delivery-tracking-credential.entity';
import { DeliveryPinChallenge } from '../../entities/delivery-pin-challenge.entity';

type TrackingCredential = {
    tenantId: string;
    deliveryId: string;
    credentialId: string;
};

@Injectable()
export class DeliveryTrackingService {
    constructor(
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryTrackingCredential) private readonly credentialRepository: Repository<DeliveryTrackingCredential>,
        @InjectRepository(DeliveryLocationSample) private readonly locationRepository: Repository<DeliveryLocationSample>,
        @InjectRepository(DeliveryPinChallenge) private readonly pinChallengeRepository: Repository<DeliveryPinChallenge>,
        private readonly dataSource: DataSource,
    ) { }

    async issueLink(tenantId: string, deliveryId: string, createdBy: string | undefined, ttlHours = 24) {
        const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId, tenantId } });
        if (!delivery) throw new NotFoundException('Entrega não encontrada.');
        if (['DELIVERED', 'CANCELED', 'REJECTED', 'RETURNED'].includes(delivery.status)) {
            throw new ConflictException('Não é possível emitir acompanhamento para uma entrega encerrada.');
        }

        return this.dataSource.transaction((manager) => this.issueLinkInTransaction(manager, tenantId, deliveryId, createdBy, ttlHours));
    }

    async issueLinkInTransaction(
        manager: EntityManager,
        tenantId: string,
        deliveryId: string,
        createdBy: string | undefined,
        ttlHours = 24,
    ) {
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = this.hash(rawToken);
        const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(ttlHours) || 24, 1), 168) * 60 * 60 * 1000);
        await manager.getRepository(DeliveryTrackingCredential).createQueryBuilder()
            .update()
            .set({ revokedAt: new Date() })
            .where('tenant_id = :tenantId AND delivery_id = :deliveryId AND revoked_at IS NULL', { tenantId, deliveryId })
            .execute();
        await manager.getRepository(DeliveryTrackingCredential).save(manager.getRepository(DeliveryTrackingCredential).create({
            tenantId,
            deliveryId,
            tokenHash,
            expiresAt,
            revokedAt: null,
            lastUsedAt: null,
            createdBy: createdBy || null,
        }));

        const base = String(process.env.PUBLIC_WEB_BASE_URL || process.env.PUBLIC_ADMIN_BASE_URL || '').replace(/\/$/, '');
        // Keep the opaque token in the URL fragment so browsers do not send it
        // in the HTTP request line, referrer, access log or proxy metrics.
        const trackingPath = `/tracking.html#token=${encodeURIComponent(rawToken)}`;
        return {
            delivery_id: deliveryId,
            token: rawToken,
            expires_at: expiresAt.toISOString(),
            tracking_api_url: `${base}/admin/api/public/deliveries/track/session`,
            tracking_url: `${base}${trackingPath}` || trackingPath,
        };
    }

    async revoke(tenantId: string, deliveryId: string) {
        const result = await this.credentialRepository.createQueryBuilder()
            .update()
            .set({ revokedAt: new Date() })
            .where('tenant_id = :tenantId AND delivery_id = :deliveryId AND revoked_at IS NULL', { tenantId, deliveryId })
            .execute();
        if (!result.affected) throw new NotFoundException('Acompanhamento não encontrado.');
        return { ok: true };
    }

    async publicSnapshot(rawToken: string) {
        const token = String(rawToken || '').trim();
        if (token.length < 40 || token.length > 100) throw new UnauthorizedException('Link de acompanhamento inválido.');
        const credential = await this.credentialRepository.findOne({ where: { tokenHash: this.hash(token) } });
        if (!credential || credential.revokedAt) throw new UnauthorizedException('Link de acompanhamento inválido.');
        if (credential.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Link de acompanhamento expirado.');

        const delivery = await this.deliveryRepository.findOne({ where: { id: credential.deliveryId, tenantId: credential.tenantId } });
        if (!delivery) throw new NotFoundException('Entrega não encontrada.');
        await this.credentialRepository.update({ id: credential.id }, { lastUsedAt: new Date() });
        const terminal = ['DELIVERED', 'CANCELED', 'REJECTED', 'RETURNED'].includes(delivery.status);
        const latest = terminal ? null : await this.locationRepository.findOne({
            where: { tenantId: credential.tenantId, deliveryId: credential.deliveryId },
            order: { deviceRecordedAt: 'DESC' },
        });
        const activePin = terminal ? null : await this.pinChallengeRepository.createQueryBuilder('challenge')
            .where('challenge.tenant_id = :tenantId AND challenge.delivery_id = :deliveryId', {
                tenantId: credential.tenantId,
                deliveryId: credential.deliveryId,
            })
            .andWhere('challenge.replaced_at IS NULL AND challenge.verified_at IS NULL')
            .andWhere('challenge.expires_at > NOW()')
            .getOne();

        return {
            display_code: delivery.displayCode,
            status: delivery.status,
            version: delivery.version,
            destination: {
                city: delivery.city,
                state: delivery.state,
                lat: delivery.destinationLat === null ? null : Number(delivery.destinationLat),
                lng: delivery.destinationLng === null ? null : Number(delivery.destinationLng),
            },
            tracking_active: !terminal,
            receipt_confirmation_available: Boolean(activePin) && ['IN_TRANSIT', 'ARRIVED'].includes(delivery.status),
            eta_seconds: delivery.etaSeconds,
            eta_updated_at: delivery.etaUpdatedAt,
            driver_location: latest ? {
                lat: Number(latest.lat),
                lng: Number(latest.lng),
                accuracy_m: latest.accuracyM === null ? null : Number(latest.accuracyM),
                speed_mps: latest.speedMps === null ? null : Number(latest.speedMps),
                heading_deg: latest.headingDeg === null ? null : Number(latest.headingDeg),
                recorded_at: latest.deviceRecordedAt,
            } : null,
            updated_at: delivery.updatedAt,
        };
    }

    async authorize(rawToken: string): Promise<TrackingCredential> {
        const token = String(rawToken || '').trim();
        const credential = await this.credentialRepository.findOne({ where: { tokenHash: this.hash(token) } });
        if (!credential || credential.revokedAt || credential.expiresAt.getTime() <= Date.now()) {
            throw new UnauthorizedException('Link de acompanhamento inválido.');
        }
        return { tenantId: credential.tenantId, deliveryId: credential.deliveryId, credentialId: credential.id };
    }

    private hash(token: string) {
        return createHash('sha256').update(token, 'utf8').digest('hex');
    }
}
