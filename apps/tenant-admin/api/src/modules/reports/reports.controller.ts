import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_REPORT_ROLES } from '../auth/roles';

@Controller('admin/api/reports')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_REPORT_ROLES)
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('stats')
    dashboardStats(@Request() req) {
        return this.reportsService.getDashboardStats(req.user.tenantId);
    }

    @Get('sales')
    salesReport(
        @Request() req,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ) {
        return this.reportsService.getSalesReport(req.user.tenantId, startDate, endDate);
    }

    @Get('management')
    managementReport(
        @Request() req,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ) {
        return this.reportsService.getManagementReport(req.user.tenantId, startDate, endDate);
    }

    @Get('top-items')
    topItems(
        @Request() req,
        @Query('limit') limit?: number,
    ) {
        return this.reportsService.getTopItems(req.user.tenantId, limit || 10);
    }

    @Get('weekly')
    weeklySales(@Request() req) {
        return this.reportsService.getWeeklySales(req.user.tenantId);
    }
}
