import http from 'k6/http';
import { check, sleep } from 'k6';

import { loginSuperAdmin } from './lib/auth.js';
import { buildJsonHeaders, runtime } from './lib/env.js';

export const options = {
    scenarios: {
        super_admin_reads: {
            executor: 'constant-arrival-rate',
            rate: 5,
            timeUnit: '1s',
            duration: '5m',
            preAllocatedVUs: 10,
            maxVUs: 60,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        'http_req_duration{group:super-admin-read}': ['p(95)<2000', 'p(99)<3000'],
    },
};

export function setup() {
    return loginSuperAdmin();
}

export default function (data) {
    const headers = { headers: buildJsonHeaders(data.token), tags: { group: 'super-admin-read' } };

    const responses = http.batch([
        ['GET', `${runtime.superAdminBaseUrl}/metrics`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/operations/overview`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/reliability/overview`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/reliability/incidents?limit=20`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/reliability/dlq`, null, headers],
        ['GET', `${runtime.superAdminBaseUrl}/audit-logs?limit=20`, null, headers],
    ]);

    check(responses[0], { 'super-admin metrics 200': (res) => res.status === 200 });
    check(responses[1], { 'operations overview 200': (res) => res.status === 200 });
    check(responses[2], { 'reliability overview 200': (res) => res.status === 200 });

    sleep(1);
}

