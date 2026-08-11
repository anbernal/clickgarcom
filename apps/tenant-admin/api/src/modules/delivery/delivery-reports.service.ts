import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Delivery } from '../../entities/delivery.entity';
import { DeliveryEvent } from '../../entities/delivery-event.entity';
import { DeliveryFulfillment } from '../../entities/delivery-fulfillment.entity';
import { DeliveryReportQueryDto } from './dto/delivery-commands.dto';

@Injectable()
export class DeliveryReportsService {
    constructor(
        @InjectRepository(Delivery) private readonly deliveryRepository: Repository<Delivery>,
        @InjectRepository(DeliveryEvent) private readonly eventRepository: Repository<DeliveryEvent>,
        @InjectRepository(DeliveryFulfillment) private readonly fulfillmentRepository: Repository<DeliveryFulfillment>,
    ) { }

    async summary(tenantId: string, query: DeliveryReportQueryDto) {
        const range = this.normalizeRange(query);
        const base = this.deliveryRepository.createQueryBuilder('delivery')
            .where('delivery.tenant_id = :tenantId', { tenantId })
            .andWhere('delivery.created_at >= :from AND delivery.created_at < :to', { from: range.from, to: range.to });
        if (query.driver_id) base.andWhere('delivery.assigned_driver_id = :driverId', { driverId: query.driver_id });
        if (query.status) {
            const statuses = query.status.split(',').map((value) => value.trim()).filter(Boolean);
            base.andWhere('delivery.status IN (:...reportStatuses)', { reportStatuses: statuses });
        }
        if (query.mode) {
            base.andWhere(`EXISTS (
                SELECT 1 FROM delivery_fulfillments report_mode_fulfillment
                WHERE report_mode_fulfillment.delivery_id = delivery.id
                  AND report_mode_fulfillment.tenant_id = delivery.tenant_id
                  AND report_mode_fulfillment.is_current = TRUE
                  AND report_mode_fulfillment.mode = :reportMode
            )`, { reportMode: query.mode });
        }
        if (query.provider) {
            base.andWhere(`EXISTS (
                SELECT 1 FROM delivery_fulfillments report_provider_fulfillment
                WHERE report_provider_fulfillment.delivery_id = delivery.id
                  AND report_provider_fulfillment.tenant_id = delivery.tenant_id
                  AND report_provider_fulfillment.is_current = TRUE
                  AND report_provider_fulfillment.provider = :reportProvider
            )`, { reportProvider: query.provider });
        }

        const kpi = await base.clone()
            .select('COUNT(*)', 'total')
            .addSelect("COUNT(*) FILTER (WHERE delivery.status = 'DELIVERED')", 'delivered')
            .addSelect("COUNT(*) FILTER (WHERE delivery.status IN ('DELIVERY_FAILED', 'RETURNING', 'RETURNED'))", 'failed_or_returned')
            .addSelect("COUNT(*) FILTER (WHERE delivery.status = 'CANCELED')", 'canceled')
            .addSelect("AVG(EXTRACT(EPOCH FROM (delivery.accepted_at - delivery.created_at))) FILTER (WHERE delivery.accepted_at IS NOT NULL)", 'avg_acceptance_seconds')
            .addSelect("AVG(EXTRACT(EPOCH FROM (delivery.delivered_at - delivery.created_at))) FILTER (WHERE delivery.delivered_at IS NOT NULL)", 'avg_total_seconds')
            .addSelect("COUNT(*) FILTER (WHERE delivery.eta_updated_at IS NULL AND delivery.status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'))", 'without_eta')
            .getRawOne<Record<string, string | null>>();

        const byStatus = await base.clone()
            .select('delivery.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('delivery.status')
            .orderBy('count', 'DESC')
            .getRawMany<{ status: string; count: string }>();

        const byDriver = await base.clone()
            .select('delivery.assigned_driver_id', 'driver_id')
            .addSelect('COUNT(*)', 'count')
            .addSelect("COUNT(*) FILTER (WHERE delivery.status = 'DELIVERED')", 'delivered')
            .andWhere('delivery.assigned_driver_id IS NOT NULL')
            .groupBy('delivery.assigned_driver_id')
            .orderBy('count', 'DESC')
            .getRawMany<{ driver_id: string; count: string; delivered: string }>();

        const financial = await base.clone()
            .leftJoin(DeliveryFulfillment, 'fulfillment', 'fulfillment.delivery_id = delivery.id AND fulfillment.tenant_id = delivery.tenant_id AND fulfillment.is_current = TRUE')
            .select('COALESCE(SUM(COALESCE(delivery.customer_delivery_fee, delivery.delivery_fee, 0)), 0)', 'customer_delivery_fee')
            .addSelect('COALESCE(SUM(COALESCE(fulfillment.quoted_cost, delivery.provider_quoted_cost, 0)), 0)', 'quoted_cost')
            .addSelect('COALESCE(SUM(COALESCE(fulfillment.actual_cost, delivery.provider_actual_cost, 0)), 0)', 'actual_cost')
            .addSelect('COALESCE(SUM(COALESCE(delivery.restaurant_adjustment, 0)), 0)', 'restaurant_adjustment')
            .getRawOne<Record<string, string>>();

        const overrideCount = await this.eventRepository.createQueryBuilder('event')
            .where('event.tenant_id = :tenantId', { tenantId })
            .andWhere('event.created_at >= :from AND event.created_at < :to', { from: range.from, to: range.to })
            .andWhere("event.metadata ->> 'override' = 'true'")
            .getCount();

        return {
            tenant_id: tenantId,
            period: { from: range.from.toISOString(), to: range.to.toISOString() },
            kpis: {
                total: Number(kpi?.total || 0),
                delivered: Number(kpi?.delivered || 0),
                failed_or_returned: Number(kpi?.failed_or_returned || 0),
                canceled: Number(kpi?.canceled || 0),
                override: overrideCount,
                without_eta: Number(kpi?.without_eta || 0),
                avg_acceptance_seconds: this.roundOrNull(kpi?.avg_acceptance_seconds),
                avg_total_seconds: this.roundOrNull(kpi?.avg_total_seconds),
            },
            financial: {
                currency: 'BRL',
                customer_delivery_fee: this.money(financial?.customer_delivery_fee),
                quoted_cost: this.money(financial?.quoted_cost),
                actual_cost: this.money(financial?.actual_cost),
                restaurant_adjustment: this.money(financial?.restaurant_adjustment),
                provider_variance: this.money((Number(financial?.actual_cost || 0) - Number(financial?.quoted_cost || 0)).toFixed(2)),
            },
            by_status: byStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
            by_driver: byDriver.map((row) => ({ driver_id: row.driver_id, count: Number(row.count), delivered: Number(row.delivered) })),
        };
    }

    async summaryCsv(tenantId: string, query: DeliveryReportQueryDto) {
        const report = await this.summary(tenantId, query);
        const rows: string[][] = [
            ['metric', 'value'],
            ...Object.entries(report.kpis).map(([key, value]) => [key, String(value ?? '')]),
            ...Object.entries(report.financial).map(([key, value]) => [key, String(value ?? '')]),
            ...report.by_status.map((row) => [`status.${row.status}`, String(row.count)]),
        ];
        return rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n') + '\n';
    }

    private normalizeRange(query: DeliveryReportQueryDto) {
        const now = new Date();
        const to = query.date_to ? new Date(query.date_to) : now;
        const from = query.date_from ? new Date(query.date_from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
            throw new BadRequestException('Período de relatório inválido.');
        }
        if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
            throw new BadRequestException('O período máximo do relatório é de 90 dias.');
        }
        return { from, to };
    }

    private roundOrNull(value: string | null | undefined) {
        if (value === null || value === undefined) return null;
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number) : null;
    }

    private money(value: string | null | undefined) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
    }

    private csvCell(value: string) {
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }
}
