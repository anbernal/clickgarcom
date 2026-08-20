import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import { Tenant } from '../../entities/tenant.entity';
import { Delivery } from '../../entities/delivery.entity';
import { DeliveryDriverProfile } from '../../entities/delivery-driver-profile.entity';
import { DeliveryDriverAssignment } from '../../entities/delivery-driver-assignment.entity';
import { DeliveryDriverAccessLink } from '../../entities/delivery-driver-access-link.entity';
import { DeliveryDriverSession } from '../../entities/delivery-driver-session.entity';
import { DeliveryDriverIncident } from '../../entities/delivery-driver-incident.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryConfirmPinDto, DeliveryExceptionDto } from './dto/delivery-commands.dto';
import { DeliveryExceptionReason } from './contracts';

type PortalRequest = { headers?: Record<string, any>; cookies?: Record<string, string>; ip?: string; socket?: { remoteAddress?: string } };
type PortalResponse = { cookie(name: string, value: string, options: Record<string, unknown>): void; clearCookie(name: string, options?: Record<string, unknown>): void; setHeader(name: string, value: string): void };
export type FleetDriverSessionSnapshot = {
    session_id: string;
    tenant_id: string;
    tenant: { id: string; slug: string; name: string; logo_url?: string | null };
    driver: { id: string; profile_id: string; name: string; plate: string; availability: string; max_assigned_deliveries: number };
    shift_open: boolean;
    expires_at: string;
};

@Injectable()
export class FleetDriverPortalService {
    private readonly sessionCookie = 'clickgarcom_driver_session';
    private readonly activationCookie = 'clickgarcom_driver_activation';
    private readonly sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
    private readonly activationTtlMs = 15 * 60 * 1000;
    private readonly failedLogins = new Map<string, { count: number; resetAt: number; blockedUntil?: number }>();

    constructor(
        @InjectRepository(Tenant) private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryDriverProfile) private readonly profileRepository: Repository<DeliveryDriverProfile>,
        @InjectRepository(DeliveryDriverAssignment) private readonly assignmentRepository: Repository<DeliveryDriverAssignment>,
        @InjectRepository(DeliveryDriverAccessLink) private readonly accessLinkRepository: Repository<DeliveryDriverAccessLink>,
        @InjectRepository(DeliveryDriverSession) private readonly sessionRepository: Repository<DeliveryDriverSession>,
        @InjectRepository(DeliveryDriverIncident) private readonly incidentRepository: Repository<DeliveryDriverIncident>,
        private readonly deliveryService: DeliveryService,
        private readonly dataSource: DataSource,
        private readonly config: ConfigService,
    ) {}

    async exchangeAccessToken(rawToken: string, _request: PortalRequest, response: PortalResponse) {
        const tokenHash = this.hashToken(String(rawToken || '').trim());
        const link = await this.accessLinkRepository.findOne({ where: { tokenHash, revokedAt: null } });
        // An unused link expires normally. Once the PIN has been created, the
        // same link may be opened again as a safe shortcut to the CPF/PIN
        // login, even after its activation window has elapsed.
        if (!link || (!link.usedAt && link.expiresAt <= new Date())) throw new UnauthorizedException('Este link expirou ou já foi utilizado.');
        const profile = await this.profileRepository.findOne({ where: { id: link.driverProfileId, tenantId: link.tenantId } });
        if (!profile?.active) throw new UnauthorizedException('Este link expirou ou já foi utilizado.');
        const tenant = await this.requireTenant(link.tenantId);
        if (link.usedAt) {
            if (!profile.pinHash) throw new UnauthorizedException('Abra novamente o link de ativação enviado pelo restaurante.');
            response.clearCookie(this.activationCookie, { path: '/' });
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Referrer-Policy', 'no-referrer');
            return { activation_required: false, login_required: true, driver: this.driverSnapshot(profile), tenant: this.tenantSnapshot(tenant) };
        }
        response.cookie(this.activationCookie, tokenHash, this.cookieOptions(this.activationTtlMs));
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        return { activation_required: true, driver: this.driverSnapshot(profile), tenant: this.tenantSnapshot(tenant) };
    }

    async activate(pin: string, request: PortalRequest, response: PortalResponse) {
        this.assertPin(pin);
        const activationHash = this.readCookie(request, this.activationCookie);
        if (!activationHash) throw new UnauthorizedException('Abra novamente o link de ativação enviado pelo restaurante.');
        const profile = await this.dataSource.transaction(async manager => {
            const linkRepo = manager.getRepository(DeliveryDriverAccessLink);
            const profileRepo = manager.getRepository(DeliveryDriverProfile);
            const link = await linkRepo.createQueryBuilder('link').setLock('pessimistic_write').where('link.token_hash = :hash AND link.used_at IS NULL AND link.revoked_at IS NULL AND link.expires_at > NOW()', { hash: activationHash }).getOne();
            if (!link) throw new UnauthorizedException('Este link expirou ou já foi utilizado.');
            const current = await profileRepo.findOne({ where: { id: link.driverProfileId, tenantId: link.tenantId } });
            if (!current?.active) throw new UnauthorizedException('Este link expirou ou já foi utilizado.');
            current.pinHash = await bcrypt.hash(pin, 12); current.lastAccessAt = new Date(); current.availability = current.availability === 'OFFLINE' ? 'AVAILABLE' : current.availability; current.version += 1;
            await profileRepo.save(current); link.usedAt = new Date(); await linkRepo.save(link); return current;
        });
        response.clearCookie(this.activationCookie, { path: '/' });
        return this.createSession(profile, request, response);
    }

    async login(cpf: string, pin: string, tenantSlug: string | undefined, request: PortalRequest, response: PortalResponse) {
        this.assertPin(pin); const normalized = String(cpf || '').replace(/\D/g, '');
        if (!/^\d{11}$/.test(normalized)) throw new BadRequestException('Informe um CPF válido.');
        if (!String(tenantSlug || '').trim()) throw new BadRequestException('Restaurante não identificado. Abra o link enviado pelo restaurante.');
        const key = `${this.clientKey(request)}:${normalized}`; this.assertLoginWindow(key);
        const query = this.profileRepository.createQueryBuilder('profile').innerJoin(Tenant, 'tenant', 'tenant.id = profile.tenant_id').where('profile.cpf_hmac = :cpf AND profile.active = TRUE', { cpf: this.cpfHmac(normalized) });
        if (tenantSlug) query.andWhere('LOWER(tenant.slug) = :slug', { slug: tenantSlug.trim().toLowerCase() });
        const profile = await query.getOne(); const valid = !!profile?.pinHash && await bcrypt.compare(pin, profile.pinHash);
        if (!profile || !valid) { this.recordFailedLogin(key); throw new UnauthorizedException('Não foi possível entrar. Confira os dados e tente novamente.'); }
        this.failedLogins.delete(key); profile.lastAccessAt = new Date(); await this.profileRepository.save(profile); return this.createSession(profile, request, response);
    }

    async session(request: PortalRequest): Promise<FleetDriverSessionSnapshot> {
        const rawToken = this.readCookie(request, this.sessionCookie); if (!rawToken) throw new UnauthorizedException('Sessão expirada.');
        const session = await this.sessionRepository.findOne({ where: { tokenHash: this.hashToken(rawToken), revokedAt: null } });
        if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('Sessão expirada.');
        const profile = await this.profileRepository.findOne({ where: { id: session.driverProfileId, tenantId: session.tenantId } });
        if (!profile?.active) throw new UnauthorizedException('Sessão expirada.'); session.lastSeenAt = new Date(); await this.sessionRepository.save(session); return this.sessionSnapshot(session, profile);
    }

    async logout(request: PortalRequest, response: PortalResponse) { const rawToken = this.readCookie(request, this.sessionCookie); if (rawToken) await this.sessionRepository.update({ tokenHash: this.hashToken(rawToken), revokedAt: null }, { revokedAt: new Date(), shiftOpen: false }); response.clearCookie(this.sessionCookie, { path: '/' }); return { ok: true }; }

    async shift(open: boolean, request: PortalRequest) { const current = await this.session(request); await this.profileRepository.createQueryBuilder().update().set({ availability: open ? 'AVAILABLE' : 'OFFLINE', version: () => 'version + 1' }).where('id = :id AND tenant_id = :tenantId', { id: current.driver.profile_id, tenantId: current.tenant_id }).execute(); await this.sessionRepository.update({ id: current.session_id }, { shiftOpen: open }); return { open, version: 1 }; }

    async queue(request: PortalRequest) {
        const current = await this.session(request);
        const rows = await this.assignmentRepository.createQueryBuilder('assignment').innerJoin(Delivery, 'delivery', 'delivery.id = assignment.delivery_id AND delivery.tenant_id = assignment.tenant_id').where("assignment.tenant_id = :tenantId AND assignment.driver_profile_id = :driverId AND assignment.status = 'ACTIVE'", { tenantId: current.tenant_id, driverId: current.driver.profile_id }).andWhere("delivery.status NOT IN ('DELIVERED','CANCELED','REJECTED','RETURNED')").select(['assignment.id AS assignment_id','assignment.delivery_id AS delivery_id','assignment.position AS position','delivery.version AS version','delivery.display_code AS delivery_code','delivery.customer_name AS customer_name','delivery.customer_phone AS customer_phone','delivery.formatted_address AS formatted_address','delivery.street AS street','delivery.address_number AS address_number','delivery.address_complement AS address_complement','delivery.neighborhood AS neighborhood','delivery.city AS city','delivery.state AS state','delivery.address_reference AS address_reference','delivery.status AS status','delivery.updated_at AS updated_at','delivery.destination_lat AS destination_lat','delivery.destination_lng AS destination_lng']).orderBy('assignment.position', 'ASC').addOrderBy('assignment.assigned_at', 'ASC').getRawMany();
        return rows.map(row => this.assignmentSnapshot(row));
    }

    async history(period: string | undefined, request: PortalRequest) { const current = await this.session(request); const since = new Date(Date.now() - (String(period || 'today').toLowerCase() === 'week' ? 7 : 1) * 86400000); const rows = await this.deliveryRepository.createQueryBuilder('delivery').where("delivery.tenant_id = :tenantId AND delivery.assigned_driver_profile_id = :driverId AND delivery.status = 'DELIVERED' AND delivery.delivered_at >= :since", { tenantId: current.tenant_id, driverId: current.driver.profile_id, since }).orderBy('delivery.delivered_at', 'DESC').take(100).getMany(); return rows.map(row => ({ id: row.id, delivery_id: row.id, delivery_code: row.displayCode, neighborhood: row.neighborhood || 'Destino', completed_at: row.deliveredAt || row.updatedAt, duration_minutes: Math.max(0, Math.round(((row.deliveredAt?.getTime() || row.updatedAt?.getTime() || Date.now()) - (row.pickedUpAt?.getTime() || row.createdAt?.getTime() || Date.now())) / 60000)) })); }

    async command(deliveryId: string, command: string, body: any, request: PortalRequest) {
        const current = await this.session(request); await this.assertAssigned(current, deliveryId); const key = this.readHeader(request, 'idempotency-key'); const expected = body?.expected_version === undefined ? undefined : Number(body.expected_version);
        if (command === 'pickup') return this.deliveryService.pickupForFleetDriver(current.tenant_id, deliveryId, current.driver.profile_id, key);
        if (command === 'start') return this.deliveryService.startForFleetDriver(current.tenant_id, deliveryId, current.driver.profile_id, expected, key);
        if (command === 'arrive') return this.deliveryService.arriveForFleetDriver(current.tenant_id, deliveryId, current.driver.profile_id);
        if (command === 'complete') { if (!body?.pin) throw new BadRequestException('Informe o código de entrega.'); return this.deliveryService.confirmPinForFleetDriver(current.tenant_id, deliveryId, current.driver.profile_id, { pin: String(body.pin).toUpperCase() } as DeliveryConfirmPinDto, key); }
        if (command === 'incident') { const reason = String(body?.reason || '').trim(); if (!reason) throw new BadRequestException('Descreva o problema para a expedição.'); await this.deliveryService.openExceptionForFleetDriver(current.tenant_id, deliveryId, current.driver.profile_id, { reason_code: DeliveryExceptionReason.Other, notes: reason } as DeliveryExceptionDto, key); const incident = await this.incidentRepository.save(this.incidentRepository.create({ tenantId: current.tenant_id, deliveryId, driverProfileId: current.driver.profile_id, reason, status: 'OPEN' })); return { status: 'OCCURRENCE', incident_id: incident.id }; }
        throw new NotFoundException('Ação de entrega não encontrada.');
    }

    private async assertAssigned(session: FleetDriverSessionSnapshot, deliveryId: string) { const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId, tenantId: session.tenant_id, assignedDriverProfileId: session.driver.profile_id } }); if (!delivery) throw new NotFoundException('Entrega não encontrada.'); }
    private async createSession(profile: DeliveryDriverProfile, request: PortalRequest, response: PortalResponse): Promise<FleetDriverSessionSnapshot> { const tenant = await this.requireTenant(profile.tenantId); const raw = randomBytes(48).toString('base64url'); const session = this.sessionRepository.create({ id: randomUUID(), tenantId: profile.tenantId, driverProfileId: profile.id, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + this.sessionTtlMs), revokedAt: null, shiftOpen: profile.availability !== 'OFFLINE', lastSeenAt: new Date(), userAgent: String(request.headers?.['user-agent'] || '').slice(0, 255), ipAddress: this.clientKey(request) }); await this.sessionRepository.save(session); response.cookie(this.sessionCookie, raw, this.cookieOptions(this.sessionTtlMs)); return this.sessionSnapshot(session, profile, tenant); }
    private async sessionSnapshot(session: DeliveryDriverSession, profile: DeliveryDriverProfile, tenant?: Tenant): Promise<FleetDriverSessionSnapshot> { const resolved = tenant || await this.requireTenant(session.tenantId); return { session_id: session.id, tenant_id: session.tenantId, tenant: this.tenantSnapshot(resolved), driver: { id: profile.id, profile_id: profile.id, name: profile.name, plate: profile.plate, availability: profile.availability, max_assigned_deliveries: profile.deliveryLimit }, shift_open: session.shiftOpen, expires_at: session.expiresAt.toISOString() }; }
    private assignmentSnapshot(row: any) { const address = row.formatted_address || [row.street, row.address_number, row.address_complement, row.neighborhood, row.city, row.state].filter(Boolean).join(', '); return { id: row.assignment_id, delivery_id: row.delivery_id, delivery_code: row.delivery_code, customer_name: row.customer_name || 'Cliente', customer_phone: row.customer_phone || null, address, reference: row.address_reference || '', status: row.status, position: Number(row.position || 0), eta_minutes: 0, distance_km: 0, item_count: 0, version: Number(row.version || 1), updated_at: row.updated_at, destination_lat: row.destination_lat == null ? null : Number(row.destination_lat), destination_lng: row.destination_lng == null ? null : Number(row.destination_lng) }; }
    private driverSnapshot(profile: DeliveryDriverProfile) { return { id: profile.id, profile_id: profile.id, name: profile.name, plate: profile.plate, availability: profile.availability, max_assigned_deliveries: profile.deliveryLimit }; }
    private tenantSnapshot(tenant: Tenant) { const settings: any = tenant.settings || {}; return { id: tenant.id, slug: tenant.slug, name: tenant.name, logo_url: settings.digital_menu?.logo_url || null }; }
    private async requireTenant(id: string) { const tenant = await this.tenantRepository.findOne({ where: { id } }); if (!tenant || !tenant.active) throw new UnauthorizedException('Restaurante indisponível.'); return tenant; }
    private assertPin(pin: string) { if (!/^\d{6}$/.test(String(pin || ''))) throw new BadRequestException('Informe um PIN com 6 números.'); }
    private readCookie(request: PortalRequest, name: string) { if (request.cookies?.[name]) return request.cookies[name]; const prefix = `${name}=`; const found = String(request.headers?.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix)); return found ? decodeURIComponent(found.slice(prefix.length)) : undefined; }
    private readHeader(request: PortalRequest, name: string) { return String(request.headers?.[name] || request.headers?.[name.toLowerCase()] || '').slice(0, 255) || undefined; }
    private cookieOptions(maxAge: number) { return { httpOnly: true, secure: String(this.config.get('NODE_ENV') || '').toLowerCase() === 'production', sameSite: 'lax' as const, path: '/', maxAge }; }
    private secret() { return String(this.config.get('FLEET_DRIVER_SECRET') || this.config.get('JWT_SECRET') || 'clickgarcom-fleet-driver-development-secret'); }
    private hashToken(value: string) { return createHmac('sha256', this.secret()).update(value).digest('hex'); }
    private cpfHmac(value: string) { return createHmac('sha256', `${this.secret()}:cpf`).update(value).digest('hex'); }
    private clientKey(request: PortalRequest) { return String(request.headers?.['x-forwarded-for'] || request.ip || request.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 100); }
    private assertLoginWindow(key: string) { const current = this.failedLogins.get(key); const now = Date.now(); if (current?.blockedUntil && current.blockedUntil > now) throw new ConflictException('Muitas tentativas. Aguarde alguns minutos e tente novamente.'); if (current?.resetAt && current.resetAt <= now) this.failedLogins.delete(key); }
    private recordFailedLogin(key: string) { const now = Date.now(); const current = this.failedLogins.get(key); const item = current && current.resetAt > now ? current : { count: 0, resetAt: now + 15 * 60_000 }; item.count += 1; if (item.count >= 5) item.blockedUntil = now + 15 * 60_000; this.failedLogins.set(key, item); }
}
