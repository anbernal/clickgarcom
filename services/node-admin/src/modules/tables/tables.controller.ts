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
    async updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.tablesService.updateStatus(id, status);
    }

    // --- Table Requests Endpoints ---

    @Get('requests/pending')
    async getPendingRequests(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.getPendingRequests(tid);
    }

    @Post('requests/:id/approve')
    async approveRequest(@Param('id') id: string, @Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.approveRequest(id, tid);
    }

    @Post('requests/:id/reject')
    async rejectRequest(@Param('id') id: string, @Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.rejectRequest(id, tid);
    }

    @Post('requests/manual')
    async createManualRequest(@Body() body: { tableId: string, userPhone: string, paxCount: number }, @Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.tablesService.createManualRequest(tid, body);
    }

    @Get(':id/tab')
    getTab(@Param('id') id: string) {
        return this.tablesService.getTab(id);
    }
}
