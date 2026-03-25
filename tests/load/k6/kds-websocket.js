import { check, sleep } from 'k6';
import ws from 'k6/ws';

import { loginTenant } from './lib/auth.js';
import { requireRuntimeValue, runtime } from './lib/env.js';

export const options = {
    scenarios: {
        kds_ws_connections: {
            executor: 'ramping-vus',
            startVUs: 5,
            stages: [
                { duration: '1m', target: 25 },
                { duration: '2m', target: 100 },
                { duration: '2m', target: 200 },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        checks: ['rate>0.95'],
        ws_connecting: ['p(95)<1000'],
    },
};

export function setup() {
    const tenant = loginTenant();
    tenant.tenantId = requireRuntimeValue(tenant.tenantId || runtime.tenantId, 'TENANT_ID');
    return tenant;
}

export default function (data) {
    const url = `${runtime.kdsWsUrl}?tenant_id=${encodeURIComponent(data.tenantId)}&token=${encodeURIComponent(data.token)}`;

    const response = ws.connect(url, { tags: { group: 'kds-websocket' } }, (socket) => {
        socket.on('open', () => {
            socket.setTimeout(() => socket.close(), 15000);
        });

        socket.on('message', () => {
            // noop: interested in connection stability and event delivery pressure
        });

        socket.on('error', () => {
            socket.close();
        });
    });

    check(response, {
        'ws status 101': (res) => res && res.status === 101,
    });

    sleep(1);
}

