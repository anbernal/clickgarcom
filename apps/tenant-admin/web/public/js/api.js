// ClickGarçom Admin — API Client
const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const API_BASE = String(runtimeConfig.apiBaseUrl || '/admin/api').replace(/\/+$/, '');
const LOGIN_PAGE_PATH = String(runtimeConfig.loginPagePath || '/login.html').trim() || '/login.html';

// Retrieve Auth Session
let authSession = null;
try {
    const local = localStorage.getItem('clickgarcom_auth');
    const session = sessionStorage.getItem('clickgarcom_auth');
    if (local) authSession = JSON.parse(local);
    else if (session) authSession = JSON.parse(session);
} catch (e) {
    console.error('Session parse error', e);
}

// Global Redirect if no session exists and not on login/register page
if (!authSession && !window.location.pathname.includes('.html') && window.location.pathname !== LOGIN_PAGE_PATH && window.location.pathname !== '/register.html') {
    window.location.href = LOGIN_PAGE_PATH;
}

// Parse JWT payload (to get tenant_id)
let TENANT_ID = null;
if (authSession?.token) {
    try {
        const payloadB64 = authSession.token.split('.')[1];
        const payload = JSON.parse(atob(payloadB64));
        TENANT_ID = payload.tenant_id;
    } catch (e) {
        console.error('JWT parse error', e);
    }
}

const TENANT_ROLE_ALIASES = {
    ADMINISTRATOR: 'ADMIN',
    GERENTE: 'MANAGER',
    MANAGER: 'MANAGER',
    WAITER: 'WAITER',
    ATENDENTE: 'WAITER',
    SALAO: 'WAITER',
    GARCOM: 'WAITER',
    'GARÇOM': 'WAITER',
    KITCHEN: 'KITCHEN',
    COZINHA: 'KITCHEN',
    BAR: 'BAR',
    CASHIER: 'CASHIER',
    CAIXA: 'CASHIER',
    DRIVER: 'DRIVER',
    ENTREGADOR: 'DRIVER',
    DISPATCHER: 'DISPATCHER',
    DESPACHANTE: 'DISPATCHER',
};

const TENANT_ROUTE_GROUPS = {
    full_access: ['ADMIN', 'MANAGER'],
    menu_read: ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR', 'CASHIER'],
    menu_write: ['ADMIN', 'MANAGER'],
    order_read_write: ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR'],
    order_cancel: ['ADMIN', 'MANAGER', 'WAITER'],
    table_read: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    tab_operations: ['ADMIN', 'MANAGER', 'WAITER'],
    table_write: ['ADMIN', 'MANAGER'],
    floor_operations: ['ADMIN', 'MANAGER', 'WAITER'],
    settlement: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    reports: ['ADMIN', 'MANAGER'],
    wallet: ['ADMIN', 'MANAGER'],
    bot_config: ['ADMIN', 'MANAGER'],
    purchases: ['ADMIN', 'MANAGER'],
    delivery_read: ['ADMIN', 'MANAGER', 'WAITER', 'DISPATCHER'],
    delivery_dispatch: ['ADMIN', 'MANAGER', 'WAITER', 'DISPATCHER'],
    delivery_settings: ['ADMIN', 'MANAGER'],
    delivery_override: ['ADMIN', 'MANAGER'],
    delivery_reports: ['ADMIN', 'MANAGER'],
    fleet_read: ['ADMIN', 'MANAGER', 'DISPATCHER'],
    fleet_write: ['ADMIN', 'MANAGER'],
    retail_read: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'DISPATCHER'],
    retail_write: ['ADMIN', 'MANAGER'],
    retail_fulfillment: ['ADMIN', 'MANAGER', 'WAITER', 'DISPATCHER'],
};

const TENANT_PAGE_ACCESS = {
    dashboard: ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR', 'CASHIER'],
    wallet: TENANT_ROUTE_GROUPS.wallet,
    extratoMensagens: TENANT_ROUTE_GROUPS.wallet,
    pedidos: TENANT_ROUTE_GROUPS.order_read_write,
    cardapio: TENANT_ROUTE_GROUPS.menu_read,
    categorias: TENANT_ROUTE_GROUPS.menu_read,
    comandas: TENANT_ROUTE_GROUPS.table_read,
    mesas: TENANT_ROUTE_GROUPS.table_read,
    pagamentos: TENANT_ROUTE_GROUPS.settlement,
    vendas: TENANT_ROUTE_GROUPS.reports,
    compras: TENANT_ROUTE_GROUPS.purchases,
    configuracoes: TENANT_ROUTE_GROUPS.full_access,
    equipe: TENANT_ROUTE_GROUPS.full_access,
    delivery: TENANT_ROUTE_GROUPS.delivery_read,
    fleet: TENANT_ROUTE_GROUPS.fleet_read,
    retailOverview: TENANT_ROUTE_GROUPS.retail_read,
    retailProducts: TENANT_ROUTE_GROUPS.retail_read,
    retailInventory: TENANT_ROUTE_GROUPS.retail_read,
    retailPicking: TENANT_ROUTE_GROUPS.retail_fulfillment,
    retailOrders: TENANT_ROUTE_GROUPS.retail_read,
};

// Visibility is not enough: an old browser tab, bookmark or cached session may
// still call navigate('comandas'). Keep the module boundary at the client API
// layer as well, while the backend remains the authorization source of truth.
const FOOD_SERVICE_PAGES = new Set(['dashboard', 'pedidos', 'cardapio', 'categorias', 'comandas', 'mesas']);
const RETAIL_PAGES = new Set(['retailOverview', 'retailProducts', 'retailInventory', 'retailPicking', 'retailOrders']);
const DELIVERY_PAGES = new Set(['delivery', 'fleet']);

function normalizeTenantUserRole(role) {
    const normalized = String(role || '').trim().toUpperCase();
    return TENANT_ROLE_ALIASES[normalized] || normalized;
}

function getStoredAuthContainer() {
    if (localStorage.getItem('clickgarcom_auth')) {
        return localStorage;
    }

    if (sessionStorage.getItem('clickgarcom_auth')) {
        return sessionStorage;
    }

    return null;
}

function persistAuthSession() {
    const storage = getStoredAuthContainer();
    if (!storage || !authSession) {
        return;
    }

    storage.setItem('clickgarcom_auth', JSON.stringify(authSession));
}

function buildFallbackPermissions(role) {
    const normalizedRole = normalizeTenantUserRole(role);
    const routeGroups = Object.entries(TENANT_ROUTE_GROUPS)
        .filter(([, roles]) => roles.includes(normalizedRole))
        .map(([key]) => key);
    const pages = Object.entries(TENANT_PAGE_ACCESS)
        .filter(([, roles]) => roles.includes(normalizedRole))
        .map(([pageId]) => pageId);
    const deliveryActionEnabled = getCurrentUser()?.delivery_enabled === true;
    const attendanceActionEnabled = getCurrentUser()?.attendance_enabled !== false;

    return {
        pages,
        routeGroups,
        actions: {
            manageUsers: routeGroups.includes('full_access'),
            manageSettings: routeGroups.includes('full_access'),
            toggleTenantStatus: routeGroups.includes('full_access'),
            manageMenu: routeGroups.includes('menu_write'),
            manageOrders: routeGroups.includes('order_read_write'),
            cancelOrders: routeGroups.includes('order_cancel'),
            manageTables: attendanceActionEnabled && routeGroups.includes('table_write'),
            manageTabs: attendanceActionEnabled && routeGroups.includes('tab_operations'),
            viewAttendance: attendanceActionEnabled && routeGroups.includes('floor_operations'),
            manageAttendance: attendanceActionEnabled && routeGroups.includes('floor_operations'),
            manageSettlement: routeGroups.includes('settlement'),
            manageClosedTabs: routeGroups.includes('full_access'),
            viewReports: routeGroups.includes('reports'),
            viewWallet: routeGroups.includes('wallet'),
            managePurchases: routeGroups.includes('purchases'),
            manageDeliveries: deliveryActionEnabled && routeGroups.includes('delivery_dispatch'),
            manageDeliverySettings: deliveryActionEnabled && routeGroups.includes('delivery_settings'),
            overrideDelivery: deliveryActionEnabled && routeGroups.includes('delivery_override'),
            viewDeliveryReports: deliveryActionEnabled && routeGroups.includes('delivery_reports'),
            viewFleet: deliveryActionEnabled && routeGroups.includes('fleet_read'),
            manageFleet: deliveryActionEnabled && routeGroups.includes('fleet_write'),
            viewRetail: routeGroups.includes('retail_read'),
            manageRetailCatalog: routeGroups.includes('retail_write'),
            manageRetailInventory: routeGroups.includes('retail_write'),
            manageRetailFulfillment: routeGroups.includes('retail_fulfillment'),
        },
    };
}

function getCurrentUser() {
    return authSession?.user || null;
}

function getCurrentUserRole() {
    return normalizeTenantUserRole(getCurrentUser()?.role);
}

function getCurrentUserPermissions() {
    const storedPermissions = getCurrentUser()?.permissions;
    const fallbackPermissions = buildFallbackPermissions(getCurrentUserRole());
    if (storedPermissions && Array.isArray(storedPermissions.pages)) {
        const merged = {
            ...fallbackPermissions,
            ...storedPermissions,
            pages: Array.from(new Set([
                ...(fallbackPermissions.pages || []),
                ...(storedPermissions.pages || []),
            ])),
            routeGroups: Array.from(new Set([
                ...(fallbackPermissions.routeGroups || []),
                ...(storedPermissions.routeGroups || []),
            ])),
            actions: {
                ...fallbackPermissions.actions,
                ...(storedPermissions.actions || {}),
            },
        };
        // The navigation remains visible while the module is unavailable,
        // but operational delivery actions must stay disabled until the
        // Super Admin activates it for this tenant.
        if (getCurrentUser()?.delivery_enabled !== true) {
            Object.keys(merged.actions || {})
                .filter((key) => key.toLowerCase().includes('delivery'))
                .forEach((key) => { merged.actions[key] = false; });
        }
        if (getCurrentUser()?.attendance_enabled === false) {
            Object.keys(merged.actions || {})
                .filter((key) => ['attendance', 'table', 'tab'].some((token) => key.toLowerCase().includes(token)))
                .forEach((key) => { merged.actions[key] = false; });
        }
        return merged;
    }

    return fallbackPermissions;
}

function canAccessRouteGroup(routeGroup) {
    return getCurrentUserPermissions().routeGroups?.includes(routeGroup);
}

function canAccessPage(pageId) {
    const user = getCurrentUser() || {};
    if (FOOD_SERVICE_PAGES.has(pageId) && user.attendance_enabled === false) {
        return false;
    }
    if (RETAIL_PAGES.has(pageId) && !isRetailModuleEnabledForNavigation(user)) {
        return false;
    }
    if (DELIVERY_PAGES.has(pageId) && user.delivery_enabled !== true) {
        return false;
    }
    // The delivery driver uses the dedicated mobile workflow; a stale session
    // must never retain access to the administrative dispatch board.
    if (['delivery', 'fleet'].includes(pageId) && getCurrentUserRole() === 'DRIVER') {
        return false;
    }
    return getCurrentUserPermissions().pages?.includes(pageId);
}

function isRetailModuleEnabledForNavigation(user) {
    if (typeof user?.retail_enabled === 'boolean') {
        return user.retail_enabled;
    }
    if (new URLSearchParams(window.location.search).has('retail-preview')) {
        return true;
    }
    return ['MARKET', 'PHARMACY'].includes(String(user?.establishment_type || user?.establishmentType || '').toUpperCase());
}

function canPerformAction(actionKey) {
    return !!getCurrentUserPermissions().actions?.[actionKey];
}

function setAuthSessionUser(user) {
    if (!authSession) {
        return;
    }

    authSession = {
        ...authSession,
        user: {
            ...(authSession.user || {}),
            ...(user || {}),
        },
    };
    persistAuthSession();
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': authSession ? `Bearer ${authSession.token}` : ''
    };
}

async function handleResponse(res) {
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('clickgarcom_auth');
        sessionStorage.removeItem('clickgarcom_auth');
        window.location.href = LOGIN_PAGE_PATH;
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!res.ok) {
        let errorMessage = `API Error: ${res.status}`;

        try {
            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                const payload = await res.json();
                errorMessage = String(
                    payload?.message
                    || payload?.error
                    || payload?.details
                    || errorMessage
                );
            } else {
                const text = (await res.text()).trim();
                if (text) {
                    errorMessage = text;
                }
            }
        } catch (error) {
            console.error('API error parse failed', error);
        }

        throw new Error(errorMessage);
    }

    return res.json();
}

function extractFilenameFromDisposition(disposition) {
    const match = String(disposition || '').match(/filename="([^"]+)"/i);
    return match?.[1] || null;
}

async function handleDownloadResponse(res) {
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('clickgarcom_auth');
        sessionStorage.removeItem('clickgarcom_auth');
        window.location.href = LOGIN_PAGE_PATH;
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
    }

    return {
        blob: await res.blob(),
        filename: extractFilenameFromDisposition(res.headers.get('content-disposition')),
    };
}

const api = {
    async get(path, params = {}) {
        const url = new URL(API_BASE + path, window.location.origin);
        if (TENANT_ID) url.searchParams.set('tenant_id', TENANT_ID);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, v);
        });
        const res = await fetch(url, { headers: { 'Authorization': getAuthHeaders().Authorization } });
        return handleResponse(res);
    },

    async post(path, body = {}, options = {}) {
        const finalBody = { ...body };
        if (TENANT_ID && !finalBody.tenant_id) finalBody.tenant_id = TENANT_ID;

        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { ...getAuthHeaders(), ...(options.headers || {}) },
            body: JSON.stringify(finalBody),
        });
        return handleResponse(res);
    },

    async put(path, body, options = {}) {
        const res = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), ...(options.headers || {}) },
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async patch(path, body) {
        const res = await fetch(API_BASE + path, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async delete(path, options = {}) {
        const res = await fetch(API_BASE + path, {
            method: 'DELETE',
            headers: { 'Authorization': getAuthHeaders().Authorization, ...(options.headers || {}) }
        });
        return handleResponse(res);
    },

    async command(path, body = {}, idempotencyKey) {
        const key = idempotencyKey || (window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        return this.post(path, body, { headers: { 'Idempotency-Key': key } });
    },

    async download(path, params = {}) {
        const url = new URL(API_BASE + path, window.location.origin);
        if (TENANT_ID) url.searchParams.set('tenant_id', TENANT_ID);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, v);
        });
        const res = await fetch(url, {
            headers: { 'Authorization': getAuthHeaders().Authorization }
        });
        return handleDownloadResponse(res);
    },
};

// Security: Escape HTML to prevent XSS
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Toast notifications
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Format currency
function formatCurrency(value) {
    return `R$${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

// Format date
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Format time
function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Status label mapping
function statusLabel(status) {
    const map = {
        PENDING: 'Pendente',
        ACCEPTED: 'Em preparo',
        READY: 'Pronto',
        DELIVERED: 'Entregue',
        CANCELED: 'Cancelado',
    };
    return map[status] || status;
}

function statusClass(status) {
    const map = {
        PENDING: 'status-pending',
        ACCEPTED: 'status-prep',
        READY: 'status-done',
        DELIVERED: 'status-done',
        CANCELED: 'status-canceled',
    };
    return map[status] || '';
}

// Generate gradient for avatars
const gradients = [
    'linear-gradient(135deg, #f97316, #dc2626)',
    'linear-gradient(135deg, #8b5cf6, #3b82f6)',
    'linear-gradient(135deg, #1abc9c, #0891b2)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #ec4899, #8b5cf6)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)',
];

function getGradient(index) {
    return gradients[index % gradients.length];
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}
