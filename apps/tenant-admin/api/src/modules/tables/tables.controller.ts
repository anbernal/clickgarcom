import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TablesService } from './tables.service';
import { CreateManualRequestDto } from './dto/create-manual-request.dto';
import { CreateTableDto } from './dto/create-table.dto';
import {
    TENANT_CLOSED_TAB_MUTATION_ROLES,
    TENANT_FLOOR_ROLES,
    TENANT_SETTLEMENT_ROLES,
    TENANT_TAB_OPERATION_ROLES,
    TENANT_TABLE_READ_ROLES,
    TENANT_TABLE_WRITE_ROLES,
} from '../auth/roles';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/api/tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Get()
    @Roles(...TENANT_TABLE_READ_ROLES)
    findAll(@Request() req) {
        return this.tablesService.findAll(req.user.tenantId);
    }

    @Get('stats')
    @Roles(...TENANT_TABLE_READ_ROLES)
    stats(@Request() req) {
        return this.tablesService.getTabStats(req.user.tenantId);
    }

    @Get('payments/overview')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    getPaymentsOverview(@Request() req, @Query() query?: Record<string, string>) {
        return this.tablesService.getPaymentsOverview(req.user.tenantId, query || {});
    }

    @Post('payments/:paymentId/refresh-status')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    refreshPaymentStatus(@Request() req, @Param('paymentId') paymentId: string) {
        return this.tablesService.refreshPaymentStatus(req.user.tenantId, paymentId);
    }

    @Post('payments/:paymentId/retry-pix')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    retryPaymentAsPix(@Request() req, @Param('paymentId') paymentId: string) {
        return this.tablesService.retryPaymentAsPix(req.user.tenantId, paymentId, {
            userId: req.user?.id,
            userName: req.user?.name,
        });
    }

    @Post('payments/:paymentId/prepare-refund')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    preparePaymentRefund(
        @Request() req,
        @Param('paymentId') paymentId: string,
        @Body() body: { reason?: string; requested_amount?: number },
    ) {
        return this.tablesService.preparePaymentRefund(req.user.tenantId, paymentId, {
            userId: req.user?.id,
            userName: req.user?.name,
            reason: body?.reason,
            requestedAmount: body?.requested_amount,
        });
    }

    @Post()
    @Roles(...TENANT_TABLE_WRITE_ROLES)
    create(@Request() req, @Body() body: CreateTableDto) {
        return this.tablesService.create(req.user.tenantId, {
            number: body.number,
            capacity: body.capacity
        });
    }

    @Patch(':id/status')
    @Roles(...TENANT_TABLE_WRITE_ROLES)
    async updateStatus(@Request() req, @Param('id') id: string, @Body('status') status: string) {
        return this.tablesService.updateStatus(id, req.user.tenantId, status);
    }

    @Delete(':id')
    @Roles(...TENANT_TABLE_WRITE_ROLES)
    async remove(@Request() req, @Param('id') id: string) {
        return this.tablesService.remove(id, req.user.tenantId);
    }

    // --- Table Requests Endpoints ---

    @Get('requests/pending')
    @Roles(...TENANT_FLOOR_ROLES)
    async getPendingRequests(@Request() req) {
        return this.tablesService.getPendingRequests(req.user.tenantId);
    }

    @Post('requests/:id/approve')
    @Roles(...TENANT_FLOOR_ROLES)
    async approveRequest(@Request() req, @Param('id') id: string, @Body('tableId') tableId?: string) {
        return this.tablesService.approveRequest(id, req.user.tenantId, tableId, req.user?.id, req.user?.name);
    }

    @Post('requests/:id/reject')
    @Roles(...TENANT_FLOOR_ROLES)
    async rejectRequest(@Request() req, @Param('id') id: string) {
        return this.tablesService.rejectRequest(id, req.user.tenantId);
    }

    @Post('requests/manual')
    @Roles(...TENANT_FLOOR_ROLES)
    async createManualRequest(@Request() req, @Body() body: CreateManualRequestDto) {
        return this.tablesService.createManualRequest(req.user.tenantId, body, req.user?.id, req.user?.name);
    }

    @Get('waiter/close-requests')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    async getPendingCloseRequests(@Request() req) {
        return this.tablesService.getPendingCloseRequests(req.user.tenantId);
    }

    @Post('waiter/close-requests/:id/finalize')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    async finalizeCloseRequest(@Request() req, @Param('id') id: string) {
        return this.tablesService.finalizeCloseRequest(id, req.user.tenantId, req.user?.id, req.user?.name);
    }

    @Get('waiter/chats/open')
    @Roles(...TENANT_FLOOR_ROLES)
    async getOpenWaiterChats(@Request() req) {
        return this.tablesService.getOpenWaiterChats(req.user.tenantId);
    }

    @Get('waiter/chats/:chatId/messages')
    @Roles(...TENANT_FLOOR_ROLES)
    async getWaiterChatMessages(@Request() req, @Param('chatId') chatId: string) {
        return this.tablesService.getWaiterChatMessages(chatId, req.user.tenantId);
    }

    @Post('waiter/chats/:chatId/messages')
    @Roles(...TENANT_FLOOR_ROLES)
    async sendWaiterChatMessage(
        @Request() req,
        @Param('chatId') chatId: string,
        @Body('message') message: string,
    ) {
        return this.tablesService.sendWaiterChatMessage(chatId, req.user.tenantId, message, req.user?.name);
    }

    @Post('waiter/chats/:chatId/close')
    @Roles(...TENANT_FLOOR_ROLES)
    async closeWaiterChat(@Request() req, @Param('chatId') chatId: string) {
        return this.tablesService.closeWaiterChat(chatId, req.user.tenantId, req.user?.name);
    }

    @Get('tabs/lookup')
    @Roles(...TENANT_TABLE_READ_ROLES)
    async lookupTab(@Request() req, @Query('value') value?: string) {
        return this.tablesService.lookupTabForStaff(req.user.tenantId, value, req.user?.role);
    }

    @Get('tabs/open')
    @Roles(...TENANT_TAB_OPERATION_ROLES)
    async listOpenTabs(@Request() req) {
        return this.tablesService.listOpenTabs(req.user.tenantId);
    }

    @Get('tabs/closed')
    @Roles(...TENANT_TAB_OPERATION_ROLES)
    async listClosedTabs(@Request() req, @Query('limit') limit?: string) {
        return this.tablesService.listClosedTabs(req.user.tenantId, Number(limit));
    }

    @Post('tabs/open')
    @Roles(...TENANT_TAB_OPERATION_ROLES)
    async openTab(@Request() req, @Body() body: {
        user_phone?: string;
        customer_instagram?: string;
        table_id?: string;
    }) {
        return this.tablesService.openTab(req.user.tenantId, body || {}, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Patch('tabs/:tabId/customer')
    @Roles(...TENANT_TAB_OPERATION_ROLES)
    async updateTabCustomer(
        @Request() req,
        @Param('tabId') tabId: string,
        @Body() body: { user_phone?: string; customer_instagram?: string },
    ) {
        return this.tablesService.updateTabCustomer(req.user.tenantId, tabId, body || {}, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Patch('tabs/:tabId/table')
    @Roles(...TENANT_TAB_OPERATION_ROLES)
    async updateTabTable(
        @Request() req,
        @Param('tabId') tabId: string,
        @Body() body: { table_id?: string | null },
    ) {
        return this.tablesService.updateTabTable(req.user.tenantId, tabId, body || {}, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Post('tabs/:tabId/finalize')
    @Roles(...TENANT_SETTLEMENT_ROLES)
    async finalizeTab(@Request() req, @Param('tabId') tabId: string) {
        return this.tablesService.finalizeTab(tabId, req.user.tenantId, req.user?.id, req.user?.name);
    }

    @Get('tabs/:tabId/details')
    @Roles(...TENANT_TABLE_READ_ROLES)
    async getTabDetails(@Request() req, @Param('tabId') tabId: string) {
        return this.tablesService.getTabDetails(tabId, req.user.tenantId, req.user?.role);
    }

    @Post('tabs/:tabId/reopen')
    @Roles(...TENANT_CLOSED_TAB_MUTATION_ROLES)
    async reopenTab(@Request() req, @Param('tabId') tabId: string, @Body('reason') reason?: string) {
        return this.tablesService.reopenTab(tabId, req.user.tenantId, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
            reason,
        });
    }

    @Get(':id/tab')
    @Roles(...TENANT_TABLE_READ_ROLES)
    getTab(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTab(id, req.user.tenantId);
    }

    @Get(':id/tabs')
    @Roles(...TENANT_TABLE_READ_ROLES)
    getTabs(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTabs(id, req.user.tenantId);
    }
}
