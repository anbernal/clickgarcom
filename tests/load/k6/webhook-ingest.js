import http from 'k6/http';
import { check, sleep } from 'k6';

import { buildJsonHeaders, buildWebhookPayload, runtime } from './lib/env.js';

export const options = {
    scenarios: {
        webhook_ingest: {
            executor: 'ramping-arrival-rate',
            startRate: 5,
            timeUnit: '1s',
            preAllocatedVUs: 20,
            maxVUs: 120,
            stages: [
                { duration: '1m', target: 20 },
                { duration: '3m', target: 80 },
                { duration: '2m', target: 120 },
                { duration: '30s', target: 200 },
                { duration: '1m', target: 0 },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        'http_req_duration{group:webhook-ingest}': ['p(95)<500', 'p(99)<1000'],
    },
};

export default function () {
    const sequence = `${__VU}-${__ITER}`;
    const response = http.post(
        `${runtime.coreBaseUrl}/webhooks/whatsapp`,
        JSON.stringify(buildWebhookPayload(sequence, '1')),
        {
            headers: buildJsonHeaders(),
            tags: { group: 'webhook-ingest', endpoint: 'whatsapp_webhook' },
        },
    );

    check(response, {
        'webhook accepted': (res) => res.status >= 200 && res.status < 300,
    });

    sleep(1);
}

