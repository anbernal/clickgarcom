import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { DeliveryCheckout } from '../../entities/delivery-checkout.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DeliveryQuote } from '../../entities/delivery-quote.entity';
import { DeliveryFeeService } from './delivery-fee.service';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { DeliveryQuoteService } from './delivery-quote.service';
import { DELIVERY_MAPS_PROVIDER, DeliveryMapsProvider } from './maps/maps-provider';
import { ConfirmDeliveryCheckoutDto, ConfirmPaidDeliveryCheckoutDto, CreateDeliveryCheckoutDto } from './dto/delivery-checkout.dto';

@Injectable()
export class DeliveryCheckoutService {
    // A customer can receive a payment link after reviewing the order. Keep
    // the frozen quote valid for 30 minutes so a freshly generated link still
    // has at least 15 minutes in the normal retry window.
    private readonly checkoutMinutes = 30;

    constructor(
        @InjectRepository(DeliveryCheckout) private readonly checkouts: Repository<DeliveryCheckout>,
        @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
        @InjectRepository(DeliveryQuote) private readonly quotes: Repository<DeliveryQuote>,
        private readonly dataSource: DataSource,
        private readonly feeService: DeliveryFeeService,
        private readonly capacityService: DeliveryCapacityService,
        private readonly quoteService: DeliveryQuoteService,
        @Inject(DELIVERY_MAPS_PROVIDER) private readonly mapsProvider: DeliveryMapsProvider,
    ) { }

    async create(tenantId: string, dto: CreateDeliveryCheckoutDto) {
        const checkoutKey = String(dto.checkout_key || '').trim();
        if (!checkoutKey) throw new ConflictException('checkout_key é obrigatória.');
        const existing = await this.checkouts.findOne({ where: { tenantId, checkoutKey } });
        if (existing) {
            if (dto.order_batch_id && existing.orderBatchId !== dto.order_batch_id) {
                throw new ConflictException('Checkout já vinculado a outro lote.');
            }
            return this.view(existing, null);
        }
        const tenant = await this.tenants.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Restaurante não encontrado.');
        if (dto.order_batch_id) {
            const batchRows = await this.dataSource.query(
                `SELECT id, service_type FROM order_batches WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
                [dto.order_batch_id, tenantId],
            );
            if (!batchRows?.[0] || String(batchRows[0].service_type || '').toUpperCase() !== 'DELIVERY') {
                throw new ConflictException('Lote de entrega inválido para este checkout.');
            }
        }
        const settings = ((tenant.settings || {}) as any).delivery || {};
        if (settings.enabled !== true) throw new ConflictException('Delivery não está ativo para este tenant.');
        const mode = String(dto.fulfillment_mode || settings.default_fulfillment_mode || 'OWN').toUpperCase();
        if (!['OWN', 'EXTERNAL'].includes(mode)) throw new ConflictException('Modalidade de entrega inválida.');
        if (dto.fulfillment_mode && dto.fulfillment_mode !== mode) throw new ConflictException('Modalidade de checkout inválida.');

        let fee = 0;
        let quoteId: string | null = null;
        let holdKey: string | null = null;
        if (mode === 'OWN') {
            const origin = settings.origin || {};
            let distanceMeters: number | null = null;
            if ([origin.lat, origin.lng].every((value: unknown) => Number.isFinite(Number(value)))) {
                try {
                    const route = await this.mapsProvider.route({
                        origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
                        destination: { lat: dto.destination_lat, lng: dto.destination_lng },
                    });
                    distanceMeters = route.distance_meters;
                } catch {
                    distanceMeters = null;
                }
            }
            const pricing = settings.fees || settings.own_delivery?.pricing || {};
            const quote = this.feeService.quote(distanceMeters, pricing);
            if (quote.rule.status === 'UNQUOTED' || quote.rule.status === 'OUT_OF_RANGE') {
                throw new ConflictException('Não foi possível calcular o frete próprio para este endereço.');
            }
            fee = quote.amount;
            holdKey = checkoutKey;
            await this.capacityService.hold(tenantId, holdKey);
        } else {
            if (!dto.quote_id) throw new ConflictException('Quote externa é obrigatória para este checkout.');
            const quote = await this.quotes.findOne({
                where: { id: dto.quote_id, tenantId, customerId: dto.customer_id, customerAddressId: dto.customer_address_id, status: 'VALID' },
            }) as any;
            if (!quote || quote.expiresAt <= new Date()) throw new ConflictException('Quote externa inválida ou expirada.');
            fee = Number(quote.customerDeliveryFee);
            quoteId = quote.id;
        }

        const token = randomUUID();
        const tokenHash = this.hash(token);
        const orderTotal = this.money(dto.order_total);
        const customerFee = this.money(fee);
        const checkout = this.checkouts.create({
            tenantId,
            checkoutKey,
            fulfillmentMode: mode,
            customerId: dto.customer_id,
            customerAddressId: dto.customer_address_id,
            orderBatchId: dto.order_batch_id || null,
            quoteId,
            orderTotal: orderTotal.toFixed(2),
            customerDeliveryFee: customerFee.toFixed(2),
            totalAmount: this.money(orderTotal + customerFee).toFixed(2),
            currency: 'BRL',
            status: 'PENDING_PAYMENT',
            confirmationTokenHash: tokenHash,
            expiresAt: new Date(Date.now() + this.checkoutMinutes * 60 * 1000),
            paymentReference: null,
            deliveryId: null,
            addressSnapshot: dto.address_snapshot || {},
            financialSnapshot: {
                version: 1,
                order_total: orderTotal,
                customer_delivery_fee: customerFee,
                total_amount: this.money(orderTotal + customerFee),
                fulfillment_mode: mode,
                quote_id: quoteId,
            },
        });
        try {
            const saved = await this.checkouts.save(checkout);
            return this.view(saved, token);
        } catch (error) {
            const concurrent = await this.checkouts.findOne({ where: { tenantId, checkoutKey } });
            if (concurrent) return this.view(concurrent, null);
            if (holdKey) await this.capacityService.release(tenantId, holdKey, 'CHECKOUT_CREATE_FAILED');
            throw error;
        }
    }

    async confirm(tenantId: string, dto: ConfirmDeliveryCheckoutDto) {
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryCheckout);
            const checkout = await repository.createQueryBuilder('checkout')
                .where('checkout.tenant_id = :tenantId AND checkout.checkout_key = :checkoutKey', { tenantId, checkoutKey: dto.checkout_key })
                .setLock('pessimistic_write')
                .getOne();
            if (!checkout) throw new NotFoundException('Checkout não encontrado.');
            if (!this.matchesToken(dto.confirmation_token, checkout.confirmationTokenHash)) throw new ConflictException('Token de confirmação inválido.');
            if (checkout.status === 'PAID') {
                if (checkout.paymentReference !== dto.payment_reference) throw new ConflictException('Checkout já foi confirmado com outra referência.');
                return checkout;
            }
            if (checkout.status !== 'PENDING_PAYMENT' || checkout.expiresAt <= new Date()) {
                checkout.status = 'EXPIRED';
                await repository.save(checkout);
                throw new ConflictException('Checkout expirado ou indisponível.');
            }
            if (checkout.fulfillmentMode === 'OWN') {
                await this.capacityService.confirm(tenantId, checkout.checkoutKey, dto.delivery_id);
            } else if (checkout.quoteId) {
                await this.quoteService.useQuote(tenantId, checkout.quoteId, dto.delivery_id);
            }
            checkout.status = 'PAID';
            checkout.paymentReference = dto.payment_reference;
            checkout.deliveryId = dto.delivery_id || null;
            return repository.save(checkout);
        });
        return this.view(result, null);
    }

    async confirmPaidInternally(tenantId: string, dto: ConfirmPaidDeliveryCheckoutDto) {
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryCheckout);
            const checkout = await repository.createQueryBuilder('checkout')
                .where('checkout.tenant_id = :tenantId AND checkout.checkout_key = :checkoutKey', { tenantId, checkoutKey: dto.checkout_key })
                .setLock('pessimistic_write')
                .getOne();
            if (!checkout) throw new NotFoundException('Checkout não encontrado.');
            if (checkout.orderBatchId !== dto.order_batch_id) throw new ConflictException('Lote do checkout não corresponde ao pagamento.');
            const paidAmount = this.money(dto.paid_amount);
            if (checkout.status === 'PAID') {
                if (checkout.paymentReference !== dto.payment_reference) throw new ConflictException('Checkout já foi confirmado com outra referência.');
                if (Number(checkout.totalAmount) !== paidAmount) throw new ConflictException('Valor pago não corresponde ao checkout.');
                return checkout;
            }
            if (checkout.status !== 'PENDING_PAYMENT' || checkout.expiresAt <= new Date()) {
                checkout.status = 'EXPIRED';
                await repository.save(checkout);
                throw new ConflictException('Checkout expirado ou indisponível.');
            }
            if (Number(checkout.totalAmount) !== paidAmount) throw new ConflictException('Valor pago não corresponde ao checkout.');
            if (checkout.fulfillmentMode === 'OWN') {
                await this.capacityService.confirm(tenantId, checkout.checkoutKey, dto.delivery_id);
            } else if (checkout.quoteId) {
                await this.quoteService.useQuote(tenantId, checkout.quoteId, dto.delivery_id);
            }
            checkout.status = 'PAID';
            checkout.paymentReference = dto.payment_reference;
            checkout.deliveryId = dto.delivery_id || null;
            const saved = await repository.save(checkout);
            return saved;
        });
        return this.view(result, null);
    }

    async get(tenantId: string, checkoutKey: string) {
        const normalizedKey = String(checkoutKey || '').trim();
        if (!normalizedKey) throw new NotFoundException('Checkout não encontrado.');
        const checkout = await this.checkouts.findOne({ where: { tenantId, checkoutKey: normalizedKey } });
        if (!checkout) throw new NotFoundException('Checkout não encontrado.');
        return this.view(checkout, null);
    }

    async rotatePublicCapability(tenantId: string, checkoutKey: string) {
        const checkout = await this.checkouts.findOne({ where: { tenantId, checkoutKey } });
        if (!checkout || checkout.status !== 'PENDING_PAYMENT' || checkout.expiresAt <= new Date()) {
            throw new ConflictException('Checkout expirado ou indisponível.');
        }
        const token = randomUUID();
        checkout.confirmationTokenHash = this.hash(token);
        const saved = await this.checkouts.save(checkout);
        return this.view(saved, token);
    }

    async cancel(tenantId: string, checkoutKey: string, reason = 'CHECKOUT_ABANDONED') {
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(DeliveryCheckout);
            const checkout = await repository.createQueryBuilder('checkout')
                .where('checkout.tenant_id = :tenantId AND checkout.checkout_key = :checkoutKey', { tenantId, checkoutKey: String(checkoutKey || '').trim() })
                .setLock('pessimistic_write')
                .getOne();
            if (!checkout) throw new NotFoundException('Checkout não encontrado.');
            if (checkout.status === 'PAID') return checkout;
            if (checkout.status === 'PENDING_PAYMENT') {
                checkout.status = 'CANCELED';
                await repository.save(checkout);
            }
            return checkout;
        });
        if (result.fulfillmentMode === 'OWN' && result.status === 'CANCELED') {
            await this.capacityService.release(tenantId, result.checkoutKey, reason).catch(() => undefined);
        }
        return this.view(result, null);
    }

    async expire(tenantId?: string) {
        const query = this.checkouts.createQueryBuilder('checkout')
            .where('checkout.status = :status AND checkout.expires_at <= :now', { status: 'PENDING_PAYMENT', now: new Date() });
        if (tenantId) query.andWhere('checkout.tenant_id = :tenantId', { tenantId });
        const rows = await query.getMany();
        for (const checkout of rows) {
            await this.checkouts.update(checkout.id, { status: 'EXPIRED' });
            if (checkout.fulfillmentMode === 'OWN') await this.capacityService.release(checkout.tenantId, checkout.checkoutKey, 'CHECKOUT_EXPIRED');
        }
        return { expired: rows.length };
    }

    private view(checkout: DeliveryCheckout, token: string | null) {
        return {
            id: checkout.id,
            tenant_id: checkout.tenantId,
            checkout_key: checkout.checkoutKey,
            fulfillment_mode: checkout.fulfillmentMode,
            customer_id: checkout.customerId,
            customer_address_id: checkout.customerAddressId,
            order_batch_id: checkout.orderBatchId,
            quote_id: checkout.quoteId,
            status: checkout.status,
            order_total: Number(checkout.orderTotal),
            customer_delivery_fee: Number(checkout.customerDeliveryFee),
            total_amount: Number(checkout.totalAmount),
            currency: checkout.currency,
            expires_at: checkout.expiresAt,
            payment_reference: checkout.paymentReference,
            delivery_id: checkout.deliveryId,
            confirmation_token: token,
            financial_snapshot: checkout.financialSnapshot,
        };
    }

    private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

    private matchesToken(value: string, expectedHash: string) {
        const actual = Buffer.from(this.hash(value), 'hex');
        const expected = Buffer.from(expectedHash, 'hex');
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    }

    private money(value: number) {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new ConflictException('Valor financeiro inválido.');
        return Math.round(Number(value) * 100) / 100;
    }
}
