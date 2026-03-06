import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tab } from '../../entities/tab.entity';
import { TablesService } from './tables.service';

@Controller('admin/api/tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
    constructor(
        private readonly tablesService: TablesService,
        @InjectRepository(Tab)
        private readonly tabRepo: Repository<Tab>,
    ) { }

    // Fase 14: Endpoint público para o checkout do cliente ver os dados da sua comanda
    // Nota: não é proteged por JWT pois a página de checkout é acessada via link no WhatsApp
    @Get('/public/tab/:tabId')
    async getPublicTabById(@Param('tabId') tabId: string) {
        const tab = await this.tabRepo.findOne({ where: { id: tabId } });
        if (!tab) throw new NotFoundException('Tab not found');
        return tab;
    }

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

    @Get(':id/tab')
    getTab(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTab(id, req.user.tenantId);
    }

    @Get(':id/tabs')
    getTabs(@Request() req, @Param('id') id: string) {
        return this.tablesService.getTabs(id, req.user.tenantId);
    }
}
