import http from 'k6/http';
import { check, sleep } from 'k6';

import { loginTenant } from './lib/auth.js';
import { buildJsonHeaders, runtime } from './lib/env.js';

export const options = {
    scenarios: {
        tenant_reads: {
            executor: 'ramping-arrival-rate',
            startRate: 2,
            timeUnit: '1s',
            preAllocatedVUs: 10,
            maxVUs: 80,
            stages: [
                { duration: '1m', target: 10 },
                { duration: '3m', target: 30 },
                { duration: '2m', target: 50 },
                { duration: '1m', target: 0 },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        'http_req_duration{group:tenant-admin-read}': ['p(95)<1500', 'p(99)<2500'],
    },
};

export function setup() {
    return loginTenant();
}

export default function (data) {
    const token = data.token;
    const headers = { headers: buildJsonHeaders(token), tags: { group: 'tenant-admin-read' } };
    const monthStart = new Date();
    monthStart.setDate(1);
    const startDate = monthStart.toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const responses = http.batch([
        ['GET', `${runtime.tenantAdminBaseUrl}/auth/me`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/wallet/balance`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/wallet/messages/statement?page=1&limit=20`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/orders?status=PENDING,ACCEPTED,READY`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/orders/operations/summary`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/tables`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/tables/stats`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/tables/payments/overview`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/reports/stats`, null, headers],
        ['GET', `${runtime.tenantAdminBaseUrl}/reports/management?start_date=${startDate}&end_date=${endDate}`, null, headers],
    ]);

    check(responses[0], { 'auth/me 200': (res) => res.status === 200 });
    check(responses[1], { 'wallet/balance 200': (res) => res.status === 200 });
    check(responses[3], { 'orders 200': (res) => res.status === 200 });
    check(responses[5], { 'tables 200': (res) => res.status === 200 });
    check(responses[8], { 'reports/stats 200': (res) => res.status === 200 });

    sleep(1);
}

