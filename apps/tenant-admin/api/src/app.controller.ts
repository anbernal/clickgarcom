import { Controller, Get } from '@nestjs/common';
import { buildApiMetadata } from './shared/api-contract';
import { buildTenantAdminOpenApiDocument } from './shared/openapi';
import { resolveAdminRuntimeMode } from './shared/runtime-mode';

@Controller()
export class AppController {
    @Get('admin/api/health')
    health() {
        const runtimeMode = resolveAdminRuntimeMode();

        return {
            status: 'ok',
            service: 'node-admin',
            runtime_mode: runtimeMode,
            admin_web_enabled: runtimeMode === 'hybrid',
            current_api_version: buildApiMetadata().api.current_version,
            versioned_base_path: buildApiMetadata().api.versioned_base_path,
        };
    }

    @Get('admin/api/meta')
    meta() {
        return buildApiMetadata();
    }

    @Get('admin/api/openapi.json')
    openApi() {
        return buildTenantAdminOpenApiDocument();
    }
}
