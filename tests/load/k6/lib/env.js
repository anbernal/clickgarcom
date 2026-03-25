import { randomSeed } from 'k6';

randomSeed(Date.now());

export const runtime = {
    tenantAdminBaseUrl: normalizeBaseUrl(__ENV.TENANT_ADMIN_BASE_URL || 'http://localhost:3002/admin/api'),
    superAdminBaseUrl: normalizeBaseUrl(__ENV.SUPER_ADMIN_BASE_URL || 'http://localhost:3005/admin/api/super-admin'),
    coreBaseUrl: normalizeBaseUrl(__ENV.CORE_BASE_URL || 'http://localhost:8080'),
    kdsWsUrl: String(__ENV.KDS_WS_URL || 'ws://localhost:8080/ws/kds').trim(),
    tenantEmail: String(__ENV.TENANT_EMAIL || '').trim(),
    tenantPassword: String(__ENV.TENANT_PASSWORD || '').trim(),
    tenantId: String(__ENV.TENANT_ID || '').trim(),
    superAdminOperator: String(__ENV.SUPER_ADMIN_OPERATOR || 'stress-local').trim(),
    superAdminPassword: String(__ENV.SUPER_ADMIN_PASSWORD || '').trim(),
    businessPhoneNumberId: String(__ENV.WHATSAPP_BUSINESS_PHONE_NUMBER_ID || '5511999999999').trim(),
    userPhonePrefix: String(__ENV.WHATSAPP_USER_PHONE_PREFIX || '551199900').trim(),
};

export function requireRuntimeValue(value, name) {
    if (!String(value || '').trim()) {
        throw new Error(`Missing required env: ${name}`);
    }
    return String(value).trim();
}

export function buildJsonHeaders(token) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

export function randomPhone() {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${runtime.userPhonePrefix}${suffix}`;
}

export function buildWebhookPayload(sequence, bodyText) {
    const from = randomPhone();
    return {
        object: 'whatsapp_business_account',
        entry: [
            {
                changes: [
                    {
                        value: {
                            metadata: {
                                business_phone_number_id: runtime.businessPhoneNumberId,
                            },
                            messages: [
                                {
                                    id: `wamid.stress.${sequence}.${Date.now()}`,
                                    from,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: 'text',
                                    text: {
                                        body: bodyText,
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
}

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

