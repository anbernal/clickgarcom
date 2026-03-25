import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

@Controller('admin/api/super-admin')
export class SuperAdminController {
    constructor(private readonly superAdminService: SuperAdminService) { }

    @Post('auth/login')
    login(
        @Request() req,
        @Body() body: { operator?: string; password?: string },
    ) {
        return this.superAdminService.login(body || {}, {
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
    }

    @Get('auth/me')
    async me(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        const session = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.getSessionProfile(session);
    }

    @Post('auth/logout')
    async logout(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        const session = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.logoutSession(session);
    }

    @Get('metrics')
    async metrics(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.getMetrics();
    }

    @Get('tenants')
    async tenants(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.listTenants();
    }

    @Get('operations/overview')
    async operationsOverview(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.getOperationsOverview();
    }

    @Get('audit-logs')
    async auditLogs(
        @Request() req,
        @Headers('authorization') authorization?: string,
        @Query('limit') limit?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.listAuditLogs(limit ? Number(limit) : undefined);
    }

    @Get('access-logs')
    async accessLogs(
        @Request() req,
        @Headers('authorization') authorization?: string,
        @Query('limit') limit?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.listAccessLogs(limit ? Number(limit) : undefined);
    }

    @Get('reliability/overview')
    async reliabilityOverview(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.getReliabilityOverview();
    }

    @Get('reliability/incidents')
    async reliabilityIncidents(
        @Request() req,
        @Headers('authorization') authorization?: string,
        @Query('limit') limit?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.listReliabilityIncidents(limit ? Number(limit) : undefined);
    }

    @Get('reliability/dlq')
    async reliabilityDlq(
        @Request() req,
        @Headers('authorization') authorization?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.getReliabilityDlqOverview();
    }

    @Get('reliability/correlations')
    async reliabilityCorrelations(
        @Request() req,
        @Headers('authorization') authorization?: string,
        @Query('tenant_id') tenantId?: string,
        @Query('message_id') messageId?: string,
        @Query('payment_id') paymentId?: string,
    ) {
        await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
        });
        return this.superAdminService.searchReliabilityCorrelation({
            tenantId,
            messageId,
            paymentId,
        });
    }

    @Post('reliability/inbox/:id/retry')
    async retryInboxEvent(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Param('id') id: string,
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.retryInboxEvent(id, actor);
    }

    @Post('reliability/outbox/:id/retry')
    async retryOutboxMessage(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Param('id') id: string,
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.retryOutboxMessage(id, actor);
    }

    @Post('tenants')
    async createTenant(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Body() body: any,
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.createTenant(body || {}, actor);
    }

    @Patch('tenants/:id')
    async updateTenant(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.updateTenant(id, body || {}, actor);
    }

    @Patch('tenants/:id/active')
    async setTenantActive(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Param('id') id: string,
        @Body() body: { active?: boolean },
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.setTenantActive(id, !!body?.active, actor);
    }

    @Patch('tenants/:id/wallet')
    async updateWallet(
        @Request() req,
        @Headers('authorization') authorization: string | undefined,
        @Param('id') id: string,
        @Body() body: { amount?: number; billing_plan?: string },
    ) {
        const actor = await this.superAdminService.requireAuthenticatedSession({
            authorization,
            sourceIp: this.resolveSourceIp(req),
            userAgent: this.resolveUserAgent(req),
            sensitiveOperation: true,
        });
        return this.superAdminService.updateWallet(id, body || {}, actor);
    }

    private resolveSourceIp(req: any) {
        const forwarded = req?.headers?.['x-forwarded-for'];
        if (Array.isArray(forwarded) && forwarded.length) {
            return String(forwarded[0] || '').trim();
        }
        if (String(forwarded || '').trim()) {
            return String(forwarded).split(',')[0].trim();
        }
        return String(req?.ip || req?.socket?.remoteAddress || '').trim();
    }

    private resolveUserAgent(req: any) {
        const header = req?.headers?.['user-agent'];
        if (Array.isArray(header)) {
            return header.join(' ').trim();
        }
        return String(header || '').trim();
    }
}
