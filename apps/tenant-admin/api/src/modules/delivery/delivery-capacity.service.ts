import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { DeliveryOwnCapacityReservation } from '../../entities/delivery-own-capacity-reservation.entity';
import { Tenant } from '../../entities/tenant.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';

type ReservationStatus = 'HELD' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';

@Injectable()
export class DeliveryCapacityService {
    private readonly holdMinutes = 15;

    constructor(
        @InjectRepository(DeliveryOwnCapacityReservation)
        private readonly reservations: Repository<DeliveryOwnCapacityReservation>,
        @InjectRepository(Tenant)
        private readonly tenants: Repository<Tenant>,
        private readonly dataSource: DataSource,
    ) { }

    async summary(tenantId: string) {
        const tenant = await this.requireTenant(tenantId);
        const capacity = this.capacityFromTenant(tenant);
        await this.expire(tenantId, new Date());
        const reserved = await this.reservations.count({ where: [
            { tenantId, status: 'HELD' },
            { tenantId, status: 'CONFIRMED' },
        ] });
        return {
            tenant_id: tenantId,
            declared_capacity: capacity,
            reserved,
            available: Math.max(0, capacity - reserved),
            hold_minutes: this.holdMinutes,
        };
    }

    async listReservations(tenantId: string, includeHistory = false) {
        const tenant = await this.requireTenant(tenantId);
        await this.expire(tenantId, new Date());
        const query = this.reservations.createQueryBuilder('reservation')
            .where('reservation.tenant_id = :tenantId', { tenantId })
            .orderBy('reservation.created_at', 'DESC')
            .take(100);
        if (!includeHistory) query.andWhere('reservation.status IN (:...statuses)', { statuses: ['HELD', 'CONFIRMED'] });
        const rows = await query.getMany();
        const capacity = this.capacityFromTenant(tenant);
        return {
            tenant_id: tenantId,
            declared_capacity: capacity,
            reservations: rows.map((row) => ({
                id: row.id,
                delivery_id: row.deliveryId,
                status: row.status,
                expires_at: row.expiresAt,
                confirmed_at: row.confirmedAt,
                released_at: row.releasedAt,
                release_reason: row.releaseReason,
            })),
        };
    }

    async hold(tenantId: string, checkoutKey: string) {
        const normalizedKey = this.key(checkoutKey);
        return this.dataSource.transaction(async (manager) => {
            const tenant = await manager.getRepository(Tenant).createQueryBuilder('tenant')
                .where('tenant.id = :tenantId', { tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!tenant) throw new NotFoundException('Restaurante não encontrado.');
            const capacity = this.capacityFromTenant(tenant);
            const repository = manager.getRepository(DeliveryOwnCapacityReservation);
            const now = new Date();
            await repository.createQueryBuilder()
                .update(DeliveryOwnCapacityReservation)
                .set({ status: 'EXPIRED', releasedAt: now, releaseReason: 'HOLD_EXPIRED' })
                .where('tenant_id = :tenantId AND status = :status AND expires_at <= :now', { tenantId, status: 'HELD', now })
                .execute();

            let reservation = await repository.createQueryBuilder('reservation')
                .where('reservation.tenant_id = :tenantId AND reservation.checkout_key = :checkoutKey', { tenantId, checkoutKey: normalizedKey })
                .setLock('pessimistic_write')
                .getOne();
            if (reservation && ['HELD', 'CONFIRMED'].includes(reservation.status) && (!reservation.expiresAt || reservation.expiresAt > now)) {
                return this.view(reservation, capacity);
            }

            const active = await repository.count({ where: [
                { tenantId, status: 'HELD' },
                { tenantId, status: 'CONFIRMED' },
            ] });
            if (active >= capacity) throw new ConflictException('Não há capacidade própria disponível para este checkout.');

            const expiresAt = new Date(now.getTime() + this.holdMinutes * 60 * 1000);
            if (!reservation) {
                reservation = repository.create({
                    tenantId,
                    checkoutKey: normalizedKey,
                    deliveryId: null,
                    status: 'HELD',
                    expiresAt,
                    confirmedAt: null,
                    releasedAt: null,
                    releaseReason: null,
                });
            } else {
                reservation.status = 'HELD';
                reservation.expiresAt = expiresAt;
                reservation.confirmedAt = null;
                reservation.releasedAt = null;
                reservation.releaseReason = null;
                reservation.deliveryId = null;
            }
            const saved = await repository.save(reservation);
            await this.audit(manager, tenantId, 'DELIVERY_CAPACITY_HELD', { reservation_id: saved.id, status: saved.status });
            return this.view(saved, capacity);
        });
    }

    async confirm(tenantId: string, checkoutKey: string, deliveryId?: string) {
        const normalizedKey = this.key(checkoutKey);
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryOwnCapacityReservation);
            const reservation = await repository.createQueryBuilder('reservation')
                .where('reservation.tenant_id = :tenantId AND reservation.checkout_key = :checkoutKey', { tenantId, checkoutKey: normalizedKey })
                .setLock('pessimistic_write')
                .getOne();
            if (!reservation) throw new NotFoundException('Hold de capacidade não encontrado.');
            if (reservation.status === 'CONFIRMED') {
                if (deliveryId && reservation.deliveryId && reservation.deliveryId !== deliveryId) throw new ConflictException('Hold já está vinculado a outro Delivery.');
                return this.view(reservation, this.capacityFromTenant(await this.requireTenant(tenantId)));
            }
            if (reservation.status !== 'HELD') throw new ConflictException('O hold de capacidade não está mais ativo.');
            if (reservation.expiresAt <= new Date()) {
                reservation.status = 'EXPIRED';
                reservation.releasedAt = new Date();
                reservation.releaseReason = 'HOLD_EXPIRED';
                await repository.save(reservation);
                throw new ConflictException('O hold de capacidade expirou.');
            }
            reservation.status = 'CONFIRMED';
            reservation.confirmedAt = new Date();
            reservation.deliveryId = deliveryId || null;
            const saved = await repository.save(reservation);
            await this.audit(manager, tenantId, 'DELIVERY_CAPACITY_CONFIRMED', { reservation_id: saved.id, delivery_id: deliveryId || null });
            return this.view(saved, this.capacityFromTenant(await this.requireTenant(tenantId)));
        });
    }

    async release(tenantId: string, checkoutKey: string, reason = 'CHECKOUT_RELEASED') {
        const normalizedKey = this.key(checkoutKey);
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryOwnCapacityReservation);
            const reservation = await repository.createQueryBuilder('reservation')
                .where('reservation.tenant_id = :tenantId AND reservation.checkout_key = :checkoutKey', { tenantId, checkoutKey: normalizedKey })
                .setLock('pessimistic_write')
                .getOne();
            if (!reservation) throw new NotFoundException('Hold de capacidade não encontrado.');
            if (['RELEASED', 'EXPIRED'].includes(reservation.status)) return this.view(reservation, this.capacityFromTenant(await this.requireTenant(tenantId)));
            reservation.status = 'RELEASED';
            reservation.releasedAt = new Date();
            reservation.releaseReason = String(reason || 'CHECKOUT_RELEASED').slice(0, 80);
            const saved = await repository.save(reservation);
            await this.audit(manager, tenantId, 'DELIVERY_CAPACITY_RELEASED', { reservation_id: saved.id, reason: saved.releaseReason });
            return this.view(saved, this.capacityFromTenant(await this.requireTenant(tenantId)));
        });
    }

    /**
     * Releases the reservation linked to a Delivery. Own-operation completion
     * only knows the delivery id (the checkout key is intentionally opaque),
     * so the lookup and transition live in the capacity service. Repeating the
     * call is safe and returns the already released/expired reservation.
     */
    async releaseForDelivery(tenantId: string, deliveryId: string, reason = 'DELIVERY_COMPLETED') {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryOwnCapacityReservation);
            const reservation = await repository.createQueryBuilder('reservation')
                .where('reservation.tenant_id = :tenantId AND reservation.delivery_id = :deliveryId', { tenantId, deliveryId })
                .setLock('pessimistic_write')
                .getOne();
            if (!reservation) return null;
            if (!['RELEASED', 'EXPIRED'].includes(reservation.status)) {
                reservation.status = 'RELEASED';
                reservation.releasedAt = new Date();
                reservation.releaseReason = String(reason || 'DELIVERY_COMPLETED').slice(0, 80);
                const saved = await repository.save(reservation);
                await this.audit(manager, tenantId, 'DELIVERY_CAPACITY_RELEASED', { reservation_id: saved.id, delivery_id: deliveryId, reason: saved.releaseReason });
            }
            return this.view(reservation, this.capacityFromTenant(await this.requireTenant(tenantId)));
        });
    }

    async expire(tenantId?: string, now = new Date()) {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryOwnCapacityReservation);
            const grouped = await repository.createQueryBuilder('reservation')
                .select('reservation.tenant_id', 'tenant_id')
                .addSelect('COUNT(*)', 'count')
                .where('reservation.status = :status AND reservation.expires_at <= :now', { status: 'HELD', now })
                .groupBy('reservation.tenant_id')
                .getRawMany<{ tenant_id: string; count: string }>();
            const query = repository.createQueryBuilder()
                .update(DeliveryOwnCapacityReservation)
                .set({ status: 'EXPIRED', releasedAt: now, releaseReason: 'HOLD_EXPIRED' })
                .where('status = :status AND expires_at <= :now', { status: 'HELD', now });
            if (tenantId) query.andWhere('tenant_id = :tenantId', { tenantId });
            const result = await query.execute();
            for (const row of grouped) {
                if (tenantId && row.tenant_id !== tenantId) continue;
                await this.audit(manager, row.tenant_id, 'DELIVERY_CAPACITY_EXPIRED', { count: Number(row.count), reason: 'HOLD_EXPIRED' });
            }
            return { expired: result.affected || 0 };
        });
    }

    private async requireTenant(tenantId: string) {
        const tenant = await this.tenants.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Restaurante não encontrado.');
        return tenant;
    }

    private async audit(manager: any, tenantId: string, eventType: string, metadata: Record<string, unknown>) {
        await manager.getRepository(UserAccessAuditLog).save(manager.getRepository(UserAccessAuditLog).create({
            tenantId,
            actorUserId: null,
            actorName: null,
            actorRole: null,
            targetUserId: null,
            targetUserName: null,
            eventType,
            description: 'Transição de capacidade própria de Delivery registrada.',
            metadata,
        }));
    }

    private capacityFromTenant(tenant: Tenant) {
        const value = Number((tenant.settings as any)?.delivery?.own_capacity?.available_couriers ?? 0);
        return Number.isInteger(value) && value >= 0 ? value : 0;
    }

    private key(value: string) {
        const key = String(value || '').trim();
        if (!key || key.length > 255) throw new ConflictException('checkout_key inválida.');
        return key;
    }

    private view(reservation: DeliveryOwnCapacityReservation, capacity: number) {
        const active = ['HELD', 'CONFIRMED'].includes(reservation.status) ? 1 : 0;
        return {
            id: reservation.id,
            tenant_id: reservation.tenantId,
            checkout_key: reservation.checkoutKey,
            delivery_id: reservation.deliveryId,
            status: reservation.status as ReservationStatus,
            expires_at: reservation.expiresAt,
            confirmed_at: reservation.confirmedAt,
            released_at: reservation.releasedAt,
            release_reason: reservation.releaseReason,
            declared_capacity: capacity,
            available: Math.max(0, capacity - active),
        };
    }
}
