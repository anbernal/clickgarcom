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

const ORDER_SLA_MINUTES = {
    PENDING: { warning: 3, critical: 5, label: 'Aceite' },
    ACCEPTED: { warning: 12, critical: 20, label: 'Preparo' },
    READY: { warning: 4, critical: 8, label: 'Entrega' },
} as const;

const ORDER_DESTINATION_LABELS: Record<string, string> = {
    KITCHEN: 'Cozinha',
    BAR: 'Bar',
};

type BatchSyncResult = {
    batch: OrderBatch;
    orders: Order[];
    previousStatus: string;
    currentStatus: string;
    acceptedMilestoneReached: boolean;
    readyMilestoneReached: boolean;
};

type OrderOperationalStage = keyof typeof ORDER_SLA_MINUTES;

type StationOperationsSummary = {
    destination: string;
    label: string;
    activeCount: number;
    pendingCount: number;
    acceptedCount: number;
    readyCount: number;
    delayedCount: number;
    warningCount: number;
    avgActivePendingMinutes: number;
    avgActivePreparationMinutes: number;
    avgActiveReadyMinutes: number;
    avgAcceptanceMinutes: number;
    avgPreparationMinutes: number;
    avgDeliveryWaitMinutes: number;
    bottleneckStage: string;
    bottleneckLabel: string;
    bottleneckDelayedCount: number;
    bottleneckQueueCount: number;
    cancellationsLast7Days: number;
    cancellationTopReason: string | null;
    cancellationCategoryBreakdown: {
        stock: number;
        operational: number;
        customer: number;
        other: number;
    };
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

    async getOperationsSummary(tenantId: string) {
        const [activeOrders, recentRows] = await Promise.all([
            this.orderRepo.find({
                where: {
                    tenantId,
                    status: In(['PENDING', 'ACCEPTED', 'READY']),
                },
                order: { createdAt: 'ASC' },
            }),
            this.dataSource.query(
                `SELECT
                    destination,
                    status,
                    created_at,
                    accepted_at,
                    ready_at,
                    delivered_at,
                    canceled_at,
                    cancel_reason
                 FROM orders
                 WHERE tenant_id = $1
                   AND created_at >= NOW() - INTERVAL '7 days'`,
                [tenantId],
            ),
        ]);

        const stations = ['KITCHEN', 'BAR'].map((destination) =>
            this.buildStationOperationsSummary(destination, activeOrders, recentRows || []),
        );

        return {
            generatedAt: new Date().toISOString(),
            sla: this.buildOrderSlaPayload(),
            overall: this.buildOverallOperationsSummary(stations),
            stations,
        };
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

    private buildOrderSlaPayload() {
        return {
            pending: {
                warningMinutes: ORDER_SLA_MINUTES.PENDING.warning,
                criticalMinutes: ORDER_SLA_MINUTES.PENDING.critical,
                label: ORDER_SLA_MINUTES.PENDING.label,
            },
            accepted: {
                warningMinutes: ORDER_SLA_MINUTES.ACCEPTED.warning,
                criticalMinutes: ORDER_SLA_MINUTES.ACCEPTED.critical,
                label: ORDER_SLA_MINUTES.ACCEPTED.label,
            },
            ready: {
                warningMinutes: ORDER_SLA_MINUTES.READY.warning,
                criticalMinutes: ORDER_SLA_MINUTES.READY.critical,
                label: ORDER_SLA_MINUTES.READY.label,
            },
        };
    }

    private buildOverallOperationsSummary(stations: StationOperationsSummary[]) {
        return {
            activeCount: stations.reduce((sum, station) => sum + station.activeCount, 0),
            pendingCount: stations.reduce((sum, station) => sum + station.pendingCount, 0),
            acceptedCount: stations.reduce((sum, station) => sum + station.acceptedCount, 0),
            readyCount: stations.reduce((sum, station) => sum + station.readyCount, 0),
            delayedCount: stations.reduce((sum, station) => sum + station.delayedCount, 0),
            warningCount: stations.reduce((sum, station) => sum + station.warningCount, 0),
            cancellationsLast7Days: stations.reduce((sum, station) => sum + station.cancellationsLast7Days, 0),
        };
    }

    private buildStationOperationsSummary(
        destination: string,
        activeOrders: Order[],
        recentRows: any[],
    ): StationOperationsSummary {
        const now = new Date();
        const stationLabel = ORDER_DESTINATION_LABELS[destination] || destination;
        const stationActiveOrders = activeOrders.filter((order) => order.destination === destination);
        const stationRecentRows = (recentRows || []).filter((row) => String(row?.destination || '') === destination);
        const pendingOrders = stationActiveOrders.filter((order) => order.status === 'PENDING');
        const acceptedOrders = stationActiveOrders.filter((order) => order.status === 'ACCEPTED');
        const readyOrders = stationActiveOrders.filter((order) => order.status === 'READY');
        const pendingMetrics = this.buildActiveStageMetrics('PENDING', pendingOrders, now);
        const acceptedMetrics = this.buildActiveStageMetrics('ACCEPTED', acceptedOrders, now);
        const readyMetrics = this.buildActiveStageMetrics('READY', readyOrders, now);
        const cancellationSummary = this.buildCancellationSummary(stationRecentRows);
        const bottleneck = this.resolveStationBottleneck(
            pendingOrders.length,
            acceptedOrders.length,
            readyOrders.length,
            pendingMetrics.delayedCount,
            acceptedMetrics.delayedCount,
            readyMetrics.delayedCount,
        );

        return {
            destination,
            label: stationLabel,
            activeCount: stationActiveOrders.length,
            pendingCount: pendingOrders.length,
            acceptedCount: acceptedOrders.length,
            readyCount: readyOrders.length,
            delayedCount: pendingMetrics.delayedCount + acceptedMetrics.delayedCount + readyMetrics.delayedCount,
            warningCount: pendingMetrics.warningCount + acceptedMetrics.warningCount + readyMetrics.warningCount,
            avgActivePendingMinutes: pendingMetrics.averageMinutes,
            avgActivePreparationMinutes: acceptedMetrics.averageMinutes,
            avgActiveReadyMinutes: readyMetrics.averageMinutes,
            avgAcceptanceMinutes: this.buildHistoricalAverageMinutes(
                stationRecentRows,
                (row) => row.created_at,
                (row) => row.accepted_at,
            ),
            avgPreparationMinutes: this.buildHistoricalAverageMinutes(
                stationRecentRows,
                (row) => row.accepted_at,
                (row) => row.ready_at,
            ),
            avgDeliveryWaitMinutes: this.buildHistoricalAverageMinutes(
                stationRecentRows,
                (row) => row.ready_at,
                (row) => row.delivered_at,
            ),
            bottleneckStage: bottleneck.stage,
            bottleneckLabel: bottleneck.label,
            bottleneckDelayedCount: bottleneck.delayedCount,
            bottleneckQueueCount: bottleneck.queueCount,
            cancellationsLast7Days: cancellationSummary.total,
            cancellationTopReason: cancellationSummary.topReason,
            cancellationCategoryBreakdown: cancellationSummary.categories,
        };
    }

    private buildActiveStageMetrics(
        stage: OrderOperationalStage,
        orders: Order[],
        now: Date,
    ) {
        const thresholds = ORDER_SLA_MINUTES[stage];
        const elapsedMinutes = orders
            .map((order) => this.resolveStageElapsedMinutes(stage, order, now))
            .filter((value): value is number => value !== null);

        const delayedCount = elapsedMinutes.filter((value) => value >= thresholds.critical).length;
        const warningCount = elapsedMinutes.filter(
            (value) => value >= thresholds.warning && value < thresholds.critical,
        ).length;

        return {
            delayedCount,
            warningCount,
            averageMinutes: this.roundMinutes(this.calculateAverage(elapsedMinutes)),
        };
    }

    private buildHistoricalAverageMinutes(
        rows: any[],
        startResolver: (row: any) => unknown,
        endResolver: (row: any) => unknown,
    ) {
        const samples = (rows || [])
            .map((row) => this.diffMinutes(startResolver(row), endResolver(row)))
            .filter((value): value is number => value !== null);

        return this.roundMinutes(this.calculateAverage(samples));
    }

    private buildCancellationSummary(rows: any[]) {
        const canceledRows = (rows || []).filter(
            (row) => String(row?.status || '').toUpperCase() === 'CANCELED' || row?.canceled_at,
        );
        const reasonCounts = new Map<string, number>();
        const categories = {
            stock: 0,
            operational: 0,
            customer: 0,
            other: 0,
        };

        canceledRows.forEach((row) => {
            const reason = String(row?.cancel_reason || '').trim();
            if (reason) {
                reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
            }
            const category = this.classifyCancelReason(reason);
            categories[category] += 1;
        });

        const topReason = [...reasonCounts.entries()]
            .sort((left, right) => right[1] - left[1])[0]?.[0] || null;

        return {
            total: canceledRows.length,
            topReason,
            categories,
        };
    }

    private resolveStationBottleneck(
        pendingQueue: number,
        acceptedQueue: number,
        readyQueue: number,
        pendingDelayed: number,
        acceptedDelayed: number,
        readyDelayed: number,
    ) {
        const candidates = [
            {
                stage: 'PENDING',
                label: ORDER_SLA_MINUTES.PENDING.label,
                delayedCount: pendingDelayed,
                queueCount: pendingQueue,
            },
            {
                stage: 'ACCEPTED',
                label: ORDER_SLA_MINUTES.ACCEPTED.label,
                delayedCount: acceptedDelayed,
                queueCount: acceptedQueue,
            },
            {
                stage: 'READY',
                label: ORDER_SLA_MINUTES.READY.label,
                delayedCount: readyDelayed,
                queueCount: readyQueue,
            },
        ].sort((left, right) => {
            if (right.delayedCount !== left.delayedCount) {
                return right.delayedCount - left.delayedCount;
            }
            return right.queueCount - left.queueCount;
        });

        const top = candidates[0];
        if (!top || (top.delayedCount <= 0 && top.queueCount <= 0)) {
            return {
                stage: 'FLOW_OK',
                label: 'Fluxo sob controle',
                delayedCount: 0,
                queueCount: 0,
            };
        }

        return top;
    }

    private resolveStageElapsedMinutes(stage: OrderOperationalStage, order: Order, now: Date) {
        const startAt =
            stage === 'PENDING'
                ? order.createdAt
                : stage === 'ACCEPTED'
                    ? (order.acceptedAt || order.createdAt)
                    : (order.readyAt || order.createdAt);

        return this.diffMinutes(startAt, now);
    }

    private diffMinutes(startValue: unknown, endValue: unknown) {
        const start = this.parseDate(startValue);
        const end = this.parseDate(endValue);
        if (!start || !end) return null;
        if (end.getTime() <= start.getTime()) return 0;
        return (end.getTime() - start.getTime()) / 60000;
    }

    private parseDate(value: unknown) {
        if (!value) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
        const parsed = new Date(String(value));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    private calculateAverage(values: number[]) {
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    private roundMinutes(value: number) {
        return Math.round(value * 10) / 10;
    }

    private classifyCancelReason(reason: string): 'stock' | 'operational' | 'customer' | 'other' {
        const normalized = String(reason || '').trim().toLowerCase();
        if (!normalized) return 'other';

        if (
            normalized.includes('ingrediente')
            || normalized.includes('estoque')
            || normalized.includes('falta')
            || normalized.includes('indispon')
            || normalized.includes('fora do card')
        ) {
            return 'stock';
        }

        if (
            normalized.includes('cliente')
            || normalized.includes('desist')
            || normalized.includes('duplic')
            || normalized.includes('engano')
            || normalized.includes('pagamento')
        ) {
            return 'customer';
        }

        if (
            normalized.includes('equipamento')
            || normalized.includes('cozinha')
            || normalized.includes('bar')
            || normalized.includes('sobrecarga')
            || normalized.includes('operac')
            || normalized.includes('equipe')
        ) {
            return 'operational';
        }

        return 'other';
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
