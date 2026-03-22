import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureAdminWebShell } from './shared/admin-web';
import { isAdminWebEnabled } from './shared/runtime-mode';
import { VersionedApiExceptionFilter } from './shared/filters/versioned-api-exception.filter';
import { VersionedApiResponseInterceptor } from './shared/interceptors/versioned-api-response.interceptor';
import { configureVersionedApiAliases, requestTargetsPublicCheckout } from './shared/versioned-api';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const publicCheckoutRateLimit = new Map<string, { count: number; resetAt: number }>();
    const publicCheckoutWindowMs = 60_000;
    const publicCheckoutMaxRequests = 300;
    const httpAdapterHost = app.get(HttpAdapterHost);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );
    app.useGlobalInterceptors(new VersionedApiResponseInterceptor());
    app.useGlobalFilters(new VersionedApiExceptionFilter(httpAdapterHost));

    configureVersionedApiAliases(app);

    app.use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');

        if (requestTargetsPublicCheckout(req)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }

        next();
    });

    configureAdminWebShell(app);

    app.use('/admin/api/public/tables', (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const clientIp = resolveClientIp(req);
        const current = publicCheckoutRateLimit.get(clientIp);

        if (!current || current.resetAt <= now) {
            publicCheckoutRateLimit.set(clientIp, {
                count: 1,
                resetAt: now + publicCheckoutWindowMs,
            });
        } else {
            current.count += 1;
            publicCheckoutRateLimit.set(clientIp, current);
        }

        const rateState = publicCheckoutRateLimit.get(clientIp)!;
        const retryAfterSeconds = Math.max(1, Math.ceil((rateState.resetAt - now) / 1000));
        res.setHeader('X-RateLimit-Limit', String(publicCheckoutMaxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(publicCheckoutMaxRequests - rateState.count, 0)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateState.resetAt / 1000)));

        if (rateState.count > publicCheckoutMaxRequests) {
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                message: 'Muitas tentativas. Tente novamente em instantes.',
            });
        }

        next();
    });

    app.enableCors();

    const port = process.env.APP_PORT || 3002;
    await app.listen(port);
    const runtimeMode = isAdminWebEnabled() ? 'hybrid' : 'api';
    console.log(`🍽  ClickGarçom Admin API running on http://localhost:${port} (${runtimeMode})`);
}
bootstrap();

function resolveClientIp(req: Request): string {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
    if (forwardedFor) {
        return forwardedFor;
    }

    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}
