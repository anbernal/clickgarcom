import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryPostalCodeProvider, PostalCodeResult } from './postal-code-provider';

@Injectable()
export class HttpDeliveryPostalCodeProvider implements DeliveryPostalCodeProvider {
    private readonly baseUrl: string;
    private readonly timeoutMs: number;

    constructor(config: ConfigService) {
        this.baseUrl = String(config.get('DELIVERY_POSTAL_CODE_BASE_URL') || 'https://viacep.com.br/ws').replace(/\/$/, '');
        this.timeoutMs = Math.max(500, Math.min(10_000, Number(config.get('DELIVERY_POSTAL_CODE_TIMEOUT_MS') || 3000)));
    }

    async lookup(postalCode: string): Promise<PostalCodeResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.baseUrl}/${postalCode}/json/`, { signal: controller.signal, headers: { accept: 'application/json' } });
            if (!response.ok) throw new Error(`postal provider returned HTTP ${response.status}`);
            const body = await response.json() as Record<string, unknown>;
            if (body.erro === true) return this.notFound(postalCode);
            const result = {
                postal_code: String(body.cep || postalCode).replace(/\D/g, ''),
                street: String(body.logradouro || ''),
                neighborhood: String(body.bairro || ''),
                city: String(body.localidade || ''),
                state: String(body.uf || '').toUpperCase(),
                provider: 'VIACEP',
                status: 'FOUND' as const,
            };
            if (result.postal_code.length !== 8 || !result.city || result.state.length !== 2) return this.notFound(postalCode);
            return result;
        } catch {
            return { postal_code: postalCode, street: '', neighborhood: '', city: '', state: '', provider: 'VIACEP', status: 'ERROR' };
        } finally {
            clearTimeout(timer);
        }
    }

    private notFound(postalCode: string): PostalCodeResult {
        return { postal_code: postalCode, street: '', neighborhood: '', city: '', state: '', provider: 'VIACEP', status: 'NOT_FOUND' };
    }
}
