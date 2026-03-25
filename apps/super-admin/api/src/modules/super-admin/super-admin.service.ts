import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
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

type SuperAdminLoginPayload = {
    operator?: string;
    password?: string;
};

type SuperAdminRequestContext = {
    authorization?: string;
    sourceIp?: string;
    userAgent?: string;
    sensitiveOperation?: boolean;
};

type SuperAdminActorContext = {
    sessionId: string | null;
    operatorName: string | null;
    keyFingerprint: string | null;
    sourceIp: string | null;
    userAgent: string | null;
    sessionExpiresAt: string | null;
};

type SuperAdminSessionTokenPayload = {
    sid: string;
    op: string;
    iat: number;
    exp: number;
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

    async login(payload: SuperAdminLoginPayload, requestContext?: SuperAdminRequestContext) {
        const operatorName = this.normalizeOptionalText(payload.operator, 120);
        const password = String(payload.password || '');
        const sourceIp = this.normalizeSourceIp(requestContext?.sourceIp);
        const userAgent = this.normalizeOptionalText(requestContext?.userAgent, 1000);

        if (!operatorName || !password) {
            await this.recordAccessLog({
                eventType: 'LOGIN_FAILURE',
                success: false,
                operatorName,
                sourceIp,
                userAgent,
                authMethod: 'password',
                details: {
                    reason: 'missing_credentials',
                },
            });
            throw new BadRequestException('Informe operador e senha.');
        }

        const isPasswordValid = await this.verifySuperAdminPassword(password);
        if (!isPasswordValid) {
            await this.recordAccessLog({
                eventType: 'LOGIN_FAILURE',
                success: false,
                operatorName,
                sourceIp,
                userAgent,
                authMethod: 'password',
                details: {
                    reason: 'invalid_password',
                },
            });
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        const session = await this.createSession(operatorName, sourceIp, userAgent);
        const token = this.signSessionToken({
            sid: session.id,
            op: operatorName,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(new Date(session.expires_at).getTime() / 1000),
        });

        await this.recordAccessLog({
            eventType: 'LOGIN_SUCCESS',
            success: true,
            operatorName,
            sessionId: session.id,
            sourceIp,
            userAgent,
            authMethod: 'password',
            details: {
                expires_at: session.expires_at,
            },
        });

        return {
            accessToken: token,
            session: {
                operatorName,
                expiresAt: session.expires_at,
                issuedAt: session.issued_at,
            },
        };
    }

    async requireAuthenticatedSession(requestContext?: SuperAdminRequestContext): Promise<SuperAdminActorContext> {
        const sourceIp = this.normalizeSourceIp(requestContext?.sourceIp);
        const userAgent = this.normalizeOptionalText(requestContext?.userAgent, 1000);
        const token = this.parseBearerToken(requestContext?.authorization);

        if (!token) {
            await this.recordAccessLog({
                eventType: 'TOKEN_REJECTED',
                success: false,
                sourceIp,
                userAgent,
                authMethod: 'bearer',
                details: {
                    reason: 'missing_bearer_token',
                },
            });
            throw new UnauthorizedException('Sessão do super-admin ausente.');
        }

        let decoded: SuperAdminSessionTokenPayload;
        try {
            decoded = this.verifySessionToken(token);
        } catch (error) {
            await this.recordAccessLog({
                eventType: 'TOKEN_REJECTED',
                success: false,
                sourceIp,
                userAgent,
                authMethod: 'bearer',
                details: {
                    reason: (error as Error).message || 'invalid_token',
                },
            });
            throw new UnauthorizedException('Sessão do super-admin inválida ou expirada.');
        }

        const session = await this.getSessionById(decoded.sid);
        if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
            await this.recordAccessLog({
                eventType: 'TOKEN_REJECTED',
                success: false,
                operatorName: decoded.op,
                sessionId: decoded.sid,
                sourceIp,
                userAgent,
                authMethod: 'bearer',
                details: {
                    reason: session?.revoked_at ? 'session_revoked' : 'session_expired',
                },
            });
            throw new UnauthorizedException('Sessão do super-admin inválida ou expirada.');
        }

        if (requestContext?.sensitiveOperation) {
            await this.assertSensitiveIpAllowed(sourceIp, decoded.op);
        }

        await this.touchSession(session.id);

        return {
            sessionId: session.id,
            operatorName: decoded.op,
            keyFingerprint: createHash('sha256').update(token).digest('hex').slice(0, 12),
            sourceIp,
            userAgent,
            sessionExpiresAt: new Date(session.expires_at).toISOString(),
        };
    }

    getSessionProfile(actor: SuperAdminActorContext) {
        return {
            operatorName: actor.operatorName,
            sessionId: actor.sessionId,
            sessionExpiresAt: actor.sessionExpiresAt,
            ipAllowlistEnabled: this.getSensitiveIpAllowlist().length > 0,
        };
    }

    async logoutSession(actor: SuperAdminActorContext) {
        if (actor.sessionId) {
            await this.dataSource.query(
                `UPDATE super_admin_sessions
                 SET revoked_at = NOW(),
                     revoked_reason = COALESCE(revoked_reason, 'logout')
                 WHERE id = $1
                   AND revoked_at IS NULL`,
                [actor.sessionId],
            );
        }

        await this.recordAccessLog({
            eventType: 'LOGOUT',
            success: true,
            operatorName: actor.operatorName,
            sessionId: actor.sessionId,
            sourceIp: actor.sourceIp,
            userAgent: actor.userAgent,
            authMethod: 'bearer',
            details: {
                reason: 'user_logout',
            },
        });

        return {
            loggedOut: true,
        };
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
        const [hasMessageLogs, hasOutboxMessages, hasPaymentAttempts, hasInboxEvents, hasOrders, hasPayments] = await Promise.all([
            this.hasMessageLogsTable(),
            this.hasOutboxMessagesTable(),
            this.hasPaymentAttemptsTable(),
            this.hasInboxEventsTable(),
            this.hasOrdersTable(),
            this.hasPaymentsTable(),
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
                    COALESCE(ib.failed_inbox_24h, 0)::int AS failed_inbox_24h,
                    COALESCE(ib.failed_inbox_7d, 0)::int AS failed_inbox_7d,
                    ib.last_inbox_received_at AS last_inbox_received_at,
                    ib.last_inbox_processed_at AS last_inbox_processed_at,
                    ib.last_inbox_failed_at AS last_inbox_failed_at,
            `
            : `
                    0::int AS inbox_events_24h,
                    0::int AS pending_inbox,
                    0::int AS stale_inbox,
                    0::int AS failed_inbox_24h,
                    0::int AS failed_inbox_7d,
                    NULL::timestamp AS last_inbox_received_at,
                    NULL::timestamp AS last_inbox_processed_at,
                    NULL::timestamp AS last_inbox_failed_at,
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
                    pay.last_payment_attempt_at AS last_payment_attempt_at,
            `
            : `
                    0::int AS pending_payments,
                    0::int AS stale_pending_payments,
                    0::int AS failed_payments_7d,
                    NULL::timestamp AS last_payment_attempt_at,
            `;

        const orderSelect = hasOrders
            ? `
                    COALESCE(ord.orders_24h, 0)::int AS orders_24h,
                    COALESCE(ord.orders_7d, 0)::int AS orders_7d,
                    COALESCE(ord.active_orders, 0)::int AS active_orders,
                    COALESCE(ord.delayed_queue_orders, 0)::int AS delayed_queue_orders,
                    COALESCE(ord.canceled_orders_7d, 0)::int AS canceled_orders_7d,
                    COALESCE(ord.avg_acceptance_minutes_7d, 0)::numeric(10,2) AS avg_acceptance_minutes_7d,
                    ord.last_order_created_at AS last_order_created_at,
            `
            : `
                    0::int AS orders_24h,
                    0::int AS orders_7d,
                    0::int AS active_orders,
                    0::int AS delayed_queue_orders,
                    0::int AS canceled_orders_7d,
                    0::numeric(10,2) AS avg_acceptance_minutes_7d,
                    NULL::timestamp AS last_order_created_at,
            `;

        const paymentBusinessSelect = hasPayments
            ? `
                    COALESCE(paybiz.payments_created_7d, 0)::int AS payments_created_7d,
                    COALESCE(paybiz.payments_confirmed_7d, 0)::int AS payments_confirmed_7d,
                    COALESCE(paybiz.payments_failed_7d, 0)::int AS payments_failed_7d,
                    paybiz.last_payment_created_at AS last_payment_created_at
            `
            : `
                    0::int AS payments_created_7d,
                    0::int AS payments_confirmed_7d,
                    0::int AS payments_failed_7d,
                    NULL::timestamp AS last_payment_created_at
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
                        COUNT(*) FILTER (
                            WHERE ie.received_at >= NOW() - INTERVAL '24 hours'
                              AND NULLIF(TRIM(COALESCE(ie.processing_error, '')), '') IS NOT NULL
                        ) AS failed_inbox_24h,
                        COUNT(*) FILTER (
                            WHERE ie.received_at >= NOW() - INTERVAL '7 days'
                              AND NULLIF(TRIM(COALESCE(ie.processing_error, '')), '') IS NOT NULL
                        ) AS failed_inbox_7d,
                        MAX(ie.received_at) AS last_inbox_received_at,
                        MAX(ie.processed_at) AS last_inbox_processed_at,
                        MAX(ie.received_at) FILTER (
                            WHERE NULLIF(TRIM(COALESCE(ie.processing_error, '')), '') IS NOT NULL
                        ) AS last_inbox_failed_at
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

        const orderJoin = hasOrders
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '24 hours') AS orders_24h,
                        COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '7 days') AS orders_7d,
                        COUNT(*) FILTER (WHERE o.status IN ('PENDING', 'ACCEPTED', 'READY')) AS active_orders,
                        COUNT(*) FILTER (
                            WHERE (o.status = 'PENDING' AND o.created_at <= NOW() - INTERVAL '5 minutes')
                               OR (o.status = 'ACCEPTED' AND COALESCE(o.accepted_at, o.created_at) <= NOW() - INTERVAL '20 minutes')
                               OR (o.status = 'READY' AND COALESCE(o.ready_at, o.created_at) <= NOW() - INTERVAL '8 minutes')
                        ) AS delayed_queue_orders,
                        COUNT(*) FILTER (
                            WHERE o.status = 'CANCELED'
                              AND o.created_at >= NOW() - INTERVAL '7 days'
                        ) AS canceled_orders_7d,
                        AVG(EXTRACT(EPOCH FROM (o.accepted_at - o.created_at)) / 60.0) FILTER (
                            WHERE o.accepted_at IS NOT NULL
                              AND o.created_at >= NOW() - INTERVAL '7 days'
                        ) AS avg_acceptance_minutes_7d,
                        MAX(o.created_at) AS last_order_created_at
                    FROM orders o
                    WHERE o.tenant_id = t.id
                ) ord ON true
            `
            : '';

        const paymentBusinessJoin = hasPayments
            ? `
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days') AS payments_created_7d,
                        COUNT(*) FILTER (
                            WHERE p.created_at >= NOW() - INTERVAL '7 days'
                              AND p.status = 'CONFIRMED'
                        ) AS payments_confirmed_7d,
                        COUNT(*) FILTER (
                            WHERE p.created_at >= NOW() - INTERVAL '7 days'
                              AND p.status IN ('EXPIRED', 'CANCELED')
                        ) AS payments_failed_7d,
                        MAX(p.created_at) AS last_payment_created_at
                    FROM payments p
                    WHERE p.tenant_id = t.id
                ) paybiz ON true
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
                ${orderSelect}
                ${paymentBusinessSelect}
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
             ${orderJoin}
             ${paymentBusinessJoin}
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
                    ['INBOX_STALE', 'INBOX_BACKLOG', 'WEBHOOK_SILENCE', 'WEBHOOK_PROCESSING_FAILURE'].includes(String(flag.code || '')),
                )) {
                    acc.webhookQueueTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'WEBHOOK_PROCESSING_FAILURE')) {
                    acc.webhookFailureTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'WEBHOOK_SILENCE')) {
                    acc.webhookSilentTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'QUEUE_DELAYED')) {
                    acc.delayedQueueTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'HIGH_CANCELLATION_RATE')) {
                    acc.highCancellationTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'LOW_PAYMENT_CONVERSION')) {
                    acc.lowPaymentConversionTenants += 1;
                }
                if (tenant.riskFlags.some((flag: any) => String(flag.code || '') === 'SLOW_ORDER_ACCEPTANCE')) {
                    acc.slowAcceptanceTenants += 1;
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
                webhookFailureTenants: 0,
                webhookSilentTenants: 0,
                delayedQueueTenants: 0,
                highCancellationTenants: 0,
                lowPaymentConversionTenants: 0,
                slowAcceptanceTenants: 0,
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

    async listAccessLogs(limitRaw?: number) {
        const limit = Math.max(1, Math.min(100, Number(limitRaw || 20) || 20));
        const available = await this.hasSuperAdminAccessLogsTable();
        if (!available) {
            return {
                available: false,
                logs: [],
            };
        }

        const rows = await this.dataSource.query(
            `SELECT
                l.id,
                l.event_type,
                l.success,
                l.operator_name,
                l.session_id,
                l.source_ip,
                l.user_agent,
                l.auth_method,
                l.details,
                l.created_at
             FROM super_admin_access_logs l
             ORDER BY l.created_at DESC
             LIMIT $1`,
            [limit],
        );

        return {
            available: true,
            logs: (rows || []).map((row: any) => ({
                id: row.id,
                eventType: row.event_type,
                success: !!row.success,
                operatorName: row.operator_name || null,
                sessionId: row.session_id || null,
                sourceIp: row.source_ip || null,
                userAgent: row.user_agent || null,
                authMethod: row.auth_method || null,
                details: this.parseJsonRecord(row.details),
                createdAt: row.created_at,
            })),
        };
    }

    async getReliabilityOverview() {
        const [hasInboxEvents, hasOutboxMessages, hasPaymentAttempts] = await Promise.all([
            this.hasInboxEventsTable(),
            this.hasOutboxMessagesTable(),
            this.hasPaymentAttemptsTable(),
        ]);

        const inboxSummary = hasInboxEvents
            ? (await this.dataSource.query(
                `SELECT
                    COUNT(*) FILTER (WHERE processing_error IS NOT NULL)::int AS failed_total,
                    COUNT(*) FILTER (
                        WHERE processing_error IS NOT NULL
                          AND received_at >= NOW() - INTERVAL '24 hours'
                    )::int AS failed_24h,
                    COUNT(*) FILTER (WHERE processed = FALSE)::int AS pending_total
                 FROM inbox_events`,
            ))?.[0] || {}
            : {};

        const outboxSummary = hasOutboxMessages
            ? (await this.dataSource.query(
                `SELECT
                    COUNT(*) FILTER (WHERE sent = FALSE)::int AS pending_total,
                    COUNT(*) FILTER (WHERE sent = FALSE AND attempts >= GREATEST(max_attempts, 1))::int AS dead_total,
                    COUNT(*) FILTER (
                        WHERE sent = FALSE
                          AND attempts < GREATEST(max_attempts, 1)
                          AND COALESCE(next_retry_at, created_at) <= NOW()
                    )::int AS retryable_now,
                    COUNT(*) FILTER (
                        WHERE sent = FALSE
                          AND COALESCE(next_retry_at, created_at) <= NOW() - INTERVAL '30 minutes'
                    )::int AS stale_total,
                    COUNT(*) FILTER (
                        WHERE sent = FALSE
                          AND created_at >= NOW() - INTERVAL '24 hours'
                    )::int AS incidents_24h
                 FROM outbox_messages`,
            ))?.[0] || {}
            : {};

        const paymentSummary = hasPaymentAttempts
            ? (await this.dataSource.query(
                `SELECT
                    COUNT(*) FILTER (WHERE status IN ('ERROR', 'REJECTED', 'EXPIRED'))::int AS failed_total,
                    COUNT(*) FILTER (
                        WHERE status IN ('ERROR', 'REJECTED', 'EXPIRED')
                          AND created_at >= NOW() - INTERVAL '24 hours'
                    )::int AS failed_24h,
                    COUNT(*) FILTER (
                        WHERE status IN ('CREATED', 'PROCESSING', 'UNKNOWN', 'PENDING')
                          AND reconciled_at IS NULL
                          AND created_at <= NOW() - INTERVAL '30 minutes'
                    )::int AS stale_pending_total
                 FROM payment_attempts`,
            ))?.[0] || {}
            : {};

        const impactedTenants = await this.countReliabilityImpactedTenants({
            hasInboxEvents,
            hasOutboxMessages,
            hasPaymentAttempts,
        });
        const topTenants = await this.listReliabilityTopTenants({
            hasInboxEvents,
            hasOutboxMessages,
            hasPaymentAttempts,
        });

        const incidents24h =
            Number(inboxSummary.failed_24h || 0) +
            Number(outboxSummary.incidents_24h || 0) +
            Number(paymentSummary.failed_24h || 0);

        return {
            generatedAt: new Date().toISOString(),
            summary: {
                incidents24h,
                impactedTenants,
                retryableOutbox: Number(outboxSummary.retryable_now || 0),
                deadOutbox: Number(outboxSummary.dead_total || 0),
                staleOutbox: Number(outboxSummary.stale_total || 0),
                failedInbox: Number(inboxSummary.failed_total || 0),
                pendingInbox: Number(inboxSummary.pending_total || 0),
                paymentFailures: Number(paymentSummary.failed_total || 0),
                stalePayments: Number(paymentSummary.stale_pending_total || 0),
            },
            topTenants,
        };
    }

    async listReliabilityIncidents(limitRaw?: number) {
        const limit = Math.max(1, Math.min(100, Number(limitRaw || 30) || 30));
        const [hasInboxEvents, hasOutboxMessages, hasPaymentAttempts, hasPayments] = await Promise.all([
            this.hasInboxEventsTable(),
            this.hasOutboxMessagesTable(),
            this.hasPaymentAttemptsTable(),
            this.hasPaymentsTable(),
        ]);

        const incidentQueries: string[] = [];
        const params: any[] = [];

        if (hasInboxEvents) {
            incidentQueries.push(`
                SELECT
                    'INBOX_FAILURE'::text AS incident_type,
                    CASE
                        WHEN ie.received_at <= NOW() - INTERVAL '6 hours' THEN 'critical'
                        ELSE 'warning'
                    END AS severity,
                    ie.id::text AS entity_id,
                    ie.tenant_id::text AS tenant_id,
                    COALESCE(t.name, 'Tenant não identificado') AS tenant_name,
                    ie.provider_message_id AS message_id,
                    NULL::text AS payment_id,
                    NULL::text AS provider_payment_id,
                    NULL::text AS external_reference,
                    ie.received_at AS occurred_at,
                    LEFT(COALESCE(NULLIF(ie.processing_error, ''), 'Falha de processamento da inbox.'), 240) AS summary,
                    'retry_inbox'::text AS retry_action,
                    jsonb_build_object(
                        'processed', ie.processed,
                        'source', ie.source,
                        'providerMessageId', ie.provider_message_id
                    ) AS metadata
                FROM inbox_events ie
                LEFT JOIN tenants t ON t.id = ie.tenant_id
                WHERE ie.processing_error IS NOT NULL
            `);
        }

        if (hasOutboxMessages) {
            incidentQueries.push(`
                SELECT
                    CASE
                        WHEN om.attempts >= GREATEST(om.max_attempts, 1) THEN 'OUTBOX_DEAD'
                        ELSE 'OUTBOX_STALE'
                    END AS incident_type,
                    CASE
                        WHEN om.attempts >= GREATEST(om.max_attempts, 1) THEN 'critical'
                        ELSE 'warning'
                    END AS severity,
                    om.id::text AS entity_id,
                    om.tenant_id::text AS tenant_id,
                    COALESCE(t.name, 'Tenant não identificado') AS tenant_name,
                    NULL::text AS message_id,
                    NULL::text AS payment_id,
                    NULL::text AS provider_payment_id,
                    NULL::text AS external_reference,
                    COALESCE(om.next_retry_at, om.created_at) AS occurred_at,
                    LEFT(
                        CONCAT(
                            'Destino ', COALESCE(om.destination, 'desconhecido'),
                            ' para ', COALESCE(om.recipient, '-'),
                            ' com ', om.attempts::text, '/', GREATEST(om.max_attempts, 1)::text,
                            ' tentativa(s). ',
                            COALESCE(NULLIF(om.last_error, ''), 'Sem detalhe de erro.')
                        ),
                        240
                    ) AS summary,
                    'retry_outbox'::text AS retry_action,
                    jsonb_build_object(
                        'destination', om.destination,
                        'recipient', om.recipient,
                        'attempts', om.attempts,
                        'maxAttempts', om.max_attempts,
                        'lastError', om.last_error
                    ) AS metadata
                FROM outbox_messages om
                LEFT JOIN tenants t ON t.id = om.tenant_id
                WHERE om.sent = FALSE
                  AND (
                      om.attempts >= GREATEST(om.max_attempts, 1)
                      OR COALESCE(om.next_retry_at, om.created_at) <= NOW() - INTERVAL '30 minutes'
                  )
            `);
        }

        if (hasPaymentAttempts && hasPayments) {
            incidentQueries.push(`
                SELECT
                    CASE
                        WHEN pa.status IN ('ERROR', 'REJECTED', 'EXPIRED') THEN 'PAYMENT_FAILURE'
                        ELSE 'PAYMENT_STALE'
                    END AS incident_type,
                    CASE
                        WHEN pa.status = 'ERROR' THEN 'critical'
                        WHEN pa.status = 'REJECTED' THEN 'critical'
                        ELSE 'warning'
                    END AS severity,
                    pa.id::text AS entity_id,
                    pa.tenant_id::text AS tenant_id,
                    COALESCE(t.name, 'Tenant não identificado') AS tenant_name,
                    NULL::text AS message_id,
                    pa.payment_id::text AS payment_id,
                    COALESCE(pa.provider_payment_id, '') AS provider_payment_id,
                    COALESCE(p.external_reference, '') AS external_reference,
                    COALESCE(pa.updated_at, pa.created_at) AS occurred_at,
                    LEFT(
                        CONCAT(
                            'Pagamento ', pa.payment_id::text,
                            ' em status ', pa.status,
                            COALESCE(CONCAT(' / ', NULLIF(pa.provider_status, '')), ''),
                            '. ',
                            COALESCE(NULLIF(pa.last_error, ''), NULLIF(pa.provider_status_detail, ''), 'Aguardando investigação.')
                        ),
                        240
                    ) AS summary,
                    'none'::text AS retry_action,
                    jsonb_build_object(
                        'status', pa.status,
                        'providerStatus', pa.provider_status,
                        'providerStatusDetail', pa.provider_status_detail,
                        'requestedAmount', pa.requested_amount,
                        'paymentMethod', pa.payment_method
                    ) AS metadata
                FROM payment_attempts pa
                LEFT JOIN tenants t ON t.id = pa.tenant_id
                LEFT JOIN payments p ON p.id = pa.payment_id
                WHERE pa.status IN ('ERROR', 'REJECTED', 'EXPIRED')
                   OR (
                        pa.status IN ('CREATED', 'PROCESSING', 'UNKNOWN', 'PENDING')
                        AND pa.reconciled_at IS NULL
                        AND pa.created_at <= NOW() - INTERVAL '30 minutes'
                   )
            `);
        }

        if (!incidentQueries.length) {
            return {
                available: false,
                incidents: [],
            };
        }

        params.push(limit);
        const rows = await this.dataSource.query(
            `${incidentQueries.join('\nUNION ALL\n')}
             ORDER BY occurred_at DESC
             LIMIT $${params.length}`,
            params,
        );

        return {
            available: true,
            incidents: (rows || []).map((row: any) => ({
                id: `${row.incident_type}:${row.entity_id}`,
                incidentType: row.incident_type,
                severity: String(row.severity || 'warning').toUpperCase(),
                entityId: row.entity_id,
                tenantId: row.tenant_id || null,
                tenantName: row.tenant_name || null,
                occurredAt: row.occurred_at,
                summary: row.summary || '',
                correlation: {
                    tenantId: row.tenant_id || null,
                    messageId: row.message_id || null,
                    paymentId: row.payment_id || null,
                    providerPaymentId: row.provider_payment_id || null,
                    externalReference: row.external_reference || null,
                },
                retry: {
                    action: row.retry_action || 'none',
                    available: ['retry_outbox', 'retry_inbox'].includes(String(row.retry_action || '')),
                },
                metadata: this.parseJsonRecord(row.metadata),
            })),
        };
    }

    async getReliabilityDlqOverview() {
        const queuePayload = await this.fetchRabbitMqQueues();
        if (!queuePayload.available) {
            return queuePayload;
        }

        const queues = Array.isArray(queuePayload.queues) ? queuePayload.queues : [];
        const dlqQueues = queues.filter((queue: any) => String(queue.name || '').toLowerCase().endsWith('.dlq'));
        const totalDlqMessages = dlqQueues.reduce((acc: number, queue: any) => acc + Number(queue.messages || 0), 0);
        const queuesWithoutConsumers = queues.filter((queue: any) => Number(queue.consumers || 0) === 0);
        const alertQueues = queues.filter((queue: any) => {
            const messages = Number(queue.messages || 0);
            const consumers = Number(queue.consumers || 0);
            return messages > 0 || consumers === 0;
        });

        const peek = dlqQueues.length
            ? await this.fetchRabbitMqDlqPeek(String(dlqQueues[0].name || ''))
            : {
                available: true,
                queueName: null,
                messages: [],
            };

        return {
            available: true,
            summary: {
                dlqQueues: dlqQueues.length,
                dlqMessages: totalDlqMessages,
                queuesWithoutConsumers: queuesWithoutConsumers.length,
                alertQueues: alertQueues.length,
            },
            queues: queues.map((queue: any) => ({
                name: queue.name,
                vhost: queue.vhost,
                state: queue.state || null,
                type: queue.type || null,
                consumers: Number(queue.consumers || 0),
                messages: Number(queue.messages || 0),
                messagesReady: Number(queue.messages_ready || 0),
                messagesUnacknowledged: Number(queue.messages_unacknowledged || 0),
                dlq: String(queue.name || '').toLowerCase().endsWith('.dlq'),
                deadLetterExchange: queue?.arguments?.['x-dead-letter-exchange'] || null,
            })),
            peek,
        };
    }

    async searchReliabilityCorrelation(input: {
        tenantId?: string;
        messageId?: string;
        paymentId?: string;
    }) {
        const tenantId = this.normalizeUuid(input.tenantId);
        const messageId = this.normalizeOptionalText(input.messageId, 255);
        const paymentId = this.normalizeUuid(input.paymentId);

        if (!tenantId && !messageId && !paymentId) {
            throw new BadRequestException('Informe tenant_id, message_id ou payment_id para correlacionar.');
        }

        const [hasInboxEvents, hasOutboxMessages, hasPaymentAttempts, hasMessageLogs, hasPayments] = await Promise.all([
            this.hasInboxEventsTable(),
            this.hasOutboxMessagesTable(),
            this.hasPaymentAttemptsTable(),
            this.hasMessageLogsTable(),
            this.hasPaymentsTable(),
        ]);

        const tenant = tenantId
            ? await this.tenantRepo.findOne({ where: { id: tenantId } })
            : null;

        const result: any = {
            query: {
                tenantId,
                messageId,
                paymentId,
            },
            tenant: tenant
                ? {
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                    active: !!tenant.active,
                    billingPlan: tenant.billingPlan,
                }
                : null,
            correlation: {
                inboxEvents: [],
                messageLogs: [],
                outboxMessages: [],
                payment: null,
                paymentAttempts: [],
                recentIncidents: [],
            },
        };

        if (hasInboxEvents && (messageId || tenantId)) {
            const rows = messageId
                ? await this.dataSource.query(
                    `SELECT
                        ie.id,
                        ie.tenant_id,
                        ie.provider_message_id,
                        ie.source,
                        ie.processed,
                        ie.processing_error,
                        ie.received_at,
                        ie.processed_at
                     FROM inbox_events ie
                     WHERE ie.provider_message_id = $1
                     ORDER BY ie.received_at DESC
                     LIMIT 10`,
                    [messageId],
                )
                : await this.dataSource.query(
                    `SELECT
                        ie.id,
                        ie.tenant_id,
                        ie.provider_message_id,
                        ie.source,
                        ie.processed,
                        ie.processing_error,
                        ie.received_at,
                        ie.processed_at
                     FROM inbox_events ie
                     WHERE ie.tenant_id = $1::uuid
                     ORDER BY ie.received_at DESC
                     LIMIT 10`,
                    [tenantId],
                );

            result.correlation.inboxEvents = (rows || []).map((row: any) => ({
                id: row.id,
                tenantId: row.tenant_id || null,
                providerMessageId: row.provider_message_id,
                source: row.source,
                processed: !!row.processed,
                processingError: row.processing_error || null,
                receivedAt: row.received_at,
                processedAt: row.processed_at || null,
            }));
        }

        if (hasMessageLogs && (messageId || tenantId)) {
            const rows = messageId
                ? await this.dataSource.query(
                    `SELECT
                        ml.id,
                        ml.tenant_id,
                        ml.direction,
                        ml.status,
                        ml.message_id,
                        ml.user_phone,
                        ml.message_preview,
                        ml.created_at
                     FROM message_logs ml
                     WHERE ml.message_id = $1
                     ORDER BY ml.created_at DESC
                     LIMIT 10`,
                    [messageId],
                )
                : await this.dataSource.query(
                    `SELECT
                        ml.id,
                        ml.tenant_id,
                        ml.direction,
                        ml.status,
                        ml.message_id,
                        ml.user_phone,
                        ml.message_preview,
                        ml.created_at
                     FROM message_logs ml
                     WHERE ml.tenant_id = $1::uuid
                     ORDER BY ml.created_at DESC
                     LIMIT 10`,
                    [tenantId],
                );

            result.correlation.messageLogs = (rows || []).map((row: any) => ({
                id: row.id,
                tenantId: row.tenant_id || null,
                direction: row.direction,
                status: row.status || null,
                messageId: row.message_id || null,
                userPhone: row.user_phone || null,
                messagePreview: row.message_preview || null,
                createdAt: row.created_at,
            }));
        }

        if (hasOutboxMessages && tenantId) {
            const rows = await this.dataSource.query(
                `SELECT
                    om.id,
                    om.destination,
                    om.recipient,
                    om.sent,
                    om.attempts,
                    om.max_attempts,
                    om.last_error,
                    om.created_at,
                    om.sent_at,
                    om.next_retry_at
                 FROM outbox_messages om
                 WHERE om.tenant_id = $1::uuid
                   AND om.sent = FALSE
                 ORDER BY COALESCE(om.next_retry_at, om.created_at) ASC
                 LIMIT 10`,
                [tenantId],
            );

            result.correlation.outboxMessages = (rows || []).map((row: any) => ({
                id: row.id,
                destination: row.destination,
                recipient: row.recipient,
                sent: !!row.sent,
                attempts: Number(row.attempts || 0),
                maxAttempts: Number(row.max_attempts || 0),
                lastError: row.last_error || null,
                createdAt: row.created_at,
                sentAt: row.sent_at || null,
                nextRetryAt: row.next_retry_at || null,
                retryAvailable: !row.sent,
            }));
        }

        if (hasPayments && (paymentId || tenantId)) {
            const paymentRows = paymentId
                ? await this.dataSource.query(
                    `SELECT
                        p.id,
                        p.tenant_id,
                        p.tab_id,
                        p.payment_type,
                        p.amount,
                        p.status,
                        p.pix_txid,
                        p.external_reference,
                        p.created_at,
                        p.paid_at,
                        p.expired_at,
                        p.metadata
                     FROM payments p
                     WHERE p.id = $1::uuid
                     LIMIT 1`,
                    [paymentId],
                )
                : await this.dataSource.query(
                    `SELECT
                        p.id,
                        p.tenant_id,
                        p.tab_id,
                        p.payment_type,
                        p.amount,
                        p.status,
                        p.pix_txid,
                        p.external_reference,
                        p.created_at,
                        p.paid_at,
                        p.expired_at,
                        p.metadata
                     FROM payments p
                     WHERE p.tenant_id = $1::uuid
                     ORDER BY p.created_at DESC
                     LIMIT 1`,
                    [tenantId],
                );

            const paymentRow = paymentRows?.[0];
            if (paymentRow) {
                result.correlation.payment = {
                    id: paymentRow.id,
                    tenantId: paymentRow.tenant_id,
                    tabId: paymentRow.tab_id || null,
                    paymentType: paymentRow.payment_type || null,
                    amount: Number(paymentRow.amount || 0),
                    status: paymentRow.status || null,
                    pixTxid: paymentRow.pix_txid || null,
                    externalReference: paymentRow.external_reference || null,
                    metadata: this.parseJsonRecord(paymentRow.metadata),
                    createdAt: paymentRow.created_at,
                    paidAt: paymentRow.paid_at || null,
                    expiredAt: paymentRow.expired_at || null,
                };
            }
        }

        if (hasPaymentAttempts && (paymentId || tenantId || result.correlation.payment?.id)) {
            const resolvedPaymentId = paymentId || result.correlation.payment?.id || null;
            const rows = resolvedPaymentId
                ? await this.dataSource.query(
                    `SELECT
                        pa.id,
                        pa.payment_id,
                        pa.status,
                        pa.provider,
                        pa.payment_method,
                        pa.provider_payment_id,
                        pa.provider_status,
                        pa.provider_status_detail,
                        pa.last_error,
                        pa.requested_amount,
                        pa.external_reference,
                        pa.reconciled_at,
                        pa.settled_at,
                        pa.created_at,
                        pa.updated_at
                     FROM payment_attempts pa
                     WHERE pa.payment_id = $1::uuid
                     ORDER BY pa.created_at DESC
                     LIMIT 10`,
                    [resolvedPaymentId],
                )
                : await this.dataSource.query(
                    `SELECT
                        pa.id,
                        pa.payment_id,
                        pa.status,
                        pa.provider,
                        pa.payment_method,
                        pa.provider_payment_id,
                        pa.provider_status,
                        pa.provider_status_detail,
                        pa.last_error,
                        pa.requested_amount,
                        pa.external_reference,
                        pa.reconciled_at,
                        pa.settled_at,
                        pa.created_at,
                        pa.updated_at
                     FROM payment_attempts pa
                     WHERE pa.tenant_id = $1::uuid
                     ORDER BY pa.created_at DESC
                     LIMIT 10`,
                    [tenantId],
                );

            result.correlation.paymentAttempts = (rows || []).map((row: any) => ({
                id: row.id,
                paymentId: row.payment_id,
                status: row.status,
                provider: row.provider,
                paymentMethod: row.payment_method,
                providerPaymentId: row.provider_payment_id || null,
                providerStatus: row.provider_status || null,
                providerStatusDetail: row.provider_status_detail || null,
                lastError: row.last_error || null,
                requestedAmount: Number(row.requested_amount || 0),
                externalReference: row.external_reference || null,
                reconciledAt: row.reconciled_at || null,
                settledAt: row.settled_at || null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));
        }

        if (tenantId) {
            const incidents = await this.listReliabilityIncidents(100);
            result.correlation.recentIncidents = (incidents.incidents || [])
                .filter((item: any) => item.tenantId === tenantId)
                .slice(0, 10);
        }

        return result;
    }

    async retryInboxEvent(inboxId: string, actor: SuperAdminActorContext) {
        if (!await this.hasInboxEventsTable()) {
            throw new NotFoundException('Tabela de inbox não disponível neste ambiente.');
        }

        const normalizedId = this.normalizeUuid(inboxId);
        if (!normalizedId) {
            throw new BadRequestException('ID de inbox inválido.');
        }

        const rows = await this.dataSource.query(
            `SELECT
                ie.id,
                ie.tenant_id,
                ie.source,
                ie.provider_message_id,
                ie.processed,
                ie.processing_error,
                ie.received_at,
                ie.processed_at,
                t.name AS tenant_name
             FROM inbox_events ie
             LEFT JOIN tenants t ON t.id = ie.tenant_id
             WHERE ie.id = $1::uuid
             LIMIT 1`,
            [normalizedId],
        );
        const existing = rows?.[0];
        if (!existing) {
            throw new NotFoundException('Evento de inbox não encontrado.');
        }

        await this.dataSource.query(
            `UPDATE inbox_events
             SET processed = FALSE,
                 processing_error = NULL,
                 processed_at = NULL
             WHERE id = $1::uuid`,
            [normalizedId],
        );

        await this.publishRabbitMqMessage('whatsapp.messages', {
            inbox_id: normalizedId,
            wamid: existing.provider_message_id,
        });

        await this.recordAuditLog({
            action: 'SUPPORT_INBOX_RETRY_REQUESTED',
            entityType: 'INBOX_EVENT',
            entityId: normalizedId,
            tenantId: existing.tenant_id || null,
            actor,
            details: {
                summary: `Reprocessamento manual solicitado para inbox ${normalizedId} (${existing.provider_message_id}).`,
                source: existing.source,
                previous_error: existing.processing_error || null,
                previously_processed: !!existing.processed,
            },
        });

        return {
            retried: true,
            inbox: {
                id: normalizedId,
                tenantId: existing.tenant_id || null,
                tenantName: existing.tenant_name || null,
                source: existing.source,
                providerMessageId: existing.provider_message_id,
                receivedAt: existing.received_at,
                previousProcessedAt: existing.processed_at || null,
                previousError: existing.processing_error || null,
            },
        };
    }

    async retryOutboxMessage(outboxId: string, actor: SuperAdminActorContext) {
        if (!await this.hasOutboxMessagesTable()) {
            throw new NotFoundException('Tabela de outbox não disponível neste ambiente.');
        }

        const normalizedId = this.normalizeUuid(outboxId);
        if (!normalizedId) {
            throw new BadRequestException('ID de outbox inválido.');
        }

        const rows = await this.dataSource.query(
            `SELECT
                om.id,
                om.tenant_id,
                om.destination,
                om.recipient,
                om.sent,
                om.attempts,
                om.max_attempts,
                om.last_error,
                om.created_at,
                om.next_retry_at,
                t.name AS tenant_name
             FROM outbox_messages om
             LEFT JOIN tenants t ON t.id = om.tenant_id
             WHERE om.id = $1::uuid
             LIMIT 1`,
            [normalizedId],
        );
        const existing = rows?.[0];
        if (!existing) {
            throw new NotFoundException('Mensagem de outbox não encontrada.');
        }
        if (existing.sent) {
            throw new BadRequestException('A mensagem já foi enviada e não precisa de retentativa.');
        }

        await this.dataSource.query(
            `UPDATE outbox_messages
             SET sent = FALSE,
                 sent_at = NULL,
                 next_retry_at = NOW(),
                 attempts = CASE
                     WHEN attempts >= GREATEST(max_attempts, 1)
                         THEN GREATEST(GREATEST(max_attempts, 1) - 1, 0)
                     ELSE attempts
                 END
             WHERE id = $1::uuid`,
            [normalizedId],
        );
        const refreshedRows = await this.dataSource.query(
            `SELECT
                om.id,
                om.tenant_id,
                om.destination,
                om.recipient,
                om.sent,
                om.attempts,
                om.max_attempts,
                om.last_error,
                om.created_at,
                om.next_retry_at,
                om.sent_at,
                t.name AS tenant_name
             FROM outbox_messages om
             LEFT JOIN tenants t ON t.id = om.tenant_id
             WHERE om.id = $1::uuid
             LIMIT 1`,
            [normalizedId],
        );
        const updated = refreshedRows?.[0];

        await this.recordAuditLog({
            action: 'SUPPORT_OUTBOX_RETRY_REQUESTED',
            entityType: 'OUTBOX_MESSAGE',
            entityId: updated.id,
            tenantId: updated.tenant_id || null,
            actor,
            details: {
                summary: `Retentativa manual solicitada para outbox ${updated.id} (${existing.destination} -> ${existing.recipient}).`,
                previous_attempts: Number(existing.attempts || 0),
                previous_max_attempts: Number(existing.max_attempts || 0),
                previous_error: existing.last_error || null,
            },
        });

        return {
            retried: true,
            outbox: {
                id: updated.id,
                tenantId: updated.tenant_id || null,
                tenantName: updated.tenant_name || existing.tenant_name || null,
                destination: updated.destination,
                recipient: updated.recipient,
                sent: !!updated.sent,
                attempts: Number(updated.attempts || 0),
                maxAttempts: Number(updated.max_attempts || 0),
                lastError: updated.last_error || null,
                nextRetryAt: updated.next_retry_at,
                sentAt: updated.sent_at || null,
                createdAt: updated.created_at,
            },
        };
    }

    async createTenant(payload: TenantPayload, actor: SuperAdminActorContext) {
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
            actor,
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

    async updateTenant(id: string, payload: TenantPayload, actor: SuperAdminActorContext) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
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

    async setTenantActive(id: string, active: boolean, actor: SuperAdminActorContext) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
        tenant.active = !!active;
        await this.tenantRepo.save(tenant);

        await this.recordAuditLog({
            action: 'TENANT_STATUS_CHANGED',
            entityType: 'TENANT',
            entityId: tenant.id,
            tenantId: tenant.id,
            actor,
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
        actor: SuperAdminActorContext,
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
            actor,
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
        const failedInbox24h = Number(row.failed_inbox_24h || 0);
        const failedInbox7d = Number(row.failed_inbox_7d || 0);
        const outboxSent24h = Number(row.outbox_sent_24h || 0);
        const pendingOutbox = Number(row.pending_outbox || 0);
        const staleOutbox = Number(row.stale_outbox || 0);
        const failedOutbox = Number(row.failed_outbox || 0);
        const pendingPayments = Number(row.pending_payments || 0);
        const stalePendingPayments = Number(row.stale_pending_payments || 0);
        const failedPayments7d = Number(row.failed_payments_7d || 0);
        const orders24h = Number(row.orders_24h || 0);
        const orders7d = Number(row.orders_7d || 0);
        const activeOrders = Number(row.active_orders || 0);
        const delayedQueueOrders = Number(row.delayed_queue_orders || 0);
        const canceledOrders7d = Number(row.canceled_orders_7d || 0);
        const avgAcceptanceMinutes7d = Number(row.avg_acceptance_minutes_7d || 0);
        const paymentsCreated7d = Number(row.payments_created_7d || 0);
        const paymentsConfirmed7d = Number(row.payments_confirmed_7d || 0);
        const paymentsFailed7d = Number(row.payments_failed_7d || 0);
        const walletBalance = Number(row.wallet_balance || 0);
        const billingPlan = String(row.billing_plan || 'pre_paid').trim();
        const averageDailyMessages = messages7d / 7;
        const previousDailyAverage = messagesPrevious7d / 7;
        const estimatedDailyBurn = averageDailyMessages * Math.max(messagePrice, 0);
        const cancelRate7d = orders7d > 0
            ? this.roundMetric((canceledOrders7d / orders7d) * 100)
            : 0;
        const paymentConversionRate7d = paymentsCreated7d > 0
            ? this.roundMetric((paymentsConfirmed7d / paymentsCreated7d) * 100)
            : null;
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
            failedInbox24h,
            failedInbox7d,
            lastInboxReceivedAt: row.last_inbox_received_at,
            orders24h,
            orders7d,
            activeOrders,
            delayedQueueOrders,
            canceledOrders7d,
            avgAcceptanceMinutes7d,
            cancelRate7d,
            outboxSent24h,
            pendingOutbox,
            staleOutbox,
            failedOutbox,
            oldestPendingOutboxAt: row.oldest_pending_outbox_at,
            pendingPayments,
            stalePendingPayments,
            failedPayments7d,
            paymentsCreated7d,
            paymentConversionRate7d,
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
                failedInbox24h,
                failedInbox7d,
                lastInboxReceivedAt: row.last_inbox_received_at || null,
                lastInboxProcessedAt: row.last_inbox_processed_at || null,
                lastInboxFailedAt: row.last_inbox_failed_at || null,
                orders24h,
                orders7d,
                activeOrders,
                delayedQueueOrders,
                canceledOrders7d,
                cancelRate7d,
                avgAcceptanceMinutes7d: this.roundMetric(avgAcceptanceMinutes7d),
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
                paymentsCreated7d,
                paymentsConfirmed7d,
                paymentsFailed7d,
                paymentConversionRate7d,
                lastMessageAt: row.last_message_at || null,
                lastPaymentAttemptAt: row.last_payment_attempt_at || null,
                lastOrderCreatedAt: row.last_order_created_at || null,
                lastPaymentCreatedAt: row.last_payment_created_at || null,
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
        failedInbox24h: number;
        failedInbox7d: number;
        lastInboxReceivedAt?: string | Date | null;
        orders24h: number;
        orders7d: number;
        activeOrders: number;
        delayedQueueOrders: number;
        canceledOrders7d: number;
        avgAcceptanceMinutes7d: number;
        cancelRate7d: number;
        outboxSent24h: number;
        pendingOutbox: number;
        staleOutbox: number;
        failedOutbox: number;
        oldestPendingOutboxAt?: string | Date | null;
        pendingPayments: number;
        stalePendingPayments: number;
        failedPayments7d: number;
        paymentsCreated7d: number;
        paymentConversionRate7d: number | null;
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

        if (input.active && input.delayedQueueOrders >= 8) {
            this.pushRisk(flags, {
                code: 'QUEUE_DELAYED',
                severity: 'CRITICAL',
                title: 'Fila atrasada',
                description: 'O tenant tem pedidos ativos acima do SLA operacional esperado.',
            });
        } else if (input.active && input.delayedQueueOrders >= 3) {
            this.pushRisk(flags, {
                code: 'QUEUE_DELAYED',
                severity: 'WARNING',
                title: 'Fila em atenção',
                description: 'A fila de pedidos já acumula itens atrasados acima do normal.',
            });
        }

        if (input.active && input.orders7d >= 10 && input.cancelRate7d >= 25) {
            this.pushRisk(flags, {
                code: 'HIGH_CANCELLATION_RATE',
                severity: 'CRITICAL',
                title: 'Cancelamento alto',
                description: 'A taxa de cancelamento da última semana está acima do aceitável.',
            });
        } else if (input.active && input.orders7d >= 5 && input.cancelRate7d >= 12) {
            this.pushRisk(flags, {
                code: 'HIGH_CANCELLATION_RATE',
                severity: 'WARNING',
                title: 'Cancelamento em alta',
                description: 'A taxa de cancelamento recente do tenant merece investigação.',
            });
        }

        if (input.active && input.orders7d >= 10 && input.avgAcceptanceMinutes7d >= 15) {
            this.pushRisk(flags, {
                code: 'SLOW_ORDER_ACCEPTANCE',
                severity: 'CRITICAL',
                title: 'Aceite lento',
                description: 'O tempo médio até aceite está alto e já impacta a operação.',
            });
        } else if (input.active && input.orders7d >= 5 && input.avgAcceptanceMinutes7d >= 8) {
            this.pushRisk(flags, {
                code: 'SLOW_ORDER_ACCEPTANCE',
                severity: 'WARNING',
                title: 'Aceite em atenção',
                description: 'O tempo médio até aceite saiu do padrão esperado para a semana.',
            });
        }

        if (input.active && input.paymentsCreated7d >= 10 && input.paymentConversionRate7d !== null && input.paymentConversionRate7d < 35) {
            this.pushRisk(flags, {
                code: 'LOW_PAYMENT_CONVERSION',
                severity: 'CRITICAL',
                title: 'Conversão baixa de pagamento',
                description: 'Poucas cobranças geradas estão sendo confirmadas no tenant.',
            });
        } else if (input.active && input.paymentsCreated7d >= 5 && input.paymentConversionRate7d !== null && input.paymentConversionRate7d < 60) {
            this.pushRisk(flags, {
                code: 'LOW_PAYMENT_CONVERSION',
                severity: 'WARNING',
                title: 'Conversão de pagamento em atenção',
                description: 'A conversão de cobranças confirmadas está abaixo do recomendado.',
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

        if (input.active && input.failedInbox24h > 0) {
            this.pushRisk(flags, {
                code: 'WEBHOOK_PROCESSING_FAILURE',
                severity: 'CRITICAL',
                title: 'Webhook com erro de processamento',
                description: 'Eventos da inbox estão chegando, mas falharam durante o processamento interno nas últimas 24 horas.',
            });
        } else if (input.active && input.failedInbox7d >= 3) {
            this.pushRisk(flags, {
                code: 'WEBHOOK_PROCESSING_FAILURE',
                severity: 'WARNING',
                title: 'Falhas recentes de webhook',
                description: 'O tenant acumulou erros de processamento de inbox na última semana.',
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

    private roundMetric(value: number, decimals = 1) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric)) {
            return 0;
        }

        const factor = 10 ** decimals;
        return Math.round(numeric * factor) / factor;
    }

    private parseBearerToken(authorization?: string) {
        const raw = String(authorization || '').trim();
        if (!raw) {
            return '';
        }
        const match = raw.match(/^Bearer\s+(.+)$/i);
        return match?.[1]?.trim() || '';
    }

    private signSessionToken(payload: SuperAdminSessionTokenPayload) {
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
        const secret = this.getSessionSecrets()[0];
        const signature = this.base64UrlEncodeBytes(
            createHmac('sha256', secret).update(encodedPayload).digest(),
        );
        return `sa.${encodedPayload}.${signature}`;
    }

    private verifySessionToken(token: string): SuperAdminSessionTokenPayload {
        const parts = String(token || '').trim().split('.');
        if (parts.length !== 3 || parts[0] !== 'sa') {
            throw new Error('invalid_token_format');
        }

        const encodedPayload = parts[1];
        const providedSignature = parts[2];
        const isValidSignature = this.getSessionSecrets().some((secret) => {
            const expectedSignature = this.base64UrlEncodeBytes(
                createHmac('sha256', secret).update(encodedPayload).digest(),
            );
            return this.safeCompare(expectedSignature, providedSignature);
        });

        if (!isValidSignature) {
            throw new Error('invalid_token_signature');
        }

        const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as Partial<SuperAdminSessionTokenPayload>;
        if (!payload?.sid || !payload?.op || !payload?.exp) {
            throw new Error('invalid_token_payload');
        }
        if (Number(payload.exp) * 1000 <= Date.now()) {
            throw new Error('token_expired');
        }

        return {
            sid: String(payload.sid),
            op: String(payload.op),
            iat: Number(payload.iat || 0),
            exp: Number(payload.exp),
        };
    }

    private async createSession(operatorName: string, sourceIp: string | null, userAgent: string | null) {
        if (!await this.hasSuperAdminSessionsTable()) {
            throw new ForbiddenException('Migration de segurança do super-admin ainda não foi aplicada.');
        }

        const sessionId = randomUUID();
        const expiresAt = new Date(Date.now() + this.getSessionTtlHours() * 60 * 60 * 1000);
        await this.dataSource.query(
            `INSERT INTO super_admin_sessions
                (id, operator_name, source_ip, user_agent, issued_at, last_seen_at, expires_at)
             VALUES
                ($1::uuid, $2, $3, $4, NOW(), NOW(), $5)`,
            [sessionId, operatorName, sourceIp, userAgent, expiresAt.toISOString()],
        );

        const rows = await this.dataSource.query(
            `SELECT id, operator_name, source_ip, user_agent, issued_at, last_seen_at, expires_at, revoked_at
             FROM super_admin_sessions
             WHERE id = $1::uuid
             LIMIT 1`,
            [sessionId],
        );
        return rows?.[0];
    }

    private async getSessionById(sessionId: string) {
        if (!await this.hasSuperAdminSessionsTable()) {
            return null;
        }

        const rows = await this.dataSource.query(
            `SELECT id, operator_name, source_ip, user_agent, issued_at, last_seen_at, expires_at, revoked_at
             FROM super_admin_sessions
             WHERE id = $1::uuid
             LIMIT 1`,
            [sessionId],
        );
        return rows?.[0] || null;
    }

    private async touchSession(sessionId: string) {
        if (!await this.hasSuperAdminSessionsTable()) {
            return;
        }

        await this.dataSource.query(
            `UPDATE super_admin_sessions
             SET last_seen_at = NOW()
             WHERE id = $1::uuid`,
            [sessionId],
        );
    }

    private async assertSensitiveIpAllowed(sourceIp: string | null, operatorName?: string | null) {
        const allowlist = this.getSensitiveIpAllowlist();
        if (!allowlist.length) {
            return;
        }

        const normalizedIp = this.normalizeSourceIp(sourceIp);
        const allowed = !!normalizedIp && allowlist.some((candidate) => this.matchesAllowedIp(normalizedIp, candidate));
        if (allowed) {
            return;
        }

        await this.recordAccessLog({
            eventType: 'IP_BLOCKED',
            success: false,
            operatorName: operatorName || null,
            sourceIp: normalizedIp,
            authMethod: 'bearer',
            details: {
                reason: 'ip_not_allowlisted',
                allowlist,
            },
        });
        throw new ForbiddenException('Seu IP nao esta autorizado para operacoes sensiveis do super-admin.');
    }

    private getSensitiveIpAllowlist() {
        return this.splitConfigList(
            process.env.SUPER_ADMIN_MUTATION_IP_ALLOWLIST || process.env.SUPER_ADMIN_IP_ALLOWLIST || '',
        ).map((item) => item.toLowerCase());
    }

    private matchesAllowedIp(sourceIp: string, candidate: string) {
        const normalizedSource = this.normalizeSourceIp(sourceIp);
        const normalizedCandidate = String(candidate || '').trim().toLowerCase();

        if (!normalizedSource || !normalizedCandidate) {
            return false;
        }
        if (normalizedCandidate === '*') {
            return true;
        }
        if (normalizedCandidate === 'loopback') {
            return normalizedSource === '127.0.0.1';
        }
        if (normalizedCandidate.endsWith('*')) {
            return normalizedSource.startsWith(normalizedCandidate.slice(0, -1));
        }
        return normalizedSource === normalizedCandidate;
    }

    private normalizeSourceIp(value: unknown) {
        const raw = this.normalizeOptionalText(value, 120);
        if (!raw) {
            return null;
        }

        let normalized = raw.split(',')[0].trim().toLowerCase();
        if (normalized.startsWith('::ffff:')) {
            normalized = normalized.slice(7);
        }
        if (normalized === '::1') {
            normalized = '127.0.0.1';
        }
        return normalized.slice(0, 80);
    }

    private async verifySuperAdminPassword(password: string) {
        const normalizedPassword = String(password || '');
        const hashCandidates = this.splitConfigList(
            process.env.SUPER_ADMIN_AUTH_PASSWORD_HASHES || process.env.SUPER_ADMIN_AUTH_PASSWORD_HASH || '',
        );
        for (const hash of hashCandidates) {
            if (await bcrypt.compare(normalizedPassword, hash)) {
                return true;
            }
        }

        const plainCandidates = this.getSuperAdminPlainPasswordCandidates();
        return plainCandidates.some((candidate) => this.safeCompare(candidate, normalizedPassword));
    }

    private getSuperAdminPlainPasswordCandidates() {
        const configured = this.splitConfigList(
            process.env.SUPER_ADMIN_AUTH_PASSWORDS ||
            process.env.SUPER_ADMIN_AUTH_PASSWORD ||
            process.env.SUPER_ADMIN_KEY ||
            '',
        );

        if (configured.length) {
            return configured;
        }

        if (String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
            return ['admin123@@##'];
        }

        return [];
    }

    private getSessionSecrets() {
        const configured = this.splitConfigList(
            process.env.SUPER_ADMIN_SESSION_SECRETS || process.env.SUPER_ADMIN_SESSION_SECRET || '',
        );
        if (configured.length) {
            return configured;
        }

        const fallbacks = this.splitConfigList(
            process.env.SUPER_ADMIN_AUTH_PASSWORD || process.env.SUPER_ADMIN_KEY || '',
        );
        if (fallbacks.length) {
            return fallbacks;
        }

        if (String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
            return ['clickgarcom-super-admin-dev-session-secret'];
        }

        throw new ForbiddenException('Nenhum segredo de sessão do super-admin foi configurado.');
    }

    private getSessionTtlHours() {
        const raw = Number(process.env.SUPER_ADMIN_SESSION_TTL_HOURS || 12);
        if (!Number.isFinite(raw) || raw <= 0) {
            return 12;
        }
        return Math.min(168, Math.max(1, Math.round(raw)));
    }

    private splitConfigList(rawValue: unknown) {
        return Array.from(new Set(
            String(rawValue || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
        ));
    }

    private getRabbitMqManagementBaseUrl() {
        const configured = String(process.env.RABBITMQ_MANAGEMENT_URL || '').trim();
        if (configured) {
            return configured.replace(/\/+$/, '');
        }
        return 'http://rabbitmq:15672/api';
    }

    private getRabbitMqManagementAuth() {
        const username = String(process.env.RABBITMQ_USER || 'clickgarcom').trim();
        const password = String(process.env.RABBITMQ_PASSWORD || 'clickgarcom123').trim();
        return { username, password };
    }

    private getRabbitMqManagementVhost() {
        const configured = String(process.env.RABBITMQ_VHOST || '/').trim();
        return configured || '/';
    }

    private getRabbitMqManagementVhostPath() {
        return encodeURIComponent(this.getRabbitMqManagementVhost());
    }

    private async fetchRabbitMqQueues() {
        try {
            const response = await axios.get(
                `${this.getRabbitMqManagementBaseUrl()}/queues/${this.getRabbitMqManagementVhostPath()}`,
                {
                    auth: this.getRabbitMqManagementAuth(),
                    timeout: 3000,
                },
            );
            return {
                available: true,
                queues: Array.isArray(response.data) ? response.data : [],
            };
        } catch (error) {
            this.logger.warn(`Falha ao consultar RabbitMQ Management API: ${(error as Error).message}`);
            return {
                available: false,
                reason: 'rabbitmq_management_unavailable',
                queues: [],
            };
        }
    }

    private async fetchRabbitMqDlqPeek(queueName: string) {
        const normalizedQueue = String(queueName || '').trim();
        if (!normalizedQueue) {
            return {
                available: true,
                queueName: null,
                messages: [],
            };
        }

        try {
            const response = await axios.post(
                `${this.getRabbitMqManagementBaseUrl()}/queues/${this.getRabbitMqManagementVhostPath()}/${encodeURIComponent(normalizedQueue)}/get`,
                {
                    count: 5,
                    ackmode: 'ack_requeue_true',
                    encoding: 'auto',
                    truncate: 400,
                },
                {
                    auth: this.getRabbitMqManagementAuth(),
                    timeout: 3000,
                },
            );
            return {
                available: true,
                queueName: normalizedQueue,
                messages: Array.isArray(response.data)
                    ? response.data.map((item: any) => ({
                        payload: String(item?.payload || '').slice(0, 400),
                        exchange: item?.exchange || null,
                        routingKey: item?.routing_key || null,
                        redelivered: !!item?.redelivered,
                    }))
                    : [],
            };
        } catch (error) {
            this.logger.warn(`Falha ao inspecionar mensagens da DLQ: ${(error as Error).message}`);
            return {
                available: false,
                queueName: normalizedQueue,
                messages: [],
            };
        }
    }

    private async publishRabbitMqMessage(queueName: string, payload: Record<string, unknown>) {
        const normalizedQueue = String(queueName || '').trim();
        if (!normalizedQueue) {
            throw new BadRequestException('Fila de destino inválida para publicação.');
        }

        try {
            await axios.post(
                `${this.getRabbitMqManagementBaseUrl()}/exchanges/${this.getRabbitMqManagementVhostPath()}/amq.default/publish`,
                {
                    properties: {},
                    routing_key: normalizedQueue,
                    payload: JSON.stringify(payload || {}),
                    payload_encoding: 'string',
                },
                {
                    auth: this.getRabbitMqManagementAuth(),
                    timeout: 3000,
                },
            );
        } catch (error) {
            throw new BadRequestException(`Falha ao publicar retentativa no RabbitMQ: ${(error as Error).message}`);
        }
    }

    private async countReliabilityImpactedTenants(input: {
        hasInboxEvents: boolean;
        hasOutboxMessages: boolean;
        hasPaymentAttempts: boolean;
    }) {
        const unions: string[] = [];
        if (input.hasInboxEvents) {
            unions.push(`
                SELECT ie.tenant_id
                FROM inbox_events ie
                WHERE ie.processing_error IS NOT NULL
            `);
        }
        if (input.hasOutboxMessages) {
            unions.push(`
                SELECT om.tenant_id
                FROM outbox_messages om
                WHERE om.sent = FALSE
                  AND (
                      om.attempts >= GREATEST(om.max_attempts, 1)
                      OR COALESCE(om.next_retry_at, om.created_at) <= NOW() - INTERVAL '30 minutes'
                  )
            `);
        }
        if (input.hasPaymentAttempts) {
            unions.push(`
                SELECT pa.tenant_id
                FROM payment_attempts pa
                WHERE pa.status IN ('ERROR', 'REJECTED', 'EXPIRED')
                   OR (
                        pa.status IN ('CREATED', 'PROCESSING', 'UNKNOWN', 'PENDING')
                        AND pa.reconciled_at IS NULL
                        AND pa.created_at <= NOW() - INTERVAL '30 minutes'
                   )
            `);
        }

        if (!unions.length) {
            return 0;
        }

        const rows = await this.dataSource.query(
            `SELECT COUNT(DISTINCT tenant_id)::int AS total
             FROM (
                ${unions.join('\nUNION ALL\n')}
             ) incidents
             WHERE tenant_id IS NOT NULL`,
        );
        return Number(rows?.[0]?.total || 0);
    }

    private async listReliabilityTopTenants(input: {
        hasInboxEvents: boolean;
        hasOutboxMessages: boolean;
        hasPaymentAttempts: boolean;
    }) {
        const unions: string[] = [];
        if (input.hasInboxEvents) {
            unions.push(`
                SELECT ie.tenant_id
                FROM inbox_events ie
                WHERE ie.processing_error IS NOT NULL
            `);
        }
        if (input.hasOutboxMessages) {
            unions.push(`
                SELECT om.tenant_id
                FROM outbox_messages om
                WHERE om.sent = FALSE
                  AND (
                      om.attempts >= GREATEST(om.max_attempts, 1)
                      OR COALESCE(om.next_retry_at, om.created_at) <= NOW() - INTERVAL '30 minutes'
                  )
            `);
        }
        if (input.hasPaymentAttempts) {
            unions.push(`
                SELECT pa.tenant_id
                FROM payment_attempts pa
                WHERE pa.status IN ('ERROR', 'REJECTED', 'EXPIRED')
                   OR (
                        pa.status IN ('CREATED', 'PROCESSING', 'UNKNOWN', 'PENDING')
                        AND pa.reconciled_at IS NULL
                        AND pa.created_at <= NOW() - INTERVAL '30 minutes'
                   )
            `);
        }

        if (!unions.length) {
            return [];
        }

        const rows = await this.dataSource.query(
            `SELECT
                i.tenant_id,
                t.name AS tenant_name,
                COUNT(*)::int AS incident_count
             FROM (
                ${unions.join('\nUNION ALL\n')}
             ) i
             JOIN tenants t ON t.id = i.tenant_id
             WHERE i.tenant_id IS NOT NULL
             GROUP BY i.tenant_id, t.name
             ORDER BY incident_count DESC, t.name ASC
             LIMIT 8`,
        );

        return (rows || []).map((row: any) => ({
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            incidentCount: Number(row.incident_count || 0),
        }));
    }

    private base64UrlEncode(value: string) {
        return this.base64UrlEncodeBytes(Buffer.from(value, 'utf8'));
    }

    private base64UrlEncodeBytes(value: Buffer) {
        return Buffer.from(value)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    private base64UrlDecode(value: string) {
        const normalized = String(value || '')
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const padding = normalized.length % 4 === 0
            ? ''
            : '='.repeat(4 - (normalized.length % 4));
        return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
    }

    private safeCompare(left: string, right: string) {
        const leftBuffer = Buffer.from(String(left || ''), 'utf8');
        const rightBuffer = Buffer.from(String(right || ''), 'utf8');
        if (leftBuffer.length !== rightBuffer.length) {
            return false;
        }
        return timingSafeEqual(leftBuffer, rightBuffer);
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

    private async recordAccessLog(input: {
        eventType: string;
        success: boolean;
        operatorName?: string | null;
        sessionId?: string | null;
        sourceIp?: string | null;
        userAgent?: string | null;
        authMethod?: string | null;
        details?: Record<string, unknown>;
    }) {
        if (!await this.hasSuperAdminAccessLogsTable()) {
            return;
        }

        try {
            await this.dataSource.query(
                `INSERT INTO super_admin_access_logs
                    (event_type, success, operator_name, session_id, source_ip, user_agent, auth_method, details, created_at)
                 VALUES
                    ($1, $2, $3, NULLIF($4, '')::uuid, $5, $6, $7, $8::jsonb, NOW())`,
                [
                    String(input.eventType || '').trim(),
                    !!input.success,
                    this.normalizeOptionalText(input.operatorName, 120),
                    String(input.sessionId || '').trim(),
                    this.normalizeSourceIp(input.sourceIp),
                    this.normalizeOptionalText(input.userAgent, 1000),
                    this.normalizeOptionalText(input.authMethod, 40),
                    JSON.stringify(input.details || {}),
                ],
            );
        } catch (error) {
            this.logger.warn(`Falha ao gravar log de acesso do super-admin: ${(error as Error).message}`);
        }
    }

    private normalizeOptionalText(value: unknown, maxLength: number) {
        const normalized = String(value || '').trim();
        if (!normalized) return null;
        return normalized.slice(0, maxLength);
    }

    private normalizeUuid(value: unknown) {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
            return null;
        }
        return normalized;
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

    private async hasPaymentsTable(): Promise<boolean> {
        return this.hasTable('payments');
    }

    private async hasOrdersTable(): Promise<boolean> {
        return this.hasTable('orders');
    }

    private async hasSuperAdminAuditLogsTable(): Promise<boolean> {
        return this.hasTable('super_admin_audit_logs');
    }

    private async hasSuperAdminSessionsTable(): Promise<boolean> {
        return this.hasTable('super_admin_sessions');
    }

    private async hasSuperAdminAccessLogsTable(): Promise<boolean> {
        return this.hasTable('super_admin_access_logs');
    }

    private async hasTable(tableName: string): Promise<boolean> {
        const normalized = String(tableName || '').replace(/[^a-z0-9_]/gi, '');
        const rows = await this.dataSource.query(
            `SELECT to_regclass('public.${normalized}') AS reg`,
        );
        return !!rows?.[0]?.reg;
    }
}
