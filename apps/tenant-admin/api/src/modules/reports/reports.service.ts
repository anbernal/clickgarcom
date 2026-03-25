import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';

@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemRepo: Repository<OrderItem>,
        @InjectRepository(MenuItem)
        private readonly menuItemRepo: Repository<MenuItem>,
        @InjectRepository(Table)
        private readonly tableRepo: Repository<Table>,
        @InjectRepository(Tab)
        private readonly tabRepo: Repository<Tab>,
    ) { }

    async getDashboardStats(tenantId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [orderStats, tableStats] = await Promise.all([
            this.orderRepo.query(
                `
                    WITH order_totals AS (
                        SELECT
                            o.id,
                            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
                        FROM orders o
                        LEFT JOIN order_items oi
                          ON oi.order_id = o.id
                        WHERE o.tenant_id = $1
                          AND o.created_at >= $2
                          AND o.created_at < $3
                          AND o.status <> 'CANCELED'
                        GROUP BY o.id
                    )
                    SELECT
                        COUNT(*)::int AS orders_count,
                        COALESCE(SUM(order_total), 0) AS revenue,
                        COALESCE(AVG(order_total), 0) AS avg_ticket
                    FROM order_totals
                `,
                [tenantId, today.toISOString(), tomorrow.toISOString()],
            ),
            this.tableRepo.query(
                `
                    SELECT
                        COUNT(*)::int AS total_tables,
                        COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int AS occupied_tables
                    FROM tables
                    WHERE tenant_id = $1
                `,
                [tenantId],
            ),
        ]);

        const ordersRow = orderStats?.[0] || {};
        const tablesRow = tableStats?.[0] || {};

        return {
            revenue: this.roundMoney(ordersRow.revenue),
            ordersCount: this.parseInteger(ordersRow.orders_count),
            totalTables: this.parseInteger(tablesRow.total_tables),
            occupiedTables: this.parseInteger(tablesRow.occupied_tables),
            avgTicket: this.roundMoney(ordersRow.avg_ticket),
        };
    }

    async getSalesReport(tenantId: string, startDate?: string, endDate?: string) {
        const range = this.resolveDateRange(startDate, endDate, 30);
        const qb = this.orderRepo
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.items', 'items')
            .where('o.tenant_id = :tenantId', { tenantId })
            .orderBy('o.created_at', 'DESC');

        qb.andWhere('o.created_at >= :startDate', { startDate: range.startDate.toISOString() });
        qb.andWhere('o.created_at < :endDate', { endDate: range.endDate.toISOString() });

        return qb.getMany();
    }

    async getManagementReport(tenantId: string, startDate?: string, endDate?: string) {
        const range = this.resolveDateRange(startDate, endDate, 30);
        const previousRange = this.buildPreviousRange(range);

        const [currentOverview, previousOverview, hourlyRows, dailyRows, categoryRows, itemRows, lowSalesRows, costCoverage] = await Promise.all([
            this.getOverviewMetrics(tenantId, range.startDate, range.endDate),
            this.getOverviewMetrics(tenantId, previousRange.startDate, previousRange.endDate),
            this.getHourlyPerformance(tenantId, range.startDate, range.endDate),
            this.getDailyPerformance(tenantId, range.startDate, range.endDate),
            this.getCategoryRanking(tenantId, range.startDate, range.endDate),
            this.getItemMargins(tenantId, range.startDate, range.endDate),
            this.getLowSalesItems(tenantId, range.startDate, range.endDate),
            this.getMenuCostCoverage(tenantId),
        ]);

        const overview = this.buildManagementOverview(currentOverview, previousOverview, hourlyRows, dailyRows, costCoverage);
        const hourlyPerformance = this.buildHourlySeries(range, hourlyRows);
        const dailyPerformance = this.buildDailySeries(range, dailyRows);

        return {
            period: {
                start_date: this.toDateString(range.startDate),
                end_date: this.toDateString(new Date(range.endDate.getTime() - 1)),
                days: range.days,
                label: this.buildPeriodLabel(range.startDate, range.endDate),
            },
            comparison_period: {
                start_date: this.toDateString(previousRange.startDate),
                end_date: this.toDateString(new Date(previousRange.endDate.getTime() - 1)),
                days: previousRange.days,
                label: this.buildPeriodLabel(previousRange.startDate, previousRange.endDate),
            },
            overview,
            hourly_performance: hourlyPerformance,
            daily_performance: dailyPerformance,
            category_ranking: categoryRows.map((row) => this.mapMarginRow(row)),
            item_margins: itemRows.map((row) => this.mapMarginRow(row)),
            low_sales_items: lowSalesRows
                .map((row) => this.mapLowSalesRow(row))
                .filter((row) => row.performanceBand !== 'NORMAL')
                .slice(0, 12),
            cost_coverage: {
                configured_items: costCoverage.configuredItems,
                total_items: costCoverage.totalItems,
                coverage_rate: costCoverage.coverageRate,
            },
        };
    }

    async getTopItems(tenantId: string, limit = 10) {
        const result = await this.orderItemRepo
            .createQueryBuilder('oi')
            .select('oi.menu_item_id', 'menuItemId')
            .addSelect('mi.name', 'itemName')
            .addSelect('SUM(oi.quantity)', 'totalQuantity')
            .addSelect('SUM(oi.unit_price * oi.quantity)', 'totalRevenue')
            .innerJoin('orders', 'o', 'o.id = oi.order_id')
            .leftJoin('menu_items', 'mi', 'mi.id = oi.menu_item_id')
            .where('o.tenant_id = :tenantId', { tenantId })
            .groupBy('oi.menu_item_id')
            .addGroupBy('mi.name')
            .orderBy('"totalQuantity"', 'DESC')
            .limit(limit)
            .getRawMany();

        return result;
    }

    async getWeeklySales(tenantId: string) {
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - 6);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        const rows = await this.orderRepo.query(
            `
                WITH order_totals AS (
                    SELECT
                        o.id,
                        DATE(o.created_at) AS report_date,
                        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
                    FROM orders o
                    LEFT JOIN order_items oi
                      ON oi.order_id = o.id
                    WHERE o.tenant_id = $1
                      AND o.created_at >= $2
                      AND o.created_at < $3
                      AND o.status <> 'CANCELED'
                    GROUP BY o.id, DATE(o.created_at)
                )
                SELECT
                    report_date::text AS report_date,
                    COUNT(*)::int AS orders_count,
                    COALESCE(SUM(order_total), 0) AS revenue
                FROM order_totals
                GROUP BY report_date
                ORDER BY report_date ASC
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );

        const rowMap = new Map<string, any>((rows || []).map((row: any) => [String(row.report_date), row]));
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const series = [];
        const cursor = new Date(startDate);

        while (cursor < endDate) {
            const key = this.toDateString(cursor);
            const row = rowMap.get(key);
            series.push({
                day: dayNames[cursor.getDay()],
                date: key,
                revenue: this.roundMoney(row?.revenue),
                orders: this.parseInteger(row?.orders_count),
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        return series;
    }

    private async getOverviewMetrics(tenantId: string, startDate: Date, endDate: Date) {
        const [row] = await this.orderRepo.query(
            `
                WITH order_totals AS (
                    SELECT
                        o.id,
                        o.status,
                        o.created_at,
                        o.accepted_at,
                        o.ready_at,
                        o.delivered_at,
                        o.canceled_at,
                        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
                    FROM orders o
                    LEFT JOIN order_items oi
                      ON oi.order_id = o.id
                    WHERE o.tenant_id = $1
                      AND o.created_at >= $2
                      AND o.created_at < $3
                    GROUP BY o.id, o.status, o.created_at, o.accepted_at, o.ready_at, o.delivered_at, o.canceled_at
                )
                SELECT
                    COUNT(*)::int AS orders_count,
                    COUNT(*) FILTER (WHERE status <> 'CANCELED')::int AS billed_orders_count,
                    COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled_orders_count,
                    COALESCE(SUM(CASE WHEN status <> 'CANCELED' THEN order_total ELSE 0 END), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN status = 'CANCELED' THEN order_total ELSE 0 END), 0) AS lost_revenue,
                    COALESCE(AVG(CASE WHEN accepted_at IS NOT NULL THEN EXTRACT(EPOCH FROM accepted_at - created_at) / 60 END), 0) AS avg_acceptance_minutes,
                    COALESCE(AVG(CASE WHEN accepted_at IS NOT NULL AND ready_at IS NOT NULL THEN EXTRACT(EPOCH FROM ready_at - accepted_at) / 60 END), 0) AS avg_preparation_minutes,
                    COALESCE(AVG(CASE WHEN ready_at IS NOT NULL AND delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM delivered_at - ready_at) / 60 END), 0) AS avg_delivery_minutes
                FROM order_totals
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );

        const ordersCount = this.parseInteger(row?.orders_count);
        const billedOrdersCount = this.parseInteger(row?.billed_orders_count);
        const canceledOrdersCount = this.parseInteger(row?.canceled_orders_count);
        const revenue = this.roundMoney(row?.revenue);
        const lostRevenue = this.roundMoney(row?.lost_revenue);
        const averageTicket = billedOrdersCount > 0 ? this.roundMoney(revenue / billedOrdersCount) : 0;
        const cancellationRate = ordersCount > 0 ? this.roundPercentage((canceledOrdersCount / ordersCount) * 100) : 0;

        return {
            ordersCount,
            billedOrdersCount,
            canceledOrdersCount,
            revenue,
            lostRevenue,
            averageTicket,
            cancellationRate,
            averageAcceptanceMinutes: this.roundNumber(row?.avg_acceptance_minutes),
            averagePreparationMinutes: this.roundNumber(row?.avg_preparation_minutes),
            averageDeliveryMinutes: this.roundNumber(row?.avg_delivery_minutes),
        };
    }

    private async getHourlyPerformance(tenantId: string, startDate: Date, endDate: Date) {
        return this.orderRepo.query(
            `
                WITH order_totals AS (
                    SELECT
                        o.id,
                        o.status,
                        o.created_at,
                        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
                    FROM orders o
                    LEFT JOIN order_items oi
                      ON oi.order_id = o.id
                    WHERE o.tenant_id = $1
                      AND o.created_at >= $2
                      AND o.created_at < $3
                    GROUP BY o.id, o.status, o.created_at
                )
                SELECT
                    EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
                    COUNT(*) FILTER (WHERE status <> 'CANCELED')::int AS orders_count,
                    COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled_orders,
                    COALESCE(SUM(CASE WHEN status <> 'CANCELED' THEN order_total ELSE 0 END), 0) AS revenue
                FROM order_totals
                GROUP BY EXTRACT(HOUR FROM created_at)
                ORDER BY EXTRACT(HOUR FROM created_at)
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );
    }

    private async getDailyPerformance(tenantId: string, startDate: Date, endDate: Date) {
        return this.orderRepo.query(
            `
                WITH order_totals AS (
                    SELECT
                        o.id,
                        o.status,
                        o.created_at,
                        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
                    FROM orders o
                    LEFT JOIN order_items oi
                      ON oi.order_id = o.id
                    WHERE o.tenant_id = $1
                      AND o.created_at >= $2
                      AND o.created_at < $3
                    GROUP BY o.id, o.status, o.created_at
                )
                SELECT
                    DATE(created_at)::text AS report_date,
                    COUNT(*) FILTER (WHERE status <> 'CANCELED')::int AS orders_count,
                    COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled_orders,
                    COALESCE(SUM(CASE WHEN status <> 'CANCELED' THEN order_total ELSE 0 END), 0) AS revenue
                FROM order_totals
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at)
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );
    }

    private async getCategoryRanking(tenantId: string, startDate: Date, endDate: Date) {
        return this.orderItemRepo.query(
            `
                SELECT
                    COALESCE(mc.id::text, 'UNCATEGORIZED') AS group_id,
                    COALESCE(mc.name, 'Sem categoria') AS group_name,
                    SUM(oi.quantity)::int AS quantity_sold,
                    COUNT(DISTINCT o.id)::int AS orders_count,
                    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN mi.cost_price IS NOT NULL THEN oi.quantity * oi.unit_price ELSE 0 END), 0) AS revenue_with_cost,
                    COALESCE(SUM(CASE WHEN mi.cost_price IS NOT NULL THEN oi.quantity * mi.cost_price ELSE 0 END), 0) AS estimated_cost,
                    COUNT(DISTINCT mi.id)::int AS entities_count,
                    COUNT(DISTINCT CASE WHEN mi.cost_price IS NOT NULL THEN mi.id END)::int AS configured_entities_count
                FROM orders o
                JOIN order_items oi
                  ON oi.order_id = o.id
                LEFT JOIN menu_items mi
                  ON mi.id = oi.menu_item_id
                LEFT JOIN menu_categories mc
                  ON mc.id = mi.category_id
                WHERE o.tenant_id = $1
                  AND o.created_at >= $2
                  AND o.created_at < $3
                  AND o.status <> 'CANCELED'
                GROUP BY COALESCE(mc.id::text, 'UNCATEGORIZED'), COALESCE(mc.name, 'Sem categoria')
                ORDER BY revenue DESC, quantity_sold DESC
                LIMIT 12
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );
    }

    private async getItemMargins(tenantId: string, startDate: Date, endDate: Date) {
        return this.orderItemRepo.query(
            `
                SELECT
                    mi.id::text AS group_id,
                    mi.name AS group_name,
                    COALESCE(mc.name, 'Sem categoria') AS group_context,
                    SUM(oi.quantity)::int AS quantity_sold,
                    COUNT(DISTINCT o.id)::int AS orders_count,
                    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN mi.cost_price IS NOT NULL THEN oi.quantity * oi.unit_price ELSE 0 END), 0) AS revenue_with_cost,
                    COALESCE(SUM(CASE WHEN mi.cost_price IS NOT NULL THEN oi.quantity * mi.cost_price ELSE 0 END), 0) AS estimated_cost,
                    COUNT(DISTINCT mi.id)::int AS entities_count,
                    COUNT(DISTINCT CASE WHEN mi.cost_price IS NOT NULL THEN mi.id END)::int AS configured_entities_count,
                    mi.cost_price,
                    MAX(o.created_at) AS last_sold_at
                FROM orders o
                JOIN order_items oi
                  ON oi.order_id = o.id
                LEFT JOIN menu_items mi
                  ON mi.id = oi.menu_item_id
                LEFT JOIN menu_categories mc
                  ON mc.id = mi.category_id
                WHERE o.tenant_id = $1
                  AND o.created_at >= $2
                  AND o.created_at < $3
                  AND o.status <> 'CANCELED'
                GROUP BY mi.id, mi.name, mc.name, mi.cost_price
                ORDER BY revenue DESC, quantity_sold DESC
                LIMIT 15
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );
    }

    private async getLowSalesItems(tenantId: string, startDate: Date, endDate: Date) {
        return this.menuItemRepo.query(
            `
                WITH sold AS (
                    SELECT
                        oi.menu_item_id,
                        SUM(oi.quantity)::int AS quantity_sold,
                        COUNT(DISTINCT o.id)::int AS orders_count,
                        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue,
                        MAX(o.created_at) AS last_sold_at
                    FROM orders o
                    JOIN order_items oi
                      ON oi.order_id = o.id
                    WHERE o.tenant_id = $1
                      AND o.created_at >= $2
                      AND o.created_at < $3
                      AND o.status <> 'CANCELED'
                    GROUP BY oi.menu_item_id
                ),
                totals AS (
                    SELECT COALESCE(SUM(quantity_sold), 0) AS total_quantity_sold
                    FROM sold
                )
                SELECT
                    mi.id::text AS menu_item_id,
                    mi.name,
                    COALESCE(mc.name, 'Sem categoria') AS category_name,
                    COALESCE(s.quantity_sold, 0)::int AS quantity_sold,
                    COALESCE(s.orders_count, 0)::int AS orders_count,
                    COALESCE(s.revenue, 0) AS revenue,
                    s.last_sold_at,
                    CASE
                        WHEN COALESCE(s.quantity_sold, 0) = 0 THEN 'NO_SALES'
                        WHEN COALESCE(s.quantity_sold, 0) <= GREATEST(2, FLOOR(t.total_quantity_sold * 0.03)) THEN 'LOW_SALES'
                        ELSE 'NORMAL'
                    END AS performance_band,
                    CASE
                        WHEN t.total_quantity_sold > 0 THEN COALESCE(s.quantity_sold, 0)::decimal / t.total_quantity_sold
                        ELSE 0
                    END AS sales_share
                FROM menu_items mi
                LEFT JOIN menu_categories mc
                  ON mc.id = mi.category_id
                LEFT JOIN sold s
                  ON s.menu_item_id = mi.id
                CROSS JOIN totals t
                WHERE mi.tenant_id = $1
                  AND mi.available = TRUE
                ORDER BY COALESCE(s.quantity_sold, 0) ASC, mi.name ASC
                LIMIT 20
            `,
            [tenantId, startDate.toISOString(), endDate.toISOString()],
        );
    }

    private async getMenuCostCoverage(tenantId: string) {
        const [row] = await this.menuItemRepo.query(
            `
                SELECT
                    COUNT(*)::int AS total_items,
                    COUNT(*) FILTER (WHERE cost_price IS NOT NULL)::int AS configured_items
                FROM menu_items
                WHERE tenant_id = $1
            `,
            [tenantId],
        );

        const totalItems = this.parseInteger(row?.total_items);
        const configuredItems = this.parseInteger(row?.configured_items);

        return {
            totalItems,
            configuredItems,
            coverageRate: totalItems > 0 ? this.roundPercentage((configuredItems / totalItems) * 100) : 0,
        };
    }

    private buildManagementOverview(currentOverview, previousOverview, hourlyRows, dailyRows, costCoverage) {
        const peakHour = [...hourlyRows]
            .map((row) => ({
                hour: this.parseInteger(row?.hour_of_day),
                revenue: this.roundMoney(row?.revenue),
                ordersCount: this.parseInteger(row?.orders_count),
            }))
            .sort((a, b) => {
                if (b.revenue !== a.revenue) return b.revenue - a.revenue;
                return b.ordersCount - a.ordersCount;
            })[0] || null;

        const peakDay = [...dailyRows]
            .map((row) => ({
                date: String(row?.report_date || ''),
                revenue: this.roundMoney(row?.revenue),
                ordersCount: this.parseInteger(row?.orders_count),
            }))
            .sort((a, b) => {
                if (b.revenue !== a.revenue) return b.revenue - a.revenue;
                return b.ordersCount - a.ordersCount;
            })[0] || null;

        return {
            revenue: currentOverview.revenue,
            average_ticket: currentOverview.averageTicket,
            billed_orders_count: currentOverview.billedOrdersCount,
            canceled_orders_count: currentOverview.canceledOrdersCount,
            cancellation_rate: currentOverview.cancellationRate,
            lost_revenue: currentOverview.lostRevenue,
            average_acceptance_minutes: currentOverview.averageAcceptanceMinutes,
            average_preparation_minutes: currentOverview.averagePreparationMinutes,
            average_delivery_minutes: currentOverview.averageDeliveryMinutes,
            peak_hour: peakHour
                ? {
                    hour_of_day: peakHour.hour,
                    label: `${String(peakHour.hour).padStart(2, '0')}h`,
                    revenue: peakHour.revenue,
                    orders_count: peakHour.ordersCount,
                }
                : null,
            peak_day: peakDay
                ? {
                    date: peakDay.date,
                    label: this.formatDateLabel(peakDay.date),
                    revenue: peakDay.revenue,
                    orders_count: peakDay.ordersCount,
                }
                : null,
            comparisons: {
                revenue: this.buildComparison(currentOverview.revenue, previousOverview.revenue),
                average_ticket: this.buildComparison(currentOverview.averageTicket, previousOverview.averageTicket),
                billed_orders_count: this.buildComparison(currentOverview.billedOrdersCount, previousOverview.billedOrdersCount),
                cancellation_rate: this.buildComparison(currentOverview.cancellationRate, previousOverview.cancellationRate),
                lost_revenue: this.buildComparison(currentOverview.lostRevenue, previousOverview.lostRevenue),
            },
            cost_coverage: {
                configured_items: costCoverage.configuredItems,
                total_items: costCoverage.totalItems,
                coverage_rate: costCoverage.coverageRate,
            },
        };
    }

    private buildHourlySeries(range: { startDate: Date; endDate: Date; days: number }, rows: any[]) {
        const rowMap = new Map(rows.map((row) => [this.parseInteger(row?.hour_of_day), row]));
        return Array.from({ length: 24 }, (_, hour) => {
            const row = rowMap.get(hour);
            const revenue = this.roundMoney(row?.revenue);
            const ordersCount = this.parseInteger(row?.orders_count);
            return {
                hour_of_day: hour,
                label: `${String(hour).padStart(2, '0')}h`,
                orders_count: ordersCount,
                canceled_orders: this.parseInteger(row?.canceled_orders),
                revenue,
                average_ticket: ordersCount > 0 ? this.roundMoney(revenue / ordersCount) : 0,
            };
        }).filter((entry) => {
            if (range.days > 2) {
                return entry.orders_count > 0 || entry.canceled_orders > 0;
            }
            return true;
        });
    }

    private buildDailySeries(range: { startDate: Date; endDate: Date }, rows: any[]) {
        const rowMap = new Map(rows.map((row) => [String(row?.report_date || ''), row]));
        const series = [];
        const cursor = new Date(range.startDate);

        while (cursor < range.endDate) {
            const key = this.toDateString(cursor);
            const row = rowMap.get(key);
            series.push({
                date: key,
                label: this.formatDateLabel(key),
                weekday_label: this.formatWeekdayLabel(key),
                orders_count: this.parseInteger(row?.orders_count),
                canceled_orders: this.parseInteger(row?.canceled_orders),
                revenue: this.roundMoney(row?.revenue),
            });

            cursor.setDate(cursor.getDate() + 1);
        }

        return series;
    }

    private mapMarginRow(row: any) {
        const revenue = this.roundMoney(row?.revenue);
        const revenueWithCost = this.roundMoney(row?.revenue_with_cost);
        const estimatedCost = this.roundMoney(row?.estimated_cost);
        const estimatedMargin = this.roundMoney(revenueWithCost - estimatedCost);
        const coverageRate = revenue > 0 ? this.roundPercentage((revenueWithCost / revenue) * 100) : 0;

        return {
            id: String(row?.group_id || ''),
            name: String(row?.group_name || 'Sem nome'),
            context: row?.group_context ? String(row.group_context) : null,
            quantity_sold: this.parseInteger(row?.quantity_sold),
            orders_count: this.parseInteger(row?.orders_count),
            revenue,
            revenue_with_cost: revenueWithCost,
            estimated_cost: estimatedCost,
            estimated_margin: estimatedMargin,
            margin_rate: revenueWithCost > 0 ? this.roundPercentage((estimatedMargin / revenueWithCost) * 100) : 0,
            coverage_rate: coverageRate,
            configured_entities_count: this.parseInteger(row?.configured_entities_count),
            entities_count: this.parseInteger(row?.entities_count),
            cost_price: row?.cost_price === null || row?.cost_price === undefined ? null : this.roundMoney(row.cost_price),
            last_sold_at: row?.last_sold_at ? new Date(row.last_sold_at).toISOString() : null,
        };
    }

    private mapLowSalesRow(row: any) {
        return {
            menu_item_id: String(row?.menu_item_id || ''),
            name: String(row?.name || 'Sem nome'),
            category_name: String(row?.category_name || 'Sem categoria'),
            quantity_sold: this.parseInteger(row?.quantity_sold),
            orders_count: this.parseInteger(row?.orders_count),
            revenue: this.roundMoney(row?.revenue),
            last_sold_at: row?.last_sold_at ? new Date(row.last_sold_at).toISOString() : null,
            performance_band: String(row?.performance_band || 'NORMAL'),
            performanceBand: String(row?.performance_band || 'NORMAL'),
            sales_share: this.roundPercentage(this.parseNumber(row?.sales_share) * 100),
        };
    }

    private buildComparison(currentValue: number, previousValue: number) {
        const delta = this.roundNumber(currentValue - previousValue);

        if (previousValue === 0) {
            return {
                current: currentValue,
                previous: previousValue,
                delta,
                change_percent: currentValue === 0 ? 0 : 100,
                trend: currentValue === 0 ? 'stable' : 'up',
            };
        }

        const changePercent = this.roundPercentage((delta / previousValue) * 100);

        return {
            current: currentValue,
            previous: previousValue,
            delta,
            change_percent: changePercent,
            trend: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'stable',
        };
    }

    private resolveDateRange(startDate?: string, endDate?: string, defaultDays = 30) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let parsedStart = this.parseDateOnly(startDate);
        let parsedEnd = this.parseDateOnly(endDate);

        if (parsedEnd) {
            parsedEnd.setDate(parsedEnd.getDate() + 1);
        }

        if (!parsedStart && !parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - defaultDays);
        } else if (parsedStart && !parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
        } else if (!parsedStart && parsedEnd) {
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - defaultDays);
        }

        if (!parsedStart || !parsedEnd) {
            parsedEnd = new Date(today);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
            parsedStart = new Date(parsedEnd);
            parsedStart.setDate(parsedStart.getDate() - defaultDays);
        }

        if (parsedStart >= parsedEnd) {
            parsedEnd = new Date(parsedStart);
            parsedEnd.setDate(parsedEnd.getDate() + 1);
        }

        return {
            startDate: parsedStart,
            endDate: parsedEnd,
            days: Math.max(1, Math.round((parsedEnd.getTime() - parsedStart.getTime()) / 86400000)),
        };
    }

    private buildPreviousRange(range: { startDate: Date; endDate: Date; days: number }) {
        const previousEndDate = new Date(range.startDate);
        const previousStartDate = new Date(previousEndDate);
        previousStartDate.setDate(previousStartDate.getDate() - range.days);

        return {
            startDate: previousStartDate,
            endDate: previousEndDate,
            days: range.days,
        };
    }

    private parseDateOnly(value?: string) {
        if (!value) {
            return null;
        }

        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }

        const [, year, month, day] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        date.setHours(0, 0, 0, 0);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        if (value === `${year}-${month}-${day}`) {
            return date;
        }

        return null;
    }

    private toDateString(date: Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private buildPeriodLabel(startDate: Date, endDate: Date) {
        const endInclusive = new Date(endDate.getTime() - 1);
        return `${this.formatDateLabel(this.toDateString(startDate))} a ${this.formatDateLabel(this.toDateString(endInclusive))}`;
    }

    private formatDateLabel(dateString: string) {
        const date = new Date(`${dateString}T00:00:00`);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
        });
    }

    private formatWeekdayLabel(dateString: string) {
        const date = new Date(`${dateString}T00:00:00`);
        return date.toLocaleDateString('pt-BR', {
            weekday: 'short',
        }).replace('.', '');
    }

    private roundMoney(value: unknown) {
        const parsed = this.parseNumber(value);
        return Math.round(parsed * 100) / 100;
    }

    private roundPercentage(value: unknown) {
        const parsed = this.parseNumber(value);
        return Math.round(parsed * 10) / 10;
    }

    private roundNumber(value: unknown) {
        const parsed = this.parseNumber(value);
        return Math.round(parsed * 10) / 10;
    }

    private parseNumber(value: unknown) {
        const parsed = Number.parseFloat(String(value ?? '0'));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private parseInteger(value: unknown) {
        const parsed = Number.parseInt(String(value ?? '0'), 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }
}
