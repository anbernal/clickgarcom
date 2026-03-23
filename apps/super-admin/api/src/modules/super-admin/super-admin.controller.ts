import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

@Controller('admin/api/super-admin')
export class SuperAdminController {
    constructor(private readonly superAdminService: SuperAdminService) { }

    @Get('metrics')
    metrics(@Headers('x-super-admin-key') key?: string) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.getMetrics();
    }

    @Get('tenants')
    tenants(@Headers('x-super-admin-key') key?: string) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.listTenants();
    }

    @Get('operations/overview')
    operationsOverview(@Headers('x-super-admin-key') key?: string) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.getOperationsOverview();
    }

    @Get('audit-logs')
    auditLogs(
        @Headers('x-super-admin-key') key?: string,
        @Query('limit') limit?: string,
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.listAuditLogs(limit ? Number(limit) : undefined);
    }

    @Post('tenants')
    createTenant(
        @Request() req,
        @Headers('x-super-admin-key') key: string | undefined,
        @Headers('x-super-admin-operator') operator: string | undefined,
        @Body() body: any,
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.createTenant(body || {}, {
            receivedKey: key,
            operatorName: operator,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }

    @Patch('tenants/:id')
    updateTenant(
        @Request() req,
        @Headers('x-super-admin-key') key: string | undefined,
        @Headers('x-super-admin-operator') operator: string | undefined,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.updateTenant(id, body || {}, {
            receivedKey: key,
            operatorName: operator,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }

    @Patch('tenants/:id/active')
    setTenantActive(
        @Request() req,
        @Headers('x-super-admin-key') key: string | undefined,
        @Headers('x-super-admin-operator') operator: string | undefined,
        @Param('id') id: string,
        @Body() body: { active?: boolean },
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.setTenantActive(id, !!body?.active, {
            receivedKey: key,
            operatorName: operator,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }

    @Patch('tenants/:id/wallet')
    updateWallet(
        @Request() req,
        @Headers('x-super-admin-key') key: string | undefined,
        @Headers('x-super-admin-operator') operator: string | undefined,
        @Param('id') id: string,
        @Body() body: { amount?: number; billing_plan?: string },
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.updateWallet(id, body || {}, {
            receivedKey: key,
            operatorName: operator,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }
}
