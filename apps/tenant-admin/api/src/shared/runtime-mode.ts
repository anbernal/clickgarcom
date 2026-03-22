export function isAdminWebEnabled() {
    const raw = String(process.env.ADMIN_WEB_ENABLED || 'true').trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function resolveAdminRuntimeMode() {
    return isAdminWebEnabled() ? 'hybrid' : 'api';
}
