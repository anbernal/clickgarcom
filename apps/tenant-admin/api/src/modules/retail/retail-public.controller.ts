import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { PublicMenuCustomerService } from '../menu/public-menu-customer.service';
import { RetailCheckoutService } from './retail-checkout.service';

/** Public store endpoints. Authentication reuses the tenant-bound customer
 * session created from WhatsApp, therefore a store is not a public catalog. */
@Controller('admin/api/public/stores')
export class RetailPublicController {
    constructor(
        private readonly checkout: RetailCheckoutService,
        private readonly customers: PublicMenuCustomerService,
    ) { }

    @Get(':slug/catalog') @Header('Cache-Control', 'private, no-store')
    catalog(@Param('slug') slug: string, @Req() request: Request) { return this.checkout.getCatalog(slug, this.cookie(request)); }

    @Post(':slug/session/request') @Header('Cache-Control', 'no-store')
    requestSession(@Param('slug') slug: string, @Body() body: Record<string, unknown>) { return this.customers.requestLogin(slug, String(body?.phone || '')); }

    @Post(':slug/session/verify') @Header('Cache-Control', 'no-store')
    async verifySession(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Res({ passthrough: true }) response: Response) {
        const result = await this.customers.verifyLogin(slug, String(body?.challenge_id || ''), String(body?.code || ''), String(body?.name || ''));
        this.setCookie(response, result.sessionToken, result.expiresInSeconds);
        return { customer: result.customer };
    }

    @Post(':slug/session/exchange') @Header('Cache-Control', 'no-store')
    async exchangeSession(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Res({ passthrough: true }) response: Response) {
        const result = await this.customers.exchangeWhatsAppAccess(slug, String(body?.capability || ''));
        this.setCookie(response, result.sessionToken, result.expiresInSeconds);
        return { customer: result.customer };
    }

    @Get(':slug/session') @Header('Cache-Control', 'no-store')
    session(@Param('slug') slug: string, @Req() request: Request) { const token = this.cookie(request); return token ? this.customers.getProfile(slug, token) : { authenticated: false }; }
    @Patch(':slug/session') @Header('Cache-Control', 'no-store')
    updateSession(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) { return this.customers.updateProfile(slug, this.cookie(request), String(body?.name || '')); }
    @Post(':slug/session/logout') @Header('Cache-Control', 'no-store')
    logout(@Res({ passthrough: true }) response: Response) { response.clearCookie('clickgarcom_menu_customer', { path: '/' }); return { ok: true }; }
    @Get(':slug/postal-code/:postalCode') @Header('Cache-Control', 'no-store')
    postalCode(@Param('slug') slug: string, @Param('postalCode') postalCode: string, @Req() request: Request) { return this.customers.lookupPostalCode(slug, this.cookie(request), postalCode); }
    @Post(':slug/addresses') @Header('Cache-Control', 'no-store')
    createAddress(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) { return this.customers.createAddress(slug, this.cookie(request), body || {}); }
    @Patch(':slug/addresses/:addressId') @Header('Cache-Control', 'no-store')
    updateAddress(@Param('slug') slug: string, @Param('addressId') addressId: string, @Req() request: Request, @Body() body: Record<string, unknown>) { return this.customers.updateAddress(slug, this.cookie(request), addressId, body || {}); }
    @Delete(':slug/addresses/:addressId') @Header('Cache-Control', 'no-store')
    removeAddress(@Param('slug') slug: string, @Param('addressId') addressId: string, @Req() request: Request) { return this.customers.removeAddress(slug, this.cookie(request), addressId); }
    @Get(':slug/orders') @Header('Cache-Control', 'no-store')
    orders(@Param('slug') slug: string, @Req() request: Request) { return this.customers.listOrderHistory(slug, this.cookie(request)); }
    @Post(':slug/checkout') @Header('Cache-Control', 'no-store')
    checkoutDelivery(@Param('slug') slug: string, @Req() request: Request, @Body() body: Record<string, unknown>) { return this.checkout.createDeliveryCheckout(slug, this.cookie(request), body || {}); }

    private cookie(request: Request) { const value = String(request.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith('clickgarcom_menu_customer=')); return value ? decodeURIComponent(value.slice('clickgarcom_menu_customer='.length)) : ''; }
    private setCookie(response: Response, token: string, maxAge: number) { response.cookie('clickgarcom_menu_customer', token, { httpOnly: true, secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production', sameSite: 'lax', maxAge: maxAge * 1000, path: '/' }); }
}
