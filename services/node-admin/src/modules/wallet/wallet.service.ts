import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, Method } from 'axios';
import { DataSource, Repository } from 'typeorm';

import { Tenant } from '../../entities/tenant.entity';

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
}
