import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import {
    ADMIN_API_BASE_PATH,
    ADMIN_API_VERSION,
    ADMIN_API_VERSIONED_BASE_PATH,
    ADMIN_PUBLIC_API_BASE_PATH,
    ADMIN_PUBLIC_API_VERSIONED_BASE_PATH,
    ApiEnvelopeMeta,
} from './api-contract';

const VERSIONED_ROUTE_ALIASES = [
    {
        externalBasePath: ADMIN_PUBLIC_API_VERSIONED_BASE_PATH,
        internalBasePath: ADMIN_PUBLIC_API_BASE_PATH,
    },
    {
        externalBasePath: ADMIN_API_VERSIONED_BASE_PATH,
        internalBasePath: ADMIN_API_BASE_PATH,
    },
];

export type VersionedApiRequest = Request & {
    clickgarcomApiVersion?: string;
    clickgarcomVersionedRoute?: boolean;
    clickgarcomVersionedPath?: string;
};

export function configureVersionedApiAliases(app: INestApplication) {
    app.use((req: VersionedApiRequest, res: Response, next: NextFunction) => {
        const routeAlias = VERSIONED_ROUTE_ALIASES.find(({ externalBasePath }) =>
            matchesBasePath(req.url, externalBasePath),
        );

        if (!routeAlias) {
            return next();
        }

        req.clickgarcomApiVersion = ADMIN_API_VERSION;
        req.clickgarcomVersionedRoute = true;
        req.clickgarcomVersionedPath = extractPath(req.originalUrl || req.url);
        req.url = replaceBasePath(req.url, routeAlias.externalBasePath, routeAlias.internalBasePath);
        res.setHeader('X-API-Version', ADMIN_API_VERSION);

        next();
    });
}

export function isVersionedApiRequest(req: VersionedApiRequest | undefined | null): req is VersionedApiRequest {
    return Boolean(req?.clickgarcomVersionedRoute && req?.clickgarcomApiVersion);
}

export function buildVersionedApiMeta(req: VersionedApiRequest): ApiEnvelopeMeta {
    return {
        api_version: req.clickgarcomApiVersion || ADMIN_API_VERSION,
        path: resolveVersionedRequestPath(req),
        timestamp: new Date().toISOString(),
    };
}

export function resolveVersionedRequestPath(req: VersionedApiRequest) {
    return req.clickgarcomVersionedPath || extractPath(req.originalUrl || req.url);
}

export function requestTargetsPublicCheckout(req: Request) {
    const pathCandidates = [extractPath(req.originalUrl || ''), extractPath(req.url || '')];

    return pathCandidates.some((candidate) =>
        candidate === '/checkout.html'
        || candidate.startsWith(`${ADMIN_PUBLIC_API_BASE_PATH}/tables`)
        || candidate.startsWith(`${ADMIN_PUBLIC_API_VERSIONED_BASE_PATH}/tables`),
    );
}

export function requestTargetsOpenApiDocument(req: Request) {
    const pathCandidates = [extractPath(req.originalUrl || ''), extractPath(req.url || '')];

    return pathCandidates.some((candidate) =>
        candidate === `${ADMIN_API_BASE_PATH}/openapi.json`
        || candidate === `${ADMIN_API_VERSIONED_BASE_PATH}/openapi.json`,
    );
}

function matchesBasePath(url: string, basePath: string) {
    const path = extractPath(url);
    return path === basePath || path.startsWith(`${basePath}/`);
}

function replaceBasePath(url: string, from: string, to: string) {
    if (!url.startsWith(from)) {
        return url;
    }

    return `${to}${url.slice(from.length)}`;
}

function extractPath(url: string) {
    const [path = '/'] = String(url || '').split('?');
    return path || '/';
}
