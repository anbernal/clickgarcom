import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';

import { TablesService } from './tables.service';

@Controller('admin/api/internal/payments')
export class InternalTablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Post('settlements/approve')
    async approveSettlement(
        @Headers('x-internal-token') token: string,
        @Body() body: { tenant_id?: string; tab_id?: string },
    ) {
        this.assertInternalToken(token);

        const tenantId = String(body?.tenant_id || '').trim();
        const tabId = String(body?.tab_id || '').trim();

        if (!tenantId || !tabId) {
            throw new BadRequestException('tenant_id and tab_id are required');
        }

        return this.tablesService.confirmApprovedPaymentSettlement(tenantId, tabId);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || 'clickgarcom-internal-token').trim();
        if (!expected) return;
        if (String(token || '').trim() !== expected) {
            throw new UnauthorizedException('invalid internal token');
        }
    }
}
