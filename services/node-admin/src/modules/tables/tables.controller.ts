import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { TablesService } from './tables.service';

@Controller('admin/api/tables')
export class TablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Get()
    findAll(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.findAll(tid);
    }

    @Get('stats')
    stats(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.getTabStats(tid);
    }

    @Post()
    create(@Body() body: any) {
        const tenantId = body.tenant_id || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.create(tenantId, { number: body.number });
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
        return this.tablesService.updateStatus(id, body.status);
    }

    @Get(':id/tab')
    getTab(@Param('id') id: string) {
        return this.tablesService.getTab(id);
    }
}
