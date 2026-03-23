import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { createHash } from 'crypto';
import { Tenant, TenantSettings } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';

type TenantPayload = {
    name?: string;
    slug?: string;
    whatsapp_number?: string;
    waba_id?: string;
    meta_token?: string;
    message_price?: number;
    admin_email?: string;
    admin_password?: string;
};

type SuperAdminActorPayload = {
    receivedKey?: string;
    operatorName?: string;
    sourceIp?: string;
    userAgent?: string;
};

type SuperAdminActorContext = {
    operatorName: string | null;
    keyFingerprint: string | null;
    sourceIp: string | null;
    userAgent: string | null;
};

@Injectable()
export class SuperAdminService {
    private readonly logger = new Logger(SuperAdminService.name);

    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly dataSource: DataSource,
    ) { }

    assertAccess(receivedKey?: string) {
        const configured = (process.env.SUPER_ADMIN_KEY || '').trim();
        if (!configured) return;
        if ((receivedKey || '').trim() !== configured) {
            throw new ForbiddenException('Acesso Super Admin negado.');
        }
    }

    async getMetrics() {
        const hasMessageLogs = await this.hasMessageLogsTable();
        const totalsRows = await this.dataSource.query(
            `SELECT
                COUNT(*)::int AS total_tenants,
                COUNT(*) FILTER (WHERE active = true)::int AS active_tenants
             FROM tenants`,
        );

        const msgRows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM message_logs`,
            )
            : [{ msg_in: 0, msg_out: 0 }];

        const topRows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.active,
                    COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM tenants t
                 LEFT JOIN message_logs ml ON ml.tenant_id = t.id
                 GROUP BY t.id, t.name, t.active
                 ORDER BY (COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0) +
                           COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)) DESC, t.name ASC
                 LIMIT 10`,
            )
            : await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.active,
                    0::int AS msg_in,
                    0::int AS msg_out
                 FROM tenants t
                 ORDER BY t.name ASC
                 LIMIT 10`,
            );

        const totals = totalsRows?.[0] || {};
        const msg = msgRows?.[0] || {};
        const topTenants = (topRows || []).map((row: any) => {
            const inCount = Number(row.msg_in || 0);
            const outCount = Number(row.msg_out || 0);
            return {
                id: row.id,
                name: row.name,
                status: row.active ? 'ACTIVE' : 'PAUSED',
                in: inCount,
                out: outCount,
                total: inCount + outCount,
            };
        });

        return {
            totalTenants: Number(totals.total_tenants || 0),
            activeTenants: Number(totals.active_tenants || 0),
            msgIn: Number(msg.msg_in || 0),
            msgOut: Number(msg.msg_out || 0),
            topTenants,
        };
    }

    async listTenants() {
        const hasMessageLogs = await this.hasMessageLogsTable();
        const rows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.slug,
                    t.whatsapp_number,
                    t.waba_id,
                    t.active,
                    t.is_open,
                    t.wallet_balance,
                    t.billing_plan,
                    t.message_price,
                    t.created_at,
                    admin_user.email AS admin_email,
                    COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM tenants t
                 LEFT JOIN LATERAL (
                    SELECT u.email
                    FROM users u
                    WHERE u.tenant_id = t.id
                    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at ASC
                    LIMIT 1
                 ) admin_user ON true
                 LEFT JOIN message_logs ml ON ml.tenant_id = t.id
                 GROUP BY
                    t.id, t.name, t.slug, t.whatsapp_number, t.waba_id, t.active, t.is_open, t.wallet_balance, t.billing_plan, t.message_price, t.created_at, admin_user.email
                 ORDER BY t.created_at DESC`,
            )
            : await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.slug,
                    t.whatsapp_number,
                    t.waba_id,
                    t.active,
                    t.is_open,
                    t.wallet_balance,
                    t.billing_plan,
                    t.message_price,
                    t.created_at,
                    admin_user.email AS admin_email,
                    0::int AS msg_in,
                    0::int AS msg_out
                 FROM tenants t
                 LEFT JOIN LATERAL (
                    SELECT u.email
                    FROM users u
                    WHERE u.tenant_id = t.id
                    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at ASC
                    LIMIT 1
                 ) admin_user ON true
                 ORDER BY t.created_at DESC`,
            );

        const webhookUrl = await this.getWebhookUrl();
        return (rows || []).map((row: any) => {
            const msgIn = Number(row.msg_in || 0);
            const msgOut = Number(row.msg_out || 0);
            return {
                id: row.id,
                name: row.name,
                slug: row.slug,
                whatsappNumber: row.whatsapp_number,
                wabaId: row.waba_id || '',
                adminEmail: row.admin_email || '',
                active: !!row.active,
                isOpen: !!row.is_open,
                walletBalance: Number(row.wallet_balance || 0),
                billingPlan: row.billing_plan || 'pre_paid',
                messagePrice: Number(row.message_price || 0.02),
                webhook: webhookUrl,
                msgsIn: msgIn,
                msgsOut: msgOut,
                msgs: msgIn + msgOut,
                createdAt: row.created_at,
            };
        });
    }

    async getOperationsOverview() {
        const [hasMessageLogs, hasOutboxMessages, hasPaymentAttempts, hasInboxEvents] = await Promise.all([
            this.hasMessageLogsTable(),
            this.hasOutboxMessagesTable(),
            this.hasPaymentAttemptsTable(),
            this.hasInboxEventsTable(),
        ]);

        const messageSelect = hasMessageLogs
            ? `
                    COALESCE(msg.messages_24h, 0)::int AS messages_24h,
                    COALESCE(msg.messages_7d, 0)::int AS messages_7d,
                    COALESCE(msg.messages_previous_7d, 0)::int AS messages_previous_7d,
                    msg.last_message_at AS last_message_at,
            `
            : `
                    0::int AS messages_24h,
                    0::int AS messages_7d,
                    0::int AS messages_previous_7d,
                    NULL::timestamp AS last_message_at,
            `;

        const inboxSelect = hasInboxEvents
            ? `
                    COALESCE(ib.inbox_events_24h, 0)::int AS inbox_events_24h,
                    COALESCE(ib.pending_inbox, 0)::int AS pending_inbox,
                    COALESCE(ib.stale_inbox, 0)::int AS stale_inbox,
                    ib.last_inbox_received_at AS last_inbox_received_at,
                    ib.last_inbox_processed_at AS last_inbox_processed_at,
            `
            : `
                    0::int AS inbox_events_24h,
                    0::int AS pending_inbox,
                    0::int AS stale_inbox,
                    NULL::timestamp AS last_inbox_received_at,
                    NULL::timestamp AS last_inbox_processed_at,
            `;

        const outboxSelect = hasOutboxMessages
            ? `
                    COALESCE(ob.outbox_sent_24h, 0)::int AS outbox_sent_24h,
                    COALESCE(ob.pending_outbox, 0)::int AS pending_outbox,
                    COALESCE(ob.stale_outbox, 0)::int AS stale_outbox,
                    COALESCE(ob.failed_outbox, 0)::int AS failed_outbox,
                    ob.oldest_pending_outbox_at AS oldest_pending_outbox_at,
                    ob.last_outbox_sent_at AS last_outbox_sent_at,
            `
            : `
                    0::int AS outbox_sent_24h,
                    0::int AS pending_outbox,
                    0::int AS stale_outbox,
                    0::int AS failed_outbox,
                    NULL::timestamp AS oldest_pending_outbox_at,
                    NULL::timestamp AS last_outbox_sent_at,
            `;

        const paymentSelect = hasPaymentAttempts
            ? `
                    COALESCE(pay.pending_payments, 0)::int AS pending_payments,
                    COALESCE(pay.stale_pending_payments, 0)::int AS stale_pending_payments,
                    COALESCE(pay.failed_payments_7d, 0)::int AS failed_payments_7d,
                    pay.last_payment_attempt_at AS last_payment_attempt_at
            `
            : `
                    0::int AS pending_payments,
                    0::int AS stale_pending_payments,
                    0::int AS failed_payments_7d,
                    NULL::timestamp AS last_payment_attempt_at
            `;

        const messageJoin = hasMessageLogs
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (WHERE ml.created_at >= NOW() - INTERVAL '24 hours') AS messages_24h,
                        COUNT(*) FILTER (WHERE ml.created_at >= NOW() - INTERVAL '7 days') AS messages_7d,
                        COUNT(*) FILTER (
                            WHERE ml.created_at >= NOW() - INTERVAL '14 days'
                              AND ml.created_at < NOW() - INTERVAL '7 days'
                        ) AS messages_previous_7d,
                        MAX(ml.created_at) AS last_message_at
                    FROM message_logs ml
                    WHERE ml.tenant_id = t.id
                ) msg ON true
            `
            : '';

        const inboxJoin = hasInboxEvents
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (WHERE ie.received_at >= NOW() - INTERVAL '24 hours') AS inbox_events_24h,
                        COUNT(*) FILTER (WHERE ie.processed = FALSE) AS pending_inbox,
                        COUNT(*) FILTER (
                            WHERE ie.processed = FALSE
                              AND ie.received_at <= NOW() - INTERVAL '15 minutes'
                        ) AS stale_inbox,
                        MAX(ie.received_at) AS last_inbox_received_at,
                        MAX(ie.processed_at) AS last_inbox_processed_at
                    FROM inbox_events ie
                    WHERE ie.tenant_id = t.id
                ) ib ON true
            `
            : '';

        const outboxJoin = hasOutboxMessages
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (
                            WHERE om.sent = TRUE
                              AND COALESCE(om.sent_at, om.created_at) >= NOW() - INTERVAL '24 hours'
                        ) AS outbox_sent_24h,
                        COUNT(*) FILTER (WHERE om.sent = FALSE) AS pending_outbox,
                        COUNT(*) FILTER (
                            WHERE om.sent = FALSE
                              AND COALESCE(om.next_retry_at, om.created_at) <= NOW() - INTERVAL '30 minutes'
                        ) AS stale_outbox,
                        COUNT(*) FILTER (
                            WHERE om.sent = FALSE
                              AND om.attempts >= om.max_attempts
                        ) AS failed_outbox,
                        MIN(COALESCE(om.next_retry_at, om.created_at)) FILTER (WHERE om.sent = FALSE) AS oldest_pending_outbox_at,
                        MAX(COALESCE(om.sent_at, om.created_at)) FILTER (WHERE om.sent = TRUE) AS last_outbox_sent_at
                    FROM outbox_messages om
                    WHERE om.tenant_id = t.id
                ) ob ON true
            `
            : '';

        const paymentJoin = hasPaymentAttempts
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (
                            WHERE pa.status IN ('CREATED', 'PROCESSING', 'PENDING', 'UNKNOWN')
                        ) AS pending_payments,
                        COUNT(*) FILTER (
                            WHERE pa.status IN ('CREATED', 'PROCESSING', 'PENDING', 'UNKNOWN')
                              AND pa.created_at <= NOW() - INTERVAL '60 minutes'
                        ) AS stale_pending_payments,
                        COUNT(*) FILTER (
                            WHERE pa.status IN ('REJECTED', 'ERROR', 'EXPIRED')
                              AND pa.created_at >= NOW() - INTERVAL '7 days'
                        ) AS failed_payments_7d,
                        MAX(pa.created_at) AS last_payment_attempt_at
                    FROM payment_attempts pa
                    WHERE pa.tenant_id = t.id
                ) pay ON true
            `
            : '';

        const rows = await this.dataSource.query(
            `SELECT
                t.id,
                t.name,
                t.slug,
                t.active,
                t.created_at,
                t.whatsapp_number,
                t.waba_id,
                t.meta_token,
                t.wallet_balance,
                t.billing_plan,
                t.message_price,
                t.settings,
                admin_user.email AS admin_email,
                ${messageSelect}
                ${inboxSelect}
                ${outboxSelect}
                ${paymentSelect}
             FROM tenants t
             LEFT JOIN LATERAL (
                SELECT u.email
                FROM users u
                WHERE u.tenant_id = t.id
                ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at ASC
                LIMIT 1
             ) admin_user ON true
             ${messageJoin}
             ${inboxJoin}
             ${outboxJoin}
             ${paymentJoin}
             ORDER BY t.active DESC, t.created_at DESC, t.name ASC`,
        );

        const tenants = (rows || [])
            .map((row: any) => this.mapOperationsTenantRow(row))
            .sort((left: any, right: any) => {
                const severityRank = { CRITICAL: 0, WARNING: 1, HEALTHY: 2, PAUSED: 3 };
                const rankDiff =
                    (severityRank[left.healthStatus] ?? 9) - (severityRank[right.healthStatus] ?? 9);
                if (rankDiff !== 0) return rankDiff;
                if (left.healthScore !== right.healthScore) return left.healthScore - right.healthScore;
                return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
            });

        const summary = tenants.reduce(
            (acc: any, tenant: any) => {
                acc.totalTenants += 1;
                if (tenant.active) acc.activeTenants += 1;
                if (tenant.healthStatus === 'HEALTHY') acc.healthyTenants += 1;
                if (tenant.healthStatus === 'WARNING') acc.warningTenants += 1;
                if (tenant.healthStatus === 'CRITICAL') acc.criticalTenants += 1;
                if (tenant.healthStatus === 'PAUSED') acc.pausedTenants += 1;
                if (tenant.onboarding.completionPercent < 100) acc.onboardingPendingTenants += 1;
                if (tenant.riskFlags.some((flag: any) =>
                    ['LOW_BALANCE', 'NEGATIVE_BALANCE'].includes(String(flag.code || '')),
                )) {
                    acc.lowBalanceTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'CONSUMPTION_SPIKE')) {
                    acc.abnormalConsumptionTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) =>
                    ['OUTBOX_STALE', 'OUTBOX_BACKLOG', 'OUTBOX_RETRIES_EXHAUSTED'].includes(String(flag.code || '')),
                )) {
                    acc.outboxAlertTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) =>
                    ['INBOX_STALE', 'INBOX_BACKLOG', 'WEBHOOK_SILENCE'].includes(String(flag.code || '')),
                )) {
                    acc.webhookQueueTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'WEBHOOK_SILENCE')) {
                    acc.webhookSilentTenants += 1;
                }
                if (tenant.operations.pendingPayments > 0) {
                    acc.pendingPaymentsTenants += 1;
                }
                return acc;
            },
            {
                totalTenants: 0,
                activeTenants: 0,
                healthyTenants: 0,
                warningTenants: 0,
                criticalTenants: 0,
                pausedTenants: 0,
                onboardingPendingTenants: 0,
                lowBalanceTenants: 0,
                abnormalConsumptionTenants: 0,
                outboxAlertTenants: 0,
                webhookQueueTenants: 0,
                webhookSilentTenants: 0,
                pendingPaymentsTenants: 0,
            },
        );

        return {
            generatedAt: new Date().toISOString(),
            summary,
            tenants,
        };
    }

    async listAuditLogs(limitRaw?: number) {
        const limit = Math.max(1, Math.min(100, Number(limitRaw || 20) || 20));
        const available = await this.hasSuperAdminAuditLogsTable();
        if (!available) {
            return {
                available: false,
                logs: [],
            };
        }

        const rows = await this.dataSource.query(
            `SELECT
                l.id,
                l.action,
                l.entity_type,
                l.entity_id,
                l.tenant_id,
                l.operator_name,
                l.operator_key_fingerprint,
                l.source_ip,
                l.user_agent,
                l.details,
                l.created_at,
                t.name AS tenant_name
             FROM super_admin_audit_logs l
             LEFT JOIN tenants t ON t.id = l.tenant_id
             ORDER BY l.created_at DESC
             LIMIT $1`,
            [limit],
        );

        return {
            available: true,
            logs: (rows || []).map((row: any) => ({
                id: row.id,
                action: row.action,
                entityType: row.entity_type,
                entityId: row.entity_id || null,
                tenantId: row.tenant_id || null,
                tenantName: row.tenant_name || null,
                operatorName: row.operator_name || null,
                operatorKeyFingerprint: row.operator_key_fingerprint || null,
                sourceIp: row.source_ip || null,
                userAgent: row.user_agent || null,
                details: this.parseJsonRecord(row.details),
                createdAt: row.created_at,
            })),
        };
    }

    async createTenant(payload: TenantPayload, actorPayload?: SuperAdminActorPayload) {
        const name = String(payload.name || '').trim();
        const slug = String(payload.slug || '').trim().toLowerCase();
        const whatsappNumber = this.normalizeDigits(payload.whatsapp_number);
        const wabaId = this.normalizeDigits(payload.waba_id);
        const metaToken = String(payload.meta_token || '').trim();
        const adminEmail = String(payload.admin_email || '').trim().toLowerCase();
        const adminPassword = String(payload.admin_password || '');

        if (!name || !slug || !whatsappNumber || !wabaId || !adminEmail || !adminPassword) {
            throw new BadRequestException('Preencha nome, slug, WhatsApp, Phone-Number-ID, email e senha.');
        }

        await this.ensureTenantUniqueness(null, slug, whatsappNumber, wabaId);

        const defaults: TenantSettings = {
            split_enabled: true,
            auto_accept_orders: false,
            nps_enabled: true,
            voucher_enabled: true,
            service_fee_percent: 10,
        };

        const tenant = this.tenantRepo.create({
            name,
            slug,
            whatsappNumber,
            wabaId,
            metaToken: metaToken || null,
            messagePrice: payload.message_price !== undefined ? payload.message_price : 0.02,
            active: true,
            isOpen: false,
            settings: defaults,
        });
        const savedTenant = await this.tenantRepo.save(tenant);

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(adminPassword, salt);

        const adminUser = this.userRepo.create({
            tenantId: savedTenant.id,
            name: 'Administrador',
            email: adminEmail,
            phone: whatsappNumber,
            passwordHash,
            role: 'ADMIN',
            active: true,
        });
        await this.userRepo.save(adminUser);

        await this.recordAuditLog({
            action: 'TENANT_CREATED',
            entityType: 'TENANT',
            entityId: savedTenant.id,
            tenantId: savedTenant.id,
            actor: this.resolveActorContext(actorPayload),
            details: {
                summary: `Tenant ${savedTenant.name} criado com slug ${savedTenant.slug}.`,
                slug: savedTenant.slug,
                admin_email: adminEmail,
                whatsapp_number: savedTenant.whatsappNumber,
                waba_id: savedTenant.wabaId || null,
                billing_plan: savedTenant.billingPlan,
                message_price: Number(savedTenant.messagePrice || 0),
            },
        });

        return {
            id: savedTenant.id,
            name: savedTenant.name,
            slug: savedTenant.slug,
            whatsappNumber: savedTenant.whatsappNumber,
            wabaId: savedTenant.wabaId || '',
            adminEmail,
            webhook: await this.getWebhookUrl(),
        };
    }

    async updateTenant(id: string, payload: TenantPayload, actorPayload?: SuperAdminActorPayload) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
        const actor = this.resolveActorContext(actorPayload);
        const changedFields: string[] = [];

        const name = String(payload.name || '').trim();
        const slug = String(payload.slug || '').trim().toLowerCase();
        const whatsappNumber = this.normalizeDigits(payload.whatsapp_number);
        const wabaId = this.normalizeDigits(payload.waba_id);
        const metaToken = String(payload.meta_token || '').trim();
        const adminEmail = String(payload.admin_email || '').trim().toLowerCase();
        const adminPassword = String(payload.admin_password || '');

        await this.ensureTenantUniqueness(id, slug || tenant.slug, whatsappNumber || tenant.whatsappNumber, wabaId || tenant.wabaId || '');

        if (name && tenant.name !== name) {
            tenant.name = name;
            changedFields.push('name');
        }
        if (slug && tenant.slug !== slug) {
            tenant.slug = slug;
            changedFields.push('slug');
        }
        if (whatsappNumber && tenant.whatsappNumber !== whatsappNumber) {
            tenant.whatsappNumber = whatsappNumber;
            changedFields.push('whatsapp_number');
        }
        if (wabaId && tenant.wabaId !== wabaId) {
            tenant.wabaId = wabaId;
            changedFields.push('waba_id');
        }
        if (metaToken && tenant.metaToken !== metaToken) {
            tenant.metaToken = metaToken;
            changedFields.push('meta_token');
        }
        if (payload.message_price !== undefined && tenant.messagePrice !== payload.message_price) {
            tenant.messagePrice = payload.message_price;
            changedFields.push('message_price');
        }

        await this.tenantRepo.save(tenant);

        let passwordChanged = false;
        if (adminEmail || adminPassword) {
            let adminUser = await this.userRepo.findOne({
                where: { tenantId: tenant.id, role: 'ADMIN' },
                order: { createdAt: 'ASC' },
            });

            if (!adminUser) {
                adminUser = this.userRepo.create({
                    tenantId: tenant.id,
                    name: 'Administrador',
                    email: adminEmail || `admin+${tenant.slug}@clickgarcom.local`,
                    phone: tenant.whatsappNumber,
                    role: 'ADMIN',
                    active: true,
                    passwordHash: '',
                });
            }

            if (adminEmail && adminUser.email !== adminEmail) {
                adminUser.email = adminEmail;
                changedFields.push('admin_email');
            }
            if (adminPassword) {
                const salt = await bcrypt.genSalt(10);
                adminUser.passwordHash = await bcrypt.hash(adminPassword, salt);
                passwordChanged = true;
            }
            if (!adminUser.passwordHash) {
                const salt = await bcrypt.genSalt(10);
                adminUser.passwordHash = await bcrypt.hash('123456', salt);
                passwordChanged = true;
            }

            await this.userRepo.save(adminUser);
        }

        await this.recordAuditLog({
            action: 'TENANT_UPDATED',
            entityType: 'TENANT',
            entityId: tenant.id,
            tenantId: tenant.id,
            actor,
            details: {
                summary: changedFields.length
                    ? `Tenant ${tenant.name} atualizado: ${changedFields.join(', ')}${passwordChanged ? ', admin_password' : ''}.`
                    : `Tenant ${tenant.name} revisado sem mudanças materiais.`,
                changed_fields: changedFields,
                admin_password_changed: passwordChanged,
            },
        });

        return {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            whatsappNumber: tenant.whatsappNumber,
            wabaId: tenant.wabaId || '',
            webhook: await this.getWebhookUrl(),
            updated: true,
        };
    }

    async setTenantActive(id: string, active: boolean, actorPayload?: SuperAdminActorPayload) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
        tenant.active = !!active;
        await this.tenantRepo.save(tenant);

        await this.recordAuditLog({
            action: 'TENANT_STATUS_CHANGED',
            entityType: 'TENANT',
            entityId: tenant.id,
            tenantId: tenant.id,
            actor: this.resolveActorContext(actorPayload),
            details: {
                summary: `Tenant ${tenant.name} foi ${tenant.active ? 'ativado' : 'pausado'}.`,
                active: tenant.active,
            },
        });

        return {
            id: tenant.id,
            active: tenant.active,
        };
    }

    async updateWallet(
        id: string,
        payload: { amount?: number; billing_plan?: string },
        actorPayload?: SuperAdminActorPayload,
    ) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
        const previousBillingPlan = tenant.billingPlan;
        const previousBalance = Number(tenant.walletBalance || 0);

        if (payload.billing_plan) {
            const plan = String(payload.billing_plan).trim();
            if (['pre_paid', 'post_paid'].includes(plan)) {
                tenant.billingPlan = plan;
            } else {
                throw new BadRequestException('O plano de faturamento deve ser "pre_paid" ou "post_paid".');
            }
        }

        if (payload.amount !== undefined && payload.amount !== null) {
            const amount = Number(payload.amount);
            if (!Number.isFinite(amount)) {
                throw new BadRequestException('O valor recarregado deve ser um numero valido.');
            }
            tenant.walletBalance = Number(tenant.walletBalance || 0) + amount;
        }

        await this.tenantRepo.save(tenant);

        await this.recordAuditLog({
            action: 'TENANT_WALLET_UPDATED',
            entityType: 'TENANT',
            entityId: tenant.id,
            tenantId: tenant.id,
            actor: this.resolveActorContext(actorPayload),
            details: {
                summary: `Carteira de ${tenant.name} ajustada para saldo ${Number(tenant.walletBalance || 0).toFixed(2)} e plano ${tenant.billingPlan}.`,
                previous_billing_plan: previousBillingPlan,
                current_billing_plan: tenant.billingPlan,
                previous_balance: previousBalance,
                current_balance: Number(tenant.walletBalance || 0),
                delta_amount: payload.amount !== undefined && payload.amount !== null ? Number(payload.amount) : 0,
            },
        });

        return {
            id: tenant.id,
            walletBalance: tenant.walletBalance,
            billingPlan: tenant.billingPlan,
        };
    }

    private async ensureTenantUniqueness(
        currentTenantId: string | null,
        slug: string,
        whatsappNumber: string,
        wabaId: string,
    ) {
        const existingSlug = await this.tenantRepo.findOne({ where: { slug } });
        if (existingSlug && existingSlug.id !== currentTenantId) {
            throw new BadRequestException('Slug ja cadastrado.');
        }

        const existingPhone = await this.tenantRepo.findOne({ where: { whatsappNumber } });
        if (existingPhone && existingPhone.id !== currentTenantId) {
            throw new BadRequestException('Numero de WhatsApp ja cadastrado.');
        }

        if (wabaId) {
            const existingWaba = await this.tenantRepo.findOne({ where: { wabaId } });
            if (existingWaba && existingWaba.id !== currentTenantId) {
                throw new BadRequestException('Phone-Number-ID da Meta ja cadastrado.');
            }
        }
    }

    private normalizeDigits(value?: string): string {
        return String(value || '').replace(/\D/g, '');
    }

    private mapOperationsTenantRow(row: any) {
        const settings = this.parseTenantSettings(row.settings);
        const messagePrice = Number(row.message_price || 0);
        const messages24h = Number(row.messages_24h || 0);
        const messages7d = Number(row.messages_7d || 0);
        const messagesPrevious7d = Number(row.messages_previous_7d || 0);
        const inboxEvents24h = Number(row.inbox_events_24h || 0);
        const pendingInbox = Number(row.pending_inbox || 0);
        const staleInbox = Number(row.stale_inbox || 0);
        const outboxSent24h = Number(row.outbox_sent_24h || 0);
        const pendingOutbox = Number(row.pending_outbox || 0);
        const staleOutbox = Number(row.stale_outbox || 0);
        const failedOutbox = Number(row.failed_outbox || 0);
        const pendingPayments = Number(row.pending_payments || 0);
        const stalePendingPayments = Number(row.stale_pending_payments || 0);
        const failedPayments7d = Number(row.failed_payments_7d || 0);
        const walletBalance = Number(row.wallet_balance || 0);
        const billingPlan = String(row.billing_plan || 'pre_paid').trim();
        const averageDailyMessages = messages7d / 7;
        const previousDailyAverage = messagesPrevious7d / 7;
        const estimatedDailyBurn = averageDailyMessages * Math.max(messagePrice, 0);
        const daysOfBalance =
            billingPlan === 'pre_paid' && estimatedDailyBurn > 0
                ? walletBalance / estimatedDailyBurn
                : null;
        const onboarding = this.buildOnboardingChecklist({
            metaToken: row.meta_token,
            wabaId: row.waba_id,
            whatsappNumber: row.whatsapp_number,
            adminEmail: row.admin_email,
            messagePrice,
            settings,
        });
        const riskFlags = this.buildOperationsRiskFlags({
            active: !!row.active,
            createdAt: row.created_at,
            onboarding,
            billingPlan,
            walletBalance,
            daysOfBalance,
            messages24h,
            messages7d,
            previousDailyAverage,
            inboxEvents24h,
            pendingInbox,
            staleInbox,
            lastInboxReceivedAt: row.last_inbox_received_at,
            outboxSent24h,
            pendingOutbox,
            staleOutbox,
            failedOutbox,
            oldestPendingOutboxAt: row.oldest_pending_outbox_at,
            pendingPayments,
            stalePendingPayments,
            failedPayments7d,
        });
        const healthScore = this.computeHealthScore(riskFlags);
        const healthStatus = this.resolveHealthStatus(!!row.active, riskFlags);

        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            active: !!row.active,
            adminEmail: row.admin_email || '',
            whatsappNumber: row.whatsapp_number || '',
            wabaId: row.waba_id || '',
            walletBalance,
            billingPlan,
            messagePrice,
            createdAt: row.created_at,
            healthScore,
            healthStatus,
            onboarding,
            operations: {
                messages24h,
                messages7d,
                messagesPrevious7d,
                inboxEvents24h,
                pendingInbox,
                staleInbox,
                lastInboxReceivedAt: row.last_inbox_received_at || null,
                lastInboxProcessedAt: row.last_inbox_processed_at || null,
                outboxSent24h,
                averageDailyMessages,
                previousDailyAverage,
                estimatedDailyBurn,
                daysOfBalance,
                pendingOutbox,
                staleOutbox,
                failedOutbox,
                oldestPendingOutboxAt: row.oldest_pending_outbox_at || null,
                lastOutboxSentAt: row.last_outbox_sent_at || null,
                pendingPayments,
                stalePendingPayments,
                failedPayments7d,
                lastMessageAt: row.last_message_at || null,
                lastPaymentAttemptAt: row.last_payment_attempt_at || null,
            },
            riskFlags,
        };
    }

    private buildOnboardingChecklist(input: {
        metaToken?: unknown;
        wabaId?: unknown;
        whatsappNumber?: unknown;
        adminEmail?: unknown;
        messagePrice: number;
        settings: TenantSettings;
    }) {
        const items = [
            {
                key: 'meta_token',
                label: 'Token Meta',
                done: String(input.metaToken || '').trim().length > 0,
                optional: false,
            },
            {
                key: 'waba_id',
                label: 'Phone-Number-ID',
                done: String(input.wabaId || '').trim().length > 0,
                optional: false,
            },
            {
                key: 'whatsapp_number',
                label: 'WhatsApp comercial',
                done: String(input.whatsappNumber || '').trim().length > 0,
                optional: false,
            },
            {
                key: 'admin_access',
                label: 'Acesso admin',
                done: String(input.adminEmail || '').trim().length > 0,
                optional: false,
            },
            {
                key: 'message_price',
                label: 'Preco por mensagem',
                done: Number(input.messagePrice || 0) > 0,
                optional: false,
            },
            {
                key: 'mercado_pago',
                label: 'Mercado Pago',
                done:
                    String(input.settings?.mp_access_token || '').trim().length > 0 &&
                    String(input.settings?.mp_public_key || '').trim().length > 0,
                optional: true,
            },
        ];

        const requiredItems = items.filter((item) => !item.optional);
        const completedRequired = requiredItems.filter((item) => item.done).length;
        const completionPercent = requiredItems.length
            ? Math.round((completedRequired / requiredItems.length) * 100)
            : 100;

        return {
            items,
            requiredTotal: requiredItems.length,
            completedRequired,
            completionPercent,
            missingRequiredKeys: requiredItems.filter((item) => !item.done).map((item) => item.key),
            missingRequiredLabels: requiredItems.filter((item) => !item.done).map((item) => item.label),
        };
    }

    private buildOperationsRiskFlags(input: {
        active: boolean;
        createdAt?: string | Date | null;
        onboarding: {
            missingRequiredKeys: string[];
            missingRequiredLabels: string[];
        };
        billingPlan: string;
        walletBalance: number;
        daysOfBalance: number | null;
        messages24h: number;
        messages7d: number;
        previousDailyAverage: number;
        inboxEvents24h: number;
        pendingInbox: number;
        staleInbox: number;
        lastInboxReceivedAt?: string | Date | null;
        outboxSent24h: number;
        pendingOutbox: number;
        staleOutbox: number;
        failedOutbox: number;
        oldestPendingOutboxAt?: string | Date | null;
        pendingPayments: number;
        stalePendingPayments: number;
        failedPayments7d: number;
    }) {
        const flags: Array<{
            code: string;
            severity: 'WARNING' | 'CRITICAL';
            title: string;
            description: string;
        }> = [];

        const createdAt = input.createdAt ? new Date(input.createdAt) : null;
        const olderThanSevenDays =
            !!createdAt && Number.isFinite(createdAt.getTime())
                ? Date.now() - createdAt.getTime() >= 7 * 24 * 60 * 60 * 1000
                : false;
        const lastInboxReceivedAt = input.lastInboxReceivedAt ? new Date(input.lastInboxReceivedAt) : null;
        const hoursSinceLastInbox =
            !!lastInboxReceivedAt && Number.isFinite(lastInboxReceivedAt.getTime())
                ? (Date.now() - lastInboxReceivedAt.getTime()) / (60 * 60 * 1000)
                : null;

        if (input.active && input.onboarding.missingRequiredKeys.includes('meta_token')) {
            this.pushRisk(flags, {
                code: 'MISSING_META_TOKEN',
                severity: 'CRITICAL',
                title: 'Sem token Meta',
                description: 'O tenant não consegue operar a integração principal sem o token da Meta.',
            });
        }

        if (input.active && input.onboarding.missingRequiredKeys.includes('waba_id')) {
            this.pushRisk(flags, {
                code: 'MISSING_WABA_ID',
                severity: 'CRITICAL',
                title: 'Sem Phone-Number-ID',
                description: 'O vínculo do webhook com o número oficial ainda não foi concluído.',
            });
        }

        if (input.active && input.onboarding.missingRequiredKeys.includes('whatsapp_number')) {
            this.pushRisk(flags, {
                code: 'MISSING_WHATSAPP_NUMBER',
                severity: 'CRITICAL',
                title: 'Sem número comercial',
                description: 'Falta o número comercial que identifica o tenant nas mensagens do WhatsApp.',
            });
        }

        if (input.onboarding.missingRequiredKeys.includes('admin_access')) {
            this.pushRisk(flags, {
                code: 'MISSING_ADMIN_ACCESS',
                severity: 'WARNING',
                title: 'Sem admin principal',
                description: 'Não existe um acesso administrativo principal claramente configurado.',
            });
        }

        if (input.onboarding.missingRequiredKeys.includes('message_price')) {
            this.pushRisk(flags, {
                code: 'MISSING_MESSAGE_PRICE',
                severity: 'WARNING',
                title: 'Sem precificação',
                description: 'O custo por mensagem ainda não foi parametrizado corretamente.',
            });
        }

        if (input.active && input.billingPlan === 'pre_paid') {
            if (input.walletBalance < 0) {
                this.pushRisk(flags, {
                    code: 'NEGATIVE_BALANCE',
                    severity: 'CRITICAL',
                    title: 'Saldo negativo',
                    description: 'Tenant pré-pago já está operando abaixo do saldo disponível.',
                });
            } else if (input.daysOfBalance !== null && input.daysOfBalance < 3) {
                this.pushRisk(flags, {
                    code: 'LOW_BALANCE',
                    severity: 'CRITICAL',
                    title: 'Saldo crítico',
                    description: 'Pelo ritmo recente de uso, o saldo cobre menos de 3 dias.',
                });
            } else if (input.daysOfBalance !== null && input.daysOfBalance < 7) {
                this.pushRisk(flags, {
                    code: 'LOW_BALANCE',
                    severity: 'WARNING',
                    title: 'Saldo em risco',
                    description: 'Pelo ritmo recente de uso, o saldo cobre menos de 7 dias.',
                });
            }
        }

        if (
            input.active &&
            input.messages24h >= 25 &&
            input.previousDailyAverage > 0 &&
            input.messages24h > input.previousDailyAverage * 2.5
        ) {
            this.pushRisk(flags, {
                code: 'CONSUMPTION_SPIKE',
                severity: 'WARNING',
                title: 'Consumo fora do padrão',
                description: 'O volume das últimas 24h está muito acima da média da semana anterior.',
            });
        }

        if (input.active && input.staleInbox > 0) {
            this.pushRisk(flags, {
                code: 'INBOX_STALE',
                severity: 'CRITICAL',
                title: 'Webhook parado na inbox',
                description: 'Existem eventos recebidos e não processados há mais de 15 minutos.',
            });
        } else if (input.active && input.pendingInbox >= 10) {
            this.pushRisk(flags, {
                code: 'INBOX_BACKLOG',
                severity: 'WARNING',
                title: 'Inbox acumulada',
                description: 'O volume de eventos aguardando processamento já saiu do normal.',
            });
        }

        if (
            input.active &&
            olderThanSevenDays &&
            input.onboarding.missingRequiredKeys.length === 0 &&
            input.outboxSent24h > 0 &&
            input.inboxEvents24h === 0 &&
            hoursSinceLastInbox !== null &&
            hoursSinceLastInbox >= 36
        ) {
            this.pushRisk(flags, {
                code: 'WEBHOOK_SILENCE',
                severity: 'WARNING',
                title: 'Webhook sem eventos recentes',
                description: 'O tenant segue emitindo saída, mas ficou sem eventos de inbox nas últimas 24h.',
            });
        }

        if (input.active && input.staleOutbox > 0) {
            this.pushRisk(flags, {
                code: 'OUTBOX_STALE',
                severity: 'CRITICAL',
                title: 'Fila represada',
                description: 'Existem mensagens pendentes há mais de 30 minutos na outbox.',
            });
        } else if (input.active && input.pendingOutbox >= 10) {
            this.pushRisk(flags, {
                code: 'OUTBOX_BACKLOG',
                severity: 'WARNING',
                title: 'Outbox acumulada',
                description: 'O volume de mensagens pendentes já merece intervenção operacional.',
            });
        }

        if (input.active && input.failedOutbox > 0) {
            this.pushRisk(flags, {
                code: 'OUTBOX_RETRIES_EXHAUSTED',
                severity: 'CRITICAL',
                title: 'Outbox esgotou retentativas',
                description: 'Já existem mensagens que falharam em todas as tentativas de envio.',
            });
        }

        if (input.active && input.stalePendingPayments > 0) {
            this.pushRisk(flags, {
                code: 'STALE_PENDING_PAYMENTS',
                severity: 'WARNING',
                title: 'Pagamentos aguardando retorno',
                description: 'Existem tentativas de pagamento em aberto há mais de 60 minutos.',
            });
        }

        if (input.active && input.failedPayments7d >= 3) {
            this.pushRisk(flags, {
                code: 'PAYMENT_FAILURES',
                severity: 'WARNING',
                title: 'Falhas de pagamento',
                description: 'O tenant acumulou recusas ou erros recentes acima do normal.',
            });
        }

        if (
            input.active &&
            olderThanSevenDays &&
            input.messages7d === 0 &&
            input.onboarding.missingRequiredKeys.length === 0
        ) {
            this.pushRisk(flags, {
                code: 'NO_RECENT_ACTIVITY',
                severity: 'WARNING',
                title: 'Sem atividade recente',
                description: 'Tenant ativo e configurado, mas sem tráfego na última semana.',
            });
        }

        return flags;
    }

    private pushRisk(
        list: Array<{
            code: string;
            severity: 'WARNING' | 'CRITICAL';
            title: string;
            description: string;
        }>,
        risk: {
            code: string;
            severity: 'WARNING' | 'CRITICAL';
            title: string;
            description: string;
        },
    ) {
        const existing = list.find((item) => item.code === risk.code);
        if (existing) {
            if (existing.severity !== 'CRITICAL' && risk.severity === 'CRITICAL') {
                existing.severity = 'CRITICAL';
                existing.title = risk.title;
                existing.description = risk.description;
            }
            return;
        }
        list.push(risk);
    }

    private computeHealthScore(
        riskFlags: Array<{ severity: 'WARNING' | 'CRITICAL' }>,
    ) {
        const penalties = riskFlags.reduce((sum, flag) => sum + (flag.severity === 'CRITICAL' ? 25 : 10), 0);
        return Math.max(0, 100 - penalties);
    }

    private resolveHealthStatus(
        active: boolean,
        riskFlags: Array<{ severity: 'WARNING' | 'CRITICAL' }>,
    ) {
        if (!active) return 'PAUSED';
        if (riskFlags.some((flag) => flag.severity === 'CRITICAL')) return 'CRITICAL';
        if (riskFlags.some((flag) => flag.severity === 'WARNING')) return 'WARNING';
        return 'HEALTHY';
    }

    private parseTenantSettings(raw: unknown): TenantSettings {
        if (!raw) return {};
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed as TenantSettings
                    : {};
            } catch {
                return {};
            }
        }
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as TenantSettings;
        }
        return {};
    }

    private parseJsonRecord(raw: unknown): Record<string, unknown> {
        if (!raw) return {};
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed as Record<string, unknown>
                    : {};
            } catch {
                return {};
            }
        }
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as Record<string, unknown>;
        }
        return {};
    }

    private resolveActorContext(actorPayload?: SuperAdminActorPayload): SuperAdminActorContext {
        const operatorName = this.normalizeOptionalText(actorPayload?.operatorName, 120) || 'Operador não identificado';
        const receivedKey = String(actorPayload?.receivedKey || '').trim();
        return {
            operatorName,
            keyFingerprint: receivedKey
                ? createHash('sha256').update(receivedKey).digest('hex').slice(0, 12)
                : null,
            sourceIp: this.normalizeOptionalText(actorPayload?.sourceIp, 80),
            userAgent: this.normalizeOptionalText(actorPayload?.userAgent, 1000),
        };
    }

    private async recordAuditLog(input: {
        action: string;
        entityType: string;
        entityId?: string | null;
        tenantId?: string | null;
        actor: SuperAdminActorContext;
        details?: Record<string, unknown>;
    }) {
        if (!await this.hasSuperAdminAuditLogsTable()) {
            return;
        }

        try {
            await this.dataSource.query(
                `INSERT INTO super_admin_audit_logs
                    (action, entity_type, entity_id, tenant_id, operator_name, operator_key_fingerprint, source_ip, user_agent, details, created_at)
                 VALUES
                    ($1, $2, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid, $5, $6, $7, $8, $9::jsonb, NOW())`,
                [
                    String(input.action || '').trim(),
                    String(input.entityType || '').trim(),
                    String(input.entityId || '').trim(),
                    String(input.tenantId || '').trim(),
                    input.actor.operatorName,
                    input.actor.keyFingerprint,
                    input.actor.sourceIp,
                    input.actor.userAgent,
                    JSON.stringify(input.details || {}),
                ],
            );
        } catch (error) {
            this.logger.warn(`Falha ao gravar auditoria do super-admin: ${(error as Error).message}`);
        }
    }

    private normalizeOptionalText(value: unknown, maxLength: number) {
        const normalized = String(value || '').trim();
        if (!normalized) return null;
        return normalized.slice(0, maxLength);
    }

    private async getWebhookUrl(): Promise<string> {
        const configuredBase =
            process.env.PUBLIC_WEBHOOK_BASE_URL ||
            process.env.NGROK_PUBLIC_URL;
        if (String(configuredBase || '').trim()) {
            const base = String(configuredBase).trim().replace(/\/+$/, '');
            return `${base}/webhooks/whatsapp`;
        }

        const ngrokApiBase = String(process.env.NGROK_API_URL || '').trim().replace(/\/+$/, '');
        if (ngrokApiBase) {
            try {
                const { data } = await axios.get(`${ngrokApiBase}/api/tunnels`, {
                    timeout: 2000,
                });
                const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
                const tunnel =
                    tunnels.find((item: any) =>
                        String(item?.public_url || '').trim().startsWith('https://'),
                    ) ||
                    tunnels.find((item: any) =>
                        String(item?.public_url || '').trim().length > 0,
                    );

                const publicUrl = String(tunnel?.public_url || '').trim();
                if (publicUrl) {
                    const base = publicUrl.replace(/\/+$/, '');
                    return `${base}/webhooks/whatsapp`;
                }
            } catch (error) {
                this.logger.debug(`Falha ao consultar ngrok: ${(error as Error).message}`);
            }
        }

        const base = 'http://localhost:8080';
        return `${base}/webhooks/whatsapp`;
    }

    private async hasMessageLogsTable(): Promise<boolean> {
        return this.hasTable('message_logs');
    }

    private async hasInboxEventsTable(): Promise<boolean> {
        return this.hasTable('inbox_events');
    }

    private async hasOutboxMessagesTable(): Promise<boolean> {
        return this.hasTable('outbox_messages');
    }

    private async hasPaymentAttemptsTable(): Promise<boolean> {
        return this.hasTable('payment_attempts');
    }

    private async hasSuperAdminAuditLogsTable(): Promise<boolean> {
        return this.hasTable('super_admin_audit_logs');
    }

    private async hasTable(tableName: string): Promise<boolean> {
        const normalized = String(tableName || '').replace(/[^a-z0-9_]/gi, '');
        const rows = await this.dataSource.query(
            `SELECT to_regclass('public.${normalized}') AS reg`,
        );
        return !!rows?.[0]?.reg;
    }
}
