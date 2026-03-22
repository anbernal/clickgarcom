import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { OrderBatch } from '../../entities/order-batch.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DEFAULT_MESSAGE_TEMPLATES, resolveMessageTemplate } from '../../shared/message-templates';
import { AmqpService } from '../amqp/amqp.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['ACCEPTED', 'CANCELED'],
    ACCEPTED: ['READY', 'CANCELED'],
    READY: ['DELIVERED'],
    DELIVERED: [],
    CANCELED: [],
};

type BatchSyncResult = {
    batch: OrderBatch;
    orders: Order[];
    previousStatus: string;
    currentStatus: string;
    acceptedMilestoneReached: boolean;
    readyMilestoneReached: boolean;
};

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        @InjectRepository(OrderBatch)
        private readonly orderBatchRepo: Repository<OrderBatch>,
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,
        private readonly dataSource: DataSource,
        private readonly amqpService: AmqpService,
    ) { }

    async findAll(tenantId: string, status?: string) {
        const where: any = { tenantId };
        if (status) {
            const statuses = status
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (statuses.length === 1) {
                where.status = statuses[0];
            } else if (statuses.length > 1) {
                where.status = In(statuses);
            }
        }
        return this.orderRepo.find({
            where,
            relations: ['items'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string, tenantId: string) {
        return this.orderRepo.findOne({ where: { id, tenantId }, relations: ['items'] });
    }

    async updateStatus(
        id: string,
        newStatus: string,
        tenantId: string,
        prepMinutes?: number,
        cancelReason?: string,
    ) {
        const order = await this.findOne(id, tenantId);
        if (!order) throw new BadRequestException('Order not found');

        const allowed = VALID_TRANSITIONS[order.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(
                `Cannot transition from ${order.status} to ${newStatus}`,
            );
        }

        const now = new Date();
        order.status = newStatus;

        switch (newStatus) {
            case 'ACCEPTED':
                order.acceptedAt = now;
                break;
            case 'READY':
                order.readyAt = now;
                break;
            case 'DELIVERED':
                order.deliveredAt = now;
                break;
            case 'CANCELED':
                order.canceledAt = now;
                order.cancelReason = (cancelReason || '').trim() || null;
                break;
        }

        const saved = await this.orderRepo.save(order);
        const batchSync = saved.batchId
            ? await this.syncBatchStatus(saved.batchId, tenantId)
            : null;

        if (newStatus === 'ACCEPTED') {
            if (!saved.batchId || !batchSync || batchSync.acceptedMilestoneReached) {
                await this.enqueueAcceptedMessage(saved, tenantId, prepMinutes, batchSync?.orders || undefined);
            }
        }
        if (newStatus === 'READY') {
            if (!saved.batchId || !batchSync || batchSync.readyMilestoneReached) {
                await this.enqueueReadyMessage(saved, tenantId);
            }
        }
        if (newStatus === 'CANCELED') {
            await this.recalculateTabTotals(saved.tabId, tenantId);
            await this.enqueueCanceledMessage(saved, tenantId);
        }

        await this.publishOrderStatusChanged(saved);

        return saved;
    }

    private async enqueueAcceptedMessage(order: Order, tenantId: string, prepMinutes?: number, batchOrders?: Order[]) {
        const recipient = await this.resolveOrderRecipient(order, tenantId);
        if (!recipient) return;

        const activeOrders = (batchOrders || [order]).filter((current) => current.status !== 'CANCELED');
        const itemsSummary = order.batchId
            ? await this.buildBatchItemsSummary(order.batchId, tenantId)
            : await this.buildAcceptedItemsSummary(order, tenantId);
        const tenantName = await this.resolveTenantName(tenantId);

        let prepCopy = `Seu pedido foi aceito e já está sendo preparado.\n\n`;
        if (activeOrders.length <= 1) {
            const eta = this.normalizePrepMinutes(prepMinutes);
            prepCopy = `Seu pedido foi aceito e será entregue em *${eta} minutos*.\n\n`;
        }

        const messageBody =
            `✅ *Pedido aceito!*\n\n` +
            `${itemsSummary}` +
            `${prepCopy}` +
            `Assim que estiver pronto, avisaremos por aqui.`;
        const message = this.withRestaurantHeader(tenantName, messageBody);

        await this.enqueueWhatsAppMessage(tenantId, recipient, message);
    }

    private async enqueueCanceledMessage(order: Order, tenantId: string) {
        const recipient = await this.resolveOrderRecipient(order, tenantId);
        if (!recipient) return;

        const itemsSummary = await this.buildAcceptedItemsSummary(order, tenantId);
        const tenantName = await this.resolveTenantName(tenantId);
        const reason = (order.cancelReason || '').trim() || 'Sem motivo informado.';
        const messageBody =
            `⚠️ *Pedido indisponível no momento*\n\n` +
            `${itemsSummary}` +
            `Motivo: *${reason}*\n\n` +
            `Esse item não será cobrado na sua comanda.\n` +
            `Você pode fazer um novo pedido pelo menu principal.`;
        const message = this.withRestaurantHeader(tenantName, messageBody);

        await this.enqueueWhatsAppMessage(tenantId, recipient, message);
    }

    private async enqueueReadyMessage(order: Order, tenantId: string) {
        const recipient = await this.resolveOrderRecipient(order, tenantId);
        if (!recipient) return;

        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        const orderCode = this.resolveOrderMessageCode(order);
        const message = resolveMessageTemplate(
            tenant?.settings?.messages?.msg_order_ready,
            DEFAULT_MESSAGE_TEMPLATES.msg_order_ready || '',
            {
                '{numero_pedido}': orderCode,
                '{codigo_pedido}': orderCode,
                '{nome_restaurante}': String(tenant?.name || '').trim(),
            },
        ).replace(/\n{3,}/g, '\n\n');

        if (!message) return;

        await this.enqueueWhatsAppMessage(tenantId, recipient, message);
    }

    private async enqueueWhatsAppMessage(tenantId: string, recipient: string, message: string) {
        await this.dataSource.query(
            `INSERT INTO outbox_messages
                (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
             VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
            [tenantId, recipient, message],
        );
    }

    private async syncBatchStatus(batchId: string, tenantId: string): Promise<BatchSyncResult | null> {
        const batch = await this.orderBatchRepo.findOne({ where: { id: batchId, tenantId } });
        if (!batch) return null;

        const orders = await this.orderRepo.find({
            where: { tenantId, batchId },
            relations: ['items'],
            order: { createdAt: 'ASC' },
        });
        if (orders.length === 0) return null;

        const previousStatus = batch.status;
        const currentStatus = this.deriveBatchStatus(orders);
        const now = new Date();
        let changed = batch.status !== currentStatus;
        const acceptedMilestoneReached = this.allActiveOrdersAccepted(orders) && !batch.acceptedAt;
        const readyMilestoneReached = this.allActiveOrdersReady(orders) && !batch.readyAt;

        batch.status = currentStatus;

        if (acceptedMilestoneReached) {
            batch.acceptedAt = now;
            changed = true;
        }

        if (readyMilestoneReached) {
            batch.readyAt = now;
            changed = true;
        }

        if (this.allActiveOrdersDelivered(orders) && !batch.deliveredAt) {
            batch.deliveredAt = now;
            changed = true;
        }

        if (this.allOrdersCanceled(orders)) {
            if (!batch.canceledAt) {
                batch.canceledAt = now;
                changed = true;
            }
            if (!batch.cancelReason) {
                const reason = orders
                    .map((current) => String(current.cancelReason || '').trim())
                    .find(Boolean);
                if (reason) {
                    batch.cancelReason = reason;
                    changed = true;
                }
            }
        }

        if (changed) {
            await this.orderBatchRepo.save(batch);
        }

        return {
            batch,
            orders,
            previousStatus,
            currentStatus,
            acceptedMilestoneReached,
            readyMilestoneReached,
        };
    }

    private deriveBatchStatus(orders: Order[]): string {
        const total = orders.length;
        if (total === 0) return 'PENDING';

        const canceled = orders.filter((order) => order.status === 'CANCELED').length;
        const delivered = orders.filter((order) => order.status === 'DELIVERED').length;
        const ready = orders.filter((order) => order.status === 'READY').length;
        const pending = orders.filter((order) => order.status === 'PENDING').length;
        const active = total - canceled;

        if (canceled === total) return 'CANCELED';
        if (active > 0 && delivered === active) return 'DELIVERED';
        if (active > 0 && ready + delivered === active) return 'READY';
        if (ready + delivered > 0) return 'READY_PARTIAL';
        if (active > 0 && pending === 0) return 'ACCEPTED';
        return 'PENDING';
    }

    private allActiveOrdersAccepted(orders: Order[]): boolean {
        const active = orders.filter((order) => order.status !== 'CANCELED');
        return active.length > 0 && active.every((order) => order.status !== 'PENDING');
    }

    private allActiveOrdersReady(orders: Order[]): boolean {
        const active = orders.filter((order) => order.status !== 'CANCELED');
        return active.length > 0 && active.every((order) => order.status === 'READY' || order.status === 'DELIVERED');
    }

    private allActiveOrdersDelivered(orders: Order[]): boolean {
        const active = orders.filter((order) => order.status !== 'CANCELED');
        return active.length > 0 && active.every((order) => order.status === 'DELIVERED');
    }

    private allOrdersCanceled(orders: Order[]): boolean {
        return orders.length > 0 && orders.every((order) => order.status === 'CANCELED');
    }

    private async recalculateTabTotals(tabId: string, tenantId: string): Promise<void> {
        const subtotalRows = await this.dataSource.query(
            `SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS subtotal
               FROM orders o
               JOIN order_items oi ON oi.order_id = o.id
              WHERE o.tab_id = $1
                AND o.tenant_id = $2
                AND o.status <> 'CANCELED'`,
            [tabId, tenantId],
        );

        const tenantRows = await this.dataSource.query(
            `SELECT COALESCE((settings->>'service_fee_percent')::numeric, 10) AS service_fee_percent
               FROM tenants
              WHERE id = $1
              LIMIT 1`,
            [tenantId],
        );

        const subtotal = Number.parseFloat(String(subtotalRows?.[0]?.subtotal ?? '0')) || 0;
        const serviceFeePercent = Number.parseFloat(String(tenantRows?.[0]?.service_fee_percent ?? '10')) || 10;
        const serviceFee = this.roundMoney(subtotal * (serviceFeePercent / 100));
        const total = this.roundMoney(subtotal + serviceFee);

        await this.dataSource.query(
            `UPDATE tabs
                SET subtotal = $1,
                    service_fee = $2,
                    total = $3
              WHERE id = $4
                AND tenant_id = $5`,
            [this.roundMoney(subtotal), serviceFee, total, tabId, tenantId],
        );
    }

    private roundMoney(value: number): number {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    private async buildAcceptedItemsSummary(order: Order, tenantId: string): Promise<string> {
        const rows = await this.dataSource.query(
            `SELECT mi.name AS name, oi.quantity AS quantity
               FROM order_items oi
               JOIN menu_items mi ON mi.id = oi.menu_item_id
              WHERE oi.order_id = $1
                AND mi.tenant_id = $2
              ORDER BY oi.created_at ASC`,
            [order.id, tenantId],
        );

        const fromDb = (rows || [])
            .map((row: any) => {
                const name = String(row?.name || '').trim();
                const qty = Number.parseInt(String(row?.quantity ?? ''), 10);
                if (!name) return null;
                return `- ${name} (qtd: ${Number.isFinite(qty) && qty > 0 ? qty : 1})`;
            })
            .filter(Boolean) as string[];

        if (fromDb.length > 0) {
            return `📦 Itens:\n${fromDb.join('\n')}\n\n`;
        }

        const fallback = (order.items || [])
            .map((item) => `- Item ${item.menuItemId.slice(0, 8)} (qtd: ${item.quantity || 1})`);

        if (fallback.length > 0) {
            return `📦 Itens:\n${fallback.join('\n')}\n\n`;
        }

        return '';
    }

    private async buildBatchItemsSummary(batchId: string, tenantId: string): Promise<string> {
        const rows = await this.dataSource.query(
            `SELECT mi.name AS name,
                    SUM(oi.quantity)::int AS quantity
               FROM orders o
               JOIN order_items oi ON oi.order_id = o.id
               JOIN menu_items mi ON mi.id = oi.menu_item_id
              WHERE o.batch_id = $1
                AND o.tenant_id = $2
                AND o.status <> 'CANCELED'
                AND mi.tenant_id = $2
              GROUP BY mi.id, mi.name
              ORDER BY MIN(oi.created_at) ASC`,
            [batchId, tenantId],
        );

        const lines = (rows || [])
            .map((row: any) => {
                const name = String(row?.name || '').trim();
                const qty = Number.parseInt(String(row?.quantity ?? ''), 10);
                if (!name) return null;
                return `- ${name} (qtd: ${Number.isFinite(qty) && qty > 0 ? qty : 1})`;
            })
            .filter(Boolean) as string[];

        if (lines.length === 0) return '';
        return `📦 Itens:\n${lines.join('\n')}\n\n`;
    }

    private normalizePrepMinutes(prepMinutes?: number): number {
        const allowed = new Set([5, 10, 15, 20, 25, 30, 40, 45]);
        if (prepMinutes && allowed.has(prepMinutes)) return prepMinutes;
        return 10;
    }

    private async resolveTenantName(tenantId: string): Promise<string> {
        const rows = await this.dataSource.query(
            'SELECT name FROM tenants WHERE id = $1 LIMIT 1',
            [tenantId],
        );

        return String(rows?.[0]?.name || '').trim();
    }

    private withRestaurantHeader(tenantName: string, message: string): string {
        const body = (message || '').trim();
        if (!body) return '';

        const title = (tenantName || '').trim();
        if (!title) return body;

        return `🍽️ ${title}\n_______________________\n\n${body}`;
    }

    private resolveOrderMessageCode(order: Order): string {
        const batchId = String(order?.batchId || '').replace(/-/g, '').trim();
        if (batchId) return batchId.slice(0, 8).toUpperCase();

        const orderId = String(order?.id || '').replace(/-/g, '').trim();
        if (!orderId) return 'PEDIDO';
        return orderId.slice(0, 8).toUpperCase();
    }

    private async resolveOrderRecipient(order: Order, tenantId: string): Promise<string | null> {
        const rows = await this.dataSource.query(
            'SELECT user_phone FROM tabs WHERE id = $1 AND tenant_id = $2 LIMIT 1',
            [order.tabId, tenantId],
        );

        return this.resolveRecipient(rows?.[0]?.user_phone, order.notes || '');
    }

    private resolveRecipient(tabPhone?: string, orderNotes?: string): string | null {
        const fromTab = (tabPhone || '').trim();
        if (fromTab) return fromTab;

        const notes = orderNotes || '';
        const match = notes.match(/(\d{10,15})/);
        return match ? match[1] : null;
    }

    private async publishOrderStatusChanged(order: Order) {
        try {
            await this.amqpService.publishKDSEvent(
                {
                    type: 'order.status_changed',
                    timestamp: new Date().toISOString(),
                    tenant_id: order.tenantId,
                    data: {
                        id: order.id,
                        tenant_id: order.tenantId,
                        tab_id: order.tabId,
                        batch_id: order.batchId,
                        batch_display_code: this.resolveOrderMessageCode(order),
                        destination: order.destination,
                        status: order.status,
                        notes: order.notes,
                        created_at: order.createdAt,
                        accepted_at: order.acceptedAt,
                        ready_at: order.readyAt,
                        delivered_at: order.deliveredAt,
                        canceled_at: order.canceledAt,
                        cancel_reason: order.cancelReason,
                        items: (order.items || []).map((item) => ({
                            id: item.id,
                            order_id: item.orderId,
                            menu_item_id: item.menuItemId,
                            quantity: item.quantity,
                            unit_price: item.unitPrice,
                            observations: item.observations,
                            created_at: item.createdAt,
                        })),
                    },
                },
                'order.status_changed',
            );
        } catch (error) {
            this.logger.warn(`Failed to publish order.status_changed for ${order.id}: ${(error as Error).message}`);
        }
    }
}
