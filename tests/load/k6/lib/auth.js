import http from 'k6/http';
import { check } from 'k6';

import { buildJsonHeaders, requireRuntimeValue, runtime } from './env.js';

export function loginTenant() {
    const email = requireRuntimeValue(runtime.tenantEmail, 'TENANT_EMAIL');
    const password = requireRuntimeValue(runtime.tenantPassword, 'TENANT_PASSWORD');

    const response = http.post(
        `${runtime.tenantAdminBaseUrl}/auth/login`,
        JSON.stringify({ email, password }),
        {
            headers: buildJsonHeaders(),
            tags: { endpoint: 'tenant_auth_login' },
        },
    );

    check(response, {
        'tenant login status 200': (res) => res.status === 200,
        'tenant login token present': (res) => !!res.json('access_token'),
    });

    if (response.status !== 200) {
        throw new Error(`Tenant login failed: ${response.status} ${response.body}`);
    }

    const payload = response.json();
    return {
        token: payload.access_token,
        tenantId: payload?.user?.tenant_id || runtime.tenantId,
        userId: payload?.user?.id || null,
    };
}

export function loginSuperAdmin() {
    const password = requireRuntimeValue(runtime.superAdminPassword, 'SUPER_ADMIN_PASSWORD');

    const response = http.post(
        `${runtime.superAdminBaseUrl}/auth/login`,
        JSON.stringify({
            operator: runtime.superAdminOperator,
            password,
        }),
        {
            headers: buildJsonHeaders(),
            tags: { endpoint: 'super_admin_auth_login' },
        },
    );

    check(response, {
        'super-admin login status 200': (res) => res.status === 200,
        'super-admin login token present': (res) => !!res.json('accessToken'),
    });

    if (response.status !== 200) {
        throw new Error(`Super-admin login failed: ${response.status} ${response.body}`);
    }

    const payload = response.json();
    return {
        token: payload.accessToken,
    };
}

