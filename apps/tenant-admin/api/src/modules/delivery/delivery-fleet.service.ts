import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';
import QRCode from 'qrcode';

import { Tenant } from '../../entities/tenant.entity';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryDriverProfile } from '../../entities/delivery-driver-profile.entity';
import { DeliveryDriverAssignment } from '../../entities/delivery-driver-assignment.entity';
import { DeliveryDriverAccessLink } from '../../entities/delivery-driver-access-link.entity';
import { DeliveryDriverSession } from '../../entities/delivery-driver-session.entity';
import { DeliveryDriverIncident } from '../../entities/delivery-driver-incident.entity';
import { DeliveryDriverEvent } from '../../entities/delivery-driver-event.entity';
import { UpdateDeliveryFleetConfigDto, CreateDeliveryDriverDto, UpdateDeliveryDriverDto, SetDeliveryDriverStatusDto, ReorderDeliveryDriverQueueDto, DeliveryFleetAssignmentsQueryDto, DeliveryFleetDriversQueryDto, DeliveryFleetReportQueryDto, DeliveryFleetMode } from './dto/delivery-fleet.dto';

@Injectable()
export class DeliveryFleetService {
    constructor(
        @InjectRepository(Tenant) private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryDriverProfile) private readonly driverRepository: Repository<DeliveryDriverProfile>,
        @InjectRepository(DeliveryDriverAssignment) private readonly assignmentRepository: Repository<DeliveryDriverAssignment>,
        @InjectRepository(DeliveryDriverAccessLink) private readonly accessLinkRepository: Repository<DeliveryDriverAccessLink>,
        @InjectRepository(DeliveryDriverSession) private readonly sessionRepository: Repository<DeliveryDriverSession>,
        @InjectRepository(DeliveryDriverIncident) private readonly incidentRepository: Repository<DeliveryDriverIncident>,
        @InjectRepository(DeliveryDriverEvent) private readonly eventRepository: Repository<DeliveryDriverEvent>,
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
    ) { }

    async getConfig(tenantId: string) {
        const tenant = await this.requireTenant(tenantId);
        const delivery = ((tenant.settings || {}) as any).delivery || {};
        return { config: { mode: this.normalizeMode(delivery.own_fleet_mode || delivery.fleet_mode), version: Number(delivery.fleet_version || 1), updated_at: delivery.fleet_updated_at || tenant.updatedAt?.toISOString() || null, updated_by: delivery.fleet_updated_by || null } };
    }

    async updateConfig(tenantId: string, dto: UpdateDeliveryFleetConfigDto, actor: any) {
        const tenant = await this.requireTenant(tenantId);
        const settings: any = { ...(tenant.settings || {}) };
        const delivery = { ...(settings.delivery || {}) };
        const currentVersion = Number(delivery.fleet_version || 1);
        if (currentVersion !== dto.expected_version) throw new ConflictException({ message: 'A configuração da frota foi alterada. Atualize e tente novamente.', config: await this.getConfig(tenantId) });
        delivery.fleet_mode = dto.mode;
        delivery.own_fleet_mode = dto.mode;
        delivery.fleet_version = currentVersion + 1;
        delivery.fleet_updated_at = new Date().toISOString();
        delivery.fleet_updated_by = actor?.name || actor?.id || null;
        settings.delivery = delivery;
        tenant.settings = settings;
        await this.tenantRepository.save(tenant);
        return this.getConfig(tenantId);
    }

    async listDrivers(tenantId: string, query: DeliveryFleetDriversQueryDto) {
        const qb = this.driverRepository.createQueryBuilder('driver').where('driver.tenant_id = :tenantId', { tenantId }).orderBy('driver.active', 'DESC').addOrderBy('driver.name', 'ASC');
        if (!query.include_inactive) qb.andWhere('driver.active = TRUE');
        const drivers = await qb.getMany();
        return { drivers: await Promise.all(drivers.map((driver) => this.toDriverSnapshot(driver, tenantId))) };
    }

    async createDriver(tenantId: string, dto: CreateDeliveryDriverDto, actor: any) {
        const cpf = this.normalizeCpf(dto.cpf);
        const plate = this.normalizePlate(dto.plate);
        if (await this.driverRepository.findOne({ where: { tenantId, cpfHmac: this.hmac(cpf), active: true } })) throw new ConflictException('Já existe um motoboy com este CPF.');
        if (await this.driverRepository.findOne({ where: { tenantId, plate, active: true } })) throw new ConflictException('Já existe um motoboy com esta placa.');
        const encrypted = this.encrypt(cpf);
        const driver = this.driverRepository.create({ tenantId, name: dto.name.trim(), ...encrypted, cpfHmac: this.hmac(cpf), cpfLast4: cpf.slice(-4), plate, phone: this.normalizePhone(dto.phone), deliveryLimit: dto.delivery_limit || 1, active: true, availability: 'OFFLINE', createdBy: actor?.id || null, updatedBy: actor?.id || null, version: 1 });
        const saved = await this.driverRepository.save(driver);
        await this.recordEvent(tenantId, saved.id, 'PROFILE_CREATED', { plate: saved.plate }, actor?.id);
        return { driver: await this.toDriverSnapshot(saved, tenantId) };
    }

    async updateDriver(tenantId: string, id: string, dto: UpdateDeliveryDriverDto, actor: any) {
        const driver = await this.requireDriver(tenantId, id);
        if (driver.version !== dto.expected_version) throw new ConflictException('O cadastro foi alterado. Atualize e tente novamente.');
        if (dto.plate) {
            const plate = this.normalizePlate(dto.plate);
            const duplicate = await this.driverRepository.findOne({ where: { tenantId, plate, active: true } });
            if (duplicate && duplicate.id !== id) throw new ConflictException('Já existe um motoboy com esta placa.');
            driver.plate = plate;
        }
        if (dto.name !== undefined) driver.name = dto.name.trim();
        if (dto.phone !== undefined) driver.phone = this.normalizePhone(dto.phone);
        if (dto.delivery_limit !== undefined) driver.deliveryLimit = dto.delivery_limit;
        driver.updatedBy = actor?.id || null;
        driver.version += 1;
        const saved = await this.driverRepository.save(driver);
        await this.recordEvent(tenantId, saved.id, 'PROFILE_UPDATED', {}, actor?.id);
        return { driver: await this.toDriverSnapshot(saved, tenantId) };
    }

    async setDriverStatus(tenantId: string, id: string, active: boolean, dto: SetDeliveryDriverStatusDto, actor: any) {
        const driver = await this.requireDriver(tenantId, id);
        if (driver.version !== dto.expected_version) throw new ConflictException('O cadastro foi alterado. Atualize e tente novamente.');
        driver.active = active;
        driver.availability = active ? 'AVAILABLE' : 'OFFLINE';
        driver.deactivationReason = active ? null : dto.reason.trim();
        driver.deactivatedAt = active ? null : new Date();
        driver.updatedBy = actor?.id || null;
        driver.version += 1;
        const saved = await this.driverRepository.save(driver);
        await this.recordEvent(tenantId, saved.id, active ? 'PROFILE_ACTIVATED' : 'PROFILE_DEACTIVATED', { reason: dto.reason }, actor?.id);
        return { driver: await this.toDriverSnapshot(saved, tenantId) };
    }

    async createAccessLink(tenantId: string, id: string, actor: any) {
        const driver = await this.requireDriver(tenantId, id);
        if (!driver.active) throw new BadRequestException('Ative o motoboy antes de gerar um acesso.');
        await this.accessLinkRepository.update({ tenantId, driverProfileId: id, usedAt: null, revokedAt: null }, { revokedAt: new Date() });
        const token = randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);
        // The portal exchanges links using the application-secret HMAC. Keep
        // the same derivation here; a plain SHA-256 would make every freshly
        // generated link look expired/used during exchange.
        await this.accessLinkRepository.save(this.accessLinkRepository.create({ tenantId, driverProfileId: id, tokenHash: this.hashToken(token), expiresAt: expires, createdBy: actor?.id || null }));
        await this.recordEvent(tenantId, id, 'ACCESS_LINK_CREATED', { expires_at: expires.toISOString() }, actor?.id);
        const tenant = await this.requireTenant(tenantId);
        const slug = tenant.slug || tenantId;
        const activationUrl = `${this.publicOrigin()}/entregador/${encodeURIComponent(slug)}#activate=${token}`;
        const qrCodeDataUrl = await QRCode.toDataURL(activationUrl, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
            color: { dark: '#123f35', light: '#ffffff' },
        });
        return { activation_url: activationUrl, qr_code_data_url: qrCodeDataUrl, expires_at: expires.toISOString(), driver_id: id };
    }

    async revokeSessions(tenantId: string, id: string) {
        await this.requireDriver(tenantId, id);
        await this.sessionRepository.createQueryBuilder().update().set({ revokedAt: new Date(), shiftOpen: false }).where('tenant_id = :tenantId AND driver_profile_id = :id AND revoked_at IS NULL', { tenantId, id }).execute();
        await this.accessLinkRepository.createQueryBuilder().update().set({ revokedAt: new Date() }).where('tenant_id = :tenantId AND driver_profile_id = :id AND revoked_at IS NULL', { tenantId, id }).execute();
        return { revoked: true, driver_id: id };
    }

    async listAssignments(tenantId: string, query: DeliveryFleetAssignmentsQueryDto) {
        const status = query.status || 'ACTIVE';
        const rows = await this.assignmentRepository.createQueryBuilder('assignment')
            .leftJoin(DeliveryDriverProfile, 'driver', 'driver.id = assignment.driver_profile_id AND driver.tenant_id = assignment.tenant_id')
            .leftJoin(Delivery, 'delivery', 'delivery.id = assignment.delivery_id AND delivery.tenant_id = assignment.tenant_id')
            .select(['assignment.id AS id', 'assignment.delivery_id AS delivery_id', 'assignment.driver_profile_id AS driver_id', 'assignment.position AS position', 'assignment.status AS status', 'assignment.assigned_at AS assigned_at', 'assignment.version AS version', 'driver.name AS driver_name', 'delivery.display_code AS delivery_code', 'delivery.customer_name AS customer_name', 'delivery.neighborhood AS neighborhood', 'delivery.status AS delivery_status', 'delivery.eta_seconds AS eta_seconds'])
            .where('assignment.tenant_id = :tenantId', { tenantId }).andWhere('assignment.status = :status', { status }).orderBy('assignment.driver_profile_id', 'ASC').addOrderBy('assignment.position', 'ASC').getRawMany();
        return { assignments: rows.map((row) => ({ ...row, position: Number(row.position), version: Number(row.version), eta_minutes: row.eta_seconds == null ? null : Math.ceil(Number(row.eta_seconds) / 60) })) };
    }

    async reorder(tenantId: string, driverId: string, dto: ReorderDeliveryDriverQueueDto, actor: any) {
        await this.requireDriver(tenantId, driverId);
        await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(DeliveryDriverAssignment);
            const active = await repo.createQueryBuilder('assignment').setLock('pessimistic_write').where('assignment.tenant_id = :tenantId AND assignment.driver_profile_id = :driverId AND assignment.status = :status', { tenantId, driverId, status: 'ACTIVE' }).orderBy('assignment.position', 'ASC').getMany();
            if (active.length !== dto.assignment_ids.length || new Set(dto.assignment_ids).size !== dto.assignment_ids.length || active.some((item) => !dto.assignment_ids.includes(item.id))) throw new BadRequestException('A fila informada não corresponde às entregas ativas do motoboy.');
            for (let index = 0; index < active.length; index += 1) { active[index].position = 10000 + index; active[index].version += 1; await repo.save(active[index]); }
            for (let index = 0; index < dto.assignment_ids.length; index += 1) { const item = active.find((candidate) => candidate.id === dto.assignment_ids[index]); item.position = index + 1; item.version += 1; await repo.save(item); }
        });
        return this.listAssignments(tenantId, { status: 'ACTIVE' });
    }

    async report(tenantId: string, query: DeliveryFleetReportQueryDto) {
        const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
        const to = query.to ? new Date(query.to) : new Date();
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new BadRequestException('Período inválido.');
        const rows = await this.driverRepository.createQueryBuilder('driver').leftJoin(Delivery, 'delivery', 'delivery.tenant_id = driver.tenant_id AND delivery.assigned_driver_profile_id = driver.id AND delivery.created_at >= :from AND delivery.created_at < :to', { from, to }).leftJoin(DeliveryDriverIncident, 'incident', 'incident.tenant_id = driver.tenant_id AND incident.driver_profile_id = driver.id AND incident.created_at >= :from AND incident.created_at < :to', { from, to }).select('driver.id', 'driver_id').addSelect('driver.name', 'driver_name').addSelect("COUNT(DISTINCT delivery.id) FILTER (WHERE delivery.status = 'DELIVERED')", 'completed').addSelect("COALESCE(AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - delivery.assigned_at)) / 60) FILTER (WHERE delivery.status = 'DELIVERED'), 0)", 'average_minutes').addSelect('COUNT(DISTINCT incident.id)', 'incidents').groupBy('driver.id').addGroupBy('driver.name').orderBy('completed', 'DESC').getRawMany();
        return { rows: rows.map((row) => { const completed = Number(row.completed || 0); const incidents = Number(row.incidents || 0); return { driver_id: row.driver_id, driver_name: row.driver_name, completed, average_minutes: Math.round(Number(row.average_minutes || 0)), incidents, success_rate: completed + incidents ? Math.round(completed / (completed + incidents) * 100) : 100 }; }) };
    }

    async cleanupExpiredAccess(tenantId?: string) {
        const now = new Date();
        const sessionQuery = this.sessionRepository.createQueryBuilder().update().set({ revokedAt: now, shiftOpen: false }).where('expires_at <= :now AND revoked_at IS NULL', { now });
        const linkQuery = this.accessLinkRepository.createQueryBuilder().update().set({ revokedAt: now }).where('expires_at <= :now AND used_at IS NULL AND revoked_at IS NULL', { now });
        if (tenantId) { sessionQuery.andWhere('tenant_id = :tenantId', { tenantId }); linkQuery.andWhere('tenant_id = :tenantId', { tenantId }); }
        const [sessions, links] = await Promise.all([sessionQuery.execute(), linkQuery.execute()]);
        return { expired_sessions: sessions.affected || 0, expired_links: links.affected || 0 };
    }

    private async toDriverSnapshot(driver: DeliveryDriverProfile, tenantId: string) {
        const activeDeliveries = await this.assignmentRepository.count({ where: { tenantId, driverProfileId: driver.id, status: 'ACTIVE' } });
        const session = await this.sessionRepository.findOne({ where: { tenantId, driverProfileId: driver.id, revokedAt: null }, order: { createdAt: 'DESC' } });
        const availability = !driver.active ? 'OFFLINE' : activeDeliveries > 0 ? 'ON_ROUTE' : (session?.shiftOpen ? 'AVAILABLE' : 'OFFLINE');
        return { id: driver.id, name: driver.name, cpf_masked: `***.***.***-${driver.cpfLast4}`, plate: driver.plate, phone: driver.phone || '', active: driver.active, availability, active_deliveries: activeDeliveries, delivery_limit: driver.deliveryLimit, access_status: session && session.expiresAt > new Date() ? 'ACTIVE' : 'NOT_ACTIVATED', last_access_at: driver.lastAccessAt?.toISOString() || null, created_at: driver.createdAt?.toISOString() || null, version: driver.version, deactivation_reason: driver.deactivationReason };
    }
    private async requireDriver(tenantId: string, id: string) { const driver = await this.driverRepository.findOne({ where: { tenantId, id } }); if (!driver) throw new NotFoundException('Motoboy não encontrado.'); return driver; }
    private async recordEvent(tenantId: string, driverProfileId: string, eventType: string, metadata: Record<string, unknown>, actorUserId?: string) { await this.eventRepository.save(this.eventRepository.create({ tenantId, driverProfileId, eventType, metadata, actorUserId: actorUserId || null, deliveryId: null })); }
    private async requireTenant(id: string) { const tenant = await this.tenantRepository.findOne({ where: { id } }); if (!tenant) throw new NotFoundException('Restaurante não encontrado.'); return tenant; }
    private normalizeCpf(cpf: string) { const value = String(cpf || '').replace(/\D/g, ''); if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value) || !this.validCpf(value)) throw new BadRequestException('CPF inválido.'); return value; }
    private validCpf(value: string) { const digit = (length: number) => { let sum = 0; for (let i = 0; i < length; i += 1) sum += Number(value[i]) * (length + 1 - i); const result = (sum * 10) % 11; return result === 10 ? 0 : result; }; return digit(9) === Number(value[9]) && digit(10) === Number(value[10]); }
    private normalizePlate(plate: string) { const value = String(plate || '').replace(/[^a-z0-9]/gi, '').toUpperCase(); if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value)) throw new BadRequestException('Placa inválida.'); return value; }
    private normalizePhone(phone?: string) { const value = String(phone || '').replace(/\D/g, ''); return value || null; }
    private hashToken(value: string) { return createHmac('sha256', this.secret()).update(value).digest('hex'); }
    private hmac(value: string) { return createHmac('sha256', `${this.secret()}:cpf`).update(value).digest('hex'); }
    private secret() { return String(this.config.get('FLEET_DRIVER_SECRET') || this.config.get('JWT_SECRET') || 'clickgarcom-fleet-development-secret'); }
    private encrypt(value: string) { const key = createHash('sha256').update(this.secret()).digest(); const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, nonce); const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return { cpfCiphertext: ciphertext, cpfNonce: nonce, cpfAuthTag: cipher.getAuthTag() }; }
    /**
     * Access links are shared outside the authenticated admin session, so they
     * must always be absolute URLs.  Older deployments only configured the
     * public web/admin base variables (and not PUBLIC_APP_URL), which produced
     * a relative `/entregador/...` value in the dialog.
     */
    private publicOrigin() {
        return String(
            this.config.get('PUBLIC_APP_URL')
            || this.config.get('APP_PUBLIC_URL')
            || this.config.get('PUBLIC_WEB_BASE_URL')
            || this.config.get('PUBLIC_ADMIN_BASE_URL')
            || '',
        ).replace(/\/+$/, '');
    }
    private normalizeMode(value: unknown) { return value === DeliveryFleetMode.IdentifiedDrivers ? DeliveryFleetMode.IdentifiedDrivers : DeliveryFleetMode.CapacityOnly; }
}
