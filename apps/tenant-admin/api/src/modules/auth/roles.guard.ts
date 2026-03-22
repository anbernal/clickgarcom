import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TENANT_ROLE_METADATA_KEY, normalizeTenantRole } from './roles';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<readonly string[]>(
            TENANT_ROLE_METADATA_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
        const userRole = normalizeTenantRole(request?.user?.role);

        if (!userRole) {
            throw new ForbiddenException('Perfil sem permissão para acessar este recurso.');
        }

        const allowedRoles = new Set(requiredRoles.map((role) => normalizeTenantRole(role)));
        if (!allowedRoles.has(userRole)) {
            throw new ForbiddenException('Perfil sem permissão para acessar este recurso.');
        }

        return true;
    }
}
