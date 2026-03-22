import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
    buildVersionedApiMeta,
    isVersionedApiRequest,
    requestTargetsOpenApiDocument,
    VersionedApiRequest,
} from '../versioned-api';

@Injectable()
export class VersionedApiResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const http = context.switchToHttp();
        const request = http.getRequest<VersionedApiRequest>();
        const response = http.getResponse<Response>();

        if (!isVersionedApiRequest(request) || requestTargetsOpenApiDocument(request)) {
            return next.handle();
        }

        response.setHeader('X-API-Version', request.clickgarcomApiVersion!);

        return next.handle().pipe(
            map((data) => ({
                success: true,
                data: data === undefined ? null : data,
                meta: buildVersionedApiMeta(request),
            })),
        );
    }
}
