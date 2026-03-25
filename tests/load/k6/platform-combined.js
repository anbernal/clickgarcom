import http from 'k6/http';
import { check, sleep } from 'k6';
import ws from 'k6/ws';

import { loginSuperAdmin, loginTenant } from './lib/auth.js';
import { buildJsonHeaders, buildWebhookPayload, requireRuntimeValue, runtime } from './lib/env.js';

export const options = {
    scenarios: {
        tenant_reads: {
            executor: 'ramping-arrival-rate',
            exec: 'tenantReads',
            startRate: 2,
            timeUnit: '1s',
            preAllocatedVUs: 10,
            maxVUs: 60,
            stages: [
                { duration: '1m', target: 10 },
                { duration: '3m', target: 25 },
                { duration: '1m', target: 0 },
            ],
        },
        webhook_ingest: {
            executor: 'ramping-arrival-rate',
            exec: 'webhookIngest',
            startRate: 5,
            timeUnit: '1s',
            preAllocatedVUs: 20,
            maxVUs: 120,
            stages: [
                { duration: '1m', target: 30 },
                { duration: '3m', target: 80 },
                { duration: '30s', target: 120 },
                { duration: '1m', target: 0 },
            ],
        },
        kds_ws_connections: {
            executor: 'ramping-vus',
            exec: 'kdsConnections',
            startVUs: 5,
            stages: [
                { duration: '1m', target: 25 },
                { duration: '2m', target: 100 },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
        super_admin_reads: {
            executor: 'constant-arrival-rate',
            exec: 'superAdminReads',
            rate: 3,
            timeUnit: '1s',
            duration: '4m',
            preAllocatedVUs: 10,
            maxVUs: 40,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.08'],
        'http_req_duration{group:tenant-admin-read}': ['p(95)<1800'],
        'http_req_duration{group:webhook-ingest}': ['p(95)<700'],
        'http_req_duration{group:super-admin-read}': ['p(95)<2500'],
        ws_connecting: ['p(95)<1500'],
    },
};

export function setup() {
    const tenant = loginTenant();
    const superAdmin = loginSuperAdmin();

    return {
        tenant,
        superAdmin,
        tenantId: requireRuntimeValue(tenant.tenantId || runtime.tenantId, 'TENANT_ID'),
    };
}

export function tenantReads(data) {
    const headers = {
        headers: buildJsonHeaders(data.tenant.token),
        tags: { group: 'tenant-admin-read' },
    };

    const responses = http.batch([
        ['GET', `${runtime.tenantAdminBaseUrl}/wallet/balance`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/orders?status=PENDING,ACCEPTED,READY`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/tables`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/reports/stats`, null, headers],
    ]);

    check(responses[0], { 'combined wallet 200': (res) => res.status === 200 });
    check(responses[1], { 'combined orders 200': (res) => res.status === 200 });
    sleep(1);
}

export function webhookIngest() {
    const sequence = `${__VU}-${__ITER}`;
    const response = http.post(
        `${runtime.coreBaseUrl}/webhooks/whatsapp`,
        JSON.stringify(buildWebhookPayload(sequence, '1')),
        {
            headers: buildJsonHeaders(),
            tags: { group: 'webhook-ingest', endpoint: 'whatsapp_webhook' },
        },
    );

    check(response, { 'combined webhook accepted': (res) => res.status >= 200 && res.status < 300 });
    sleep(1);
}

export function kdsConnections(data) {
    const url = `${runtime.kdsWsUrl}?tenant_id=${encodeURIComponent(data.tenantId)}&token=${encodeURIComponent(data.tenant.token)}`;
    const response = ws.connect(url, { tags: { group: 'kds-websocket' } }, (socket) => {
        socket.on('open', () => {
            socket.setTimeout(() => socket.close(), 12000);
        });
    });

    check(response, { 'combined ws 101': (res) => res && res.status === 101 });
    sleep(1);
}

export function superAdminReads(data) {
    const headers = {
        headers: buildJsonHeaders(data.superAdmin.token),
        tags: { group: 'super-admin-read' },
    };

    const responses = http.batch([
        ['GET', `${runtime.superAdminBaseUrl}/operations/overview`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/reliability/overview`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/reliability/dlq`, null, headers],
    ]);

    check(responses[0], { 'combined super-admin operations 200': (res) => res.status === 200 });
    check(responses[1], { 'combined super-admin reliability 200': (res) => res.status === 200 });
    sleep(1);
}

