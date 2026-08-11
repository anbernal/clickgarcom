import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DELIVERY_POSTAL_CODE_PROVIDER, DeliveryPostalCodeProvider, PostalCodeResult } from './postal-code-provider';

type CacheEntry = { expiresAt: number; result: PostalCodeResult };

@Injectable()
export class DeliveryPostalCodeService {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly ttlMs = 10 * 60 * 1000;

    constructor(@Inject(DELIVERY_POSTAL_CODE_PROVIDER) private readonly provider: DeliveryPostalCodeProvider) { }

    async lookup(rawPostalCode: string) {
        const postalCode = String(rawPostalCode || '').replace(/\D/g, '');
        if (!/^\d{8}$/.test(postalCode)) throw new BadRequestException('CEP inválido. Informe oito dígitos.');
        const cached = this.cache.get(postalCode);
        if (cached && cached.expiresAt > Date.now()) return cached.result;
        const result = await this.provider.lookup(postalCode);
        this.cache.set(postalCode, { expiresAt: Date.now() + this.ttlMs, result });
        return result;
    }
}
