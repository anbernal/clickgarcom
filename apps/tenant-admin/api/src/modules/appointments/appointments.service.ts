import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';

import { AppointmentService } from '../../entities/appointment-service.entity';
import { AppointmentProfessional } from '../../entities/appointment-professional.entity';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentAutomationVersion } from '../../entities/appointment-automation-version.entity';
import { Customer } from '../../entities/customer.entity';
import { Tenant, TenantSettings } from '../../entities/tenant.entity';

type Actor = { userId?: string; userName?: string; userRole?: string };
const ACTIVE = ['PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'];
// Stable ids make appointment messages idempotent in the existing WhatsApp
// outbox. Retrying an API request therefore never thanks the client twice.
const APPOINTMENT_NOTIFICATION_NAMESPACE = 'db78c6ee-d8d1-5935-9d75-9958fa9fc245';
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    PENDING_APPROVAL: ['CONFIRMED', 'CANCELED_BY_TENANT'],
    CONFIRMED: ['CHECKED_IN', 'IN_SERVICE', 'CANCELED_BY_TENANT', 'NO_SHOW'],
    CHECKED_IN: ['IN_SERVICE', 'CANCELED_BY_TENANT'],
    IN_SERVICE: ['COMPLETED', 'CANCELED_BY_TENANT'],
};

@Injectable()
export class AppointmentsService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(AppointmentService) private readonly services: Repository<AppointmentService>,
        @InjectRepository(AppointmentProfessional) private readonly professionals: Repository<AppointmentProfessional>,
        @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
        @InjectRepository(AppointmentAutomationVersion) private readonly automations: Repository<AppointmentAutomationVersion>,
        @InjectRepository(Customer) private readonly customers: Repository<Customer>,
        @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    ) {}

    async workspace(tenantId: string) {
        const tenant = await this.requireEnabledTenant(tenantId);
        const [services, professionals, appointments, automation, blocks, categories, availabilityRules] = await Promise.all([
            this.services.find({ where: { tenantId }, order: { active: 'DESC', displayOrder: 'ASC', name: 'ASC' } }),
            this.professionals.find({ where: { tenantId }, order: { active: 'DESC', name: 'ASC' } }),
            this.appointments.find({ where: { tenantId }, order: { startAt: 'ASC' }, take: 300 }),
            this.automations.findOne({ where: { tenantId, status: 'PUBLISHED' }, order: { version: 'DESC' } }),
            this.dataSource.query(`SELECT id, professional_id, start_at, end_at, reason FROM appointment_calendar_blocks WHERE tenant_id = $1 ORDER BY start_at ASC`, [tenantId]),
            this.dataSource.query(`SELECT id, name FROM appointment_service_categories WHERE tenant_id = $1`, [tenantId]),
            this.dataSource.query(`SELECT professional_id, weekday, start_time::text, end_time::text FROM appointment_availability_rules WHERE tenant_id = $1 AND active=true`, [tenantId]),
        ]);
        const relations = await this.dataSource.query(`SELECT service_id, professional_id FROM appointment_service_professionals WHERE tenant_id = $1`, [tenantId]);
        const profile = this.profile(tenant.settings);
        return {
            tenant: { name: tenant.name, slug: tenant.slug, profile, timezone: this.timezone(tenant.settings), open: tenant.isOpen, logoUrl: tenant.settings?.digital_menu?.logo_url || null, brandColor: tenant.settings?.digital_menu?.primary_color || '#176b5b' },
            copy: this.copy(profile),
            services: services.map((item) => ({ ...this.serviceView(item), category: categories.find((category: any) => category.id === item.categoryId)?.name || 'Serviços' })),
            professionals: professionals.map((item) => ({ ...this.professionalView(item), services: relations.filter((row: any) => row.professional_id === item.id).map((row: any) => row.service_id), schedule: this.scheduleView(availabilityRules.filter((row: any) => row.professional_id === item.id)) })),
            appointments: appointments.map((item) => this.appointmentView(item)),
            blocks: blocks.map((row: any) => ({ id: row.id, professionalId: row.professional_id, date: this.localDate(row.start_at), start: this.localTime(row.start_at), end: this.localTime(row.end_at), label: row.reason || 'Horário bloqueado' })),
            automations: automation ? { ...automation.definition, status: automation.status, version: automation.version, updatedAt: automation.updatedAt } : this.defaultAutomation(),
            settings: this.settingsView(tenant.settings),
        };
    }

    async createService(tenantId: string, body: any) {
        await this.requireEnabledTenant(tenantId);
        this.required(body?.name, 'Informe o nome do serviço.');
        const duration = this.integer(body?.durationMinutes, 5, 1440, 'Informe uma duração entre 5 e 1440 minutos.');
        const categoryId = await this.ensureCategory(tenantId, body?.category);
        const item = this.services.create({ tenantId, categoryId, name: String(body.name).trim(), description: this.clean(body.description), imageUrl: this.clean(body.imageUrl), icon: this.clean(body.icon), color: this.clean(body.color) || '#176b5b', durationMinutes: duration, bufferMinutes: this.integer(body?.bufferMinutes ?? 0, 0, 360, 'Buffer inválido.'), price: String(Math.max(0, Number(body?.price || 0))), confirmationMode: body?.confirmationMode === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_CONFIRM', minNoticeMinutes: this.integer(body?.minNoticeMinutes ?? 120, 0, 43200, 'Antecedência inválida.'), maxAdvanceDays: this.integer(body?.maxAdvanceDays ?? 60, 1, 730, 'Prazo máximo inválido.'), dailyLimit: body?.dailyLimit ? this.integer(body.dailyLimit, 1, 999, 'Limite diário inválido.') : null, active: body?.active !== false, displayOrder: Number(body?.displayOrder || 0) });
        return { ...this.serviceView(await this.services.save(item)), category: this.clean(body?.category) || 'Serviços' };
    }

    async updateService(tenantId: string, id: string, body: any) {
        const item = await this.services.findOne({ where: { id, tenantId } });
        if (!item) throw new NotFoundException('Serviço não encontrado.');
        if (body?.name !== undefined) { this.required(body.name, 'Informe o nome do serviço.'); item.name = String(body.name).trim(); }
        if (body?.category !== undefined) item.categoryId = await this.ensureCategory(tenantId, body.category);
        for (const [input, column] of [['description', 'description'], ['imageUrl', 'imageUrl'], ['icon', 'icon'], ['color', 'color']] as const) if (body?.[input] !== undefined) (item as any)[column] = this.clean(body[input]);
        if (body?.durationMinutes !== undefined) item.durationMinutes = this.integer(body.durationMinutes, 5, 1440, 'Duração inválida.');
        if (body?.bufferMinutes !== undefined) item.bufferMinutes = this.integer(body.bufferMinutes, 0, 360, 'Buffer inválido.');
        if (body?.price !== undefined) item.price = String(Math.max(0, Number(body.price || 0)));
        if (body?.confirmationMode !== undefined) item.confirmationMode = body.confirmationMode === 'MANUAL_APPROVAL' ? 'MANUAL_APPROVAL' : 'AUTO_CONFIRM';
        if (body?.active !== undefined) item.active = !!body.active;
        item.version += 1;
        const saved = await this.services.save(item);
        const categoryRows = body?.category !== undefined ? [] : await this.dataSource.query(`SELECT name FROM appointment_service_categories WHERE id=$1`, [saved.categoryId]);
        const category = body?.category !== undefined ? this.clean(body.category) : categoryRows[0]?.name;
        return { ...this.serviceView(saved), category: category || 'Serviços' };
    }

    async createProfessional(tenantId: string, body: any) {
        await this.requireEnabledTenant(tenantId);
        this.required(body?.name, 'Informe o nome do profissional.');
        const item = this.professionals.create({ tenantId, name: String(body.name).trim(), roleLabel: this.clean(body.role), imageUrl: this.clean(body.imageUrl), initials: this.clean(body.initials) || this.initials(body.name), color: this.clean(body.color) || '#176b5b', concurrencyLimit: this.integer(body?.concurrencyLimit ?? 1, 1, 10, 'Capacidade inválida.'), active: body?.active !== false });
        const saved = await this.professionals.save(item);
        await this.replaceProfessionalServices(tenantId, saved.id, body?.services);
        await this.replaceSchedule(tenantId, saved.id, body?.schedule);
        return { ...this.professionalView(saved), services: await this.professionalServiceIds(tenantId, saved.id), schedule: body?.schedule || {} };
    }

    async updateProfessional(tenantId: string, id: string, body: any) {
        const item = await this.professionals.findOne({ where: { id, tenantId } });
        if (!item) throw new NotFoundException('Profissional não encontrado.');
        if (body?.name !== undefined) { this.required(body.name, 'Informe o nome do profissional.'); item.name = String(body.name).trim(); item.initials = this.clean(body.initials) || this.initials(item.name); }
        if (body?.role !== undefined) item.roleLabel = this.clean(body.role);
        if (body?.imageUrl !== undefined) item.imageUrl = this.clean(body.imageUrl);
        if (body?.color !== undefined) item.color = this.clean(body.color);
        if (body?.active !== undefined) item.active = !!body.active;
        if (body?.concurrencyLimit !== undefined) item.concurrencyLimit = this.integer(body.concurrencyLimit, 1, 10, 'Capacidade inválida.');
        item.version += 1;
        const saved = await this.professionals.save(item);
        if (Array.isArray(body?.services)) await this.replaceProfessionalServices(tenantId, id, body.services);
        if (body?.schedule && typeof body.schedule === 'object') await this.replaceSchedule(tenantId, id, body.schedule);
        return { ...this.professionalView(saved), services: await this.professionalServiceIds(tenantId, id), schedule: body?.schedule || {} };
    }

    async createAdminAppointment(tenantId: string, body: any, actor: Actor) { return this.createBooking(tenantId, body, 'ADMIN', actor); }
    async updateAppointment(tenantId: string, id: string, body: any, actor: Actor) {
        const item = await this.appointments.findOne({ where: { id, tenantId } });
        if (!item) throw new NotFoundException('Agendamento não encontrado.');
        if (body?.expected_version && Number(body.expected_version) !== item.version) throw new ConflictException('Este agendamento foi atualizado em outra tela.');
        if (body?.notes !== undefined) item.notes = this.clean(body.notes);
        item.version += 1;
        const saved = await this.appointments.save(item);
        await this.event(tenantId, id, 'APPOINTMENT_UPDATED', actor, null, { version: saved.version });
        return this.appointmentView(saved);
    }

    async transition(tenantId: string, id: string, to: string, expectedVersion: number | undefined, actor: Actor, reason?: string) {
        const item = await this.appointments.findOne({ where: { id, tenantId } });
        if (!item) throw new NotFoundException('Agendamento não encontrado.');
        if (expectedVersion && Number(expectedVersion) !== item.version) throw new ConflictException('Este agendamento foi atualizado em outra tela.');
        if (!(ALLOWED_TRANSITIONS[item.status] || []).includes(to)) throw new BadRequestException('Essa mudança de status não é permitida agora.');
        item.status = to; item.version += 1;
        if (to.startsWith('CANCELED')) item.canceledAt = new Date();
        if (to === 'COMPLETED') item.completedAt = new Date();
        const saved = await this.appointments.save(item);
        await this.event(tenantId, id, `APPOINTMENT_${to}`, actor, reason || null, { status: to, version: saved.version });
        await this.enqueueNotification(saved, to);
        return this.appointmentView(saved);
    }

    async saveAutomation(tenantId: string, definition: any, publish: boolean, actor: Actor) {
        await this.requireEnabledTenant(tenantId);
        if (!definition || typeof definition !== 'object') throw new BadRequestException('Fluxo de mensagens inválido.');
        const last = await this.automations.findOne({ where: { tenantId }, order: { version: 'DESC' } });
        const item = this.automations.create({ tenantId, version: (last?.version || 0) + 1, status: publish ? 'PUBLISHED' : 'DRAFT', definition, createdBy: actor.userId || null, publishedAt: publish ? new Date() : null });
        if (publish) await this.dataSource.query(`UPDATE appointment_automation_versions SET status = 'ARCHIVED', updated_at = now() WHERE tenant_id = $1 AND status = 'PUBLISHED'`, [tenantId]);
        return this.automations.save(item);
    }

    async publicBootstrap(slug: string, token: string) {
        const credential = await this.credential(slug, token, 'BOOKING');
        const data = await this.workspace(credential.tenant_id);
        return { ...data, customer: credential.customer_id ? await this.customers.findOne({ where: { id: credential.customer_id, tenantId: credential.tenant_id } }) : null };
    }

    async publicBooking(slug: string, token: string, body: any) {
        const credential = await this.credential(slug, token, 'BOOKING');
        return this.createBooking(credential.tenant_id, body, 'WHATSAPP', { userId: null }, credential.customer_id || null);
    }

    async publicSlots(slug: string, token: string, serviceId: string, date: string, professionalId?: string) {
        const credential = await this.credential(slug, token, 'BOOKING');
        const service = await this.services.findOne({ where: { id: serviceId, tenantId: credential.tenant_id, active: true } });
        if (!service) throw new NotFoundException('Serviço não disponível.');
        const professional = await this.selectProfessional(credential.tenant_id, service.id, professionalId || 'ANY');
        const start = this.asDate(date, '00:00'); const end = new Date(start.getTime() + 86400_000);
        const weekday = new Date(`${date}T12:00:00`).getDay();
        const [rules, existing, blocks] = await Promise.all([
            this.dataSource.query(`SELECT start_time::text, end_time::text FROM appointment_availability_rules WHERE tenant_id=$1 AND active=true AND weekday=$2 AND (professional_id=$3 OR professional_id IS NULL) ORDER BY professional_id NULLS LAST, start_time`, [credential.tenant_id, weekday, professional.id]),
            this.dataSource.query(`SELECT start_at, end_at FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status = ANY($3) AND start_at < $5 AND end_at > $4`, [credential.tenant_id, professional.id, ACTIVE, start, end]),
            this.dataSource.query(`SELECT start_at, end_at FROM appointment_calendar_blocks WHERE tenant_id=$1 AND (professional_id=$2 OR professional_id IS NULL) AND start_at < $4 AND end_at > $3`, [credential.tenant_id, professional.id, start, end]),
        ]);
        const windows = rules.length ? rules : (weekday === 0 ? [] : [{ start_time: '09:00:00', end_time: '18:00:00' }]);
        const durationMs = (service.durationMinutes + service.bufferMinutes) * 60_000;
        const occupied = [...existing, ...blocks].map((row: any) => ({ start: new Date(row.start_at).getTime(), end: new Date(row.end_at).getTime() }));
        const slots: string[] = [];
        for (const window of windows) {
            const from = String(window.start_time).slice(0, 5); const until = String(window.end_time).slice(0, 5);
            for (let cursor = this.asDate(date, from).getTime(); cursor + durationMs <= this.asDate(date, until).getTime(); cursor += 30 * 60_000) {
                if (!occupied.some((range) => cursor < range.end && cursor + durationMs > range.start)) slots.push(this.localTime(new Date(cursor)));
            }
        }
        return { date, professionalId: professional.id, slots: [...new Set(slots)] };
    }

    async mintAccess(tenantId: string, phone: string, purpose: 'BOOKING' | 'MANAGE' = 'BOOKING', customerId?: string | null, appointmentId?: string | null) {
        await this.requireEnabledTenant(tenantId);
        const normalized = String(phone || '').replace(/\D/g, '');
        if (normalized.length < 10) throw new BadRequestException('Telefone do cliente inválido.');
        const customer = customerId ? await this.customers.findOne({ where: { id: customerId, tenantId } }) : await this.customers.findOne({ where: { tenantId, phoneNormalized: normalized } });
        const raw = randomBytes(32).toString('base64url');
        const hash = createHash('sha256').update(raw).digest('hex');
        await this.dataSource.query(`INSERT INTO appointment_access_credentials (tenant_id, customer_id, appointment_id, phone_normalized, purpose, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5,$6, now() + interval '30 minutes')`, [tenantId, customer?.id || null, appointmentId || null, normalized, purpose, hash]);
        const tenant = await this.tenants.findOneOrFail({ where: { id: tenantId } });
        return { slug: tenant.slug, capability: raw, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
    }

    private async createBooking(tenantId: string, body: any, source: string, actor: Actor, customerId?: string | null) {
        const tenant = await this.requireEnabledTenant(tenantId);
        this.required(body?.serviceId, 'Escolha um serviço.'); this.required(body?.date, 'Escolha uma data.'); this.required(body?.time, 'Escolha um horário.'); this.required(body?.customer, 'Informe seu nome.'); this.required(body?.phone, 'Informe seu WhatsApp.');
        const service = await this.services.findOne({ where: { id: String(body.serviceId), tenantId, active: true } });
        if (!service) throw new NotFoundException('Esse serviço não está disponível.');
        const professional = await this.selectProfessional(tenantId, service.id, body?.professionalId);
        const startAt = this.asDate(body.date, body.time); const endAt = new Date(startAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
        const now = Date.now();
        if (startAt.getTime() < now + service.minNoticeMinutes * 60_000) throw new BadRequestException('Escolha um horário com a antecedência mínima configurada.');
        if (startAt.getTime() > now + service.maxAdvanceDays * 86400_000) throw new BadRequestException('Esse horário está fora do período disponível para agendamento.');
        const phone = String(body.phone).replace(/\D/g, '');
        if (phone.length < 10) throw new BadRequestException('Informe um WhatsApp válido.');
        const customer = customerId ? await this.customers.findOne({ where: { id: customerId, tenantId } }) : await this.upsertCustomer(tenantId, phone, String(body.customer).trim());
        const status = service.confirmationMode === 'MANUAL_APPROVAL' ? 'PENDING_APPROVAL' : 'CONFIRMED';
        try {
            const appointment = await this.dataSource.transaction(async (manager) => {
                const overlap = await manager.query(`SELECT id FROM appointments WHERE tenant_id = $1 AND professional_id = $2 AND status = ANY($3) AND start_at < $5 AND end_at > $4 LIMIT 1`, [tenantId, professional.id, ACTIVE, startAt, endAt]);
                if (overlap.length) throw new ConflictException('Esse horário acabou de ser reservado. Escolha outra opção.');
                const appointment = manager.create(Appointment, { tenantId, customerId: customer?.id || null, serviceId: service.id, professionalId: professional.id, displayCode: await this.nextCode(manager, tenantId), customerName: String(body.customer).trim().slice(0, 120), customerPhone: phone, serviceNameSnapshot: service.name, professionalNameSnapshot: professional.name, durationMinutesSnapshot: service.durationMinutes, priceSnapshot: service.price, confirmationMode: service.confirmationMode, source, status, startAt, endAt, timezone: this.timezone(tenant.settings), notes: this.clean(body?.notes), consentAt: body?.consent === false ? null : new Date() });
                return manager.save(appointment);
            });
            await this.event(tenantId, appointment.id, status === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : 'BOOKING_REQUESTED', actor, null, { source });
            await this.enqueueNotification(appointment, status);
            return this.appointmentView(appointment);
        } catch (error: any) {
            if (error?.code === '23P01') throw new ConflictException('Esse horário acabou de ser reservado. Escolha outra opção.');
            throw error;
        }
    }

    private async requireEnabledTenant(tenantId: string) {
        const tenant = await this.tenants.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Estabelecimento não encontrado.');
        if (!this.enabled(tenant.settings)) throw new ForbiddenException('O módulo Agenda & Serviços não está ativo para esta conta.');
        return tenant;
    }
    private enabled(settings: TenantSettings) { const module = settings?.appointments; if (!module?.enabled) return false; if (module.permanent || !module.expires_at) return true; return new Date(module.expires_at).getTime() > Date.now(); }
    private profile(settings: TenantSettings) { const value = String(settings?.appointments?.industry_profile || 'GENERIC').toUpperCase(); return ['SALON', 'SPA', 'CLINIC'].includes(value) ? value : 'GENERIC'; }
    private timezone(settings: TenantSettings) { return String(settings?.appointments?.timezone || 'America/Sao_Paulo'); }
    private settingsView(settings: TenantSettings) { const item = settings?.appointments || {}; return { minNoticeHours: Math.max(0, Number(item.min_notice_hours ?? 2)), maxAdvanceDays: Math.max(1, Number(item.max_advance_days ?? 60)), allowCustomerCancellation: item.allow_customer_cancellation !== false, cancellationLimitHours: Math.max(0, Number(item.cancellation_limit_hours ?? 6)), defaultReminderHours: Math.max(1, Number(item.default_reminder_hours ?? 24)) }; }
    private copy(profile: string) { const map: Record<string, any> = { SALON: { client: 'Cliente', professional: 'Profissional', service: 'Serviço' }, SPA: { client: 'Cliente', professional: 'Terapeuta', service: 'Tratamento' }, CLINIC: { client: 'Paciente', professional: 'Profissional', service: 'Consulta' }, GENERIC: { client: 'Cliente', professional: 'Responsável', service: 'Serviço' } }; return map[profile] || map.GENERIC; }
    private serviceView(item: AppointmentService) { return { id: item.id, name: item.name, category: '', description: item.description || '', imageUrl: item.imageUrl || null, icon: item.icon || '✦', color: item.color || '#176b5b', durationMinutes: item.durationMinutes, bufferMinutes: item.bufferMinutes, price: Number(item.price), confirmationMode: item.confirmationMode, active: item.active, version: item.version }; }
    private scheduleView(rows: any[]) { const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; return rows.reduce((output: Record<string, string[]>, row: any) => { output[days[Number(row.weekday)]] = [String(row.start_time).slice(0,5), String(row.end_time).slice(0,5)]; return output; }, {}); }
    private professionalView(item: AppointmentProfessional) { return { id: item.id, name: item.name, role: item.roleLabel || '', imageUrl: item.imageUrl || null, initials: item.initials || this.initials(item.name), color: item.color || '#176b5b', active: item.active, concurrencyLimit: item.concurrencyLimit, version: item.version }; }
    private appointmentView(item: Appointment) { return { id: item.id, code: item.displayCode, date: this.localDate(item.startAt), time: this.localTime(item.startAt), endTime: this.localTime(item.endAt), serviceId: item.serviceId, professionalId: item.professionalId, customer: item.customerName, phone: item.customerPhone, status: item.status, source: item.source, notes: item.notes, version: item.version, createdAt: item.createdAt }; }
    private async ensureCategory(tenantId: string, name: unknown) { const label = this.clean(name); if (!label) return null; const rows = await this.dataSource.query(`INSERT INTO appointment_service_categories (tenant_id,name) VALUES($1,$2) ON CONFLICT (tenant_id, lower(name)) DO UPDATE SET updated_at=now() RETURNING id`, [tenantId, label]); return rows[0].id; }
    private async replaceProfessionalServices(tenantId: string, professionalId: string, ids: any) { if (!Array.isArray(ids)) return; const valid = ids.map(String).filter(Boolean); await this.dataSource.transaction(async (manager) => { await manager.query(`DELETE FROM appointment_service_professionals WHERE tenant_id=$1 AND professional_id=$2`, [tenantId, professionalId]); for (const serviceId of valid) await manager.query(`INSERT INTO appointment_service_professionals (tenant_id,service_id,professional_id) SELECT $1,id,$2 FROM appointment_services WHERE tenant_id=$1 AND id=$3 ON CONFLICT DO NOTHING`, [tenantId, professionalId, serviceId]); }); }
    private async replaceSchedule(tenantId: string, professionalId: string, schedule: any) { if (!schedule || typeof schedule !== 'object') return; const days: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }; await this.dataSource.transaction(async (manager) => { await manager.query(`DELETE FROM appointment_availability_rules WHERE tenant_id=$1 AND professional_id=$2`, [tenantId, professionalId]); for (const [key, value] of Object.entries(schedule)) { const range: any = value; if (days[key] === undefined || !Array.isArray(range) || range.length < 2 || !range[0] || !range[1]) continue; await manager.query(`INSERT INTO appointment_availability_rules (tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)`, [tenantId, professionalId, days[key], String(range[0]), String(range[1])]); } }); }
    private async professionalServiceIds(tenantId: string, professionalId: string) { const rows = await this.dataSource.query(`SELECT service_id FROM appointment_service_professionals WHERE tenant_id=$1 AND professional_id=$2`, [tenantId, professionalId]); return rows.map((row: any) => row.service_id); }
    private async selectProfessional(tenantId: string, serviceId: string, requested: unknown) { const id = String(requested || ''); const params = [tenantId, serviceId]; const filter = id && id !== 'ANY' ? ' AND p.id = $3' : ''; if (filter) params.push(id); const rows = await this.dataSource.query(`SELECT p.* FROM appointment_professionals p JOIN appointment_service_professionals sp ON sp.professional_id=p.id AND sp.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND sp.service_id=$2 AND p.active=true${filter} ORDER BY p.name ASC LIMIT 1`, params); if (!rows.length) throw new BadRequestException('Não há profissional habilitado para esse serviço.'); return this.professionals.create({ id: rows[0].id, tenantId: rows[0].tenant_id, name: rows[0].name, roleLabel: rows[0].role_label, active: rows[0].active, concurrencyLimit: rows[0].concurrency_limit }); }
    private async upsertCustomer(tenantId: string, phoneNormalized: string, name: string) { let customer = await this.customers.findOne({ where: { tenantId, phoneNormalized } }); if (!customer) customer = this.customers.create({ tenantId, phoneNormalized, name, active: true }); else if (name && customer.name !== name) customer.name = name; return this.customers.save(customer); }
    private async credential(slug: string, raw: string, purpose: string) { if (!raw) throw new ForbiddenException('Abra o link enviado pelo estabelecimento para continuar.'); const rows = await this.dataSource.query(`SELECT c.* FROM appointment_access_credentials c JOIN tenants t ON t.id=c.tenant_id WHERE t.slug=$1 AND c.token_hash=$2 AND c.purpose=$3 AND c.revoked_at IS NULL AND c.expires_at>now() LIMIT 1`, [slug, createHash('sha256').update(raw).digest('hex'), purpose]); if (!rows.length) throw new ForbiddenException('Este link expirou ou não está mais disponível. Peça um novo acesso pelo WhatsApp.'); await this.dataSource.query(`UPDATE appointment_access_credentials SET last_used_at=now() WHERE id=$1`, [rows[0].id]); return rows[0]; }
    private async nextCode(manager: any, tenantId: string) { for (let i = 0; i < 4; i += 1) { const code = randomBytes(3).toString('hex').toUpperCase(); const found = await manager.findOne(Appointment, { where: { tenantId, displayCode: code } }); if (!found) return code; } return randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); }
    private async event(tenantId: string, appointmentId: string, type: string, actor: Actor, reason: string | null, payload: Record<string, unknown>) { await this.dataSource.query(`INSERT INTO appointment_events (tenant_id,appointment_id,event_type,actor_type,actor_id,reason,payload) VALUES($1,$2,$3,$4,$5,$6,$7)`, [tenantId, appointmentId, type, actor?.userId ? 'USER' : 'SYSTEM', actor?.userId || null, reason, JSON.stringify(payload)]); }
    private async enqueueNotification(appointment: Appointment, eventType: string) {
        if (!appointment.customerPhone) return;
        const trigger = this.notificationTrigger(eventType);
        if (!trigger) return;
        const tenant = await this.tenants.findOne({ where: { id: appointment.tenantId } });
        if (!tenant) return;

        const published = await this.automations.findOne({
            where: { tenantId: appointment.tenantId, status: 'PUBLISHED' },
            order: { version: 'DESC' },
        });
        const nodes = Array.isArray(published?.definition?.triggers?.[trigger])
            ? published!.definition.triggers[trigger]
            : [];
        // One notification per milestone is intentional: this module was
        // designed to replace long WhatsApp conversations, not recreate them.
        const configured = nodes.find((node: any) => node?.type === 'MESSAGE' && node?.enabled !== false && String(node?.text || '').trim());
        const body = this.expandAppointmentMessage(
            configured?.text || this.defaultAppointmentMessage(trigger),
            appointment,
            tenant.name,
        );
        if (!body) return;

        const notificationId = uuidv5(`${appointment.tenantId}:${appointment.id}:${trigger}:v1`, APPOINTMENT_NOTIFICATION_NAMESPACE);
        await this.dataSource.query(
            `INSERT INTO outbox_messages
                (id, tenant_id, destination, recipient, payload, template_id, sent, attempts, max_attempts, created_at)
             VALUES ($1, $2, 'whatsapp', $3, $4, $5, false, 0, 3, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [notificationId, appointment.tenantId, String(appointment.customerPhone).replace(/\D/g, ''), body, `appointment_${trigger.toLowerCase()}`],
        );
    }

    private notificationTrigger(eventType: string): string | null {
        const value = String(eventType || '').toUpperCase();
        if (value === 'CONFIRMED' || value === 'BOOKING_CONFIRMED') return 'BOOKING_CONFIRMED';
        if (value === 'PENDING_APPROVAL' || value === 'BOOKING_REQUESTED') return 'BOOKING_REQUESTED';
        if (value === 'CANCELED_BY_TENANT' || value === 'CANCELED_BY_CUSTOMER' || value === 'BOOKING_CANCELED') return 'BOOKING_CANCELED';
        return null;
    }

    private defaultAppointmentMessage(trigger: string): string {
        if (trigger === 'BOOKING_REQUESTED') return 'Olá, {cliente}! ✂️\n\nRecebemos seu pedido de horário para {serviço}, em {data}, às {hora}. A equipe vai conferir a agenda e avisar você por aqui.\n\nObrigada pelo contato e pela preferência.';
        if (trigger === 'BOOKING_CANCELED') return 'Olá, {cliente}. Seu agendamento de {serviço}, previsto para {data}, foi cancelado. Quando quiser, você pode escolher um novo horário.';
        return 'Olá, {cliente}! ✂️\n\nSeu agendamento de {serviço} está confirmado para {data}, às {hora}, com {profissional}.\n\nObrigada pelo contato e pela preferência. Será um prazer receber você no {estabelecimento}!';
    }

    private expandAppointmentMessage(template: unknown, appointment: Appointment, tenantName: string): string {
        const date = this.localDate(appointment.startAt).split('-').reverse().join('/');
        const time = this.localTime(appointment.startAt);
        const replacements: Record<string, string> = {
            '{cliente}': String(appointment.customerName || 'Cliente').trim() || 'Cliente',
            '{serviço}': String(appointment.serviceNameSnapshot || 'serviço').trim() || 'serviço',
            '{servico}': String(appointment.serviceNameSnapshot || 'serviço').trim() || 'serviço',
            '{data}': date,
            '{hora}': time,
            '{profissional}': String(appointment.professionalNameSnapshot || 'nossa equipe').trim() || 'nossa equipe',
            '{estabelecimento}': String(tenantName || 'nosso espaço').trim() || 'nosso espaço',
        };
        let body = String(template || '').trim();
        for (const [token, value] of Object.entries(replacements)) body = body.split(token).join(value);
        return body.slice(0, 1200).trim();
    }
    private defaultAutomation() { return { status: 'DRAFT', version: 0, triggers: { BOOKING_CONFIRMED: [], BOOKING_REQUESTED: [], BOOKING_CANCELED: [], BOOKING_REMINDER_DUE: [] } }; }
    private asDate(date: unknown, time: unknown) { const value = `${String(date)}T${String(time)}:00-03:00`; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Data ou horário inválido.'); return parsed; }
    private localDate(value: any) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
    private localTime(value: any) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
    private clean(value: unknown) { const item = String(value ?? '').trim().replace(/\s+/g, ' '); return item ? item.slice(0, 5000) : null; }
    private required(value: unknown, message: string) { if (!String(value ?? '').trim()) throw new BadRequestException(message); }
    private integer(value: unknown, min: number, max: number, message: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new BadRequestException(message); return parsed; }
    private initials(value: unknown) { return String(value || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PR'; }
}
