import { Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';

import { PublicMenuCustomerService } from './public-menu-customer.service';

@Controller('admin/api/public/menu')
export class PublicMenuController {
    constructor(
        private readonly customerService: PublicMenuCustomerService,
    ) { }

    @Get(':slug')
    @Header('Cache-Control', 'private, no-store')
    findBySlug(@Param('slug') slug: string, @Req() request: Request) {
        return this.customerService.getAuthenticatedMenu(slug, this.readSessionCookie(request));
    }

    @Post(':slug/session/request')
    @Header('Cache-Control', 'no-store')
    requestSession(@Param('slug') slug: string, @Body() body: Record<string, unknown>) {
        return this.customerService.requestLogin(slug, String(body?.phone || ''));
    }

    @Post(':slug/session/verify')
    @Header('Cache-Control', 'no-store')
    async verifySession(
        @Param('slug') slug: string,
        @Body() body: Record<string, unknown>,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.customerService.verifyLogin(
            slug,
            String(body?.challenge_id || ''),
            String(body?.code || ''),
            String(body?.name || ''),
        );
        response.cookie('clickgarcom_menu_customer', result.sessionToken, {
            httpOnly: true,
            secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
            sameSite: 'lax',
            maxAge: result.expiresInSeconds * 1000,
            path: '/',
        });
        return { customer: result.customer };
    }

    @Post(':slug/session/exchange')
    @Header('Cache-Control', 'no-store')
    async exchangeSession(
        @Param('slug') slug: string,
        @Body() body: Record<string, unknown>,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.customerService.exchangeWhatsAppAccess(slug, String(body?.capability || ''));
        response.cookie('clickgarcom_menu_customer', result.sessionToken, {
            httpOnly: true,
            secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
            sameSite: 'lax',
            maxAge: result.expiresInSeconds * 1000,
            path: '/',
        });
        return { customer: result.customer };
    }

    @Post('internal/access')
    @Header('Cache-Control', 'no-store')
    createInternalAccess(
        @Headers('x-internal-token') token: string,
        @Body() body: Record<string, unknown>,
    ) {
        this.assertInternalToken(token);
        return this.customerService.createWhatsAppAccess(String(body?.tenant_id || ''), String(body?.phone || ''));
    }

    @Get(':slug/session')
    @Header('Cache-Control', 'no-store')
    getSession(@Param('slug') slug: string, @Req() request: Request) {
        const sessionToken = this.readSessionCookie(request);
        return sessionToken
            ? this.customerService.getProfile(slug, sessionToken)
            : { authenticated: false };
    }

    @Patch(':slug/session')
    @Header('Cache-Control', 'no-store')
    updateSession(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) {
        return this.customerService.updateProfile(slug, this.readSessionCookie(request), String(body?.name || ''));
    }

    @Post(':slug/session/logout')
    @Header('Cache-Control', 'no-store')
    logoutSession(@Res({ passthrough: true }) response: Response) {
        response.clearCookie('clickgarcom_menu_customer', { path: '/' });
        return { ok: true };
    }

    @Get(':slug/postal-code/:postalCode')
    @Header('Cache-Control', 'no-store')
    lookupPostalCode(@Param('slug') slug: string, @Param('postalCode') postalCode: string, @Req() request: Request) {
        return this.customerService.lookupPostalCode(slug, this.readSessionCookie(request), postalCode);
    }

    @Post(':slug/addresses')
    @Header('Cache-Control', 'no-store')
    createAddress(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) {
        return this.customerService.createAddress(slug, this.readSessionCookie(request), body || {});
    }

    @Patch(':slug/addresses/:addressId')
    @Header('Cache-Control', 'no-store')
    updateAddress(
        @Param('slug') slug: string,
        @Param('addressId') addressId: string,
        @Req() request: Request,
        @Body() body: Record<string, unknown>,
    ) {
        return this.customerService.updateAddress(slug, this.readSessionCookie(request), addressId, body || {});
    }

    @Delete(':slug/addresses/:addressId')
    @Header('Cache-Control', 'no-store')
    removeAddress(@Param('slug') slug: string, @Param('addressId') addressId: string, @Req() request: Request) {
        return this.customerService.removeAddress(slug, this.readSessionCookie(request), addressId);
    }

    @Get(':slug/orders')
    @Header('Cache-Control', 'no-store')
    listOrders(@Param('slug') slug: string, @Req() request: Request) {
        return this.customerService.listOrderHistory(slug, this.readSessionCookie(request));
    }

    @Post(':slug/checkout')
    @Header('Cache-Control', 'no-store')
    createCheckout(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) {
        return this.customerService.createCheckout(slug, this.readSessionCookie(request), body || {});
    }

    private readSessionCookie(request: Request) {
        const rawCookie = String(request.headers.cookie || '');
        const entry = rawCookie.split(';').map((item) => item.trim())
            .find((item) => item.startsWith('clickgarcom_menu_customer='));
        return entry ? decodeURIComponent(entry.slice('clickgarcom_menu_customer='.length)) : '';
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) {
            throw new UnauthorizedException('invalid internal token');
        }
    }
}
