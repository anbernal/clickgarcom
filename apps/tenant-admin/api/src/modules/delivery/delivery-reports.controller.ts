import { Controller, Get, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_REPORT_ROLES } from '../auth/roles';
import { DeliveryReportQueryDto } from './dto/delivery-commands.dto';
import { DeliveryReportsService } from './delivery-reports.service';

@Controller('admin/api/deliveries/reports')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_REPORT_ROLES)
export class DeliveryReportsController {
    constructor(private readonly reportsService: DeliveryReportsService) { }

    @Get('summary')
    summary(@Request() request: any, @Query() query: DeliveryReportQueryDto) {
        return this.reportsService.summary(request.user.tenantId, query);
    }

    @Get('summary.csv')
    async summaryCsv(@Request() request: any, @Query() query: DeliveryReportQueryDto, @Res() response: Response) {
        const csv = await this.reportsService.summaryCsv(request.user.tenantId, query);
        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', 'attachment; filename="delivery-report.csv"');
        return response.send(csv);
    }
}
