import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

import { isAdminWebEnabled } from './runtime-mode';

export function configureAdminWebShell(app: INestApplication) {
    if (!isAdminWebEnabled()) {
        return;
    }

    const express = require('express');
    const publicPath = resolveAdminWebPublicPath();
    const noCacheOptions = {
        etag: false,
        lastModified: false,
        setHeaders: (res: Response) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        },
    };

    app.use('/_config.js', (_req: Request, res: Response) => {
        res.type('application/javascript');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(buildAdminWebRuntimeConfigScript());
    });

    app.use('/css', express.static(join(publicPath, 'css')));
    app.use('/js', express.static(join(publicPath, 'js')));
    app.use('/assets', express.static(join(publicPath, 'assets')));
    app.use('/data', express.static(join(publicPath, 'data')));

    app.use('/index.html', express.static(join(publicPath, 'index.html'), noCacheOptions));
    app.use('/login.html', express.static(join(publicPath, 'login.html'), noCacheOptions));
    app.use('/kds.html', express.static(join(publicPath, 'kds.html'), noCacheOptions));
    app.use('/checkout.html', express.static(join(publicPath, 'checkout.html'), noCacheOptions));

    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.method === 'GET' && !req.originalUrl.startsWith('/admin/api')) {
            if (req.originalUrl === '/login.html' || req.originalUrl === '/login') {
                res.sendFile(join(publicPath, 'login.html'));
                return;
            }

            res.sendFile(join(publicPath, 'index.html'));
            return;
        }

        next();
    });
}

function buildAdminWebRuntimeConfigScript() {
    const apiBaseUrl = normalizeBaseUrl(process.env.ADMIN_API_BASE_URL, '/admin/api');
    const publicTablesApiBaseUrl = normalizeBaseUrl(
        process.env.ADMIN_PUBLIC_API_BASE_URL,
        `${apiBaseUrl}/public/tables`,
    );
    const kdsWsUrl = String(process.env.KDS_WS_URL || '').trim();

    const payload = {
        apiBaseUrl,
        publicTablesApiBaseUrl,
        kdsWsUrl,
        loginPagePath: '/login.html',
        appHomePath: '/',
    };

    return `window.CLICKGARCOM_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(payload)});`;
}

function resolveAdminWebPublicPath() {
    const configuredPath = String(process.env.ADMIN_WEB_PUBLIC_DIR || '').trim();
    if (configuredPath) {
        return configuredPath;
    }

    const candidatePaths = [
        join(__dirname, '..', '..', '..', 'web', 'public'),
        join(process.cwd(), '..', 'web', 'public'),
    ];

    for (const candidate of candidatePaths) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return candidatePaths[candidatePaths.length - 1];
}

function normalizeBaseUrl(rawValue: string | undefined, fallback: string) {
    const value = String(rawValue || '').trim();
    if (!value) {
        return fallback;
    }

    return value.replace(/\/+$/, '');
}
