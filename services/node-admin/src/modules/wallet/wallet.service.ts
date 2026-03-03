import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError, Method } from 'axios';

@Injectable()
export class WalletService {
    async getBalance(tenantId: string) {
        return this.requestWithFallback('get', '/wallet/balance', tenantId);
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
}
