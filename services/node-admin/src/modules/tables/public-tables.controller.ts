import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { TablesService } from './tables.service';

@Controller('admin/api/public/tables')
export class PublicTablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Get('tabs/:tabId')
    getPublicTabById(@Param('tabId') tabId: string) {
        return this.tablesService.getPublicTabById(tabId);
    }

    @Post('tabs/:tabId/payments/pix')
    createPublicPixPayment(
        @Param('tabId') tabId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tablesService.createPublicPixPayment(tabId, body || {});
    }

    @Post('tabs/:tabId/payments/card')
    createPublicCardPayment(
        @Param('tabId') tabId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tablesService.createPublicCardPayment(tabId, body || {});
    }

    @Get('tabs/:tabId/payments/:paymentId/status')
    getPublicPaymentStatus(
        @Param('tabId') tabId: string,
        @Param('paymentId') paymentId: string,
    ) {
        return this.tablesService.getPublicPaymentStatus(tabId, paymentId);
    }
}
