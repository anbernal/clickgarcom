import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';

@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemRepo: Repository<OrderItem>,
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

        // Today's orders
        const todayOrders = await this.orderRepo.find({
            where: {
                tenantId,
                createdAt: Between(today, tomorrow),
            },
            relations: ['items'],
        });

        // Calculate revenue
        const revenue = todayOrders.reduce((sum, order) => {
            const orderTotal = order.items.reduce(
                (s, item) => s + Number(item.unitPrice) * item.quantity,
                0,
            );
            return sum + orderTotal;
        }, 0);

        // Tables
        const tables = await this.tableRepo.find({ where: { tenantId } });
        const totalTables = tables.length;
        const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED').length;

        // Ticket médio
        const avgTicket =
            todayOrders.length > 0 ? revenue / todayOrders.length : 0;

        return {
            revenue: Math.round(revenue * 100) / 100,
            ordersCount: todayOrders.length,
            totalTables,
            occupiedTables,
            avgTicket: Math.round(avgTicket * 100) / 100,
        };
    }

    async getSalesReport(tenantId: string, startDate?: string, endDate?: string) {
        const qb = this.orderRepo
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.items', 'items')
            .where('o.tenant_id = :tenantId', { tenantId })
            .orderBy('o.created_at', 'DESC');

        if (startDate) {
            qb.andWhere('o.created_at >= :startDate', { startDate });
        }
        if (endDate) {
            qb.andWhere('o.created_at <= :endDate', { endDate });
        }

        return qb.getMany();
    }

    async getTopItems(tenantId: string, limit = 10) {
        const result = await this.orderItemRepo
            .createQueryBuilder('oi')
            .select('oi.menu_item_id', 'menuItemId')
            .addSelect('SUM(oi.quantity)', 'totalQuantity')
            .addSelect('SUM(oi.unit_price * oi.quantity)', 'totalRevenue')
            .innerJoin('orders', 'o', 'o.id = oi.order_id')
            .where('o.tenant_id = :tenantId', { tenantId })
            .groupBy('oi.menu_item_id')
            .orderBy('"totalQuantity"', 'DESC')
            .limit(limit)
            .getRawMany();

        return result;
    }

    async getWeeklySales(tenantId: string) {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            const orders = await this.orderRepo.find({
                where: {
                    tenantId,
                    createdAt: Between(date, nextDay),
                },
                relations: ['items'],
            });

            const revenue = orders.reduce((sum, order) => {
                const orderTotal = order.items.reduce(
                    (s, item) => s + Number(item.unitPrice) * item.quantity,
                    0,
                );
                return sum + orderTotal;
            }, 0);

            const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            days.push({
                day: dayNames[date.getDay()],
                date: date.toISOString().split('T')[0],
                revenue: Math.round(revenue * 100) / 100,
                orders: orders.length,
            });
        }

        return days;
    }
}
