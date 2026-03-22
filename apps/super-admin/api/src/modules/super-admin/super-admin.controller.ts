import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
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

    @Post('tenants')
    createTenant(
        @Headers('x-super-admin-key') key: string | undefined,
        @Body() body: any,
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.createTenant(body || {});
    }

    @Patch('tenants/:id')
    updateTenant(
        @Headers('x-super-admin-key') key: string | undefined,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.updateTenant(id, body || {});
    }

    @Patch('tenants/:id/active')
    setTenantActive(
        @Headers('x-super-admin-key') key: string | undefined,
        @Param('id') id: string,
        @Body() body: { active?: boolean },
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.setTenantActive(id, !!body?.active);
    }

    @Patch('tenants/:id/wallet')
    updateWallet(
        @Headers('x-super-admin-key') key: string | undefined,
        @Param('id') id: string,
        @Body() body: { amount?: number; billing_plan?: string },
    ) {
        this.superAdminService.assertAccess(key);
        return this.superAdminService.updateWallet(id, body || {});
    }
}
