import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { DeliveryAddressGeocodeService } from '../delivery/delivery-address-geocode.service';
import { DeliveryCheckoutService } from '../delivery/delivery-checkout.service';
import { DeliveryCustomerService } from '../delivery/delivery-customer.service';
import { DeliveryQuoteService } from '../delivery/delivery-quote.service';
import { DeliveryPostalCodeService } from '../delivery/postal-code/delivery-postal-code.service';
import { MenuService } from './menu.service';

type MenuCustomerSession = {
    tenantId: string;
    tenantSlug: string;
    customerId: string;
    phone: string;
    name: string;
};

@Injectable()
export class PublicMenuCustomerService {
    private readonly sessionSeconds = 30 * 24 * 60 * 60;
    // WhatsApp links are commonly opened later from the conversation history.
    // Keep the capability short-lived, but long enough to avoid expiring while
    // the customer is deciding what to order.
    private readonly whatsappCapabilitySeconds = 24 * 60 * 60;
    private readonly challengeMinutes = 8;

    constructor(
        private readonly dataSource: DataSource,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly menuService: MenuService,
        private readonly customerService: DeliveryCustomerService,
        private readonly postalCodeService: DeliveryPostalCodeService,
        private readonly geocodeService: DeliveryAddressGeocodeService,
        private readonly checkoutService: DeliveryCheckoutService,
        private readonly quoteService: DeliveryQuoteService,
    ) { }

    async requestLogin(rawSlug: string, rawPhone: string) {
        const tenant = await this.findTenant(rawSlug);
        const phone = this.customerService.normalizePhone(rawPhone);
        const recent = await this.dataSource.query(
            `SELECT COUNT(*)::int AS total,
                    MAX(created_at) AS last_created_at
               FROM digital_menu_login_challenges
              WHERE tenant_id = $1
                AND phone_normalized = $2
                AND created_at > NOW() - INTERVAL '15 minutes'`,
            [tenant.id, phone],
        );
        const total = Number(recent?.[0]?.total || 0);
        const lastCreatedAt = recent?.[0]?.last_created_at ? new Date(recent[0].last_created_at) : null;
        if (total >= 5 || (lastCreatedAt && Date.now() - lastCreatedAt.getTime() < 45_000)) {
            throw new ConflictException('Aguarde um pouco antes de solicitar outro código.');
        }

        const challengeId = uuidv4();
        const code = String(randomInt(100000, 1_000_000));
        const codeHash = this.hashLoginCode(challengeId, phone, code);
        const expiresAt = new Date(Date.now() + this.challengeMinutes * 60_000);
        const message = `🔐 *${tenant.name}*\n\nSeu código para entrar na loja é *${code}*.\n\nEle vale por ${this.challengeMinutes} minutos. Não compartilhe este código.`;

        await this.dataSource.transaction(async (manager) => {
            await manager.query(
                `UPDATE digital_menu_login_challenges
                    SET consumed_at = NOW()
                  WHERE tenant_id = $1
                    AND phone_normalized = $2
                    AND consumed_at IS NULL`,
                [tenant.id, phone],
            );
            await manager.query(
                `INSERT INTO digital_menu_login_challenges
                    (id, tenant_id, phone_normalized, code_hash, expires_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [challengeId, tenant.id, phone, codeHash, expiresAt],
            );
            await manager.query(
                `INSERT INTO outbox_messages
                    (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
                 VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
                [tenant.id, phone, message],
            );
        });

        return {
            challenge_id: challengeId,
            phone_masked: this.maskPhone(phone),
            expires_at: expiresAt,
            ...(String(this.configService.get('NODE_ENV') || '').toLowerCase() === 'production' ? {} : { development_code: code }),
        };
    }

    async verifyLogin(rawSlug: string, challengeId: string, rawCode: string, rawName?: string) {
        const tenant = await this.findTenant(rawSlug);
        const code = String(rawCode || '').replace(/\D/g, '');
        if (!/^[0-9]{6}$/.test(code)) throw new BadRequestException('Informe o código de seis dígitos.');
        const name = this.normalizeName(String(rawName || ''));
        if (!name) throw new BadRequestException('Informe seu nome para continuar.');

        const challenge = await this.dataSource.transaction(async (manager) => {
            const rows = await manager.query(
                `SELECT id, phone_normalized, code_hash, attempts, expires_at, consumed_at
                   FROM digital_menu_login_challenges
                  WHERE id = $1 AND tenant_id = $2
                  LIMIT 1
                  FOR UPDATE`,
                [challengeId, tenant.id],
            );
            const current = rows?.[0];
            if (!current || current.consumed_at || new Date(current.expires_at) <= new Date()) {
                throw new UnauthorizedException('Código expirado. Solicite um novo.');
            }
            if (Number(current.attempts || 0) >= 5) {
                throw new UnauthorizedException('Limite de tentativas atingido. Solicite um novo código.');
            }
            const expected = Buffer.from(String(current.code_hash || ''), 'hex');
            const received = Buffer.from(this.hashLoginCode(current.id, current.phone_normalized, code), 'hex');
            if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
                await manager.query(
                    `UPDATE digital_menu_login_challenges SET attempts = attempts + 1 WHERE id = $1`,
                    [challengeId],
                );
                throw new UnauthorizedException('Código incorreto. Confira e tente novamente.');
            }
            await manager.query(
                `UPDATE digital_menu_login_challenges SET consumed_at = NOW() WHERE id = $1`,
                [challengeId],
            );
            return current;
        });

        const customer = await this.customerService.resolveCustomer(tenant.id, challenge.phone_normalized, name);
        const sessionToken = this.jwtService.sign({
            scope: 'digital_menu_customer',
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
            customer_id: customer.id,
            phone: challenge.phone_normalized,
        }, { expiresIn: this.sessionSeconds });

        return {
            sessionToken,
            expiresInSeconds: this.sessionSeconds,
            customer,
        };
    }

    async createWhatsAppAccess(rawTenantId: string, rawPhone: string, rawExperience = '') {
        const tenantId = String(rawTenantId || '').trim();
        if (!this.isUuid(tenantId)) throw new BadRequestException('tenant_id inválido.');
        const rows = await this.dataSource.query(
            `SELECT id, slug, name, is_open, active, establishment_type, settings FROM tenants WHERE id = $1 LIMIT 1`,
            [tenantId],
        );
        const tenant = rows?.[0];
        if (!tenant || tenant.active !== true) throw new NotFoundException('Restaurante não encontrado.');
        if (tenant.is_open !== true) throw new ConflictException('O restaurante está fechado para novos pedidos agora.');

        const settings = this.parseSettings(tenant.settings);
        const experience = this.resolveStorefrontExperience(settings, tenant.establishment_type, rawExperience);
        const phone = this.customerService.normalizePhone(rawPhone);
        if (!phone) throw new BadRequestException('Telefone do WhatsApp inválido.');
        const customer = await this.customerService.resolveCustomer(tenant.id, phone);
        const capability = randomBytes(32).toString('base64url');
        const tokenHash = this.hashAccessCapability(capability);
        const expiresAt = new Date(Date.now() + this.whatsappCapabilitySeconds * 1000);

        await this.dataSource.transaction(async (manager) => {
            await manager.query(
                `UPDATE digital_menu_access_credentials
                    SET used_at = NOW()
                  WHERE tenant_id = $1 AND phone_normalized = $2 AND used_at IS NULL`,
                [tenant.id, phone],
            );
            await manager.query(
                `INSERT INTO digital_menu_access_credentials
                    (id, tenant_id, customer_id, phone_normalized, token_hash, expires_at, storefront)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [uuidv4(), tenant.id, customer.id, phone, tokenHash, expiresAt, experience],
            );
        });

        return { slug: tenant.slug, restaurant_name: tenant.name, capability, expires_at: expiresAt, experience };
    }

    async exchangeWhatsAppAccess(rawSlug: string, rawCapability: string, expectedExperience = '') {
        const tenant = await this.findTenant(rawSlug);
        if (tenant.is_open !== true) throw new ConflictException('O restaurante está fechado para novos pedidos agora.');
        const capability = String(rawCapability || '').trim();
        if (capability.length < 40 || capability.length > 100) {
            throw new UnauthorizedException('Link do cardápio inválido ou expirado.');
        }
        const tokenHash = this.hashAccessCapability(capability);
        const credential = await this.dataSource.transaction(async (manager) => {
            const rows = await manager.query(
                `SELECT id, customer_id, phone_normalized, expires_at, used_at, storefront
                   FROM digital_menu_access_credentials
                  WHERE tenant_id = $1 AND token_hash = $2
                  LIMIT 1 FOR UPDATE`,
                [tenant.id, tokenHash],
            );
            const current = rows?.[0];
            // WhatsApp's in-app browser may pre-open the URL and then load it
            // again after the customer taps it. Keep the capability exchange
            // idempotent until its short expiry so that the first navigation
            // cannot consume the customer's access attempt.
            if (!current || new Date(current.expires_at) <= new Date()) {
                throw new UnauthorizedException('Link do cardápio inválido ou expirado.');
            }
            const expected = String(expectedExperience || '').trim().toUpperCase();
            if (expected && String(current.storefront || 'MENU').toUpperCase() !== expected) {
                throw new UnauthorizedException('Este link não corresponde à loja selecionada. Solicite um novo link pelo WhatsApp.');
            }
            await manager.query(`UPDATE digital_menu_access_credentials SET used_at = COALESCE(used_at, NOW()) WHERE id = $1`, [current.id]);
            return current;
        });

        const customer = await this.customerService.getCustomer(tenant.id, credential.customer_id);
        const sessionToken = this.jwtService.sign({
            scope: 'digital_menu_customer',
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
            customer_id: credential.customer_id,
            phone: credential.phone_normalized,
        }, { expiresIn: this.sessionSeconds });
        return { sessionToken, expiresInSeconds: this.sessionSeconds, customer };
    }

    async getAuthenticatedMenu(rawSlug: string, sessionToken: string) {
        await this.resolveSession(rawSlug, sessionToken);
        const tenant = await this.findTenant(rawSlug);
        this.assertFoodStoreAvailable(tenant);
        const menu = await this.menuService.findPublicMenuBySlug(rawSlug);
        if (menu?.restaurant?.is_open !== true) {
            throw new ConflictException('O restaurante está fechado para novos pedidos agora.');
        }
        return menu;
    }

    async getProfile(rawSlug: string, sessionToken: string) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        const [customer, addresses] = await Promise.all([
            this.customerService.getCustomer(session.tenantId, session.customerId),
            this.customerService.listAddresses(session.tenantId, session.customerId),
        ]);
        return { customer, addresses };
    }

    async updateProfile(rawSlug: string, sessionToken: string, rawName: string) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        const name = this.normalizeName(rawName);
        if (!name) throw new BadRequestException('Informe seu nome.');
        return this.customerService.resolveCustomer(session.tenantId, session.phone, name);
    }

    async lookupPostalCode(rawSlug: string, sessionToken: string, postalCode: string) {
        await this.resolveSession(rawSlug, sessionToken);
        return this.postalCodeService.lookup(postalCode);
    }

    async createAddress(rawSlug: string, sessionToken: string, raw: Record<string, unknown>) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        await this.requireCustomerName(session);
        const address = await this.prepareAddress(raw);
        return this.customerService.createAddress(session.tenantId, session.customerId, address as any);
    }

    async updateAddress(rawSlug: string, sessionToken: string, addressId: string, raw: Record<string, unknown>) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        const address = await this.prepareAddress(raw);
        return this.customerService.updateAddress(session.tenantId, session.customerId, addressId, address as any);
    }

    async removeAddress(rawSlug: string, sessionToken: string, addressId: string) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        return this.customerService.removeAddress(session.tenantId, session.customerId, addressId);
    }

    async listOrderHistory(rawSlug: string, sessionToken: string) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        const rows = await this.dataSource.query(
            `SELECT dc.checkout_key,
                    dc.status AS payment_status,
                    dc.order_total,
                    dc.customer_delivery_fee,
                    dc.total_amount,
                    dc.created_at,
                    dc.expires_at,
                    ob.id AS batch_id,
                    ob.status AS order_status,
                    d.id AS delivery_id,
                    d.display_code,
                    d.status AS delivery_status,
                    d.eta_seconds,
                    d.delivered_at,
                    COALESCE(jsonb_agg(jsonb_build_object(
                        'menu_item_id', oi.menu_item_id,
                        'name', COALESCE(NULLIF(oi.item_name_snapshot, ''), mi.name, 'Item'),
                        'quantity', GREATEST(oi.quantity - COALESCE(oi.voided_quantity, 0), 0),
                        'unit_price', oi.unit_price,
                        'selected_options', COALESCE(oi.selected_options, '[]'::jsonb)
                    ) ORDER BY o.created_at, oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
               FROM delivery_checkouts dc
               JOIN order_batches ob ON ob.id = dc.order_batch_id AND ob.tenant_id = dc.tenant_id
          LEFT JOIN deliveries d ON d.batch_id = ob.id AND d.tenant_id = dc.tenant_id
          LEFT JOIN orders o ON o.batch_id = ob.id AND o.tenant_id = dc.tenant_id
          LEFT JOIN order_items oi ON oi.order_id = o.id
          LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
              WHERE dc.tenant_id = $1
                AND dc.customer_id = $2
              GROUP BY dc.checkout_key, dc.status, dc.order_total, dc.customer_delivery_fee,
                       dc.total_amount, dc.created_at, dc.expires_at, ob.id, ob.status,
                       d.id, d.display_code, d.status, d.eta_seconds, d.delivered_at
              ORDER BY dc.created_at DESC
              LIMIT 30`,
            [session.tenantId, session.customerId],
        );
        return rows.map((row: any) => ({
            checkout_key: row.checkout_key,
            payment_status: row.payment_status,
            order_status: row.order_status,
            delivery_id: row.delivery_id || null,
            delivery_code: row.display_code || null,
            delivery_status: row.delivery_status || null,
            eta_seconds: row.eta_seconds === null ? null : Number(row.eta_seconds),
            subtotal: Number(row.order_total || 0),
            delivery_fee: Number(row.customer_delivery_fee || 0),
            total: Number(row.total_amount || 0),
            created_at: row.created_at,
            expires_at: row.expires_at,
            delivered_at: row.delivered_at,
            items: Array.isArray(row.items) ? row.items.map((item: any) => ({
                menu_item_id: String(item.menu_item_id || ''),
                name: String(item.name || 'Item'),
                quantity: Number(item.quantity || 0),
                unit_price: Number(item.unit_price || 0),
                selected_options: Array.isArray(item.selected_options) ? item.selected_options.map((option: any) => ({
                    group_name: String(option?.group_name || option?.groupName || ''),
                    option_name: String(option?.option_name || option?.optionName || ''),
                    price_delta: Number(option?.price_delta ?? option?.priceDelta ?? 0),
                })).filter((option: any) => option.group_name && option.option_name) : [],
            })).filter((item: any) => item.quantity > 0) : [],
        }));
    }

    async createCheckout(rawSlug: string, sessionToken: string, raw: Record<string, unknown>) {
        const session = await this.resolveSession(rawSlug, sessionToken);
        await this.requireCustomerName(session);
        const tenant = await this.findTenant(rawSlug);
        this.assertFoodStoreAvailable(tenant);
        if (!tenant.is_open) throw new ConflictException('O restaurante está fechado para novos pedidos agora.');
        const deliverySettings = this.parseSettings(tenant.settings).delivery || {};
        if (deliverySettings.enabled !== true) throw new ConflictException('A entrega não está disponível neste restaurante.');

        const addressId = String(raw.address_id || '').trim();
        const idempotencyKey = String(raw.idempotency_key || '').trim().toLowerCase();
        if (!this.isUuid(addressId)) throw new BadRequestException('Selecione um endereço de entrega.');
        if (!this.isUuid(idempotencyKey)) throw new BadRequestException('Identificador da tentativa inválido.');
        const requestedItems = this.normalizeCart(raw.items);
        const addressRows = await this.dataSource.query(
            `SELECT * FROM customer_addresses
              WHERE id = $1 AND tenant_id = $2 AND customer_id = $3 AND deleted_at IS NULL
              LIMIT 1`,
            [addressId, session.tenantId, session.customerId],
        );
        const address = addressRows?.[0];
        if (!address) throw new NotFoundException('Endereço não encontrado.');
        if (!Number.isFinite(Number(address.latitude)) || !Number.isFinite(Number(address.longitude))) {
            throw new ConflictException('Confirme novamente o endereço para calcular a entrega.');
        }

        const checkoutKey = `menu-${idempotencyKey}`;
        const previous = await this.findOrderRequest(session, idempotencyKey);
        if (previous?.checkout_key && previous.status === 'PENDING_PAYMENT') {
            const replay = await this.checkoutService.rotatePublicCapability(session.tenantId, previous.checkout_key);
            return this.checkoutView(previous.tab_id, replay);
        }
        if (previous) throw new ConflictException('Esta tentativa já foi encerrada. Atualize a sacola e tente novamente.');

        const publicMenu = await this.menuService.findPublicMenuBySlug(rawSlug);
        const availableIds = new Set(
            publicMenu.categories.flatMap((category: any) => (category.items || []).map((item: any) => String(item.id))),
        );
        if (requestedItems.some((item) => !availableIds.has(item.menuItemId))) {
            throw new ConflictException('Um dos itens não está mais disponível. Atualize o cardápio.');
        }

        const created = await this.dataSource.transaction(async (manager) => {
            await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${session.tenantId}:${session.customerId}:${idempotencyKey}`]);
            const duplicate = await manager.query(
                `SELECT * FROM digital_menu_order_requests
                  WHERE tenant_id = $1 AND customer_id = $2 AND idempotency_key = $3 LIMIT 1`,
                [session.tenantId, session.customerId, idempotencyKey],
            );
            if (duplicate?.[0]) throw new ConflictException('O pedido já está sendo preparado. Aguarde alguns segundos.');

            const menuRows = await manager.query(
                `SELECT id, name, price, destination, item_type, option_groups, available, track_stock, stock_quantity
                   FROM menu_items
                  WHERE tenant_id = $1 AND id = ANY($2::uuid[])
                  FOR SHARE`,
                [session.tenantId, requestedItems.map((item) => item.menuItemId)],
            );
            const byId = new Map<string, any>((menuRows || []).map((row: any) => [String(row.id), row]));
            const grouped = new Map<string, Array<any>>();
            let subtotal = 0;
            for (const requested of requestedItems) {
                const item = byId.get(requested.menuItemId);
                if (!item || item.available !== true || (item.track_stock === true && Number(item.stock_quantity || 0) < requested.quantity)) {
                    throw new ConflictException('Um dos itens ficou indisponível. Atualize o cardápio.');
                }
                if (String(item.item_type || 'STANDARD') !== 'STANDARD') {
                    throw new ConflictException(`O item ${item.name} não pode ser enviado por esta tela.`);
                }
                const selectedOptions = this.validateSelectedOptions(item, requested.selectedOptions);
                const destination = String(item.destination || '').toUpperCase();
                if (!['KITCHEN', 'BAR'].includes(destination)) throw new ConflictException(`O item ${item.name} não possui setor de preparo válido.`);
                const unitPrice = this.money(Number(item.price || 0) + selectedOptions.priceDelta);
                subtotal = this.money(subtotal + unitPrice * requested.quantity);
                const items = grouped.get(destination) || [];
                items.push({ ...requested, name: String(item.name), unitPrice, selectedOptions: selectedOptions.selected });
                grouped.set(destination, items);
            }

            const requestId = uuidv4();
            const tabId = uuidv4();
            const batchId = uuidv4();
            const publicCode = await this.generateTabCode(manager, session.tenantId);
            const snapshot = this.addressSnapshot(address, session);
            await manager.query(
                `INSERT INTO tabs
                    (id, tenant_id, table_id, user_phone, opening_channel, service_mode, public_code,
                     subtotal, service_fee, total, paid_amount, status, opened_at)
                 VALUES ($1, $2, NULL, $3, 'DIGITAL_MENU_DELIVERY', 'SEM_MESA', $4,
                         $5, 0, $5, 0, 'OPEN', NOW())`,
                [tabId, session.tenantId, session.phone, publicCode, subtotal],
            );
            await manager.query(
                `INSERT INTO order_batches
                    (id, tenant_id, tab_id, customer_phone, status, service_type, delivery_address_snapshot, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'PENDING', 'DELIVERY', $5::jsonb, NOW(), NOW())`,
                [batchId, session.tenantId, tabId, session.phone, JSON.stringify(snapshot)],
            );
            await manager.query(
                `INSERT INTO digital_menu_order_requests
                    (id, tenant_id, customer_id, idempotency_key, tab_id, order_batch_id, checkout_key, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATING')`,
                [requestId, session.tenantId, session.customerId, idempotencyKey, tabId, batchId, checkoutKey],
            );
            const orderIds: string[] = [];
            for (const [destination, items] of grouped.entries()) {
                const orderId = uuidv4();
                orderIds.push(orderId);
                await manager.query(
                    `INSERT INTO orders (id, tenant_id, tab_id, batch_id, destination, status, notes, created_at)
                     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'Pedido Delivery pelo Cardápio Digital', NOW())`,
                    [orderId, session.tenantId, tabId, batchId, destination],
                );
                for (const item of items) {
                    await manager.query(
                        `INSERT INTO order_items
                            (id, order_id, menu_item_id, quantity, unit_price, selected_options, item_name_snapshot, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
                        [uuidv4(), orderId, item.menuItemId, item.quantity, item.unitPrice, JSON.stringify(item.selectedOptions || []), item.name],
                    );
                }
            }
            return { requestId, tabId, batchId, subtotal, snapshot, orderIds };
        });

        try {
            const mode = String(deliverySettings.default_fulfillment_mode || 'OWN').toUpperCase() === 'EXTERNAL' ? 'EXTERNAL' : 'OWN';
            let quoteId: string | undefined;
            if (mode === 'EXTERNAL') {
                const quote = await this.quoteService.createExternalQuote(session.tenantId, {
                    checkout_key: checkoutKey,
                    customer_id: session.customerId,
                    customer_address_id: addressId,
                    formatted_address: String(address.formatted_address || ''),
                    latitude: Number(address.latitude),
                    longitude: Number(address.longitude),
                    order_total: created.subtotal,
                });
                quoteId = quote.id;
            }
            let checkout = await this.checkoutService.create(session.tenantId, {
                checkout_key: checkoutKey,
                fulfillment_mode: mode,
                customer_id: session.customerId,
                customer_address_id: addressId,
                order_batch_id: created.batchId,
                quote_id: quoteId,
                order_total: created.subtotal,
                destination_lat: Number(address.latitude),
                destination_lng: Number(address.longitude),
                address_snapshot: created.snapshot,
            });
            if (!checkout.confirmation_token) checkout = await this.checkoutService.rotatePublicCapability(session.tenantId, checkoutKey);
            await this.dataSource.query(
                `UPDATE digital_menu_order_requests SET status = 'PENDING_PAYMENT', updated_at = NOW() WHERE id = $1`,
                [created.requestId],
            );
            await this.customerService.markUsed(session.tenantId, session.customerId, addressId);
            return this.checkoutView(created.tabId, checkout);
        } catch (error) {
            await this.failOrderRequest(created.requestId, session.tenantId, created.tabId, created.batchId, error);
            throw error;
        }
    }

    // Shared customer identity boundary for the digital menu and the store.
    // The HttpOnly cookie remains tenant-bound, so exposing this resolver does
    // not broaden access beyond the existing customer session contract.
    async resolveSession(rawSlug: string, token: string): Promise<MenuCustomerSession> {
        if (!token) throw new UnauthorizedException('Entre para continuar.');
        let decoded: any;
        try {
            decoded = this.jwtService.verify(token);
        } catch {
            throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
        }
        const slug = this.normalizeSlug(rawSlug);
        if (decoded?.scope !== 'digital_menu_customer' || decoded?.tenant_slug !== slug ||
            !this.isUuid(decoded?.tenant_id) || !this.isUuid(decoded?.customer_id)) {
            throw new UnauthorizedException('Sessão inválida para este restaurante.');
        }
        const rows = await this.dataSource.query(
            `SELECT c.id, c.phone_normalized, c.name
               FROM customers c JOIN tenants t ON t.id = c.tenant_id
              WHERE c.id = $1 AND c.tenant_id = $2 AND c.active = TRUE
                AND t.slug = $3 AND t.active = TRUE LIMIT 1`,
            [decoded.customer_id, decoded.tenant_id, slug],
        );
        if (!rows?.[0] || rows[0].phone_normalized !== decoded.phone) throw new UnauthorizedException('Sessão não está mais disponível.');
        return {
            tenantId: decoded.tenant_id,
            tenantSlug: slug,
            customerId: decoded.customer_id,
            phone: decoded.phone,
            name: String(rows[0].name || '').trim().replace(/\s+/g, ' '),
        };
    }

    private async findTenant(rawSlug: string) {
        const slug = this.normalizeSlug(rawSlug);
        const rows = await this.dataSource.query(
            `SELECT id, name, slug, active, is_open, establishment_type, settings FROM tenants WHERE slug = $1 AND active = TRUE LIMIT 1`,
            [slug],
        );
        if (!rows?.[0]) throw new NotFoundException('Cardápio não encontrado.');
        return rows[0];
    }

    private async findOrderRequest(session: MenuCustomerSession, idempotencyKey: string) {
        const rows = await this.dataSource.query(
            `SELECT * FROM digital_menu_order_requests
              WHERE tenant_id = $1 AND customer_id = $2 AND idempotency_key = $3 LIMIT 1`,
            [session.tenantId, session.customerId, idempotencyKey],
        );
        return rows?.[0] || null;
    }

    private async prepareAddress(raw: Record<string, unknown>) {
        const postalCode = String(raw.postal_code || '').replace(/\D/g, '');
        const street = String(raw.street || '').trim();
        const addressNumber = String(raw.address_number || '').trim();
        const neighborhood = String(raw.neighborhood || '').trim();
        const city = String(raw.city || '').trim();
        const state = String(raw.state || '').trim().toUpperCase();
        if (!/^\d{8}$/.test(postalCode) || !street || !addressNumber || !neighborhood || !city || !/^[A-Z]{2}$/.test(state)) {
            throw new BadRequestException('Preencha CEP, rua, número, bairro, cidade e estado.');
        }
        const geocode = await this.geocodeService.geocode({
            postal_code: postalCode,
            street,
            address_number: addressNumber,
            address_complement: String(raw.address_complement || '').trim() || undefined,
            neighborhood,
            city,
            state,
        } as any);
        return {
            label: String(raw.label || 'Casa').trim().slice(0, 80) || 'Casa',
            postal_code: postalCode,
            street,
            address_number: addressNumber,
            address_complement: String(raw.address_complement || '').trim() || undefined,
            neighborhood,
            city,
            state,
            address_reference: String(raw.address_reference || '').trim() || undefined,
            latitude: geocode.latitude,
            longitude: geocode.longitude,
            postal_code_provider: String(raw.postal_code_provider || '').trim() || undefined,
            postal_code_lookup_status: String(raw.postal_code_lookup_status || 'MANUAL').trim(),
            geocode_provider: geocode.geocode_provider,
            geocode_provider_id: geocode.geocode_provider_id || undefined,
            geocode_quality: geocode.geocode_quality,
            confirmed: true,
            is_default: raw.is_default !== false,
        };
    }

    private normalizeCart(raw: unknown) {
        if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw new BadRequestException('Sua sacola precisa ter entre 1 e 50 itens.');
        const grouped = new Map<string, { menuItemId: string; quantity: number; selectedOptions: Array<{ group_name: string; option_name: string }> }>();
        for (const value of raw) {
            const id = String(value?.menu_item_id || value?.id || '').trim();
            const quantity = Number(value?.quantity || 0);
            if (!this.isUuid(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
                throw new BadRequestException('A sacola contém um item ou quantidade inválida.');
            }
            const rawOptions = Array.isArray(value?.selected_options)
                ? value.selected_options
                : Array.isArray(value?.selectedOptions) ? value.selectedOptions : [];
            const selectedOptions = rawOptions.map((option: any) => ({
                group_name: String(option?.group_name || option?.groupName || '').trim(),
                option_name: String(option?.option_name || option?.optionName || '').trim(),
            }));
            const key = `${id}:${JSON.stringify(selectedOptions)}`;
            const current = grouped.get(key) || { menuItemId: id, quantity: 0, selectedOptions };
            current.quantity += quantity;
            grouped.set(key, current);
        }
        if ([...grouped.values()].some((item) => item.quantity > 20)) throw new BadRequestException('O limite é de 20 unidades por item.');
        return [...grouped.values()];
    }

    private validateSelectedOptions(menuItem: any, rawOptions: unknown) {
        const selected = Array.isArray(rawOptions) ? rawOptions : [];
        const groups = this.parseOptionGroups(menuItem?.option_groups);
        if (!groups.length) {
            if (selected.length) throw new BadRequestException(`O item ${menuItem.name} não aceita complementos.`);
            return { selected: [], priceDelta: 0 };
        }

        const normalized: Array<{ group_name: string; option_name: string; price_delta: number }> = [];
        let priceDelta = 0;
        for (const group of groups) {
            const groupName = String(group?.name || '').trim();
            const groupSelected = selected.filter((option: any) => String(option?.group_name || '').trim() === groupName);
            const minSelect = Math.max(0, Number(group?.min_select ?? group?.minSelect ?? (group?.required ? 1 : 0)) || 0);
            const maxSelect = Math.max(minSelect, Number(group?.max_select ?? group?.maxSelect ?? group?.options?.length ?? 1) || 1);
            if (groupSelected.length < minSelect) throw new BadRequestException(`Escolha pelo menos ${minSelect} opção(ões) em ${groupName}.`);
            if (groupSelected.length > maxSelect) throw new BadRequestException(`Escolha no máximo ${maxSelect} opção(ões) em ${groupName}.`);
            const seen = new Set<string>();
            for (const raw of groupSelected) {
                const optionName = String(raw?.option_name || '').trim();
                if (!optionName || seen.has(optionName)) throw new BadRequestException(`Opção inválida em ${groupName}.`);
                seen.add(optionName);
                const option = (Array.isArray(group.options) ? group.options : []).find((candidate: any) =>
                    String(candidate?.name || '').trim() === optionName && candidate?.available !== false,
                );
                if (!option) throw new BadRequestException(`A opção ${optionName} não está disponível para ${menuItem.name}.`);
                const delta = this.money(Number(option?.price_delta ?? option?.priceDelta ?? 0));
                normalized.push({ group_name: groupName, option_name: optionName, price_delta: delta });
                priceDelta += delta;
            }
        }
        const knownGroups = new Set(groups.map((group: any) => String(group?.name || '').trim()));
        if (selected.some((option: any) => !knownGroups.has(String(option?.group_name || '').trim()))) {
            throw new BadRequestException(`Complemento inválido para ${menuItem.name}.`);
        }
        return { selected: normalized, priceDelta: this.money(priceDelta) };
    }

    private parseOptionGroups(raw: unknown): any[] {
        if (Array.isArray(raw)) return raw;
        if (typeof raw !== 'string') return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private async generateTabCode(manager: any, tenantId: string) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const code = randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
            const rows = await manager.query(`SELECT 1 FROM tabs WHERE tenant_id = $1 AND public_code = $2 LIMIT 1`, [tenantId, code]);
            if (!rows?.[0]) return code;
        }
        throw new ConflictException('Não foi possível abrir o pedido agora. Tente novamente.');
    }

    private checkoutView(tabId: string, checkout: any) {
        return {
            tab_id: tabId,
            checkout_key: checkout.checkout_key,
            checkout_capability: checkout.confirmation_token,
            subtotal: Number(checkout.order_total || 0),
            delivery_fee: Number(checkout.customer_delivery_fee || 0),
            total: Number(checkout.total_amount || 0),
            expires_at: checkout.expires_at,
        };
    }

    private async failOrderRequest(requestId: string, tenantId: string, tabId: string, batchId: string, error: unknown) {
        const reason = String((error as any)?.message || 'Falha ao preparar checkout').slice(0, 500);
        await this.dataSource.transaction(async (manager) => {
            await manager.query(
                `UPDATE digital_menu_order_requests SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                [reason, requestId, tenantId],
            );
            await manager.query(
                `UPDATE orders SET status = 'CANCELED', canceled_at = NOW(), cancel_reason = $1 WHERE tenant_id = $2 AND batch_id = $3 AND status = 'PENDING'`,
                [reason, tenantId, batchId],
            );
            await manager.query(
                `UPDATE order_batches SET status = 'CANCELED', canceled_at = NOW(), cancel_reason = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 AND status = 'PENDING'`,
                [reason, batchId, tenantId],
            );
            await manager.query(
                `UPDATE tabs SET status = 'CLOSED', closed_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'OPEN'`,
                [tabId, tenantId],
            );
        }).catch(() => undefined);
    }

    private addressSnapshot(address: any, session: MenuCustomerSession) {
        return {
            customer_id: session.customerId,
            customer_name: session.name || null,
            customer_phone: session.phone,
            customer_address_id: address.id,
            label: address.label,
            postal_code: address.postal_code,
            street: address.street,
            address_number: address.address_number,
            address_complement: address.address_complement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            address_reference: address.address_reference,
            formatted_address: address.formatted_address,
            latitude: Number(address.latitude),
            longitude: Number(address.longitude),
            geocode_provider: address.geocode_provider,
            geocode_provider_id: address.geocode_provider_id,
            geocode_quality: address.geocode_quality,
            address_confirmed: true,
        };
    }

    private hashLoginCode(challengeId: string, phone: string, code: string) {
        const secret = String(this.configService.get('JWT_SECRET') || 'super-secret-key-clg-2024');
        return createHmac('sha256', secret).update(`${challengeId}:${phone}:${code}`).digest('hex');
    }

    private hashAccessCapability(capability: string) {
        return createHash('sha256').update(capability).digest('hex');
    }

    private normalizeSlug(raw: string) {
        const slug = String(raw || '').trim().toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) throw new BadRequestException('Identificador do restaurante inválido.');
        return slug;
    }

    private normalizeName(raw: string) {
        const name = String(raw || '').trim().replace(/\s+/g, ' ');
        return name.length >= 2 && name.length <= 120 ? name : '';
    }

    private async requireCustomerName(session: MenuCustomerSession) {
        const customer = await this.customerService.getCustomer(session.tenantId, session.customerId);
        if (!this.normalizeName(String(customer?.name || ''))) {
            throw new BadRequestException('Informe seu nome antes de cadastrar o endereço ou concluir o pedido.');
        }
    }

    private maskPhone(phone: string) {
        return phone.length < 7 ? '***' : `${phone.slice(0, 4)} ***** ${phone.slice(-2)}`;
    }

    private isUuid(value: unknown) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    }

    private money(value: number) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    private parseSettings(raw: unknown): any {
        if (raw && typeof raw === 'object') return raw;
        try { return JSON.parse(String(raw || '{}')); } catch { return {}; }
    }

    private resolveStorefrontExperience(settings: any, establishmentType: unknown, rawExperience: string) {
        const type = String(establishmentType || '').trim().toUpperCase();
        const retailEnabled = typeof settings?.retail?.enabled === 'boolean'
            ? settings.retail.enabled
            : ['MARKET', 'PHARMACY'].includes(type);
        const foodEnabled = typeof settings?.food_store?.enabled === 'boolean'
            ? settings.food_store.enabled
            : (type === '' || type === 'RESTAURANT') && (!retailEnabled || settings?.attendance?.enabled !== false);
        const requested = String(rawExperience || '').trim().toUpperCase();
        if (requested === 'MENU') {
            if (!foodEnabled) throw new ConflictException('A loja de comidas não está ativa para esta conta.');
            return 'MENU';
        }
        if (requested === 'STORE') {
            if (!retailEnabled) throw new ConflictException('A loja de produtos não está ativa para esta conta.');
            return 'STORE';
        }
        if (foodEnabled && !retailEnabled) return 'MENU';
        if (retailEnabled && !foodEnabled) return 'STORE';
        if (foodEnabled) return 'MENU';
        throw new ConflictException('Nenhuma loja de pedidos está ativa para esta conta.');
    }

    private assertFoodStoreAvailable(tenant: any) {
        const settings = this.parseSettings(tenant?.settings);
        const type = String(tenant?.establishment_type || '').trim().toUpperCase();
        const retailEnabled = typeof settings?.retail?.enabled === 'boolean'
            ? settings.retail.enabled
            : ['MARKET', 'PHARMACY'].includes(type);
        const enabled = typeof settings?.food_store?.enabled === 'boolean'
            ? settings.food_store.enabled
            : (type === '' || type === 'RESTAURANT') && (!retailEnabled || settings?.attendance?.enabled !== false);
        if (!enabled) throw new ConflictException('A loja de comidas não está disponível para esta conta.');
    }
}
