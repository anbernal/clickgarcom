import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { DeliveryQuote } from '../../entities/delivery-quote.entity';
import { DeliveryProviderConfig } from '../../entities/delivery-provider-config.entity';
import { DeliveryProvider, DELIVERY_PROVIDER } from './providers/delivery-provider';
import { CreateExternalDeliveryQuoteDto } from './dto/delivery-quote.dto';

@Injectable()
export class DeliveryQuoteService {
    constructor(
        @InjectRepository(DeliveryQuote) private readonly quotes: Repository<DeliveryQuote>,
        @InjectRepository(DeliveryProviderConfig) private readonly providerConfigs: Repository<DeliveryProviderConfig>,
        private readonly dataSource: DataSource,
        @Inject(DELIVERY_PROVIDER) private readonly provider: DeliveryProvider,
    ) { }

    async createExternalQuote(tenantId: string, dto: CreateExternalDeliveryQuoteDto) {
        const checkoutKey = String(dto.checkout_key || '').trim();
        if (!checkoutKey) throw new ConflictException('checkout_key é obrigatória.');
        const now = new Date();
        const existing = await this.quotes.createQueryBuilder('quote')
            .where('quote.tenant_id = :tenantId AND quote.checkout_key = :checkoutKey', { tenantId, checkoutKey })
            .andWhere('quote.status = :status AND quote.expires_at > :now', { status: 'VALID', now })
            .orderBy('quote.created_at', 'DESC')
            .getOne();
        if (existing) return this.view(existing);

        const providerConfig = await this.providerConfigs.findOne({
            where: { tenantId, provider: this.provider.code(), enabled: true, environment: 'PRODUCTION' },
            order: { priority: 'ASC' },
        });
        if (!providerConfig) throw new ConflictException('Nenhum operador externo habilitado para este tenant.');

        const providerQuote = await this.provider.quote({
            tenantId,
            providerConfigId: providerConfig.id,
            externalMerchantId: providerConfig.externalMerchantId,
            quoteKey: checkoutKey,
            address: { formattedAddress: dto.formatted_address, latitude: dto.latitude, longitude: dto.longitude },
            orderTotal: dto.order_total,
        });
        if (!(providerQuote.expiresAt instanceof Date) || providerQuote.expiresAt <= now || providerQuote.quotedCost < 0) {
            throw new ConflictException('O operador retornou uma cotação inválida.');
        }
        const quote = this.quotes.create({
            tenantId,
            checkoutKey,
            customerId: dto.customer_id,
            customerAddressId: dto.customer_address_id,
            deliveryId: null,
            provider: providerQuote.provider,
            externalQuoteId: providerQuote.externalQuoteId,
            status: 'VALID',
            quotedCost: providerQuote.quotedCost.toFixed(2),
            customerDeliveryFee: providerQuote.quotedCost.toFixed(2),
            currency: providerQuote.currency,
            distanceMeters: null,
            estimatedMinutes: providerQuote.estimatedMinutes,
            expiresAt: providerQuote.expiresAt,
            requestHash: null,
            providerSnapshot: {
                provider: providerQuote.provider,
                external_quote_id: providerQuote.externalQuoteId,
                estimated_minutes: providerQuote.estimatedMinutes,
                quoted_at: now.toISOString(),
            },
            usedAt: null,
        });
        return this.view(await this.quotes.save(quote));
    }

    async useQuote(tenantId: string, quoteId: string, deliveryId?: string) {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryQuote);
            const quote = await repository.createQueryBuilder('quote')
                .where('quote.id = :quoteId AND quote.tenant_id = :tenantId', { quoteId, tenantId })
                .setLock('pessimistic_write')
                .getOne();
            if (!quote) throw new NotFoundException('Cotação não encontrada.');
            if (quote.status === 'USED') {
                if (deliveryId && quote.deliveryId && quote.deliveryId !== deliveryId) throw new ConflictException('Cotação já vinculada a outro Delivery.');
                return this.view(quote);
            }
            if (quote.status !== 'VALID' || quote.expiresAt <= new Date()) {
                if (quote.status === 'VALID') {
                    quote.status = 'EXPIRED';
                    await repository.save(quote);
                }
                throw new ConflictException('A cotação expirou e precisa ser refeita.');
            }
            quote.status = 'USED';
            quote.usedAt = new Date();
            quote.deliveryId = deliveryId || null;
            return this.view(await repository.save(quote));
        });
    }

    async expire(tenantId?: string) {
        const query = this.quotes.createQueryBuilder()
            .update(DeliveryQuote)
            .set({ status: 'EXPIRED' })
            .where('status = :status AND expires_at <= :now', { status: 'VALID', now: new Date() });
        if (tenantId) query.andWhere('tenant_id = :tenantId', { tenantId });
        const result = await query.execute();
        return { expired: result.affected || 0 };
    }

    private view(quote: DeliveryQuote) {
        return {
            id: quote.id,
            tenant_id: quote.tenantId,
            checkout_key: quote.checkoutKey,
            customer_id: quote.customerId,
            customer_address_id: quote.customerAddressId,
            delivery_id: quote.deliveryId,
            provider: quote.provider,
            external_quote_id: quote.externalQuoteId,
            status: quote.status,
            customer_delivery_fee: Number(quote.customerDeliveryFee),
            currency: quote.currency,
            estimated_minutes: quote.estimatedMinutes,
            expires_at: quote.expiresAt,
            used_at: quote.usedAt,
        };
    }
}
