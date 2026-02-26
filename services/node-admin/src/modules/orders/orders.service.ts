import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';

const VALID_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['ACCEPTED', 'CANCELED'],
    ACCEPTED: ['READY', 'CANCELED'],
    READY: ['DELIVERED'],
    DELIVERED: [],
    CANCELED: [],
};

@Injectable()
export class OrdersService {
    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        private readonly dataSource: DataSource,
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

        if (newStatus === 'ACCEPTED') {
            await this.enqueueAcceptedMessage(saved, tenantId, prepMinutes);
        }
        if (newStatus === 'CANCELED') {
            await this.recalculateTabTotals(saved.tabId, tenantId);
            await this.enqueueCanceledMessage(saved, tenantId);
        }

        return saved;
    }

    private async enqueueAcceptedMessage(order: Order, tenantId: string, prepMinutes?: number) {
        const eta = this.normalizePrepMinutes(prepMinutes);
        const rows = await this.dataSource.query(
            'SELECT user_phone FROM tabs WHERE id = $1 AND tenant_id = $2 LIMIT 1',
            [order.tabId, tenantId],
        );

        const recipient = this.resolveRecipient(rows?.[0]?.user_phone, order.notes || '');
        if (!recipient) return;
        const itemsSummary = await this.buildAcceptedItemsSummary(order, tenantId);

        const message =
            `✅ *Pedido aceito!*\n\n` +
            `${itemsSummary}` +
            `Seu pedido foi aceito e será entregue em *${eta} minutos*.\n\n` +
            `Assim que estiver pronto, avisaremos por aqui.`;

        await this.dataSource.query(
            `INSERT INTO outbox_messages
                (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
             VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
            [tenantId, recipient, message],
        );
    }

    private async enqueueCanceledMessage(order: Order, tenantId: string) {
        const rows = await this.dataSource.query(
            'SELECT user_phone FROM tabs WHERE id = $1 AND tenant_id = $2 LIMIT 1',
            [order.tabId, tenantId],
        );

        const recipient = this.resolveRecipient(rows?.[0]?.user_phone, order.notes || '');
        if (!recipient) return;

        const itemsSummary = await this.buildAcceptedItemsSummary(order, tenantId);
        const reason = (order.cancelReason || '').trim() || 'Sem motivo informado.';
        const message =
            `⚠️ *Pedido indisponível no momento*\n\n` +
            `${itemsSummary}` +
            `Motivo: *${reason}*\n\n` +
            `Esse item não será cobrado na sua comanda.\n` +
            `Você pode fazer um novo pedido pelo menu principal.`;

        await this.dataSource.query(
            `INSERT INTO outbox_messages
                (tenant_id, destination, recipient, payload, sent, attempts, max_attempts, created_at)
             VALUES ($1, 'whatsapp', $2, $3, false, 0, 3, NOW())`,
            [tenantId, recipient, message],
        );
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

    private normalizePrepMinutes(prepMinutes?: number): number {
        const allowed = new Set([5, 10, 15, 20, 25, 30, 40, 45]);
        if (prepMinutes && allowed.has(prepMinutes)) return prepMinutes;
        return 10;
    }

    private resolveRecipient(tabPhone?: string, orderNotes?: string): string | null {
        const fromTab = (tabPhone || '').trim();
        if (fromTab) return fromTab;

        const notes = orderNotes || '';
        const match = notes.match(/(\d{10,15})/);
        return match ? match[1] : null;
    }
}
