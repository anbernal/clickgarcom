import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const publicCheckoutRateLimit = new Map<string, { count: number; resetAt: number }>();
    const publicCheckoutWindowMs = 60_000;
    const publicCheckoutMaxRequests = 300;

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    // Static file routing (Replaces NestJS ServeStaticModule to prevent dashboard hijacking)
    const express = require('express');
    const path = require('path');
    const publicPath = path.join(__dirname, '..', 'public');

    // 1. Serve static assets (CSS, JS, Images, Data) first
    const noCacheOptions = {
        etag: false,
        lastModified: false,
        setHeaders: (res, path) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    };
    app.use('/css', express.static(path.join(publicPath, 'css')));
    app.use('/js', express.static(path.join(publicPath, 'js')));
    app.use('/assets', express.static(path.join(publicPath, 'assets')));
    app.use('/data', express.static(path.join(publicPath, 'data')));

    // 2. Explicitly serve HTML routes
    app.use('/index.html', express.static(path.join(publicPath, 'index.html'), noCacheOptions));
    app.use('/login.html', express.static(path.join(publicPath, 'login.html'), noCacheOptions));
    app.use('/kds.html', express.static(path.join(publicPath, 'kds.html'), noCacheOptions));
    app.use('/checkout.html', express.static(path.join(publicPath, 'checkout.html'), noCacheOptions));

    app.use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');

        if (req.originalUrl === '/checkout.html' || req.originalUrl.startsWith('/admin/api/public/tables')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }

        next();
    });

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

    // 3. SPA Fallback (Dashboard index.html) for any other unmatched GET request.
    // Use app.use without "*" to avoid wildcard differences across Express versions.
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.originalUrl.startsWith('/admin/api')) {
            if (req.originalUrl === '/login.html' || req.originalUrl === '/login') {
                res.sendFile(path.join(publicPath, 'login.html'));
            } else {
                res.sendFile(path.join(publicPath, 'index.html'));
            }
        } else {
            next();
        }
    });

    app.enableCors();

    const port = process.env.APP_PORT || 3002;
    await app.listen(port);
    console.log(`🍽  ClickGarçom Admin running on http://localhost:${port}`);
}
bootstrap();

function resolveClientIp(req: Request): string {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
    if (forwardedFor) {
        return forwardedFor;
    }

    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}
