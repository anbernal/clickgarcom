import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { DeliveryCheckoutService } from '../delivery/delivery-checkout.service';
import { DeliveryQuoteService } from '../delivery/delivery-quote.service';
import { PublicMenuCustomerService } from '../menu/public-menu-customer.service';
import { RetailService } from './retail.service';

/**
 * The retail checkout intentionally reuses the same tab, DeliveryCheckout and
 * payment contracts as the digital menu. Its only operational difference is
 * that all created orders are routed to PICKING, never KITCHEN/BAR.
 */
@Injectable()
export class RetailCheckoutService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly customers: PublicMenuCustomerService,
        private readonly checkoutService: DeliveryCheckoutService,
        private readonly quoteService: DeliveryQuoteService,
        private readonly retail: RetailService,
    ) { }

    async getCatalog(rawSlug: string, sessionToken: string) {
        await this.customers.resolveSession(rawSlug, sessionToken);
        const [tenant] = await this.dataSource.query(
            `SELECT id, name, slug, is_open, establishment_type, settings
               FROM tenants WHERE slug = $1 AND active = TRUE LIMIT 1`,
            [this.slug(rawSlug)],
        );
        if (!tenant) throw new NotFoundException('Loja não encontrada.');
        const settings = this.retail.parseSettings(tenant.settings);
        if (!this.retail.isRetailEnabled(settings, String(tenant.establishment_type || '').toUpperCase())) {
            throw new NotFoundException('A loja digital não está disponível para esta conta.');
        }
        const [categories, products] = await Promise.all([
            this.dataSource.query(
                `SELECT category.id, category.name, category.image_url
                   FROM menu_categories category
                  WHERE category.tenant_id = $1 AND category.active = TRUE
                    AND EXISTS (SELECT 1 FROM menu_items item WHERE item.category_id = category.id AND item.tenant_id = category.tenant_id AND item.destination = 'PICKING')
                  ORDER BY category.display_order ASC, category.name ASC`,
                [tenant.id],
            ),
            this.dataSource.query(
                `SELECT item.id, item.name, item.description, item.price, item.image_url, item.available,
                        category.id AS category_id, category.name AS category_name,
                        details.brand, details.package_label,
                        COALESCE(balance.on_hand - balance.reserved, item.stock_quantity, 0)::int AS stock
                   FROM menu_items item
              LEFT JOIN menu_categories category ON category.id = item.category_id AND category.tenant_id = item.tenant_id
              LEFT JOIN retail_product_details details ON details.tenant_id = item.tenant_id AND details.menu_item_id = item.id
              LEFT JOIN inventory_balances balance ON balance.tenant_id = item.tenant_id AND balance.menu_item_id = item.id
                  WHERE item.tenant_id = $1 AND item.destination = 'PICKING' AND item.available = TRUE
                  ORDER BY item.display_order ASC, item.name ASC`,
                [tenant.id],
            ),
        ]);
        const categoryPresentation = (name: string, index: number) => {
            const accents = ['#fee2e2', '#f3dfb6', '#ccfbf1', '#dbeafe', '#ede9fe', '#cffafe'];
            const icons = ['🏷️', '🧺', '🧴', '🥛', '✨', '🥤'];
            return { emoji: icons[index % icons.length], accent: accents[index % accents.length] };
        };
        const categoryRows = categories.map((category: any, index: number) => ({
            id: category.id, name: category.name, ...categoryPresentation(String(category.name), index), imageUrl: category.image_url || null,
        }));
        const categoryMap = new Map<string, any>(categoryRows.map((category: any) => [String(category.id), category]));
        return {
            tenant: {
                name: tenant.name,
                type: tenant.establishment_type,
                initials: String(tenant.name || 'LG').split(/\s+/).map((part: string) => part.slice(0, 1)).join('').slice(0, 2).toUpperCase(),
                open: tenant.is_open === true,
                description: 'Produtos para sua rotina, separados com cuidado e entregues com acompanhamento.',
            },
            categories: categoryRows,
            products: products.map((product: any, index: number) => {
                const category = categoryMap.get(String(product.category_id));
                return {
                    id: product.id,
                    name: product.name,
                    brand: product.brand || '',
                    categoryId: product.category_id || 'all',
                    package: product.package_label || '',
                    price: Number(product.price || 0),
                    stock: Math.max(0, Number(product.stock || 0)),
                    emoji: category?.emoji || ['🛍️', '🧺', '🥫', '🥛'][index % 4],
                    accent: category?.accent || '#dcfce7',
                    imageUrl: product.image_url || null,
                    description: product.description || '',
                    repeat: index < 6,
                };
            }),
        };
    }

    async createDeliveryCheckout(rawSlug: string, sessionToken: string, raw: Record<string, unknown>) {
        const session = await this.customers.resolveSession(rawSlug, sessionToken);
        const profile = await this.customers.getProfile(rawSlug, sessionToken);
        if (!String(profile?.customer?.name || '').trim()) throw new BadRequestException('Informe seu nome antes de concluir a compra.');
        const [tenant] = await this.dataSource.query(
            `SELECT id, name, slug, is_open, establishment_type, settings FROM tenants WHERE id = $1 AND active = TRUE LIMIT 1`,
            [session.tenantId],
        );
        if (!tenant || !tenant.is_open) throw new ConflictException('A loja está fechada para novos pedidos agora.');
        const settings = this.retail.parseSettings(tenant.settings);
        if (!this.retail.isRetailEnabled(settings, String(tenant.establishment_type || '').toUpperCase())) throw new ConflictException('A loja digital não está disponível.');
        const deliverySettings = settings.delivery || {};
        if (deliverySettings.enabled !== true) throw new ConflictException('A entrega não está disponível nesta loja.');

        const addressId = String(raw.address_id || '').trim();
        const idempotencyKey = String(raw.idempotency_key || '').trim().toLowerCase();
        const items = this.normalizeCart(raw.items);
        if (!this.uuid(addressId)) throw new BadRequestException('Selecione um endereço de entrega.');
        if (!this.uuid(idempotencyKey)) throw new BadRequestException('Identificador da tentativa inválido.');
        const [address] = await this.dataSource.query(
            `SELECT * FROM customer_addresses WHERE id = $1 AND tenant_id = $2 AND customer_id = $3 AND deleted_at IS NULL LIMIT 1`,
            [addressId, session.tenantId, session.customerId],
        );
        if (!address) throw new NotFoundException('Endereço não encontrado.');
        if (!Number.isFinite(Number(address.latitude)) || !Number.isFinite(Number(address.longitude))) throw new ConflictException('Confirme novamente o endereço para calcular a entrega.');

        const checkoutKey = `store-${idempotencyKey}`;
        const existing = await this.dataSource.query(
            `SELECT * FROM retail_order_requests WHERE tenant_id = $1 AND customer_id = $2 AND idempotency_key = $3 LIMIT 1`,
            [session.tenantId, session.customerId, idempotencyKey],
        );
        if (existing?.[0]?.checkout_key && existing[0].status === 'PENDING_PAYMENT') {
            const checkout = await this.checkoutService.rotatePublicCapability(session.tenantId, existing[0].checkout_key);
            return this.checkoutView(existing[0].tab_id, checkout);
        }
        if (existing?.[0]) throw new ConflictException('Esta tentativa já foi encerrada. Atualize a sacola e tente novamente.');

        const created = await this.dataSource.transaction(async (manager) => {
            await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`retail:${session.tenantId}:${session.customerId}:${idempotencyKey}`]);
            const duplicate = await manager.query(
                `SELECT id FROM retail_order_requests WHERE tenant_id = $1 AND customer_id = $2 AND idempotency_key = $3 LIMIT 1`,
                [session.tenantId, session.customerId, idempotencyKey],
            );
            if (duplicate?.[0]) throw new ConflictException('A compra já está sendo preparada. Aguarde alguns segundos.');
            const productRows = await manager.query(
                `SELECT item.id, item.name, item.price, item.available, item.destination, item.item_type,
                        balance.on_hand, balance.reserved
                   FROM menu_items item
              LEFT JOIN inventory_balances balance ON balance.tenant_id = item.tenant_id AND balance.menu_item_id = item.id
                  WHERE item.tenant_id = $1 AND item.id = ANY($2::uuid[]) FOR UPDATE`,
                [session.tenantId, items.map((item) => item.menuItemId)],
            );
            const products = new Map<string, any>(productRows.map((item: any) => [String(item.id), item]));
            let subtotal = 0;
            for (const requested of items) {
                const product = products.get(requested.menuItemId);
                const available = Number(product?.on_hand ?? 0) - Number(product?.reserved ?? 0);
                if (!product || product.available !== true || product.destination !== 'PICKING' || product.item_type !== 'STANDARD' || available < requested.quantity) {
                    throw new ConflictException('Um produto ficou indisponível. Atualize sua sacola.');
                }
                subtotal = this.money(subtotal + Number(product.price || 0) * requested.quantity);
            }
            const requestId = uuidv4(); const tabId = uuidv4(); const batchId = uuidv4(); const orderId = uuidv4();
            const publicCode = await this.generateTabCode(manager, session.tenantId);
            const snapshot = this.addressSnapshot(address, session);
            await manager.query(
                `INSERT INTO tabs (id, tenant_id, table_id, user_phone, opening_channel, service_mode, public_code, subtotal, service_fee, total, paid_amount, status, opened_at)
                 VALUES ($1, $2, NULL, $3, 'RETAIL_STORE_DELIVERY', 'SEM_MESA', $4, $5, 0, $5, 0, 'OPEN', NOW())`,
                [tabId, session.tenantId, session.phone, publicCode, subtotal],
            );
            await manager.query(
                `INSERT INTO order_batches (id, tenant_id, tab_id, customer_phone, status, service_type, delivery_address_snapshot, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'PENDING', 'DELIVERY', $5::jsonb, NOW(), NOW())`,
                [batchId, session.tenantId, tabId, session.phone, JSON.stringify(snapshot)],
            );
            await manager.query(
                `INSERT INTO retail_order_requests (id, tenant_id, customer_id, idempotency_key, tab_id, order_batch_id, checkout_key, status, fulfillment_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATING', 'NEW')`,
                [requestId, session.tenantId, session.customerId, idempotencyKey, tabId, batchId, checkoutKey],
            );
            await manager.query(
                `INSERT INTO orders (id, tenant_id, tab_id, batch_id, destination, status, notes, created_at)
                 VALUES ($1, $2, $3, $4, 'PICKING', 'PENDING', 'Compra Delivery pela Loja Digital', NOW())`,
                [orderId, session.tenantId, tabId, batchId],
            );
            for (const requested of items) {
                const product = products.get(requested.menuItemId);
                await manager.query(
                    `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, selected_options, item_name_snapshot, created_at)
                     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6, NOW())`,
                    [uuidv4(), orderId, requested.menuItemId, requested.quantity, Number(product.price || 0), product.name],
                );
                await manager.query(
                    `UPDATE inventory_balances SET reserved = reserved + $3, version = version + 1, updated_at = NOW()
                      WHERE tenant_id = $1 AND menu_item_id = $2 AND on_hand - reserved >= $3`,
                    [session.tenantId, requested.menuItemId, requested.quantity],
                );
            }
            return { requestId, tabId, batchId, subtotal, snapshot };
        });

        try {
            const mode = String(deliverySettings.default_fulfillment_mode || 'OWN').toUpperCase() === 'EXTERNAL' ? 'EXTERNAL' : 'OWN';
            let quoteId: string | undefined;
            if (mode === 'EXTERNAL') {
                const quote = await this.quoteService.createExternalQuote(session.tenantId, {
                    checkout_key: checkoutKey, customer_id: session.customerId, customer_address_id: addressId,
                    formatted_address: String(address.formatted_address || ''), latitude: Number(address.latitude), longitude: Number(address.longitude), order_total: created.subtotal,
                });
                quoteId = quote.id;
            }
            let checkout = await this.checkoutService.create(session.tenantId, {
                checkout_key: checkoutKey, fulfillment_mode: mode, customer_id: session.customerId, customer_address_id: addressId,
                order_batch_id: created.batchId, quote_id: quoteId, order_total: created.subtotal,
                destination_lat: Number(address.latitude), destination_lng: Number(address.longitude), address_snapshot: created.snapshot,
            });
            if (!checkout.confirmation_token) checkout = await this.checkoutService.rotatePublicCapability(session.tenantId, checkoutKey);
            await this.dataSource.query(`UPDATE retail_order_requests SET status = 'PENDING_PAYMENT', updated_at = NOW() WHERE id = $1`, [created.requestId]);
            return this.checkoutView(created.tabId, checkout);
        } catch (error) {
            await this.fail(created, session.tenantId, error);
            throw error;
        }
    }

    private async fail(created: any, tenantId: string, error: unknown) {
        const reason = String((error as any)?.message || 'Falha ao preparar checkout').slice(0, 500);
        await this.dataSource.transaction(async (manager) => {
            const rows = await manager.query(`SELECT menu_item_id, SUM(quantity - COALESCE(voided_quantity, 0))::int AS quantity FROM order_items item JOIN orders ord ON ord.id = item.order_id WHERE ord.batch_id = $1 AND ord.tenant_id = $2 GROUP BY menu_item_id`, [created.batchId, tenantId]);
            for (const row of rows) await manager.query(`UPDATE inventory_balances SET reserved = GREATEST(0, reserved - $3), version = version + 1, updated_at = NOW() WHERE tenant_id = $1 AND menu_item_id = $2`, [tenantId, row.menu_item_id, Number(row.quantity || 0)]);
            await manager.query(`UPDATE retail_order_requests SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`, [reason, created.requestId, tenantId]);
            await manager.query(`UPDATE orders SET status = 'CANCELED', canceled_at = NOW(), cancel_reason = $1 WHERE tenant_id = $2 AND batch_id = $3 AND status = 'PENDING'`, [reason, tenantId, created.batchId]);
            await manager.query(`UPDATE order_batches SET status = 'CANCELED', canceled_at = NOW(), cancel_reason = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 AND status = 'PENDING'`, [reason, created.batchId, tenantId]);
            await manager.query(`UPDATE tabs SET status = 'CLOSED', closed_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'OPEN'`, [created.tabId, tenantId]);
        }).catch(() => undefined);
    }

    private normalizeCart(raw: unknown) {
        if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw new BadRequestException('Sua sacola precisa ter entre 1 e 50 produtos.');
        const grouped = new Map<string, { menuItemId: string; quantity: number }>();
        for (const value of raw) {
            const id = String((value as any)?.menu_item_id || (value as any)?.id || '').trim(); const quantity = Number((value as any)?.quantity || 0);
            if (!this.uuid(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new BadRequestException('A sacola contém um produto ou quantidade inválida.');
            const current = grouped.get(id) || { menuItemId: id, quantity: 0 }; current.quantity += quantity; grouped.set(id, current);
        }
        if ([...grouped.values()].some((item) => item.quantity > 20)) throw new BadRequestException('O limite é de 20 unidades por produto.');
        return [...grouped.values()];
    }

    private addressSnapshot(address: any, session: any) { return { customer_id: session.customerId, customer_name: session.name || null, customer_phone: session.phone, customer_address_id: address.id, label: address.label, postal_code: address.postal_code, street: address.street, address_number: address.address_number, address_complement: address.address_complement, neighborhood: address.neighborhood, city: address.city, state: address.state, address_reference: address.address_reference, formatted_address: address.formatted_address, latitude: Number(address.latitude), longitude: Number(address.longitude), address_confirmed: true }; }
    private checkoutView(tabId: string, checkout: any) { return { tab_id: tabId, checkout_key: checkout.checkout_key, checkout_capability: checkout.confirmation_token, subtotal: Number(checkout.order_total || 0), delivery_fee: Number(checkout.customer_delivery_fee || 0), total: Number(checkout.total_amount || 0), expires_at: checkout.expires_at }; }
    private async generateTabCode(manager: any, tenantId: string) { for (let attempt = 0; attempt < 12; attempt += 1) { const code = randomBytes(3).toString('hex').slice(0, 5).toUpperCase(); const rows = await manager.query(`SELECT 1 FROM tabs WHERE tenant_id = $1 AND public_code = $2 LIMIT 1`, [tenantId, code]); if (!rows?.[0]) return code; } throw new ConflictException('Não foi possível abrir a compra agora. Tente novamente.'); }
    private slug(value: string) { const slug = String(value || '').trim().toLowerCase(); if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) throw new BadRequestException('Identificador da loja inválido.'); return slug; }
    private uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
    private money(value: number) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
}
