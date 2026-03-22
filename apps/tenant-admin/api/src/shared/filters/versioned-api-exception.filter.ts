import {
    ArgumentsHost,
    Catch,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Response } from 'express';

import {
    buildVersionedApiMeta,
    isVersionedApiRequest,
    requestTargetsOpenApiDocument,
    VersionedApiRequest,
} from '../versioned-api';

@Catch()
@Injectable()
export class VersionedApiExceptionFilter extends BaseExceptionFilter {
    constructor(adapterHost: HttpAdapterHost) {
        super(adapterHost.httpAdapter);
    }

    override catch(exception: unknown, host: ArgumentsHost) {
        const http = host.switchToHttp();
        const request = http.getRequest<VersionedApiRequest>();

        if (!isVersionedApiRequest(request) || requestTargetsOpenApiDocument(request)) {
            return super.catch(exception, host);
        }

        const response = http.getResponse<Response>();
        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;
        const error = normalizeExceptionPayload(exception, status);

        response.setHeader('X-API-Version', request.clickgarcomApiVersion!);
        response.status(status).json({
            success: false,
            error,
            meta: buildVersionedApiMeta(request),
        });
    }
}

function normalizeExceptionPayload(exception: unknown, status: number) {
    const fallbackMessage = status >= 500 ? 'Unexpected error' : 'Request failed';
    const fallbackCode = resolveDefaultErrorCode(status);

    if (!(exception instanceof HttpException)) {
        return {
            status_code: status,
            code: fallbackCode,
            message: fallbackMessage,
        };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
        return {
            status_code: status,
            code: fallbackCode,
            message: response || fallbackMessage,
        };
    }

    if (!response || typeof response !== 'object') {
        return {
            status_code: status,
            code: fallbackCode,
            message: exception.message || fallbackMessage,
        };
    }

    const payload = response as Record<string, unknown>;
    const rawMessage = payload.message;
    const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : String(rawMessage || payload.error || exception.message || fallbackMessage);
    const explicitCode = typeof payload.error === 'string' ? normalizeErrorCode(payload.error) : undefined;
    const details = buildErrorDetails(payload);

    return {
        status_code: status,
        code: explicitCode || fallbackCode,
        message,
        ...(details !== undefined ? { details } : {}),
    };
}

function buildErrorDetails(payload: Record<string, unknown>) {
    const details: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
        if (key === 'message' || key === 'error' || key === 'statusCode') {
            continue;
        }

        details[key] = value;
    }

    return Object.keys(details).length > 0 ? details : undefined;
}

function resolveDefaultErrorCode(status: number) {
    switch (status) {
        case HttpStatus.BAD_REQUEST:
            return 'bad_request';
        case HttpStatus.UNAUTHORIZED:
            return 'unauthorized';
        case HttpStatus.FORBIDDEN:
            return 'forbidden';
        case HttpStatus.NOT_FOUND:
            return 'not_found';
        case HttpStatus.CONFLICT:
            return 'conflict';
        case HttpStatus.UNPROCESSABLE_ENTITY:
            return 'unprocessable_entity';
        case HttpStatus.TOO_MANY_REQUESTS:
            return 'too_many_requests';
        default:
            return 'internal_server_error';
    }
}

function normalizeErrorCode(rawValue: string) {
    return rawValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'request_failed';
}
