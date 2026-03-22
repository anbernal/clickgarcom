import { resolveAdminRuntimeMode } from './runtime-mode';
import { buildTenantRoleMetadata } from '../modules/auth/roles';

export const ADMIN_API_BASE_PATH = '/admin/api';
export const ADMIN_API_VERSION = 'v1';
export const ADMIN_API_VERSIONED_BASE_PATH = `${ADMIN_API_BASE_PATH}/${ADMIN_API_VERSION}`;
export const ADMIN_PUBLIC_API_BASE_PATH = '/admin/api/public';
export const ADMIN_PUBLIC_API_VERSIONED_BASE_PATH = `${ADMIN_PUBLIC_API_BASE_PATH}/${ADMIN_API_VERSION}`;

export type ApiEnvelopeMeta = {
    api_version: string;
    path: string;
    timestamp: string;
};

export type ApiSuccessEnvelope<T> = {
    success: true;
    data: T;
    meta: ApiEnvelopeMeta;
};

export type ApiErrorEnvelope = {
    success: false;
    error: {
        status_code: number;
        code: string;
        message: string;
        details?: unknown;
    };
    meta: ApiEnvelopeMeta;
};

export function buildApiMetadata() {
    const runtimeMode = resolveAdminRuntimeMode();
    const roleMetadata = buildTenantRoleMetadata();

    return {
        service: 'node-admin',
        runtime_mode: runtimeMode,
        admin_web_enabled: runtimeMode === 'hybrid',
        api: {
            legacy_base_path: ADMIN_API_BASE_PATH,
            versioned_base_path: ADMIN_API_VERSIONED_BASE_PATH,
            current_version: ADMIN_API_VERSION,
            supported_versions: [ADMIN_API_VERSION],
            versioned_response_contract: {
                success_shape: '{ success: true, data, meta }',
                error_shape: '{ success: false, error, meta }',
            },
        },
        public_api: {
            legacy_base_path: ADMIN_PUBLIC_API_BASE_PATH,
            versioned_base_path: ADMIN_PUBLIC_API_VERSIONED_BASE_PATH,
        },
        clients: {
            web_admin: 'can keep using legacy routes during migration',
            mobile: 'prefer versioned routes',
            kds: 'prefer versioned HTTP bootstrap routes; websocket contract remains separate',
        },
        docs: {
            openapi_json: `${ADMIN_API_BASE_PATH}/openapi.json`,
            versioned_openapi_json: `${ADMIN_API_VERSIONED_BASE_PATH}/openapi.json`,
            api_contract_markdown: 'apps/tenant-admin/api/API_CONTRACT.md',
            kds_websocket_contract_markdown: 'docs/kds-websocket-contract.md',
        },
        authorization: roleMetadata,
        kds: {
            websocket_path: '/ws/kds',
            auth: 'JWT required. Browser clients should connect with ?token=<jwt>; backend middleware also accepts Authorization: Bearer.',
            required_query: ['tenant_id'],
            bootstrap_http_base_path: ADMIN_API_VERSIONED_BASE_PATH,
            event_types: ['connected', 'order.created', 'order.status_changed'],
        },
    };
}
