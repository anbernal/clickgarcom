import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES } from '../auth/roles';
import { CreateDeliveryTrackingLinkDto, DeliveryConfirmPinDto, DeliveryTrackingSessionDto } from './dto/delivery-commands.dto';
import { DeliveryService } from './delivery.service';
import { DeliveryTrackingService } from './delivery-tracking.service';

@Controller('admin/api/deliveries')
@UseGuards(JwtAuthGuard)
export class DeliveryTrackingAdminController {
    constructor(private readonly trackingService: DeliveryTrackingService) { }

    @Post(':id/tracking-link')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    issue(@Request() request: any, @Param('id') id: string, @Body() body: CreateDeliveryTrackingLinkDto) {
        return this.trackingService.issueLink(request.user.tenantId, id, request.user.id, body?.ttl_hours);
    }

    @Delete(':id/tracking-link')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    revoke(@Request() request: any, @Param('id') id: string) {
        return this.trackingService.revoke(request.user.tenantId, id);
    }
}

@Controller('admin/api/public/deliveries')
export class DeliveryTrackingPublicController {
    private readonly ipWindows = new Map<string, { count: number; resetAt: number }>();
    private readonly windowMs = 60_000;
    private readonly maxRequests = 120;

    constructor(
        private readonly trackingService: DeliveryTrackingService,
        private readonly deliveryService: DeliveryService,
    ) { }

    /** Exchanges the fragment token for an HttpOnly session cookie. */
    @Post('track/session')
    async createSession(
        @Body() body: DeliveryTrackingSessionDto,
        @Request() request: any,
        @Res({ passthrough: true }) response: Response,
    ) {
        this.assertRateLimit(request);
        const snapshot = await this.trackingService.publicSnapshot(body.token);
        const maxAge = 2 * 60 * 60 * 1000;
        // Remove the former narrow-path cookie before setting the root-scoped
        // version used by the websocket upgrade.
        response.clearCookie('delivery_tracking_token', { path: '/admin/api/public/deliveries' });
        response.cookie('delivery_tracking_token', body.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            // The Core websocket endpoint lives at /ws/delivery. Keeping the
            // cookie first-party at root lets the browser present it during
            // the upgrade without exposing its HttpOnly value to JavaScript.
            path: '/',
            maxAge,
        });
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        return { ...snapshot, session_expires_at: new Date(Date.now() + maxAge).toISOString() };
    }

    @Delete('track/session')
    clearSession(@Res({ passthrough: true }) response: Response) {
        response.clearCookie('delivery_tracking_token', { path: '/' });
        response.clearCookie('delivery_tracking_token', { path: '/admin/api/public/deliveries' });
        return { ok: true };
    }

    @Get('track')
    snapshotFromSession(@Request() request: any, @Res({ passthrough: true }) response: Response) {
        return this.snapshot(undefined, request, response);
    }

    @Post('track/confirm')
    async confirmReceipt(
        @Body() body: DeliveryConfirmPinDto,
        @Request() request: any,
        @Res({ passthrough: true }) response: Response,
    ) {
        this.assertRateLimit(request);
        response.setHeader('Cache-Control', 'no-store');
        const token = request?.cookies?.delivery_tracking_token || this.readCookie(request?.headers?.cookie, 'delivery_tracking_token');
        const credential = await this.trackingService.authorize(token);
        return this.deliveryService.confirmPinForCustomer(
            credential.tenantId,
            credential.deliveryId,
            credential.credentialId,
            body,
        );
    }

    @Get('track/:token')
    snapshot(@Param('token') token: string | undefined, @Request() request: any, @Res({ passthrough: true }) response: Response) {
        this.assertRateLimit(request);
        response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        const cookieToken = request?.cookies?.delivery_tracking_token || this.readCookie(request?.headers?.cookie, 'delivery_tracking_token');
        const bearer = token || cookieToken;
        return this.trackingService.publicSnapshot(bearer);
    }

    private readCookie(header: unknown, name: string): string | undefined {
        const prefix = `${name}=`;
        const item = String(header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
        return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
    }

    private assertRateLimit(request: any) {
        const now = Date.now();
        const ip = String(request?.headers?.['x-forwarded-for'] || request?.ip || request?.socket?.remoteAddress || 'unknown')
            .split(',')[0]
            .trim()
            .slice(0, 128);
        const current = this.ipWindows.get(ip);
        if (!current || current.resetAt <= now) {
            this.ipWindows.set(ip, { count: 1, resetAt: now + this.windowMs });
        } else {
            current.count += 1;
            if (current.count > this.maxRequests) {
                throw new HttpException('Muitas consultas de tracking. Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS);
            }
        }

        // Keep the in-process limiter bounded in long-lived workers.
        if (this.ipWindows.size > 10_000) {
            for (const [key, value] of this.ipWindows) {
                if (value.resetAt <= now) this.ipWindows.delete(key);
            }
        }
    }
}
