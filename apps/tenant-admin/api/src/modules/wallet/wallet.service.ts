import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, Method } from 'axios';
import { DataSource, Repository } from 'typeorm';

import { Tenant } from '../../entities/tenant.entity';

type MessageStatementQuery = {
    page?: string | number;
    limit?: string | number;
    origin?: string;
    user_phone?: string;
    date_from?: string;
    date_to?: string;
};

const MESSAGE_STATEMENT_SHORT_PREVIEW_LENGTH = 20;
const MESSAGE_STATEMENT_TIMEZONE = 'America/Sao_Paulo';

type MessageStatementFilters = {
    origin: 'all' | 'user' | 'robot';
    userPhone: string | null;
    dateFrom: string | null;
    dateTo: string | null;
};

type WalletMonthlySummary = {
    referenceMonth: string;
    messagesIn: number;
    messagesOut: number;
    messagesUsed: number;
    amount: number;
};

type WalletForecastSummary = {
    averageDailyMessages: number;
    expectedNext30DaysMessages: number;
    expectedNext30DaysAmount: number;
    projectedMonthMessages: number;
    projectedMonthAmount: number;
    estimatedDaysRemaining: number | null;
};

type WalletLowBalanceAlert = {
    level: 'warning' | 'critical';
    title: string;
    message: string;
    recommendedRechargeAmount: number;
    recommendedRechargeMessages: number;
};

type WalletFinancialOverview = {
    referenceMonth: string;
    mode: 'pre_paid' | 'post_paid';
    chargedMessages: number;
    chargedAmount: number;
    confirmedRechargeAmount: number;
    confirmedRechargeCount: number;
    amountCoveredByRecharge: number;
    amountCoveredByPreviousBalance: number;
    amountAddedToBalance: number;
    estimatedOpeningBalance: number | null;
    currentBalance: number;
    amountPendingInvoice: number;
    note: string;
};

type WalletUsageAnalytics = {
    messagesIn: number;
    messagesOut: number;
    messagesUsed: number;
    currentMonthSummary: WalletMonthlySummary;
    previousMonthSummary: WalletMonthlySummary;
    forecast: WalletForecastSummary;
    lowBalanceAlert: WalletLowBalanceAlert | null;
    financialOverview: WalletFinancialOverview;
};

@Injectable()
export class WalletService {
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        private readonly dataSource: DataSource,
    ) { }

    async getBalance(tenantId: string) {
        const balanceData = await this.requestWithFallback('get', '/wallet/balance', tenantId);
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });

        const walletBalance = Number(balanceData?.wallet_balance ?? tenant?.walletBalance ?? 0);
        const billingPlan = String(balanceData?.billing_plan || tenant?.billingPlan || 'pre_paid');
        const messagePrice = Number(balanceData?.message_price ?? tenant?.messagePrice ?? 0.02);
        const messagesRemaining =
            billingPlan === 'pre_paid' && messagePrice > 0
                ? Math.max(0, Math.floor(walletBalance / messagePrice))
                : null;
        const usage = await this.getMessageUsageAnalytics(
            tenantId,
            messagePrice,
            walletBalance,
            billingPlan,
            messagesRemaining,
        );

        return {
            ...balanceData,
            wallet_balance: walletBalance,
            billing_plan: billingPlan,
            message_price: messagePrice,
            messages_in: usage.messagesIn,
            messages_out: usage.messagesOut,
            messages_used: usage.messagesUsed,
            messages_remaining: messagesRemaining,
            current_month_summary: usage.currentMonthSummary,
            previous_month_summary: usage.previousMonthSummary,
            forecast: usage.forecast,
            low_balance_alert: usage.lowBalanceAlert,
            financial_overview: usage.financialOverview,
        };
    }

    async createPixPayment(tenantId: string, payload: Record<string, unknown>) {
        return this.requestWithFallback('post', '/payments/pix', tenantId, payload);
    }

    async createCardPayment(tenantId: string, payload: Record<string, unknown>) {
        return this.requestWithFallback('post', '/payments/card', tenantId, payload);
    }

    async getPaymentStatus(tenantId: string, paymentId: string) {
        return this.requestWithFallback('get', `/payments/${paymentId}/status`, tenantId);
    }

    async getMessageStatement(tenantId: string, query: MessageStatementQuery = {}) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        const messagePrice = this.normalizeCurrencyValue(tenant?.messagePrice ?? 0.02);
        const page = this.parsePositiveInt(query.page, 1, 100000);
        const limit = this.parsePositiveInt(query.limit, 20, 100);
        const offset = (page - 1) * limit;
        const filters = this.normalizeStatementFilters(query);

        if (!(await this.hasMessageLogsTable())) {
            return {
                page,
                limit,
                total: 0,
                filters,
                summary: {
                    messagesIn: 0,
                    messagesOut: 0,
                    messagesUsed: 0,
                    unitPrice: messagePrice,
                    totalAmount: 0,
                    missingPhoneCount: 0,
                },
                items: [],
            };
        }

        const { baseQuery, params } = await this.buildMessageStatementBaseQuery(tenantId, filters);

        const [rows, aggregateRows] = await Promise.all([
            this.dataSource.query(
                `SELECT *
                 FROM (${baseQuery}) statement_rows
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ),
            this.dataSource.query(
                `SELECT
                    COUNT(*)::int AS total,
                    COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS messages_in,
                    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS messages_out,
                    COALESCE(SUM(CASE WHEN NULLIF(TRIM(user_phone), '') IS NULL THEN 1 ELSE 0 END), 0)::int AS missing_phone_count
                 FROM (${baseQuery}) statement_rows`,
                params,
            ),
        ]);

        const aggregate = aggregateRows?.[0] || {};
        const messagesIn = Number(aggregate.messages_in || 0);
        const messagesOut = Number(aggregate.messages_out || 0);
        const messagesUsed = messagesIn + messagesOut;
        const totalAmount = this.normalizeCurrencyValue(messagesUsed * messagePrice);

        return {
            page,
            limit,
            total: Number(aggregate.total || 0),
            filters,
            summary: {
                messagesIn,
                messagesOut,
                messagesUsed,
                unitPrice: messagePrice,
                totalAmount,
                missingPhoneCount: Number(aggregate.missing_phone_count || 0),
            },
            items: this.mapMessageStatementRows(rows || [], messagePrice),
        };
    }

    async exportMessageStatementCsv(tenantId: string, query: MessageStatementQuery = {}) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        const messagePrice = this.normalizeCurrencyValue(tenant?.messagePrice ?? 0.02);
        const filters = this.normalizeStatementFilters(query);
        const rows = await this.loadAllMessageStatementRows(tenantId, filters);
        const items = this.mapMessageStatementRows(rows, messagePrice);

        const lines = [
            'telefone_usuario;origem;data_hora;descricao;valor',
            ...items.map((item) => this.buildMessageStatementCsvLine(item)),
        ];

        return {
            filename: this.buildMessageStatementExportFilename(),
            content: lines.join('\r\n'),
        };
    }

    private async requestWithFallback(
        method: Method,
        path: string,
        tenantId: string,
        data?: Record<string, unknown>,
    ) {
        let lastNetworkError: AxiosError | Error | null = null;

        for (const baseUrl of this.getCandidateBaseUrls()) {
            try {
                const response = await axios.request({
                    method,
                    url: `${baseUrl}${path}`,
                    data,
                    timeout: 5000,
                    headers: {
                        'X-Tenant-Id': tenantId,
                    },
                });

                return response.data;
            } catch (error) {
                if (!this.isRetriableNetworkError(error)) {
                    throw this.rethrowAxiosError(error);
                }

                lastNetworkError = error as AxiosError;
            }
        }

        throw new ServiceUnavailableException(
            lastNetworkError?.message || 'Go API indisponivel para carteira e pagamentos',
        );
    }

    private getCandidateBaseUrls() {
        const configured = (process.env.GO_CORE_BASE_URL || '').trim();
        return [...new Set([configured, 'http://go-api:8080', 'http://localhost:8080'].filter(Boolean))];
    }

    private isRetriableNetworkError(error: unknown) {
        if (!axios.isAxiosError(error)) {
            return false;
        }

        return !error.response;
    }

    private rethrowAxiosError(error: unknown) {
        if (!axios.isAxiosError(error)) {
            return error;
        }

        const status = error.response?.status || 502;
        const payload = error.response?.data;
        const message =
            typeof payload === 'string'
                ? payload
                : (payload as { error?: string; message?: string } | undefined)?.message
                || (payload as { error?: string; message?: string } | undefined)?.error
                || error.message;

        return new ServiceUnavailableException({
            statusCode: status,
            message,
        });
    }

    private async getMessageUsageAnalytics(
        tenantId: string,
        messagePrice: number,
        walletBalance: number,
        billingPlan: string,
        messagesRemaining: number | null,
    ): Promise<WalletUsageAnalytics> {
        if (!(await this.hasMessageLogsTable())) {
            const currentMonthSummary = this.buildEmptyMonthlySummary(
                this.resolveCurrentMonthReference(),
                messagePrice,
            );
            const previousMonthSummary = this.buildEmptyMonthlySummary(
                this.resolvePreviousMonthReference(),
                messagePrice,
            );

            return {
                messagesIn: 0,
                messagesOut: 0,
                messagesUsed: 0,
                currentMonthSummary,
                previousMonthSummary,
                forecast: {
                    averageDailyMessages: 0,
                    expectedNext30DaysMessages: 0,
                    expectedNext30DaysAmount: 0,
                    projectedMonthMessages: 0,
                    projectedMonthAmount: 0,
                    estimatedDaysRemaining: null,
                },
                lowBalanceAlert: null,
                financialOverview: await this.buildFinancialOverview(
                    tenantId,
                    billingPlan,
                    walletBalance,
                    currentMonthSummary,
                ),
            };
        }

        const rows = await this.dataSource.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}'), 'YYYY-MM') AS current_month_ref,
                TO_CHAR(DATE_TRUNC('month', (NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') - INTERVAL '1 month'), 'YYYY-MM') AS previous_month_ref,
                EXTRACT(DAY FROM (NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}'))::int AS current_day_of_month,
                EXTRACT(DAY FROM (DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') + INTERVAL '1 month - 1 day'))::int AS days_in_month,
                COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS messages_in,
                COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS messages_out,
                COALESCE(SUM(CASE
                    WHEN DATE_TRUNC('month', created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') = DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}')
                     AND direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS current_month_messages_in,
                COALESCE(SUM(CASE
                    WHEN DATE_TRUNC('month', created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') = DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}')
                     AND direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS current_month_messages_out,
                COALESCE(SUM(CASE
                    WHEN DATE_TRUNC('month', created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') = DATE_TRUNC('month', (NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') - INTERVAL '1 month')
                     AND direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS previous_month_messages_in,
                COALESCE(SUM(CASE
                    WHEN DATE_TRUNC('month', created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') = DATE_TRUNC('month', (NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') - INTERVAL '1 month')
                     AND direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS previous_month_messages_out,
                COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int AS last_30_days_messages_used
             FROM message_logs
             WHERE tenant_id = $1`,
            [tenantId],
        );

        const row = rows?.[0] || {};
        const messagesIn = Number(row.messages_in || 0);
        const messagesOut = Number(row.messages_out || 0);
        const messagesUsed = messagesIn + messagesOut;
        const currentMonthIn = Number(row.current_month_messages_in || 0);
        const currentMonthOut = Number(row.current_month_messages_out || 0);
        const currentMonthMessagesUsed = currentMonthIn + currentMonthOut;
        const previousMonthIn = Number(row.previous_month_messages_in || 0);
        const previousMonthOut = Number(row.previous_month_messages_out || 0);
        const previousMonthMessagesUsed = previousMonthIn + previousMonthOut;
        const currentDayOfMonth = Math.max(1, Number(row.current_day_of_month || 1));
        const daysInMonth = Math.max(currentDayOfMonth, Number(row.days_in_month || currentDayOfMonth));
        const last30DaysMessagesUsed = Number(row.last_30_days_messages_used || 0);
        const averageDailyMessages = this.normalizeRoundedValue(last30DaysMessagesUsed / 30, 2);
        const expectedNext30DaysMessages = Math.max(0, Math.round(averageDailyMessages * 30));
        const expectedNext30DaysAmount = this.normalizeCurrencyValue(expectedNext30DaysMessages * messagePrice);
        const projectedMonthMessages = currentMonthMessagesUsed > 0
            ? Math.max(currentMonthMessagesUsed, Math.round((currentMonthMessagesUsed / currentDayOfMonth) * daysInMonth))
            : 0;
        const projectedMonthAmount = this.normalizeCurrencyValue(projectedMonthMessages * messagePrice);
        const estimatedDaysRemaining =
            billingPlan === 'pre_paid' && averageDailyMessages > 0 && messagesRemaining !== null
                ? this.normalizeRoundedValue(messagesRemaining / averageDailyMessages, 1)
                : null;
        const forecast: WalletForecastSummary = {
            averageDailyMessages,
            expectedNext30DaysMessages,
            expectedNext30DaysAmount,
            projectedMonthMessages,
            projectedMonthAmount,
            estimatedDaysRemaining,
        };
        const currentMonthSummary: WalletMonthlySummary = {
            referenceMonth: String(row.current_month_ref || this.resolveCurrentMonthReference()),
            messagesIn: currentMonthIn,
            messagesOut: currentMonthOut,
            messagesUsed: currentMonthMessagesUsed,
            amount: this.normalizeCurrencyValue(currentMonthMessagesUsed * messagePrice),
        };
        const previousMonthSummary: WalletMonthlySummary = {
            referenceMonth: String(row.previous_month_ref || this.resolvePreviousMonthReference()),
            messagesIn: previousMonthIn,
            messagesOut: previousMonthOut,
            messagesUsed: previousMonthMessagesUsed,
            amount: this.normalizeCurrencyValue(previousMonthMessagesUsed * messagePrice),
        };
        const financialOverview = await this.buildFinancialOverview(
            tenantId,
            billingPlan,
            walletBalance,
            currentMonthSummary,
        );

        return {
            messagesIn,
            messagesOut,
            messagesUsed,
            currentMonthSummary,
            previousMonthSummary,
            forecast,
            lowBalanceAlert: this.buildLowBalanceAlert(
                billingPlan,
                walletBalance,
                messagePrice,
                messagesRemaining,
                forecast,
            ),
            financialOverview,
        };
    }

    private async hasMessageLogsTable(): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT to_regclass('public.message_logs') AS reg`,
        );
        return !!rows?.[0]?.reg;
    }

    private async hasMessageLogDetailColumns(): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT COUNT(*)::int AS total
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'message_logs'
               AND column_name IN ('user_phone', 'message_preview')`,
        );

        return Number(rows?.[0]?.total || 0) === 2;
    }

    private async hasPaymentsTable(): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT to_regclass('public.payments') AS reg`,
        );
        return !!rows?.[0]?.reg;
    }

    private async buildMessageStatementBaseQuery(tenantId: string, filters: MessageStatementFilters) {
        const hasDetailColumns = await this.hasMessageLogDetailColumns();
        const detailPhoneExpr = hasDetailColumns ? `NULLIF(TRIM(ml.user_phone), '')` : `NULL`;
        const detailPreviewExpr = hasDetailColumns ? `NULLIF(TRIM(ml.message_preview), '')` : `NULL`;

        const coreQuery = `SELECT
            ml.id,
            ml.direction,
            ml.status,
            ml.message_id,
            ml.created_at,
            COALESCE(
                ${detailPhoneExpr},
                inbound.user_phone,
                outbound.user_phone
            ) AS user_phone,
            COALESCE(
                ${detailPreviewExpr},
                inbound.message_preview,
                outbound.message_preview,
                CASE
                    WHEN ml.direction = 'IN' THEN 'Mensagem recebida'
                    ELSE 'Mensagem enviada'
                END
            ) AS message_preview
         FROM message_logs ml
         LEFT JOIN LATERAL (
            SELECT
                NULLIF(TRIM(ie.payload #>> '{entry,0,changes,0,value,messages,0,from}'), '') AS user_phone,
                LEFT(
                    REGEXP_REPLACE(
                        COALESCE(
                            NULLIF(TRIM(ie.payload #>> '{entry,0,changes,0,value,messages,0,text,body}'), ''),
                            NULLIF(TRIM(ie.payload #>> '{entry,0,changes,0,value,messages,0,interactive,button_reply,title}'), ''),
                            NULLIF(TRIM(ie.payload #>> '{entry,0,changes,0,value,messages,0,interactive,list_reply,title}'), ''),
                            NULLIF(TRIM(ie.payload #>> '{entry,0,changes,0,value,messages,0,interactive,list_reply,description}'), ''),
                            'Mensagem recebida'
                        ),
                        '\\s+',
                        ' ',
                        'g'
                    ),
                    255
                ) AS message_preview
            FROM inbox_events ie
            WHERE ie.tenant_id = $1
              AND ie.provider_message_id = ml.message_id
            ORDER BY ie.received_at DESC
            LIMIT 1
         ) inbound ON ml.direction = 'IN'
         LEFT JOIN LATERAL (
            SELECT
                NULLIF(TRIM(om.recipient), '') AS user_phone,
                LEFT(
                    REGEXP_REPLACE(
                        COALESCE(NULLIF(TRIM(om.payload), ''), 'Mensagem enviada'),
                        '\\s+',
                        ' ',
                        'g'
                    ),
                    255
                ) AS message_preview
            FROM outbox_messages om
            WHERE om.tenant_id = $1
              AND om.destination = 'whatsapp'
              AND om.sent = TRUE
              AND ABS(EXTRACT(EPOCH FROM (COALESCE(om.sent_at, om.created_at) - ml.created_at))) <= 30
            ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(om.sent_at, om.created_at) - ml.created_at))) ASC,
                     COALESCE(om.sent_at, om.created_at) DESC
            LIMIT 1
         ) outbound ON ml.direction = 'OUT'
         WHERE ml.tenant_id = $1`;

        const params: unknown[] = [tenantId];
        const conditions: string[] = [];

        if (filters.origin === 'user') {
            params.push('IN');
            conditions.push(`statement_rows.direction = $${params.length}`);
        } else if (filters.origin === 'robot') {
            params.push('OUT');
            conditions.push(`statement_rows.direction = $${params.length}`);
        }

        if (filters.userPhone) {
            params.push(`%${filters.userPhone}%`);
            conditions.push(
                `REGEXP_REPLACE(COALESCE(statement_rows.user_phone, ''), '\\D', '', 'g') LIKE $${params.length}`,
            );
        }

        if (filters.dateFrom) {
            params.push(filters.dateFrom);
            conditions.push(
                `DATE(statement_rows.created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') >= $${params.length}`,
            );
        }

        if (filters.dateTo) {
            params.push(filters.dateTo);
            conditions.push(
                `DATE(statement_rows.created_at AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') <= $${params.length}`,
            );
        }

        const filteredQuery = conditions.length > 0
            ? `SELECT * FROM (${coreQuery}) statement_rows WHERE ${conditions.join(' AND ')}`
            : coreQuery;

        return {
            baseQuery: filteredQuery,
            params,
        };
    }

    private async loadAllMessageStatementRows(tenantId: string, filters: MessageStatementFilters) {
        if (!(await this.hasMessageLogsTable())) {
            return [];
        }

        const { baseQuery, params } = await this.buildMessageStatementBaseQuery(tenantId, filters);
        return this.dataSource.query(
            `SELECT *
             FROM (${baseQuery}) statement_rows
             ORDER BY created_at DESC`,
            params,
        );
    }

    private parsePositiveInt(value: unknown, fallback: number, max: number) {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }

        return Math.min(parsed, max);
    }

    private buildShortPreview(preview: string) {
        const normalized = String(preview || '').trim();
        if (!normalized) {
            return 'Sem dados';
        }

        const chars = Array.from(normalized);
        if (chars.length <= MESSAGE_STATEMENT_SHORT_PREVIEW_LENGTH) {
            return normalized;
        }

        return `${chars.slice(0, MESSAGE_STATEMENT_SHORT_PREVIEW_LENGTH).join('')}...`;
    }

    private mapMessageStatementRows(rows: any[], messagePrice: number) {
        return (rows || []).map((row: any) => {
            const preview = String(row.message_preview || '').trim();

            return {
                id: String(row.id || ''),
                direction: String(row.direction || 'OUT'),
                actor: String(row.direction || '').toUpperCase() === 'IN' ? 'user' : 'robot',
                status: row.status ? String(row.status) : null,
                messageId: row.message_id ? String(row.message_id) : null,
                userPhone: row.user_phone ? String(row.user_phone) : null,
                occurredAt: row.created_at,
                preview,
                previewShort: this.buildShortPreview(preview),
                amount: messagePrice,
            };
        });
    }

    private buildMessageStatementCsvLine(item: {
        userPhone: string | null;
        actor: string;
        occurredAt: string;
        preview: string;
        amount: number;
    }) {
        return [
            this.quoteCsvCell(item.userPhone || 'Nao identificado'),
            this.quoteCsvCell(item.actor === 'user' ? 'Usuario' : 'Robo'),
            this.quoteCsvCell(this.formatStatementExportDateTime(item.occurredAt)),
            this.quoteCsvCell(item.preview || 'Sem dados'),
            this.quoteCsvCell(this.normalizeCurrencyValue(item.amount || 0).toFixed(2).replace('.', ',')),
        ].join(';');
    }

    private buildMessageStatementExportFilename() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `extrato-mensagens-${year}-${month}-${day}.csv`;
    }

    private formatStatementExportDateTime(value: string) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value || '');
        }

        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: MESSAGE_STATEMENT_TIMEZONE,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    }

    private quoteCsvCell(value: string) {
        const normalized = String(value || '').replace(/"/g, '""');
        return `"${normalized}"`;
    }

    private normalizeStatementFilters(query: MessageStatementQuery): MessageStatementFilters {
        const rawOrigin = String(query.origin || '').trim().toLowerCase();
        const origin =
            rawOrigin === 'user' || rawOrigin === 'robot'
                ? rawOrigin
                : 'all';

        const normalized: MessageStatementFilters = {
            origin,
            userPhone: this.normalizePhoneSearch(query.user_phone),
            dateFrom: this.normalizeStatementDate(query.date_from),
            dateTo: this.normalizeStatementDate(query.date_to),
        };

        if (normalized.dateFrom && normalized.dateTo && normalized.dateFrom > normalized.dateTo) {
            return {
                ...normalized,
                dateFrom: normalized.dateTo,
                dateTo: normalized.dateFrom,
            };
        }

        return normalized;
    }

    private normalizePhoneSearch(value: unknown) {
        const digits = String(value || '').replace(/\D/g, '');
        return digits || null;
    }

    private normalizeStatementDate(value: unknown) {
        const raw = String(value || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    }

    private normalizeCurrencyValue(value: unknown) {
        const parsed = Number(value || 0);
        if (!Number.isFinite(parsed)) {
            return 0;
        }

        return Math.round(parsed * 100) / 100;
    }

    private normalizeRoundedValue(value: unknown, decimals = 2) {
        const parsed = Number(value || 0);
        if (!Number.isFinite(parsed)) {
            return 0;
        }

        const factor = 10 ** decimals;
        return Math.round(parsed * factor) / factor;
    }

    private async buildFinancialOverview(
        tenantId: string,
        billingPlan: string,
        walletBalance: number,
        currentMonthSummary: WalletMonthlySummary,
    ): Promise<WalletFinancialOverview> {
        const mode = billingPlan === 'post_paid' ? 'post_paid' : 'pre_paid';
        const chargedAmount = this.normalizeCurrencyValue(currentMonthSummary.amount || 0);
        const currentBalance = this.normalizeCurrencyValue(walletBalance);

        if (!(await this.hasPaymentsTable())) {
            return {
                referenceMonth: currentMonthSummary.referenceMonth,
                mode,
                chargedMessages: currentMonthSummary.messagesUsed,
                chargedAmount,
                confirmedRechargeAmount: 0,
                confirmedRechargeCount: 0,
                amountCoveredByRecharge: 0,
                amountCoveredByPreviousBalance: 0,
                amountAddedToBalance: 0,
                estimatedOpeningBalance: null,
                currentBalance,
                amountPendingInvoice: mode === 'post_paid' ? chargedAmount : 0,
                note: mode === 'post_paid'
                    ? 'O consumo do mes segue apurado normalmente, mas o detalhamento financeiro do fechamento ainda nao esta disponivel.'
                    : 'O consumo do mes segue apurado normalmente, mas o historico de recargas confirmadas nao esta disponivel para conciliacao.',
            };
        }

        const rows = await this.dataSource.query(
            `SELECT
                COALESCE(SUM(CASE
                    WHEN status = 'CONFIRMED'
                     AND tab_id IS NULL
                     AND order_id IS NULL
                     AND DATE_TRUNC('month', COALESCE(paid_at, created_at) AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') =
                         DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}')
                    THEN amount
                    ELSE 0
                END), 0)::numeric(10,2) AS confirmed_recharge_amount,
                COALESCE(COUNT(*) FILTER (
                    WHERE status = 'CONFIRMED'
                      AND tab_id IS NULL
                      AND order_id IS NULL
                      AND DATE_TRUNC('month', COALESCE(paid_at, created_at) AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}') =
                          DATE_TRUNC('month', NOW() AT TIME ZONE '${MESSAGE_STATEMENT_TIMEZONE}')
                ), 0)::int AS confirmed_recharge_count
             FROM payments
             WHERE tenant_id = $1`,
            [tenantId],
        );

        const row = rows?.[0] || {};
        const confirmedRechargeAmount = this.normalizeCurrencyValue(row.confirmed_recharge_amount || 0);
        const confirmedRechargeCount = Number(row.confirmed_recharge_count || 0);
        const amountCoveredByRecharge = mode === 'pre_paid'
            ? this.normalizeCurrencyValue(Math.min(chargedAmount, confirmedRechargeAmount))
            : 0;
        const amountCoveredByPreviousBalance = mode === 'pre_paid'
            ? this.normalizeCurrencyValue(Math.max(0, chargedAmount - confirmedRechargeAmount))
            : 0;
        const amountAddedToBalance = mode === 'pre_paid'
            ? this.normalizeCurrencyValue(Math.max(0, confirmedRechargeAmount - chargedAmount))
            : 0;
        const estimatedOpeningBalance = mode === 'pre_paid'
            ? this.normalizeCurrencyValue(currentBalance + chargedAmount - confirmedRechargeAmount)
            : null;
        const amountPendingInvoice = mode === 'post_paid' ? chargedAmount : 0;

        return {
            referenceMonth: currentMonthSummary.referenceMonth,
            mode,
            chargedMessages: currentMonthSummary.messagesUsed,
            chargedAmount,
            confirmedRechargeAmount,
            confirmedRechargeCount,
            amountCoveredByRecharge,
            amountCoveredByPreviousBalance,
            amountAddedToBalance,
            estimatedOpeningBalance,
            currentBalance,
            amountPendingInvoice,
            note: this.buildFinancialOverviewNote(
                mode,
                chargedAmount,
                confirmedRechargeAmount,
                amountCoveredByPreviousBalance,
                amountAddedToBalance,
            ),
        };
    }

    private buildFinancialOverviewNote(
        mode: 'pre_paid' | 'post_paid',
        chargedAmount: number,
        confirmedRechargeAmount: number,
        amountCoveredByPreviousBalance: number,
        amountAddedToBalance: number,
    ) {
        if (mode === 'post_paid') {
            return chargedAmount > 0
                ? 'No plano pos-pago, o consumo deste mes ainda compoe o fechamento financeiro pendente.'
                : 'No plano pos-pago, o fechamento do mes ainda nao tem consumo contabilizado.';
        }

        if (chargedAmount <= 0 && confirmedRechargeAmount <= 0) {
            return 'Ainda nao houve consumo nem recarga confirmada neste mes.';
        }

        if (chargedAmount > 0 && confirmedRechargeAmount <= 0) {
            return 'Nao houve recarga confirmada neste mes. O consumo foi abatido do saldo que ja estava disponivel na carteira.';
        }

        if (amountCoveredByPreviousBalance > 0) {
            return 'As recargas confirmadas deste mes cobriram parte do consumo. A diferenca foi abatida do saldo anterior da carteira.';
        }

        if (amountAddedToBalance > 0) {
            return 'As recargas confirmadas deste mes superaram o consumo e reforcaram o saldo disponivel da carteira.';
        }

        return 'As recargas confirmadas deste mes equivalem ao consumo ja abatido da carteira.';
    }

    private buildEmptyMonthlySummary(referenceMonth: string, messagePrice: number): WalletMonthlySummary {
        return {
            referenceMonth,
            messagesIn: 0,
            messagesOut: 0,
            messagesUsed: 0,
            amount: this.normalizeCurrencyValue(0 * messagePrice),
        };
    }

    private buildLowBalanceAlert(
        billingPlan: string,
        walletBalance: number,
        messagePrice: number,
        messagesRemaining: number | null,
        forecast: WalletForecastSummary,
    ): WalletLowBalanceAlert | null {
        if (billingPlan !== 'pre_paid' || messagePrice <= 0) {
            return null;
        }

        const estimatedDaysRemaining = forecast.estimatedDaysRemaining;
        const recommendedRechargeAmount = this.normalizeCurrencyValue(
            Math.max(0, forecast.expectedNext30DaysAmount - walletBalance),
        );
        const recommendedRechargeMessages = recommendedRechargeAmount > 0
            ? Math.max(0, Math.ceil(recommendedRechargeAmount / messagePrice))
            : 0;

        if (walletBalance <= 0 || messagesRemaining === 0 || (estimatedDaysRemaining !== null && estimatedDaysRemaining < 3)) {
            return {
                level: 'critical',
                title: 'Saldo critico',
                message: estimatedDaysRemaining !== null
                    ? `No ritmo atual, seu saldo cobre cerca de ${estimatedDaysRemaining} dia(s).`
                    : 'Seu saldo atual nao cobre novas mensagens de forma segura.',
                recommendedRechargeAmount,
                recommendedRechargeMessages,
            };
        }

        if ((estimatedDaysRemaining !== null && estimatedDaysRemaining < 7) || walletBalance < forecast.expectedNext30DaysAmount * 0.35) {
            return {
                level: 'warning',
                title: 'Saldo em atencao',
                message: estimatedDaysRemaining !== null
                    ? `No ritmo atual, o saldo deve durar cerca de ${estimatedDaysRemaining} dia(s).`
                    : 'Seu saldo esta abaixo do nivel recomendado para manter a operacao.',
                recommendedRechargeAmount,
                recommendedRechargeMessages,
            };
        }

        return null;
    }

    private resolveCurrentMonthReference() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    private resolvePreviousMonthReference() {
        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
}
