import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, Method } from 'axios';
import { DataSource, Repository } from 'typeorm';

import { Tenant } from '../../entities/tenant.entity';

type MessageStatementQuery = {
    page?: string | number;
    limit?: string | number;
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
        const usage = await this.getMessageUsage(tenantId);

        const walletBalance = Number(balanceData?.wallet_balance ?? tenant?.walletBalance ?? 0);
        const billingPlan = String(balanceData?.billing_plan || tenant?.billingPlan || 'pre_paid');
        const messagePrice = Number(balanceData?.message_price ?? tenant?.messagePrice ?? 0.02);
        const messagesRemaining =
            billingPlan === 'pre_paid' && messagePrice > 0
                ? Math.max(0, Math.floor(walletBalance / messagePrice))
                : null;

        return {
            ...balanceData,
            wallet_balance: walletBalance,
            billing_plan: billingPlan,
            message_price: messagePrice,
            messages_in: usage.messagesIn,
            messages_out: usage.messagesOut,
            messages_used: usage.messagesUsed,
            messages_remaining: messagesRemaining,
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
        const page = this.parsePositiveInt(query.page, 1, 100000);
        const limit = this.parsePositiveInt(query.limit, 20, 100);
        const offset = (page - 1) * limit;

        if (!(await this.hasMessageLogsTable())) {
            return {
                page,
                limit,
                total: 0,
                summary: {
                    messagesIn: 0,
                    messagesOut: 0,
                    messagesUsed: 0,
                },
                items: [],
            };
        }

        const hasDetailColumns = await this.hasMessageLogDetailColumns();
        const detailPhoneExpr = hasDetailColumns ? `NULLIF(TRIM(ml.user_phone), '')` : `NULL`;
        const detailPreviewExpr = hasDetailColumns ? `NULLIF(TRIM(ml.message_preview), '')` : `NULL`;

        const [rows, totalRows, summary] = await Promise.all([
            this.dataSource.query(
                `SELECT
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
                 WHERE ml.tenant_id = $1
                 ORDER BY ml.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [tenantId, limit, offset],
            ),
            this.dataSource.query(
                `SELECT COUNT(*)::int AS total
                 FROM message_logs
                 WHERE tenant_id = $1`,
                [tenantId],
            ),
            this.getMessageUsage(tenantId),
        ]);

        return {
            page,
            limit,
            total: Number(totalRows?.[0]?.total || 0),
            summary,
            items: (rows || []).map((row: any) => {
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
                };
            }),
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

    private async getMessageUsage(tenantId: string) {
        if (!(await this.hasMessageLogsTable())) {
            return {
                messagesIn: 0,
                messagesOut: 0,
                messagesUsed: 0,
            };
        }

        const rows = await this.dataSource.query(
            `SELECT
                COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS messages_in,
                COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS messages_out
             FROM message_logs
             WHERE tenant_id = $1`,
            [tenantId],
        );

        const row = rows?.[0] || {};
        const messagesIn = Number(row.messages_in || 0);
        const messagesOut = Number(row.messages_out || 0);

        return {
            messagesIn,
            messagesOut,
            messagesUsed: messagesIn + messagesOut,
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
        if (chars.length <= 5) {
            return normalized;
        }

        return `${chars.slice(0, 5).join('')}...`;
    }
}
