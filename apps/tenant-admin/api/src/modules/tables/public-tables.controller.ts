import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

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

    @Post('portal/session')
    async startPortalSession(
        @Body('access_token') accessToken: string,
        @Res({ passthrough: true }) response: Response,
    ) {
        const session = await this.tablesService.startPortalSession(accessToken);
        response.cookie('clickgarcom_portal', session.sessionToken, {
            httpOnly: true,
            secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
            sameSite: 'lax',
            maxAge: session.expiresInSeconds * 1000,
            path: '/',
        });
        return { ok: true };
    }

    @Get('portal/tab')
    getPortalTab(@Req() request: Request) {
        return this.tablesService.getPortalTab(this.readPortalCookie(request));
    }

    @Post('portal/messages')
    sendPortalMessage(@Req() request: Request, @Body('message') message: string) {
        return this.tablesService.sendPortalMessage(this.readPortalCookie(request), message);
    }

    @Get('portal/menu')
    getPortalMenu(@Req() request: Request) {
        return this.tablesService.getPortalMenu(this.readPortalCookie(request));
    }

    @Post('portal/orders')
    createPortalOrder(@Req() request: Request, @Body('items') items: unknown) {
        return this.tablesService.createPortalOrder(this.readPortalCookie(request), items);
    }

    @Post('portal/logout')
    logoutPortal(@Res({ passthrough: true }) response: Response) {
        response.clearCookie('clickgarcom_portal', { path: '/' });
        return { ok: true };
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

    private readPortalCookie(request: Request) {
        const rawCookie = String(request.headers.cookie || '');
        const entry = rawCookie.split(';').map((item) => item.trim())
            .find((item) => item.startsWith('clickgarcom_portal='));
        return entry ? decodeURIComponent(entry.slice('clickgarcom_portal='.length)) : '';
    }
}
