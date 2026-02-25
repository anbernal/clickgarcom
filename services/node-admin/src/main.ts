import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

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
