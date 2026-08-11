import { Controller, Headers, HttpException, HttpStatus, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { DeliveryWebhookService } from './delivery-webhook.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('admin/api/public/delivery/webhooks')
export class DeliveryWebhookController {
    private readonly windows = new Map<string, { count: number; resetAt: number }>();
    private readonly windowMs = 60_000;
    private readonly maxRequests = 300;

    constructor(private readonly webhookService: DeliveryWebhookService) { }

    @Post(':provider')
    receive(
        @Param('provider') provider: string,
        @Headers('x-signature') signature: string,
        @Headers('x-event-id') eventId: string,
        @Headers() headers: Record<string, unknown>,
        @Req() request: RawBodyRequest,
    ) {
        this.assertRateLimit(request, provider);
        const rawBody = request.rawBody;
        if (!rawBody || rawBody.length === 0) throw new UnauthorizedException('Payload bruto do webhook ausente.');
        return this.webhookService.receive(provider, rawBody, signature, eventId, headers);
    }

    private assertRateLimit(request: Request, provider: string) {
        const now = Date.now();
        const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
        const ip = (forwarded || request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 128);
        const key = `${String(provider || '').toUpperCase()}:${ip}`;
        const current = this.windows.get(key);
        if (!current || current.resetAt <= now) {
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
        } else {
            current.count += 1;
            if (current.count > this.maxRequests) {
                throw new HttpException('Muitas notificações do operador. Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        if (this.windows.size > 10_000) {
            for (const [windowKey, value] of this.windows) {
                if (value.resetAt <= now) this.windows.delete(windowKey);
            }
        }
    }
}
