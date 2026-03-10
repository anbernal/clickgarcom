import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TablesService } from './tables.service';

@Controller('admin/api/tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Get()
    findAll(@Request() req) {
        return this.tablesService.findAll(req.user.tenantId);
    }

    @Get('stats')
    stats(@Request() req) {
        return this.tablesService.getTabStats(req.user.tenantId);
    }

    @Post()
    create(@Request() req, @Body() body: any) {
        return this.tablesService.create(req.user.tenantId, {
            number: body.number,
            capacity: body.capacity
        });
    }

    @Patch(':id/status')
    async updateStatus(@Request() req, @Param('id') id: string, @Body('status') status: string) {
        return this.tablesService.updateStatus(id, req.user.tenantId, status);
    }

    @Delete(':id')
    async remove(@Request() req, @Param('id') id: string) {
        return this.tablesService.remove(id, req.user.tenantId);
    }

    // --- Table Requests Endpoints ---

    @Get('requests/pending')
    async getPendingRequests(@Request() req) {
        return this.tablesService.getPendingRequests(req.user.tenantId);
    }

    @Post('requests/:id/approve')
    async approveRequest(@Request() req, @Param('id') id: string, @Body('tableId') tableId?: string) {
        return this.tablesService.approveRequest(id, req.user.tenantId, tableId);
    }

    @Post('requests/:id/reject')
    async rejectRequest(@Request() req, @Param('id') id: string) {
        return this.tablesService.rejectRequest(id, req.user.tenantId);
    }

    @Post('requests/manual')
    async createManualRequest(@Request() req, @Body() body: { tableId: string, userPhone: string, paxCount: number }) {
        return this.tablesService.createManualRequest(req.user.tenantId, body);
    }

    @Get('waiter/close-requests')
    async getPendingCloseRequests(@Request() req) {
        return this.tablesService.getPendingCloseRequests(req.user.tenantId);
    }

    @Post('waiter/close-requests/:id/finalize')
    async finalizeCloseRequest(@Request() req, @Param('id') id: string) {
        return this.tablesService.finalizeCloseRequest(id, req.user.tenantId, req.user?.id);
    }

    @Get('waiter/chats/open')
    async getOpenWaiterChats(@Request() req) {
        return this.tablesService.getOpenWaiterChats(req.user.tenantId);
    }

    @Get('waiter/chats/:chatId/messages')
    async getWaiterChatMessages(@Request() req, @Param('chatId') chatId: string) {
        return this.tablesService.getWaiterChatMessages(chatId, req.user.tenantId);
    }

    @Post('waiter/chats/:chatId/messages')
    async sendWaiterChatMessage(
        @Request() req,
        @Param('chatId') chatId: string,
        @Body('message') message: string,
    ) {
        return this.tablesService.sendWaiterChatMessage(chatId, req.user.tenantId, message, req.user?.name);
    }

    @Post('waiter/chats/:chatId/close')
    async closeWaiterChat(@Request() req, @Param('chatId') chatId: string) {
        return this.tablesService.closeWaiterChat(chatId, req.user.tenantId, req.user?.name);
    }

    @Post('tabs/:tabId/finalize')
    async finalizeTab(@Request() req, @Param('tabId') tabId: string) {
        return this.tablesService.finalizeTab(tabId, req.user.tenantId, req.user?.id);
    }

    @Get(':id/tab')
    getTab(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTab(id, req.user.tenantId);
    }

    @Get(':id/tabs')
    getTabs(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTabs(id, req.user.tenantId);
    }
}
