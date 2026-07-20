import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';

import { TablesService } from './tables.service';

@Controller('admin/api/public/tables')
export class PublicTablesController {
    constructor(private readonly tablesService: TablesService) { }

    @Get('tabs/:tabId')
    getPublicTabById(
        @Param('tabId') tabId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('access_token') accessToken: string | undefined,
    ) {
        return this.tablesService.getPublicTabById(tabId, this.resolveAccessToken(authorization, accessToken));
    }

    @Post('tabs/:tabId/payments/pix')
    createPublicPixPayment(
        @Param('tabId') tabId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('access_token') accessToken: string | undefined,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tablesService.createPublicPixPayment(
            tabId,
            this.resolveAccessToken(authorization, accessToken),
            body || {},
        );
    }

    @Post('tabs/:tabId/payments/card')
    createPublicCardPayment(
        @Param('tabId') tabId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('access_token') accessToken: string | undefined,
        @Body() body: Record<string, unknown>,
    ) {
        return this.tablesService.createPublicCardPayment(
            tabId,
            this.resolveAccessToken(authorization, accessToken),
            body || {},
        );
    }

    @Get('tabs/:tabId/payments/:paymentId/status')
    getPublicPaymentStatus(
        @Param('tabId') tabId: string,
        @Param('paymentId') paymentId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('access_token') accessToken: string | undefined,
    ) {
        return this.tablesService.getPublicPaymentStatus(
            tabId,
            paymentId,
            this.resolveAccessToken(authorization, accessToken),
        );
    }

    @Post('tabs/:tabId/exit/validate')
    validatePublicExit(
        @Param('tabId') tabId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('access_token') accessToken: string | undefined,
    ) {
        return this.tablesService.validatePublicExit(
            tabId,
            this.resolveAccessToken(authorization, accessToken),
        );
    }

    private resolveAccessToken(authorization?: string, accessToken?: string) {
        const bearer = String(authorization || '').trim();
        if (bearer.toLowerCase().startsWith('bearer ')) {
            const token = bearer.slice(7).trim();
            if (token) {
                return token;
            }
        }

        const fallbackToken = String(accessToken || '').trim();
        return fallbackToken || undefined;
    }
}
