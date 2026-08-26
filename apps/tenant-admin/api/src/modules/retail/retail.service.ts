import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DeliveryService } from '../delivery/delivery.service';

const CATEGORY_PRESENTATION: Record<string, { icon: string; accent: string }> = {
    'ofertas do dia': { icon: '🏷️', accent: '#fee2e2' },
    'alimentos básicos': { icon: '🧺', accent: '#f3dfb6' },
    'frios e laticínios': { icon: '🥛', accent: '#dbeafe' },
    bebidas: { icon: '🥤', accent: '#cffafe' },
    limpeza: { icon: '🧼', accent: '#ccfbf1' },
    'higiene e beleza': { icon: '✨', accent: '#ede9fe' },
};

const PRODUCT_EMOJIS = ['🛍️', '🧺', '🥫', '🥛', '🧃', '🧼', '✨', '🧴'];

type RetailRow = {
    id: string;
    name: string;
    description: string | null;
    price: string | number;
    cost_price: string | number | null;
    image_url: string | null;
    available: boolean;
    stock_quantity: number | null;
    low_stock_threshold: number | null;
    category_name: string | null;
    category_id: string | null;
    sku: string | null;
    barcode: string | null;
    brand: string | null;
    package_label: string | null;
    on_hand: number | null;
    reserved: number | null;
    version: number | null;
};

@Injectable()
export class RetailService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly deliveryService: DeliveryService,
    ) { }

    async getWorkspace(tenantId: string) {
        const [tenant] = await this.dataSource.query(
            `SELECT establishment_type, settings FROM tenants WHERE id = $1 AND active = TRUE`,
            [tenantId],
        );
        const establishmentType = String(tenant?.establishment_type || '').toUpperCase();
        const settings = this.parseSettings(tenant?.settings);
        if (!this.isRetailEnabled(settings, establishmentType)) {
            throw new BadRequestException('O módulo RETAIL não está ativo para esta conta.');
        }

        const [categoryRows, productRows, lotRows, fulfillmentRows] = await Promise.all([
            this.dataSource.query(
                `SELECT category.id, category.name, category.description, category.image_url,
                        category.display_order, category.active
                   FROM menu_categories category
                  WHERE category.tenant_id = $1
                    AND (
                        NOT EXISTS (
                            SELECT 1 FROM menu_items item
                             WHERE item.tenant_id = category.tenant_id
                               AND item.category_id = category.id
                        )
                        OR EXISTS (
                            SELECT 1 FROM menu_items item
                             WHERE item.tenant_id = category.tenant_id
                               AND item.category_id = category.id
                               AND item.destination = 'PICKING'
                        )
                    )
                  ORDER BY category.display_order ASC, category.name ASC`,
                [tenantId],
            ),
            this.dataSource.query(
                `SELECT item.id, item.name, item.description, item.price, item.cost_price,
                        item.image_url, item.available, item.stock_quantity, item.low_stock_threshold,
                        category.id AS category_id, category.name AS category_name,
                        details.sku, details.barcode, details.brand, details.package_label,
                        balance.on_hand, balance.reserved, balance.version
                   FROM menu_items item
              LEFT JOIN menu_categories category
                     ON category.id = item.category_id AND category.tenant_id = item.tenant_id
              LEFT JOIN retail_product_details details
                     ON details.menu_item_id = item.id AND details.tenant_id = item.tenant_id
              LEFT JOIN inventory_balances balance
                     ON balance.menu_item_id = item.id AND balance.tenant_id = item.tenant_id
                  WHERE item.tenant_id = $1
                    AND item.destination = 'PICKING'
                  ORDER BY item.display_order ASC, item.name ASC`,
                [tenantId],
            ),
            this.dataSource.query(
                `SELECT lot.id, lot.menu_item_id AS "productId", lot.lot_code AS code,
                        lot.expires_at AS "expiresAt", lot.on_hand AS quantity
                   FROM inventory_lots lot
                  WHERE lot.tenant_id = $1
                  ORDER BY lot.expires_at ASC NULLS LAST, lot.created_at DESC`,
                [tenantId],
            ),
            this.dataSource.query(
                `SELECT request.id, request.fulfillment_status, request.version, request.created_at,
                        request.order_batch_id, batch.delivery_address_snapshot,
                        checkout.status AS payment_status, checkout.total_amount,
                        delivery.id AS delivery_id, delivery.display_code AS delivery_code, delivery.status AS delivery_status,
                        customer.name AS customer_name,
                        COALESCE(jsonb_agg(jsonb_build_object(
                            'productId', item.menu_item_id,
                            'quantity', GREATEST(item.quantity - COALESCE(item.voided_quantity, 0), 0),
                            'picked', request.fulfillment_status IN ('PACKING', 'READY', 'COMPLETED')
                        ) ORDER BY order_row.created_at, item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
                   FROM retail_order_requests request
                   JOIN delivery_checkouts checkout ON checkout.tenant_id = request.tenant_id AND checkout.checkout_key = request.checkout_key
              LEFT JOIN customers customer ON customer.id = request.customer_id AND customer.tenant_id = request.tenant_id
              LEFT JOIN order_batches batch ON batch.id = request.order_batch_id AND batch.tenant_id = request.tenant_id
              LEFT JOIN deliveries delivery ON delivery.batch_id = batch.id AND delivery.tenant_id = request.tenant_id
              LEFT JOIN orders order_row ON order_row.batch_id = batch.id AND order_row.tenant_id = request.tenant_id AND order_row.destination = 'PICKING'
              LEFT JOIN order_items item ON item.order_id = order_row.id
                  WHERE request.tenant_id = $1
                    AND checkout.status = 'PAID'
                    AND request.fulfillment_status <> 'COMPLETED'
                    AND request.fulfillment_status <> 'CANCELED'
                  GROUP BY request.id, request.fulfillment_status, request.version, request.created_at,
                           request.order_batch_id, batch.delivery_address_snapshot, checkout.status, checkout.total_amount,
                           delivery.id, delivery.display_code, delivery.status, customer.name
                  ORDER BY request.created_at ASC`,
                [tenantId],
            ),
        ]);

        const categories = categoryRows.map((category: Record<string, unknown>) => {
            const presentation = this.categoryPresentation(String(category.name || ''));
            return {
                id: category.id,
                name: category.name,
                icon: presentation.icon,
                accent: presentation.accent,
                active: category.active,
                description: category.description,
                imageUrl: category.image_url,
            };
        });

        const products = (productRows as RetailRow[]).map((product, index) => {
            const presentation = this.categoryPresentation(product.category_name || '');
            return {
                id: product.id,
                name: product.name,
                category: product.category_name || 'Sem categoria',
                categoryId: product.category_id,
                brand: product.brand || '',
                sku: product.sku || '',
                barcode: product.barcode || '',
                packageLabel: product.package_label || '',
                description: product.description || '',
                imageUrl: product.image_url,
                price: Number(product.price || 0),
                costPrice: Number(product.cost_price || 0),
                onHand: Number(product.on_hand ?? product.stock_quantity ?? 0),
                reserved: Number(product.reserved || 0),
                lowStockThreshold: Number(product.low_stock_threshold || 0),
                active: Boolean(product.available),
                featured: index < 4,
                emoji: PRODUCT_EMOJIS[index % PRODUCT_EMOJIS.length],
                accent: presentation.accent,
                version: Number(product.version || 1),
            };
        });

        const orders = fulfillmentRows.map((row: any) => {
            const snapshot = this.parseSettings(row.delivery_address_snapshot);
            const parts = [snapshot.street, snapshot.address_number, snapshot.neighborhood, snapshot.city, snapshot.state].filter(Boolean);
            return {
                id: row.id,
                code: String(row.delivery_code || row.order_batch_id || '').replace(/-/g, '').slice(-6).toUpperCase(),
                status: row.fulfillment_status,
                version: Number(row.version || 1),
                customer: String(row.customer_name || snapshot.customer_name || 'Cliente'),
                mode: 'DELIVERY',
                createdAt: new Date(row.created_at).toLocaleString('pt-BR'),
                total: Number(row.total_amount || 0),
                address: parts.join(', ') || 'Endereço de entrega confirmado',
                items: Array.isArray(row.items) ? row.items.filter((item: any) => Number(item.quantity || 0) > 0) : [],
                note: '',
                payment: 'Pagamento confirmado',
                deliveryId: row.delivery_id || null,
                deliveryStatus: row.delivery_status || null,
            };
        });

        return {
            establishmentType,
            retailEnabled: true,
            categories,
            products,
            lots: lotRows,
            movements: [],
            orders,
            history: [],
            integration: { mode: 'DATABASE', source: 'database', writable: true },
        };
    }

    async createCategory(tenantId: string, body: Record<string, any>) {
        await this.assertRetailTenant(tenantId);
        const name = String(body.name || '').trim();
        if (!name) throw new BadRequestException('Informe o nome da categoria.');
        const duplicate = await this.dataSource.query(
            `SELECT id FROM menu_categories WHERE tenant_id = $1 AND lower(name) = lower($2) LIMIT 1`,
            [tenantId, name],
        );
        if (duplicate.length) throw new BadRequestException('Já existe uma categoria com esse nome.');
        const id = uuidv4();
        await this.dataSource.query(
            `INSERT INTO menu_categories (id, tenant_id, name, description, image_url, display_order, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, tenantId, name, body.description || null, body.image_url || null, Number(body.display_order || 0), body.active !== false],
        );
        return { id, name };
    }

    async createProduct(tenantId: string, body: Record<string, any>) {
        await this.assertRetailTenant(tenantId);
        const name = String(body.name || '').trim();
        if (!name) throw new BadRequestException('Informe o nome do produto.');
        const categoryId = await this.assertCategory(tenantId, body.category_id);
        const id = uuidv4();
        const stock = Number(body.stock_quantity || 0);
        const threshold = Number(body.low_stock_threshold || 0);
        await this.dataSource.transaction(async (manager) => {
            await manager.query(
                `INSERT INTO menu_items
                    (id, tenant_id, category_id, name, description, price, cost_price, image_url,
                     destination, prep_time_minutes, available, display_order, track_stock,
                     stock_quantity, low_stock_threshold, item_type)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PICKING', 0, $9, 0, TRUE, $10, $11, 'STANDARD')`,
                [id, tenantId, categoryId, name, body.description || null, Number(body.price || 0), Number(body.cost_price || 0), body.image_url || null, body.available !== false, stock, threshold],
            );
            await manager.query(
                `INSERT INTO retail_product_details (tenant_id, menu_item_id, sku, barcode, brand, package_label)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [tenantId, id, body.sku || null, body.barcode || null, body.brand || null, body.package_label || null],
            );
            await manager.query(
                `INSERT INTO inventory_balances (tenant_id, menu_item_id, on_hand, reserved, version)
                 VALUES ($1, $2, $3, 0, 1)`,
                [tenantId, id, stock],
            );
        });
        return { id };
    }

    async updateProduct(tenantId: string, id: string, body: Record<string, any>) {
        await this.assertRetailTenant(tenantId);
        const [current] = await this.dataSource.query(
            `SELECT id, category_id, stock_quantity FROM menu_items WHERE id = $1 AND tenant_id = $2 AND destination = 'PICKING'`,
            [id, tenantId],
        );
        if (!current) throw new NotFoundException('Produto não encontrado.');
        const categoryId = body.category_id ? await this.assertCategory(tenantId, body.category_id) : current.category_id;
        const stock = body.stock_quantity === undefined ? null : Number(body.stock_quantity);
        await this.dataSource.transaction(async (manager) => {
            const itemFields: string[] = [];
            const itemValues: any[] = [];
            const add = (field: string, value: any) => { itemFields.push(`${field} = $${itemValues.length + 1}`); itemValues.push(value); };
            if (body.name !== undefined) add('name', String(body.name).trim());
            if (body.description !== undefined) add('description', body.description || null);
            if (body.price !== undefined) add('price', Number(body.price));
            if (body.cost_price !== undefined) add('cost_price', Number(body.cost_price));
            if (body.image_url !== undefined) add('image_url', body.image_url || null);
            if (body.available !== undefined) add('available', body.available !== false);
            if (body.category_id !== undefined) add('category_id', categoryId);
            if (stock !== null) add('stock_quantity', stock);
            if (body.low_stock_threshold !== undefined) add('low_stock_threshold', Number(body.low_stock_threshold || 0));
            if (itemFields.length) {
                itemValues.push(id, tenantId);
                await manager.query(`UPDATE menu_items SET ${itemFields.join(', ')}, updated_at = NOW() WHERE id = $${itemValues.length - 1} AND tenant_id = $${itemValues.length} AND destination = 'PICKING'`, itemValues);
            }

            const detailFields: string[] = [];
            const detailValues: any[] = [];
            const addDetail = (field: string, value: any) => { detailFields.push(`${field} = $${detailValues.length + 3}`); detailValues.push(value); };
            if (body.sku !== undefined) addDetail('sku', body.sku || null);
            if (body.barcode !== undefined) addDetail('barcode', body.barcode || null);
            if (body.brand !== undefined) addDetail('brand', body.brand || null);
            if (body.package_label !== undefined) addDetail('package_label', body.package_label || null);
            if (detailFields.length) {
                await manager.query(
                    `INSERT INTO retail_product_details (tenant_id, menu_item_id, ${detailFields.map((field) => field.split(' = ')[0]).join(', ')})
                     VALUES ($1, $2, ${detailValues.map((_, index) => `$${index + 3}`).join(', ')})
                     ON CONFLICT (tenant_id, menu_item_id) DO UPDATE SET ${detailFields.join(', ')}, updated_at = NOW()`,
                    [tenantId, id, ...detailValues],
                );
            }
            if (stock !== null) {
                const [balance] = await manager.query(`SELECT reserved FROM inventory_balances WHERE tenant_id = $1 AND menu_item_id = $2`, [tenantId, id]);
                if (Number(balance?.reserved || 0) > stock) throw new BadRequestException('O estoque não pode ficar abaixo do reservado.');
                await manager.query(
                    `INSERT INTO inventory_balances (tenant_id, menu_item_id, on_hand, reserved, version)
                     VALUES ($1, $2, $3, 0, 1)
                     ON CONFLICT (tenant_id, menu_item_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, version = inventory_balances.version + 1, updated_at = NOW()`,
                    [tenantId, id, stock],
                );
            }
        });
        return { id };
    }

    async transitionFulfillment(tenantId: string, requestId: string, nextStatus: string, expectedVersion?: number) {
        await this.assertRetailTenant(tenantId);
        const target = String(nextStatus || '').trim().toUpperCase();
        if (!['PICKING', 'PACKING', 'READY'].includes(target)) throw new BadRequestException('Etapa de separação inválida.');
        const expectedByCurrent: Record<string, string> = { NEW: 'PICKING', PICKING: 'PACKING', PACKING: 'READY' };
        const updated = await this.dataSource.transaction(async (manager) => {
            const rows = await manager.query(
                `SELECT request.*, checkout.status AS payment_status
                   FROM retail_order_requests request
                   JOIN delivery_checkouts checkout ON checkout.tenant_id = request.tenant_id AND checkout.checkout_key = request.checkout_key
                  WHERE request.id = $1 AND request.tenant_id = $2
                  FOR UPDATE`,
                [requestId, tenantId],
            );
            const request = rows?.[0];
            if (!request) throw new NotFoundException('Compra não encontrada.');
            if (request.payment_status !== 'PAID') throw new BadRequestException('A compra ainda aguarda a confirmação do pagamento.');
            if (expectedVersion && Number(request.version) !== Number(expectedVersion)) throw new BadRequestException('Esta compra foi atualizada. Atualize a fila e tente novamente.');
            if (expectedByCurrent[String(request.fulfillment_status)] !== target) throw new BadRequestException('A compra não pode avançar para essa etapa agora.');

            if (target === 'PICKING') {
                const availability = await manager.query(
                    `SELECT item.menu_item_id, (item.quantity - COALESCE(item.voided_quantity, 0))::int AS quantity,
                            balance.on_hand, balance.reserved
                       FROM orders order_row
                       JOIN order_items item ON item.order_id = order_row.id
                       JOIN inventory_balances balance ON balance.tenant_id = order_row.tenant_id AND balance.menu_item_id = item.menu_item_id
                      WHERE order_row.tenant_id = $1 AND order_row.batch_id = $2 AND order_row.destination = 'PICKING'
                      FOR UPDATE OF balance`,
                    [tenantId, request.order_batch_id],
                );
                for (const row of availability) {
                    if (Number(row.on_hand || 0) < Number(row.quantity || 0)) {
                        throw new BadRequestException('Um produto não possui saldo suficiente para iniciar a separação.');
                    }
                    await manager.query(
                        `UPDATE inventory_balances
                            SET on_hand = on_hand - $3,
                                reserved = GREATEST(0, reserved - $3),
                                version = version + 1, updated_at = NOW()
                          WHERE tenant_id = $1 AND menu_item_id = $2`,
                        [tenantId, row.menu_item_id, Number(row.quantity || 0)],
                    );
                }
                await manager.query(
                    `UPDATE orders SET status = 'ACCEPTED', accepted_at = NOW()
                      WHERE tenant_id = $1 AND batch_id = $2 AND destination = 'PICKING' AND status = 'PENDING'`,
                    [tenantId, request.order_batch_id],
                );
            }
            if (target === 'READY') {
                await manager.query(
                    `UPDATE orders SET status = 'READY', ready_at = NOW()
                      WHERE tenant_id = $1 AND batch_id = $2 AND destination = 'PICKING' AND status IN ('PENDING', 'ACCEPTED')`,
                    [tenantId, request.order_batch_id],
                );
            }
            const result = await manager.query(
                `UPDATE retail_order_requests
                    SET fulfillment_status = $3, version = version + 1, updated_at = NOW()
                  WHERE id = $1 AND tenant_id = $2
                  RETURNING id, order_batch_id, fulfillment_status, version`,
                [requestId, tenantId, target],
            );
            return result[0];
        });
        if (target === 'READY') {
            // The Delivery aggregate owns dispatch/routing. Reconcile only
            // after every PICKING order is READY, so no retail purchase ever
            // appears as a kitchen ticket.
            await this.deliveryService.reconcileOrderBatch({
                tenant_id: tenantId,
                batch_id: updated.order_batch_id,
                payment_confirmed: true,
            });
        }
        return updated;
    }

    async assertRetailTenant(tenantId: string) {
        const [tenant] = await this.dataSource.query(`SELECT establishment_type, settings FROM tenants WHERE id = $1 AND active = TRUE`, [tenantId]);
        const settings = this.parseSettings(tenant?.settings);
        if (!tenant || !this.isRetailEnabled(settings, String(tenant.establishment_type || '').toUpperCase())) {
            throw new BadRequestException('O módulo Loja não está ativo para esta conta.');
        }
    }

    private async assertCategory(tenantId: string, categoryId?: string) {
        if (!categoryId) return null;
        const [category] = await this.dataSource.query(`SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2`, [categoryId, tenantId]);
        if (!category) throw new BadRequestException('Categoria não encontrada para esta conta.');
        return category.id;
    }

    private categoryPresentation(name: string) {
        return CATEGORY_PRESENTATION[name.trim().toLocaleLowerCase('pt-BR')]
            || { icon: '🛍️', accent: '#dcfce7' };
    }

    parseSettings(raw: unknown): Record<string, any> {
        if (!raw) return {};
        if (typeof raw === 'object') return raw as Record<string, any>;
        try { return JSON.parse(String(raw)); } catch (_) { return {}; }
    }

    isRetailEnabled(settings: Record<string, any>, establishmentType: string) {
        if (typeof settings?.retail?.enabled === 'boolean') return settings.retail.enabled;
        return ['MARKET', 'PHARMACY'].includes(establishmentType);
    }
}
