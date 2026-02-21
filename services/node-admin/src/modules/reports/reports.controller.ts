import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('admin/api/reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('stats')
    dashboardStats(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.reportsService.getDashboardStats(tid);
    }

    @Get('sales')
    salesReport(
        @Query('tenant_id') tenantId?: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.reportsService.getSalesReport(tid, startDate, endDate);
    }

    @Get('top-items')
    topItems(
        @Query('tenant_id') tenantId?: string,
        @Query('limit') limit?: number,
    ) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.reportsService.getTopItems(tid, limit || 10);
    }

    @Get('weekly')
    weeklySales(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.reportsService.getWeeklySales(tid);
    }
}
