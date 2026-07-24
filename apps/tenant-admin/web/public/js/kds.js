// ─── CONFIG ────────────────────────────────────────────────────
const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const loginPagePath = String(runtimeConfig.loginPagePath || '/login.html').trim() || '/login.html';

const CONFIG = {
  API_URL: String(runtimeConfig.apiBaseUrl || '/admin/api').replace(/\/+$/, ''),
  WS_URL: resolveWebSocketUrl(),
  TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
  TENANT_NAME: 'ClickGarcom',
  POLL_INTERVAL: 15000,
  URGENT_MINUTES: 10,
  WARNING_MINUTES: 5,
};

// ─── SVG ICONS ─────────────────────────────────────────────────
const KDS_ICONS = {
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  fire: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  package: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  wall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  chair: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z"/><path d="M5 16V9h14v7"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  bill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  timer: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};

const DEFAULT_ORDER_SLA = {
  pending: { warningMinutes: 3, criticalMinutes: 5, label: 'Aceite' },
  accepted: { warningMinutes: 12, criticalMinutes: 20, label: 'Preparo' },
  ready: { warningMinutes: 4, criticalMinutes: 8, label: 'Entrega' },
};

const DEFAULT_ORDER_STATION_SLA = {
  ATTENDANCE: {
    pending: DEFAULT_ORDER_SLA.pending,
    accepted: DEFAULT_ORDER_SLA.accepted,
    ready: DEFAULT_ORDER_SLA.ready,
  },
  KITCHEN: {
    pending: DEFAULT_ORDER_SLA.pending,
    accepted: DEFAULT_ORDER_SLA.accepted,
    ready: DEFAULT_ORDER_SLA.ready,
  },
  BAR: {
    pending: DEFAULT_ORDER_SLA.pending,
    accepted: { warningMinutes: 8, criticalMinutes: 14, label: 'Preparo' },
    ready: DEFAULT_ORDER_SLA.ready,
  },
};

function resolveWebSocketUrl() {
  const configuredWs = String(runtimeConfig.kdsWsUrl || '').trim();
  if (configuredWs) return configuredWs;

  const query = new URLSearchParams(window.location.search);
  const queryWs = query.get('ws_url');
  if (queryWs) return queryWs;

  const savedWs = localStorage.getItem('clickgarcom_ws_url');
  if (savedWs) return savedWs;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isLocal) {
    return `${protocol}//${host}:8080/ws/kds`;
  }

  return `${protocol}//${window.location.host}/ws/kds`;
}

// ─── AUTHENTICATION ────────────────────────────────────────────
let authSession = null;
try {
  const local = localStorage.getItem('clickgarcom_auth');
  const session = sessionStorage.getItem('clickgarcom_auth');
  if (local) authSession = JSON.parse(local);
  else if (session) authSession = JSON.parse(session);
} catch (e) {
  console.error('Session parse error', e);
}

// Global Redirect if no session exists
if (!authSession) {
  window.location.href = loginPagePath;
}

if (authSession?.token) {
  try {
    const payloadB64 = authSession.token.split('.')[1];
    const payload = JSON.parse(atob(payloadB64));
    CONFIG.TENANT_ID = payload.tenant_id;
    CONFIG.TENANT_NAME = String(
      authSession?.user?.tenant_name ||
      authSession?.user?.tenantName ||
      payload?.tenant_name ||
      payload?.tenantName ||
      CONFIG.TENANT_NAME
    ).trim() || CONFIG.TENANT_NAME;
  } catch (e) {
    console.error('JWT parse error', e);
  }
}

// ─── STATE ─────────────────────────────────────────────────────
let allOrders = {};  // id -> order
let activePanel = 'kitchen';
let modalState = { orderId: null, tab: 'accept' };
let ws = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let pollTimer = null;
let timerInterval = null;
let recentWSEventKeys = new Map();
let menuItemNameById = new Map();
let menuItemMetaById = new Map();
let pendingRequests = [];
let availableTables = [];
let tablesSnapshot = [];
let tableMetrics = { total: 0, available: 0, occupied: 0 };
let tabMetaById = new Map();
let assignModalState = { requestId: null, selectedTableId: null };
let requestRejectState = { requestId: null };
let waiterChats = [];
let waiterChatMessagesById = new Map();
let activeWaiterChatId = null;
let closeBillRequests = [];
let operationsSummary = null;
const PANEL_ORDER = ['kitchen', 'bar', 'salao'];
const SALAO_STATS_CARD_DEFINITIONS = [
  {
    key: 'availableTables',
    label: 'Mesas Livres',
    icon: KDS_ICONS.chair,
    iconBackground: 'var(--green-bg)',
    iconColor: 'var(--green)',
    valueColor: 'var(--green)',
  },
  {
    key: 'readyOrders',
    label: 'Prontos p/ Entrega',
    icon: KDS_ICONS.check,
    iconBackground: 'var(--green-bg)',
    iconColor: 'var(--green)',
    valueColor: 'var(--green)',
  },
  {
    key: 'pendingRequests',
    label: 'Aguardando',
    icon: KDS_ICONS.phone,
    iconBackground: 'var(--yellow-bg)',
    iconColor: 'var(--yellow)',
    valueColor: '#8a6e00',
  },
  {
    key: 'openChats',
    label: 'WhatsApp',
    icon: KDS_ICONS.chat,
    iconBackground: 'var(--blue-bg)',
    iconColor: 'var(--blue)',
    valueColor: 'var(--blue)',
  },
  {
    key: 'closeBillRequests',
    label: 'Fechando Conta',
    icon: KDS_ICONS.bill,
    iconBackground: 'var(--red-bg)',
    iconColor: 'var(--red)',
    valueColor: 'var(--red)',
  },
];
const STATION_STATS_CARD_KEYS = ['pending', 'accepted', 'ready', 'total', 'delayed', 'avgPreparation', 'bottleneck'];
const KDS_ROLE_ALIASES = {
  ADMINISTRATOR: 'ADMIN',
  ADMIN: 'ADMIN',
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
};
const KDS_SYNC_CHANNEL_NAME = 'clickgarcom-kds-sync';
const KDS_SYNC_STORAGE_KEY = 'clickgarcom_kds_sync_event';
const KDS_SYNC_SOURCE_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let kdsSyncChannel = null;

function resolveInitialPanel() {
  return KDS_ACCESS.defaultPanel;
}

function normalizeKdsRole(role) {
  const normalized = String(role || '').trim().toUpperCase();
  return KDS_ROLE_ALIASES[normalized] || normalized;
}

function getCurrentKdsRole() {
  return normalizeKdsRole(authSession?.user?.role);
}

function resolveRequestedPanel(panel) {
  const normalized = String(panel || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'attendance' || normalized === 'atendimento' || normalized === 'salao' || normalized === 'salão') return 'salao';
  if (normalized === 'kitchen' || normalized === 'cozinha') return 'kitchen';
  if (normalized === 'bar') return 'bar';
  return null;
}

function getPanelsAllowedForRole(role) {
  if (role === 'KITCHEN') return ['kitchen'];
  if (role === 'BAR') return ['bar'];
  if (role === 'WAITER' || role === 'ADMIN' || role === 'MANAGER') return [...PANEL_ORDER];
  return [];
}

function buildKdsAccess() {
  const role = getCurrentKdsRole();
  const requestedPanel = resolveRequestedPanel(new URLSearchParams(window.location.search).get('panel'));
  const rolePanels = getPanelsAllowedForRole(role);
  const hasFullKdsAccess = ['ADMIN', 'MANAGER'].includes(role);
  const availablePanels = hasFullKdsAccess
    ? rolePanels
    : (requestedPanel && rolePanels.includes(requestedPanel)
      ? [requestedPanel]
      : rolePanels);
  const defaultPanel = requestedPanel && rolePanels.includes(requestedPanel)
    ? requestedPanel
    : (availablePanels[0] || 'kitchen');

  return {
    role,
    requestedPanel,
    availablePanels,
    defaultPanel,
    canViewSalao: rolePanels.includes('salao'),
    canLoadTables: ['ADMIN', 'MANAGER', 'WAITER'].includes(role),
  };
}

function applyKdsPanelAccess() {
  const allowedPanels = new Set(KDS_ACCESS.availablePanels);

  document.querySelectorAll('[data-panel]').forEach((element) => {
    element.style.display = allowedPanels.has(element.dataset.panel) ? '' : 'none';
  });

  document.querySelectorAll('.screen-panel').forEach((panel) => {
    const panelName = String(panel.id || '').replace('panel-', '');
    panel.style.display = allowedPanels.has(panelName) ? '' : 'none';
  });
}

const KDS_ACCESS = buildKdsAccess();

function initKdsRealtimeSync() {
  if ('BroadcastChannel' in window) {
    kdsSyncChannel = new BroadcastChannel(KDS_SYNC_CHANNEL_NAME);
    kdsSyncChannel.onmessage = (message) => handleKdsSyncEvent(message?.data);
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== KDS_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      handleKdsSyncEvent(JSON.parse(event.newValue));
    } catch (error) {
      console.warn('KDS sync storage parse error:', error);
    }
  });
}

function broadcastKdsSync(reason) {
  const tenantId = String(CONFIG.TENANT_ID || '').trim();
  if (!tenantId) return;

  const payload = {
    type: 'refresh',
    tenantId,
    reason: String(reason || 'kds.action'),
    sourceId: KDS_SYNC_SOURCE_ID,
    timestamp: new Date().toISOString(),
  };

  if (kdsSyncChannel) {
    kdsSyncChannel.postMessage(payload);
  }

  try {
    localStorage.setItem(KDS_SYNC_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(KDS_SYNC_STORAGE_KEY);
  } catch (error) {
    console.warn('KDS sync storage write error:', error);
  }
}

function handleKdsSyncEvent(event) {
  if (!event || event.type !== 'refresh') return;
  if (String(event.sourceId || '') === KDS_SYNC_SOURCE_ID) return;
  if (String(event.tenantId || '').trim() !== String(CONFIG.TENANT_ID || '').trim()) return;
  refreshKdsRealtimeState();
}

function refreshKdsRealtimeState() {
  loadOrders();
  if (KDS_ACCESS.canViewSalao) {
    loadPendingRequests();
    loadWaiterChats();
    loadCloseRequests();
  }
  if (KDS_ACCESS.canLoadTables) {
    loadTableState();
  }
}

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initKdsRealtimeSync();
  applyKdsPanelAccess();
  switchPanel(resolveInitialPanel());
  applySidebarTenantName();
  startClock();
  loadMenuItems().finally(() => {
    loadOrders().then(() => {
      connectWebSocket();
      startTimerUpdates();
    });
  });
  const startupTasks = [];
  if (KDS_ACCESS.canViewSalao) {
    startupTasks.push(loadPendingRequests(), loadWaiterChats(), loadCloseRequests());
  }
  if (KDS_ACCESS.canLoadTables) {
    startupTasks.push(loadTableState());
  }
  Promise.all(startupTasks);

  if (KDS_ACCESS.canViewSalao || KDS_ACCESS.canLoadTables) {
    setInterval(() => {
      if (KDS_ACCESS.canViewSalao) {
        loadPendingRequests();
      }
      if (KDS_ACCESS.canLoadTables) {
        loadTableState();
      }
    }, 10000);
  }
  if (KDS_ACCESS.canViewSalao) {
    setInterval(() => {
      loadWaiterChats();
    }, 3000);
    setInterval(() => {
      loadCloseRequests();
    }, 5000);
    setInterval(() => {
      if (activeWaiterChatId) {
        loadWaiterChatMessages(activeWaiterChatId);
      }
    }, 2000);
  }
});

function applySidebarTenantName() {
  const el = document.querySelector('.sidebar-logo');
  if (!el) return;

  const tenantName = String(CONFIG.TENANT_NAME || '').trim();
  if (!tenantName || tenantName.toLowerCase() === 'clickgarcom') return;

  const parts = tenantName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    el.textContent = tenantName;
    return;
  }

  const first = escapeHTML(parts.shift());
  const rest = escapeHTML(parts.join(' '));
  el.innerHTML = `${first}<span>${rest}</span>`;
}

async function loadMenuItems() {
  try {
    const data = await apiGet('/menu');
    const items = Array.isArray(data) ? data : [];
    menuItemMetaById = new Map(
      items
        .filter((item) => item && item.id)
        .map((item) => [String(item.id), item])
    );
    menuItemNameById = new Map(
      items
        .filter((item) => item && item.id && item.name)
        .map((item) => [String(item.id), String(item.name)])
    );
  } catch (e) {
    console.warn('Failed to load menu items for KDS labels:', e);
    menuItemNameById = new Map();
    menuItemMetaById = new Map();
  }
}

function resolveItemName(item) {
  const directName = String(
    item?.menu_item_name ||
    item?.menuItemName ||
    item?.name ||
    item?.menuItem?.name ||
    ''
  ).trim();
  if (directName) return directName;

  const menuItemId = item?.menu_item_id || item?.menuItemId || '';
  if (menuItemId && menuItemNameById.has(menuItemId)) {
    return String(menuItemNameById.get(menuItemId));
  }

  if (menuItemId) return shortId(menuItemId);
  return 'Item';
}

function formatComboComponentsSummary(comboComponents) {
  const list = Array.isArray(comboComponents) ? comboComponents : [];
  const parts = list
    .map((component) => {
      const name = String(component?.menuItemName || component?.menu_item_name || '').trim();
      const quantity = Number(component?.quantity || 0);
      if (!name) return '';
      return quantity > 1 ? `${quantity}x ${name}` : name;
    })
    .filter(Boolean);
  return parts.length ? `Combo: ${parts.join(', ')}` : '';
}

function resolveComboSummary(item) {
  const menuItemId = String(item?.menu_item_id || item?.menuItemId || '').trim();
  if (!menuItemId || !menuItemMetaById.has(menuItemId)) return '';
  return formatComboComponentsSummary(menuItemMetaById.get(menuItemId)?.comboComponents);
}

// ─── API ───────────────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(`${CONFIG.API_URL}${path}`, {
    headers: { 'Authorization': authSession ? `Bearer ${authSession.token}` : '' }
  });
  if (r.status === 401 || r.status === 403) window.location.href = loginPagePath;
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function apiPatch(path, body) {
  const r = await fetch(`${CONFIG.API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authSession ? `Bearer ${authSession.token}` : ''
    },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) window.location.href = loginPagePath;
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `API ${r.status}`);
  }
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${CONFIG.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authSession ? `Bearer ${authSession.token}` : ''
    },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401 || r.status === 403) window.location.href = loginPagePath;
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.message || `API ${r.status}`);
  }
  return r.json().catch(() => ({}));
}

async function loadOrders() {
  try {
    const [data, summary] = await Promise.all([
      apiGet(`/orders?tenant_id=${CONFIG.TENANT_ID}&status=PENDING,ACCEPTED,READY`),
      apiGet(`/orders/operations/summary?tenant_id=${CONFIG.TENANT_ID}`).catch(() => null),
    ]);
    const orders = Array.isArray(data) ? data : (data.orders || []);
    operationsSummary = summary;
    allOrders = {};
    orders.forEach((order) => {
      const normalized = normalizeOrder(order);
      allOrders[normalized.id] = normalized;
    });
    renderAll();
  } catch (e) {
    console.error('Failed to load orders:', e);
    toast('t-error', '❌ Erro', 'Falha ao carregar pedidos');
  }
}

async function refreshOperationsSummary(shouldRender = true) {
  try {
    const summary = await apiGet(`/orders/operations/summary?tenant_id=${CONFIG.TENANT_ID}`);
    operationsSummary = summary;
    if (shouldRender) {
      renderAll();
    }
  } catch (e) {
    console.warn('Failed to refresh operations summary:', e);
  }
}

// ─── WEBSOCKET ─────────────────────────────────────────────────
function connectWebSocket() {
  if (ws && ws.readyState <= 1) return;
  const tokenParam = authSession ? `&token=${authSession.token}` : '';
  const url = `${CONFIG.WS_URL}?tenant_id=${CONFIG.TENANT_ID}${tokenParam}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    wsReconnectDelay = 1000;
    setConnectionStatus(true);
    stopPolling();
  };

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleWSEvent(event);
    } catch (err) {
      console.warn('WS parse error:', err);
    }
  };

  ws.onclose = () => {
    setConnectionStatus(false);
    scheduleReconnect();
    startPolling();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(() => {
    connectWebSocket();
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
  }, wsReconnectDelay);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadOrders, CONFIG.POLL_INTERVAL);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function setConnectionStatus(online) {
  const el = document.getElementById('ws-status');
  const txt = el.querySelector('.status-text');
  if (online) {
    el.classList.remove('offline');
    txt.textContent = 'Sistema online';
  } else {
    el.classList.add('offline');
    txt.textContent = 'Reconectando…';
  }
}

function shouldHandleWSEvent(event) {
  const type = String(event?.type || '').trim();
  if (!type || type === 'connected') return true;

  const eventKey = [
    type,
    String(event?.tenant_id || ''),
    String(event?.timestamp || ''),
    String(event?.data?.id || ''),
    String(event?.data?.status || ''),
  ].join('|');

  const now = Date.now();
  for (const [key, expiresAt] of recentWSEventKeys.entries()) {
    if (expiresAt <= now) {
      recentWSEventKeys.delete(key);
    }
  }

  const existing = recentWSEventKeys.get(eventKey);
  if (existing && existing > now) {
    return false;
  }

  recentWSEventKeys.set(eventKey, now + 10000);
  return true;
}

function handleWSEvent(event) {
  if (event.type === 'connected') return;
  if (!shouldHandleWSEvent(event)) return;

  if (event.type === 'order.created') {
    const order = normalizeOrder(event.data);
    allOrders[order.id] = order;
    renderAll();
    refreshOperationsSummary();
    playNotificationSound();
    toast('t-info', '🆕 Novo Pedido', `#${getOrderDisplayCode(order)} · ${order.destination}`);
  }

  if (event.type === 'order.status_changed') {
    const order = normalizeOrder(event.data);
    if (order.status === 'DELIVERED' || order.status === 'CANCELED') {
      delete allOrders[order.id];
    } else {
      allOrders[order.id] = order;
    }
    renderAll();
    refreshOperationsSummary();
  }
}

// ─── RENDER ────────────────────────────────────────────────────
function renderAll() {
  renderCurrentPanel();
  updateNavBadges();
}

function renderCurrentPanel() {
  if (activePanel === 'bar') {
    renderPanel('bar', 'BAR');
    return;
  }
  if (activePanel === 'salao') {
    renderSalao();
    return;
  }
  renderPanel('kitchen', 'KITCHEN');
}

function renderPanel(panel, destination) {
  const orders = Object.values(allOrders).filter(o => o.destination === destination);
  const pending = orders.filter(o => o.status === 'PENDING');
  const accepted = orders.filter(o => o.status === 'ACCEPTED');
  const ready = orders.filter(o => o.status === 'READY');
  const stationSummary = getStationOperations(destination);

  const prefix = panel === 'kitchen' ? 'k' : 'b';
  renderColumn(`col-${prefix}-pending`, pending, 'PENDING');
  renderColumn(`col-${prefix}-accepted`, accepted, 'ACCEPTED');
  renderColumn(`col-${prefix}-ready`, ready, 'READY');

  document.getElementById(`cc-${prefix}-pending`).textContent = pending.length;
  document.getElementById(`cc-${prefix}-accepted`).textContent = accepted.length;
  document.getElementById(`cc-${prefix}-ready`).textContent = ready.length;

  renderStats(`stats-${panel}`, pending.length, accepted.length, ready.length, destination, stationSummary);
}

function renderColumn(containerId, orders, status) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const existing = new Set();
  orders.forEach(o => existing.add(o.id));

  // Remove cards no longer present
  container.querySelectorAll('.order-card').forEach(card => {
    if (!existing.has(card.dataset.id)) {
      card.style.animation = 'fadeIn 0.3s ease reverse';
      setTimeout(() => card.remove(), 300);
    }
  });

  // Add/update cards
  orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  orders.forEach(o => {
    let card = container.querySelector(`[data-id="${o.id}"]`);
    if (!card) {
      card = createOrderCard(o);
      container.appendChild(card);
    } else {
      updateOrderCard(card, o);
    }
  });

  if (orders.length === 0 && !container.querySelector('.empty-state')) {
    container.innerHTML = '<div class="empty-state">Nenhum pedido</div>';
  } else if (orders.length > 0) {
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();
  }
}

function createOrderCard(order) {
  const card = document.createElement('div');
  card.dataset.id = order.id;
  applyOrderCardSnapshot(card, order);
  return card;
}

function updateOrderCard(card, order) {
  applyOrderCardSnapshot(card, order);
}

function applyOrderCardSnapshot(card, order) {
  const snapshot = buildOrderCardRenderSnapshot(order);
  if (card.dataset.renderKey === snapshot.key) return;
  card.className = snapshot.className;
  card.dataset.renderKey = snapshot.key;
  card.innerHTML = snapshot.html;
}

function buildOrderCardRenderSnapshot(order) {
  const stage = getOrderStageSnapshot(order);
  const className = `order-card ${getCardClass(order)}`;
  const html = buildCardHTML(order, stage);
  const signature = [
    order.id,
    order.status,
    order.destination,
    order.created_at || '',
    order.accepted_at || '',
    order.ready_at || '',
    order.delivered_at || '',
    getOrderDisplayCode(order),
    getOrderTableLabel(order),
    stage.key,
    stage.stationKey || '',
    stage.startedAt || '',
    stage.elapsed.severity || '',
    JSON.stringify(order.items || []),
    String(order.notes || ''),
  ].join('|');

  return { className, html, key: signature };
}

function getCardClass(order) {
  const classes = [];
  const stage = getOrderStageSnapshot(order);

  if (order.status === 'PENDING') classes.push('pending');
  if (order.status === 'ACCEPTED') classes.push('accepted');
  if (order.status === 'READY') classes.push('ready');

  if (stage.elapsed.severity === 'critical') {
    classes.push('sla-critical');
  } else if (stage.elapsed.severity === 'warning') {
    classes.push('sla-warning');
  }

  return classes.join(' ');
}

function buildCardHTML(order, stage = getOrderStageSnapshot(order)) {
  const badge = order.destination === 'KITCHEN' ? 'badge-kitchen' : 'badge-bar';
  const destLabel = order.destination === 'KITCHEN' ? 'Cozinha' : 'Bar';

  let itemsHtml = '';
  if (order.items && order.items.length) {
    itemsHtml = order.items.map(i =>
      `<div class="order-item"><span class="item-qty">${escapeHTML(i.quantity)}x</span><span class="item-name">${escapeHTML(resolveItemName(i))}</span>${resolveComboSummary(i) ? `<span class="item-note">• ${escapeHTML(resolveComboSummary(i))}</span>` : ''}${formatSelectedOptionsSummary(i.selected_options || i.selectedOptions) ? `<span class="item-note">+ ${escapeHTML(formatSelectedOptionsSummary(i.selected_options || i.selectedOptions))}</span>` : ''}${i.observations ? `<span class="item-note">${escapeHTML(i.observations)}</span>` : ''}</div>`
    ).join('');
  }

  let actions = '';
  if (order.status === 'PENDING') {
    actions = `<button class="action-btn reject-btn" onclick="openModal('${order.id}','reject')">${KDS_ICONS.x} Recusar</button><button class="action-btn accept-btn" onclick="openModal('${order.id}','accept')">${KDS_ICONS.check} Aceitar</button>`;
  } else if (order.status === 'ACCEPTED') {
    actions = `<button class="action-btn done-btn" onclick="updateStatus('${order.id}','READY')">${KDS_ICONS.check} Pronto</button>`;
  } else if (order.status === 'READY') {
    actions = `<button class="action-btn deliver-btn" onclick="updateStatus('${order.id}','DELIVERED')">${KDS_ICONS.package} Entregar</button>`;
  }

  return `
    <div class="order-card-header">
      <span class="order-id">#${escapeHTML(getOrderDisplayCode(order))}</span>
      <span class="table-badge">${escapeHTML(getOrderTableLabel(order))}</span>
      <span class="order-type-badge ${badge}">${destLabel}</span>
    </div>
    <div class="order-items">${itemsHtml || '<div class="order-item"><span class="item-name" style="color:var(--text-3)">Sem itens</span></div>'}</div>
    <div class="order-card-footer">
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span class="order-stage-badge ${stage.elapsed.severity === 'critical' ? 'critical' : stage.elapsed.severity === 'warning' ? 'warning' : ''}">
          ${escapeHTML(stage.label)} · SLA ${escapeHTML(String(stage.criticalMinutes))} min
        </span>
        <span
          class="order-timer ${stage.elapsed.warning ? 'warning' : ''} ${stage.elapsed.urgent ? 'urgent' : ''}"
          data-start="${escapeHTML(stage.startedAt || '')}"
          data-stage="${escapeHTML(stage.key)}"
          data-station="${escapeHTML(stage.stationKey || 'ATTENDANCE')}"
        >
          ⏱ ${escapeHTML(stage.label)} ${escapeHTML(stage.elapsed.text)}
        </span>
      </div>
      <div class="order-actions">${actions}</div>
    </div>`;
}

function renderStats(containerId, pending, accepted, ready, destination, stationSummary) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const values = buildStationStatsValues(pending, accepted, ready, destination, stationSummary);
  ensureStationStatsCards(el, destination);
  updateStationStatsCards(el, values);
}

function buildStationStatsValues(pending, accepted, ready, destination, stationSummary) {
  const icon = destination === 'KITCHEN' ? '🍳' : '🍹';
  const delayedCount = Number(stationSummary?.delayedCount || 0);
  const warningCount = Number(stationSummary?.warningCount || 0);
  const avgAcceptanceMinutes = formatOperationalMinutes(stationSummary?.avgAcceptanceMinutes);
  const avgPreparationMinutes = formatOperationalMinutes(stationSummary?.avgPreparationMinutes);
  const preparationSla = getStationStageSlaConfig(destination, 'accepted');
  const bottleneckLabel = stationSummary?.bottleneckLabel || 'Fluxo sob controle';
  const bottleneckDetail = Number(stationSummary?.bottleneckDelayedCount || 0) > 0
    ? `${stationSummary.bottleneckDelayedCount} acima do SLA · fila ${stationSummary.bottleneckQueueCount || 0}`
    : `${stationSummary?.bottleneckQueueCount || 0} pedido(s) no estágio mais carregado`;
  return {
    pending: {
      icon: KDS_ICONS.alert,
      iconBackground: 'var(--red-bg)',
      iconColor: 'var(--red)',
      value: String(pending),
      valueColor: 'var(--red)',
      label: 'Aguardando aceite',
    },
    accepted: {
      icon: KDS_ICONS.clock,
      iconBackground: 'var(--yellow-bg)',
      iconColor: 'var(--yellow)',
      value: String(accepted),
      valueColor: '#8a6e00',
      label: `Em preparo · SLA ${String(preparationSla.criticalMinutes || 0)} min`,
    },
    ready: {
      icon: KDS_ICONS.check,
      iconBackground: 'var(--green-bg)',
      iconColor: 'var(--green)',
      value: String(ready),
      valueColor: 'var(--green)',
      label: 'Prontos',
    },
    total: {
      icon,
      iconBackground: 'var(--surface-2)',
      iconColor: '',
      value: String(pending + accepted + ready),
      valueColor: '',
      label: 'Total ativos',
    },
    delayed: {
      icon: KDS_ICONS.fire,
      iconBackground: delayedCount > 0 ? 'var(--red-bg)' : 'var(--yellow-bg)',
      iconColor: delayedCount > 0 ? 'var(--red)' : 'var(--yellow)',
      value: String(delayedCount),
      valueColor: delayedCount > 0 ? 'var(--red)' : '#8a6e00',
      label: warningCount > 0 ? `${warningCount} em atenção` : 'Acima do SLA',
    },
    avgPreparation: {
      icon: KDS_ICONS.clock,
      iconBackground: 'var(--blue-bg)',
      iconColor: 'var(--blue)',
      value: avgPreparationMinutes,
      valueColor: 'var(--blue)',
      label: `Prep médio · Aceite ${avgAcceptanceMinutes}`,
    },
    bottleneck: {
      icon: KDS_ICONS.wall,
      iconBackground: 'var(--orange-bg)',
      iconColor: 'var(--orange)',
      value: bottleneckLabel,
      valueColor: '',
      label: bottleneckDetail,
      compactValue: true,
    },
  };
}

function ensureStationStatsCards(container, destination) {
  if (container.dataset.initialized === 'true' && container.dataset.destination === destination) return;

  container.innerHTML = STATION_STATS_CARD_KEYS.map((key) => `
    <div class="stat-card" data-station-stat="${key}">
      <div class="stat-icon" data-role="icon"></div>
      <div>
        <div class="stat-value" data-role="value">0</div>
        <div class="stat-label" data-role="label"></div>
      </div>
    </div>
  `).join('');
  container.dataset.initialized = 'true';
  container.dataset.destination = destination;
}

function updateStationStatsCards(container, values) {
  STATION_STATS_CARD_KEYS.forEach((key) => {
    const card = container.querySelector(`[data-station-stat="${key}"]`);
    const value = values[key];
    if (!card || !value) return;

    const iconEl = card.querySelector('[data-role="icon"]');
    const valueEl = card.querySelector('[data-role="value"]');
    const labelEl = card.querySelector('[data-role="label"]');

    if (iconEl) {
      if (iconEl.innerHTML !== value.icon) iconEl.innerHTML = value.icon;
      if (iconEl.style.background !== value.iconBackground) iconEl.style.background = value.iconBackground;
      if (iconEl.style.color !== value.iconColor) iconEl.style.color = value.iconColor;
    }

    if (valueEl) {
      if (valueEl.textContent !== value.value) valueEl.textContent = value.value;
      if (valueEl.style.color !== value.valueColor) valueEl.style.color = value.valueColor;
      if (value.compactValue) {
        valueEl.style.fontSize = '13px';
        valueEl.style.lineHeight = '1.2';
      } else {
        valueEl.style.fontSize = '';
        valueEl.style.lineHeight = '';
      }
    }

    if (labelEl && labelEl.textContent !== value.label) {
      labelEl.textContent = value.label;
    }
  });
}

function renderSalao() {
  renderSalaoStats(getSalaoStatsValues());
  renderSalaoPendingRequests();
  renderSalaoReadyOrders();

  // --- Fechar Conta + Chats + Mesas ---
  renderCloseBillRequests();
  renderWaiterChats();
  renderSalaoTables();
}

function getSalaoStatsValues() {
  return {
    availableTables: tableMetrics.available,
    readyOrders: Object.values(allOrders).filter(o => o.status === 'READY').length,
    pendingRequests: pendingRequests.length,
    openChats: waiterChats.filter((chat) => chat.status === 'OPEN').length,
    closeBillRequests: closeBillRequests.length,
  };
}

function renderSalaoPendingRequests() {
  const newList = document.getElementById('salao-new-list');
  if (!newList) return;

  if (pendingRequests.length === 0) {
    newList.innerHTML = `<div class="empty-state">
      <div class="empty-icon">👤</div>
      Nenhum cliente aguardando
      <div class="empty-sub">Clientes serão listados aqui</div>
    </div>`;
  } else {
    newList.innerHTML = pendingRequests.map(req => {
      const elapsed = getElapsed(req.createdAt || req.created_at);
      const phone = escapeHTML(req.userPhone || req.user_phone || 'N/A');
      const pax = req.paxCount || req.pax_count || '?';
      const tableId = req.tableId || req.table_id || null;
      const tableNumber = req.table?.number || req.table_number || null;
      const requestCode = String(req.id || '').replace(/-/g, '').slice(0, 5).toUpperCase();
      const context = tableNumber
        ? `Mesa ${escapeHTML(String(tableNumber))} · `
        : 'Comanda sem mesa · ';
      const approveAction = tableId
        ? `openAssignModal('${escapeHTML(req.id)}','${phone}','${pax}')`
        : `approvePendingRequest('${escapeHTML(req.id)}')`;
      const approveLabel = tableId ? '🪑 Alocar mesa' : '✓ Abrir comanda';
      return `<div class="ready-item">
        <div style="font-size:20px;flex-shrink:0">📱</div>
        <div class="ready-item-left">
          <div class="ready-item-title">${phone}</div>
          <div class="ready-item-sub">${context}${pax} pessoa(s) · Aguardando há ${escapeHTML(elapsed.text)}</div>
          <div class="ready-item-sub" style="color:var(--green);font-size:12px;font-weight:700">Comanda prevista: ${escapeHTML(requestCode)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="action-btn accept-btn" onclick="${approveAction}">${approveLabel}</button>
          <button class="action-btn reject-btn" onclick="openRequestRejectModal('${escapeHTML(req.id)}')">✕ Recusar</button>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('salao-new-count').textContent = pendingRequests.length;
}

function renderSalaoReadyOrders() {
  const readyList = document.getElementById('salao-ready-list');
  if (!readyList) return;

  const readyOrders = Object.values(allOrders).filter(o => o.status === 'READY');
  if (readyOrders.length === 0) {
    readyList.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🍽</div>
      Nenhum pedido pronto
      <div class="empty-sub">Pedidos prontos aparecerão aqui</div>
    </div>`;
  } else {
    readyList.innerHTML = readyOrders.map(o => {
      const elapsed = getElapsed(o.ready_at || o.created_at);
      const icon = o.destination === 'KITCHEN' ? '🍳' : '🍹';
      const tag = o.destination === 'KITCHEN'
        ? '<span class="ready-tag" style="background:var(--orange-bg);color:var(--orange)">Cozinha</span>'
        : '<span class="ready-tag" style="background:var(--blue-bg);color:var(--blue)">Bar</span>';
      const itemNames = escapeHTML((o.items || []).map(i => `${i.quantity}x ${resolveItemName(i)}`).join(', ') || 'Itens');
      return `<div class="ready-item ${elapsed.urgent ? 'style="background:var(--red-bg);border-color:#f0c4be"' : ''}">
        <div style="font-size:20px;flex-shrink:0">${icon}</div>
        <div class="ready-item-left">
          <div class="ready-item-title">Pedido #${escapeHTML(getOrderDisplayCode(o))}</div>
          <div class="ready-item-sub">${itemNames}</div>
          <div style="font-size:10px;color:var(--text-3);font-family:'DM Mono';margin-top:3px">Pronto há ${escapeHTML(elapsed.text)}</div>
        </div>
        ${tag}
        <button class="action-btn deliver-btn" style="flex-shrink:0" onclick="updateStatus('${o.id}','DELIVERED')">Entregar</button>
      </div>`;
    }).join('');
  }
  document.getElementById('salao-ready-count').textContent = readyOrders.length;
}

function renderSalaoStats(values) {
  const statsEl = document.getElementById('stats-salao');
  if (!statsEl) return;

  ensureSalaoStatsCards(statsEl);

  SALAO_STATS_CARD_DEFINITIONS.forEach((definition) => {
    const card = statsEl.querySelector(`[data-salao-stat="${definition.key}"]`);
    if (!card) return;

    const iconEl = card.querySelector('[data-role="icon"]');
    const valueEl = card.querySelector('[data-role="value"]');
    const labelEl = card.querySelector('[data-role="label"]');

    if (iconEl) {
      if (iconEl.style.background !== definition.iconBackground) {
        iconEl.style.background = definition.iconBackground;
      }
      if (iconEl.style.color !== definition.iconColor) {
        iconEl.style.color = definition.iconColor;
      }
    }

    if (valueEl) {
      const nextValue = String(values?.[definition.key] ?? 0);
      if (valueEl.textContent !== nextValue) {
        valueEl.textContent = nextValue;
      }
      if (valueEl.style.color !== definition.valueColor) {
        valueEl.style.color = definition.valueColor;
      }
    }

    if (labelEl && labelEl.textContent !== definition.label) {
      labelEl.textContent = definition.label;
    }
  });
}

function ensureSalaoStatsCards(statsEl) {
  if (statsEl.dataset.initialized === 'true') return;

  statsEl.innerHTML = SALAO_STATS_CARD_DEFINITIONS.map((definition) => `
    <div class="stat-card" data-salao-stat="${definition.key}">
      <div class="stat-icon" data-role="icon">${definition.icon}</div>
      <div>
        <div class="stat-value" data-role="value">0</div>
        <div class="stat-label" data-role="label">${definition.label}</div>
      </div>
    </div>
  `).join('');
  statsEl.dataset.initialized = 'true';
}

// --- Table capacity filter ---
let salaoTableFilter = 'all';

function setSalaoTableFilter(filter) {
  salaoTableFilter = filter;
  renderSalaoTables();
}

function renderSalaoTables() {
  // Filter tabs
  const filtersEl = document.getElementById('salao-table-filters');
  if (filtersEl) {
    const capacities = ['all', '2', '4', '8+'];
    const labels = { 'all': 'Todas', '2': '2 lugares', '4': '4 lugares', '8+': '8+ lugares' };
    filtersEl.innerHTML = capacities.map(c =>
      `<button class="table-filter-tab ${salaoTableFilter === c ? 'active' : ''}" onclick="setSalaoTableFilter('${c}')">${labels[c]}</button>`
    ).join('');
  }

  // Filter tables
  let filtered = availableTables;
  if (salaoTableFilter === '2') filtered = availableTables.filter(t => (t.capacity || 0) <= 2);
  else if (salaoTableFilter === '4') filtered = availableTables.filter(t => (t.capacity || 0) >= 3 && (t.capacity || 0) <= 6);
  else if (salaoTableFilter === '8+') filtered = availableTables.filter(t => (t.capacity || 0) >= 7);

  const tablesList = document.getElementById('salao-tables-list');
  if (!tablesList) return;

  if (filtered.length === 0) {
    tablesList.innerHTML = `<div class="empty-state" style="padding:24px 16px;">
      <div class="empty-icon">🪑</div>
      Nenhuma mesa disponível
      <div class="empty-sub">${salaoTableFilter !== 'all' ? 'Tente outro filtro de capacidade' : 'Todas as mesas estão ocupadas'}</div>
    </div>`;
  } else {
    tablesList.innerHTML = filtered.map(table => {
      const cap = table.capacity || '?';
      const section = table.section || table.location || '';
      const meta = [cap + ' lugares', section].filter(Boolean).join(' · ');
      return `<div class="table-row">
        <div class="table-row-icon">🪑</div>
        <div class="table-row-info">
          <div class="table-row-name">Mesa ${escapeHTML(table.number || '--')}</div>
          <div class="table-row-meta">${escapeHTML(meta)}</div>
        </div>
        <span class="table-row-cap">${escapeHTML(String(cap))} lug.</span>
      </div>`;
    }).join('');
  }
  document.getElementById('salao-tables-count').textContent = availableTables.length;
}

function updateNavBadges() {
  const kitchen = Object.values(allOrders).filter(o => o.destination === 'KITCHEN' && o.status === 'PENDING').length;
  const bar = Object.values(allOrders).filter(o => o.destination === 'BAR' && o.status === 'PENDING').length;
  const readyOrders = Object.values(allOrders).filter(o => o.status === 'READY').length;
  document.getElementById('nb-kitchen').textContent = kitchen;
  document.getElementById('nb-bar').textContent = bar;
  document.getElementById('nb-salao').textContent = pendingRequests.length + readyOrders + waiterChats.length + closeBillRequests.length;
}

// ─── ACTIONS ───────────────────────────────────────────────────
async function updateStatus(orderId, newStatus, cancelReason, prepMinutes, cancelReasonCode, cancelCategory) {
  try {
    const orderRef = allOrders[orderId];
    const displayCode = getOrderDisplayCode(orderRef || { id: orderId });
    const body = { status: newStatus };
    if (cancelReason) body.cancel_reason = cancelReason;
    if (cancelReasonCode) body.cancel_reason_code = cancelReasonCode;
    if (cancelCategory) body.cancel_category = cancelCategory;
    if (newStatus === 'ACCEPTED' && Number.isFinite(prepMinutes)) {
      body.prep_minutes = prepMinutes;
    }
    await apiPatch(`/orders/${orderId}/status?tenant_id=${CONFIG.TENANT_ID}`, body);

    // Optimistic update
    if (newStatus === 'DELIVERED' || newStatus === 'CANCELED') {
      delete allOrders[orderId];
    } else if (allOrders[orderId]) {
      allOrders[orderId].status = newStatus;
    }
    await refreshOperationsSummary(false);
    renderAll();
    broadcastKdsSync(`order.status_changed:${newStatus}`);

    const labels = { ACCEPTED: 'aceito', READY: 'pronto', DELIVERED: 'entregue', CANCELED: 'cancelado' };
    toast('t-success', `✅ Pedido ${labels[newStatus]}!`, `#${displayCode}`);
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}

// ─── MODAL ─────────────────────────────────────────────────────
function openModal(orderId, tab) {
  modalState.orderId = orderId;
  const order = allOrders[orderId];
  if (!order) return;

  document.getElementById('mi-id').textContent = '#' + getOrderDisplayCode(order);
  document.getElementById('mi-dest').textContent = order.destination;
  document.getElementById('mi-status').textContent = order.status;

  // Reset
  document.querySelectorAll('.reason-opt').forEach(r => r.classList.remove('selected'));
  document.getElementById('custom-wrap').style.display = 'none';
  document.getElementById('custom-text').value = '';
  document.getElementById('err-no-reason').classList.remove('show');
  document.getElementById('err-custom-empty').classList.remove('show');
  document.querySelectorAll('.time-opt').forEach(t => t.classList.remove('selected'));
  document.querySelectorAll('.time-opt')[1].classList.add('selected');

  switchModalTab(tab || 'accept');
  document.getElementById('orderModal').classList.add('open');
}

function closeModal() {
  document.getElementById('orderModal').classList.remove('open');
  modalState.orderId = null;
}

document.getElementById('orderModal').addEventListener('click', e => {
  if (e.target.id === 'orderModal') closeModal();
});

function switchModalTab(t) {
  modalState.tab = t;
  document.getElementById('accept-form').style.display = t === 'accept' ? 'block' : 'none';
  document.getElementById('reject-form').style.display = t === 'reject' ? 'block' : 'none';
  document.getElementById('tab-accept').classList.toggle('active', t === 'accept');
  document.getElementById('tab-reject').classList.toggle('active', t === 'reject');
  document.getElementById('modal-title-text').textContent = t === 'accept' ? 'Aceitar Pedido' : 'Recusar Pedido';
}

function confirmAccept() {
  if (!modalState.orderId) return;
  const selected = document.querySelector('.time-opt.selected');
  const prepMinutes = Number.parseInt(selected?.textContent || '', 10) || 10;
  updateStatus(modalState.orderId, 'ACCEPTED', undefined, prepMinutes);
  closeModal();
}

function selectReason(el) {
  document.querySelectorAll('.reason-opt').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  const isCustom = el.querySelector('input').value === '__custom__';
  document.getElementById('custom-wrap').style.display = isCustom ? 'block' : 'none';
  document.getElementById('err-no-reason').classList.remove('show');
}

function confirmReject() {
  const sel = document.querySelector('.reason-opt.selected');
  if (!sel) { document.getElementById('err-no-reason').classList.add('show'); return; }
  const val = sel.querySelector('input').value;
  const code = sel.dataset.code || '';
  const category = sel.dataset.category || '';
  const reasonLabel = sel.dataset.label || sel.textContent.trim();
  if (val === '__custom__') {
    const txt = document.getElementById('custom-text').value.trim();
    if (!txt) {
      document.getElementById('err-custom-empty').classList.add('show');
      document.getElementById('custom-text').focus();
      return;
    }
    updateStatus(modalState.orderId, 'CANCELED', txt, undefined, code || 'OTHER', category || 'other');
  } else {
    updateStatus(modalState.orderId, 'CANCELED', reasonLabel, undefined, code, category);
  }
  closeModal();
}

function selectTime(el) {
  document.querySelectorAll('.time-opt').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
}

// ─── HELPERS ───────────────────────────────────────────────────
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shortId(id) {
  if (!id) return '???';
  return id.substring(0, 8);
}

function normalizeOrder(order) {
  if (!order || !order.id) return order;

  const items = Array.isArray(order.items) ? order.items : [];
  return {
    ...order,
    batch_id: order.batch_id || order.batchId || null,
    batchId: order.batchId || order.batch_id || null,
    batch_display_code: order.batch_display_code || order.batchDisplayCode || '',
    batchDisplayCode: order.batchDisplayCode || order.batch_display_code || '',
    tab_id: order.tab_id || order.tabId || null,
    tabId: order.tabId || order.tab_id || null,
    created_at: order.created_at || order.createdAt || null,
    accepted_at: order.accepted_at || order.acceptedAt || null,
    ready_at: order.ready_at || order.readyAt || null,
    delivered_at: order.delivered_at || order.deliveredAt || null,
    canceled_at: order.canceled_at || order.canceledAt || null,
    cancel_reason: order.cancel_reason || order.cancelReason || '',
    cancel_reason_code: order.cancel_reason_code || order.cancelReasonCode || '',
    cancel_category: order.cancel_category || order.cancelCategory || '',
    canceled_by_user_id: order.canceled_by_user_id || order.canceledByUserId || '',
    canceled_by_user_name: order.canceled_by_user_name || order.canceledByUserName || '',
    items: items.map((item) => ({
      ...item,
      menu_item_id: item.menu_item_id || item.menuItemId || null,
      menu_item_name: item.menu_item_name || item.menuItemName || item.name || item.menuItem?.name || '',
      unit_price: item.unit_price || item.unitPrice || item.price || null,
      selected_options: Array.isArray(item.selected_options)
        ? item.selected_options
        : Array.isArray(item.selectedOptions)
          ? item.selectedOptions
          : [],
    })),
  };
}

function formatSelectedOptionsSummary(options) {
  const list = Array.isArray(options) ? options : [];
  const parts = list
    .map((option) => {
      const groupName = String(option?.group_name || option?.groupName || '').trim();
      const optionName = String(option?.option_name || option?.optionName || '').trim();
      const priceDelta = Number(option?.price_delta ?? option?.priceDelta ?? 0);
      if (!groupName || !optionName) return '';
      return priceDelta > 0
        ? `${groupName}: ${optionName} (+${formatMoney(priceDelta)})`
        : `${groupName}: ${optionName}`;
    })
    .filter(Boolean);

  return parts.join(', ');
}

function formatTableNumber(value) {
  const raw = String(value || '--').trim();
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw;
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function getOrderTabId(order) {
  return String(order?.tab_id || order?.tabId || '').trim();
}

function getOrderPhoneSuffix(order) {
  const notes = String(order?.notes || '').trim();
  const match = notes.match(/(\d{10,15})/);
  if (!match) return '';
  const digits = match[1];
  return digits.slice(-4);
}

function getOrderTableCode(order) {
  const tabId = getOrderTabId(order);
  if (!tabId || !tabMetaById.has(tabId)) return '';
  const meta = tabMetaById.get(tabId) || {};
  return formatTableNumber(meta.tableNumber || '');
}

function getOrderTableLabel(order) {
  const tableCode = getOrderTableCode(order);
  if (tableCode) return `Mesa ${tableCode}`;
  if (order?.notes && String(order.notes).includes('WhatsApp')) return 'WhatsApp';
  return 'Mesa';
}

function getOrderDisplayCode(order) {
  const phoneSuffix = getOrderPhoneSuffix(order);
  const tableCode = getOrderTableCode(order);
  const batchDisplayCode = String(order?.batch_display_code || order?.batchDisplayCode || '').trim();
  const batchId = String(order?.batch_id || order?.batchId || '').trim();
  const orderId = String(order?.id || '').trim();
  const logicalSuffix = batchDisplayCode || (batchId ? batchId.slice(-4) : '') || (orderId ? orderId.slice(-4) : '');

  if (phoneSuffix && tableCode && logicalSuffix) return `${phoneSuffix}-${tableCode}-${logicalSuffix}`;
  if (phoneSuffix && tableCode) return `${phoneSuffix}-${tableCode}`;
  if (phoneSuffix && logicalSuffix) return `${phoneSuffix}-${logicalSuffix}`;
  if (tableCode && logicalSuffix) return `${tableCode}-${logicalSuffix}`;
  if (phoneSuffix) return phoneSuffix;
  if (tableCode) return tableCode;
  if (logicalSuffix) return logicalSuffix;
  return shortId(orderId);
}

function getElapsed(dateStr) {
  return getElapsedWithSla(dateStr);
}

function getElapsedWithSla(dateStr, slaConfig) {
  if (!dateStr) return { text: '—', minutes: 0, warning: false, urgent: false, severity: 'normal' };
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const warningMinutes = Number(slaConfig?.warningMinutes || 0);
  const criticalMinutes = Number(slaConfig?.criticalMinutes || warningMinutes || 0);
  const severity = mins >= criticalMinutes
    ? 'critical'
    : mins >= warningMinutes && warningMinutes > 0
      ? 'warning'
      : 'normal';
  return {
    text: mins > 0 ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `00:${String(secs).padStart(2, '0')}`,
    minutes: mins,
    warning: severity === 'warning',
    urgent: severity === 'critical',
    severity,
  };
}

function startTimerUpdates() {
  timerInterval = setInterval(() => {
    document.querySelectorAll('.order-timer[data-start][data-stage]').forEach(el => {
      const stage = getStageSlaConfig(el.dataset.stage, el.dataset.station);
      const elapsed = getElapsedWithSla(el.dataset.start, stage);
      el.textContent = `⏱ ${stage.label} ${elapsed.text}`;
      el.classList.toggle('warning', elapsed.warning);
      el.classList.toggle('urgent', elapsed.urgent);
    });
  }, 1000);
}

function getStationOperations(destination) {
  const stations = Array.isArray(operationsSummary?.stations) ? operationsSummary.stations : [];
  return stations.find((station) => station.destination === destination) || null;
}

function getStageSlaConfig(stageKey, stationKey = 'ATTENDANCE') {
  return getStationStageSlaConfig(stationKey, stageKey);
}

function getStationStageSlaConfig(stationKey, stageKey) {
  const normalizedStationKey = normalizeStationKey(stationKey);
  const stationSla = operationsSummary?.stationSla?.[normalizedStationKey]
    || DEFAULT_ORDER_STATION_SLA[normalizedStationKey]
    || DEFAULT_ORDER_STATION_SLA.ATTENDANCE;
  const genericSla = operationsSummary?.sla || DEFAULT_ORDER_SLA;
  if (stageKey === 'accepted') return stationSla.accepted || genericSla.accepted || DEFAULT_ORDER_SLA.accepted;
  if (stageKey === 'ready') return stationSla.ready || genericSla.ready || DEFAULT_ORDER_SLA.ready;
  return stationSla.pending || genericSla.pending || DEFAULT_ORDER_SLA.pending;
}

function getOrderStageSnapshot(order) {
  if (order?.status === 'ACCEPTED') {
    return buildOrderStageSnapshot('accepted', order.accepted_at || order.created_at, resolveOrderStationKey(order, 'accepted'));
  }
  if (order?.status === 'READY') {
    return buildOrderStageSnapshot('ready', order.ready_at || order.created_at, resolveOrderStationKey(order, 'ready'));
  }
  return buildOrderStageSnapshot('pending', order?.created_at || order?.createdAt, resolveOrderStationKey(order, 'pending'));
}

function buildOrderStageSnapshot(stageKey, startedAt, stationKey = 'ATTENDANCE') {
  const stage = getStageSlaConfig(stageKey, stationKey);
  return {
    key: stageKey,
    stationKey,
    label: stage.label || 'Etapa',
    warningMinutes: Number(stage.warningMinutes || 0),
    criticalMinutes: Number(stage.criticalMinutes || 0),
    startedAt: startedAt || '',
    elapsed: getElapsedWithSla(startedAt, stage),
  };
}

function resolveOrderStationKey(order, stageKey) {
  if (stageKey !== 'accepted') {
    return 'ATTENDANCE';
  }
  return normalizeStationKey(order?.destination);
}

function normalizeStationKey(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'BAR') return 'BAR';
  if (normalized === 'KITCHEN') return 'KITCHEN';
  return 'ATTENDANCE';
}

function formatOperationalMinutes(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return '0,0 min';
  return `${parsed.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} min`;
}

// ─── PANEL SWITCH ──────────────────────────────────────────────
const TITLES = {
  kitchen: ['Estação da Cozinha', '— aceite e gerencie os pedidos da cozinha'],
  bar: ['Estação do Bar', '— aceite e gerencie os pedidos do bar'],
  salao: ['Painel do Salão', '— gerencie clientes, entregas, contas e conversas'],
};

function switchPanel(name) {
  const nextPanel = KDS_ACCESS.availablePanels.includes(name) ? name : KDS_ACCESS.defaultPanel;
  activePanel = nextPanel;
  document.querySelectorAll('.screen-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + nextPanel).classList.add('active');
  document.querySelectorAll('.screen-tab[data-panel]').forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === nextPanel));
  document.querySelectorAll('.sidebar-nav .nav-item[data-panel]').forEach((navItem) => navItem.classList.toggle('active', navItem.dataset.panel === nextPanel));
  document.getElementById('topbar-title').textContent = TITLES[nextPanel][0];
  document.getElementById('topbar-sub').textContent = TITLES[nextPanel][1];
  renderCurrentPanel();
  updateNavBadges();
}

// ─── TOAST ─────────────────────────────────────────────────────
function toast(type, title, sub) {
  const el = document.createElement('div');
  el.className = `toast ${escapeHTML(type)}`;
  const icon = type === 't-success' ? KDS_ICONS.success : type === 't-error' ? KDS_ICONS.error : KDS_ICONS.bell;
  el.innerHTML = `<div style="flex-shrink:0;display:flex;color:${type === 't-success' ? 'var(--green)' : type === 't-error' ? 'var(--red)' : 'var(--blue)'}">${icon}</div><div class="toast-content"><div class="toast-title">${escapeHTML(title)}</div><div class="toast-sub">${escapeHTML(sub)}</div></div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('fadeout'); setTimeout(() => el.remove(), 350); }, 4200);
}

// ─── SOUND ─────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { /* Audio not available */ }
}

// ─── SIDEBAR TOGGLE ────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('kds-sidebar');
  const icon = document.getElementById('toggle-icon');
  const isMobile = window.innerWidth <= 900;

  if (isMobile) {
    sidebar.classList.toggle('expanded');
    icon.textContent = sidebar.classList.contains('expanded') ? '✕' : '☰';
  } else {
    sidebar.classList.toggle('collapsed');
    icon.textContent = sidebar.classList.contains('collapsed') ? '☰' : '◀';
    const label = sidebar.querySelector('.toggle-label');
    if (label) label.textContent = sidebar.classList.contains('collapsed') ? 'Expandir' : 'Recolher';
  }
}

// Close mobile sidebar when clicking a nav item
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sidebar-nav .nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        const sidebar = document.getElementById('kds-sidebar');
        sidebar.classList.remove('expanded');
        document.getElementById('toggle-icon').textContent = '☰';
      }
    });
  });
});

// ─── CLOCK ─────────────────────────────────────────────────────
function startClock() {
  const update = () => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// ─── PENDING TABLE REQUESTS ─────────────────────────────────────────────
async function loadPendingRequests() {
  try {
    const data = await apiGet('/tables/requests/pending');
    pendingRequests = Array.isArray(data) ? data : [];
    if (activePanel === 'salao') {
      renderSalaoStats(getSalaoStatsValues());
      renderSalaoPendingRequests();
    }
    updateNavBadges();
  } catch (e) {
    console.warn('Failed to load pending requests:', e);
  }
}

async function approvePendingRequest(requestId) {
  try {
    const r = await fetch(`${CONFIG.API_URL}/tables/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authSession ? `Bearer ${authSession.token}` : ''
      },
      body: JSON.stringify({}),
    });
    if (r.status === 401 || r.status === 403) { window.location.href = loginPagePath; return; }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API ${r.status}`);
    }
    playNotificationSound();
    toast('t-success', '✅ Comanda aberta', 'A comanda será criada e enviada ao cliente');
    await Promise.all([loadPendingRequests(), loadTableState()]);
    broadcastKdsSync('table.request.approved');
  } catch (e) {
    toast('t-error', '❌ Erro ao abrir comanda', e.message);
  }
}

function openRequestRejectModal(requestId) {
  requestRejectState = { requestId };
  document.getElementById('requestRejectModal').classList.add('open');
}

function closeRequestRejectModal() {
  document.getElementById('requestRejectModal').classList.remove('open');
  requestRejectState = { requestId: null };
}

async function confirmRejectRequest() {
  if (!requestRejectState.requestId) return;
  try {
    const r = await fetch(`${CONFIG.API_URL}/tables/requests/${requestRejectState.requestId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authSession ? `Bearer ${authSession.token}` : ''
      },
      body: JSON.stringify({}),
    });
    if (r.status === 401 || r.status === 403) { window.location.href = loginPagePath; return; }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API ${r.status}`);
    }
    closeRequestRejectModal();
    toast('t-success', 'Solicitação recusada', 'O cliente receberá uma orientação pelo WhatsApp');
    await loadPendingRequests();
    broadcastKdsSync('table.request.rejected');
  } catch (e) {
    toast('t-error', '❌ Erro ao recusar', e.message);
  }
}

async function loadTableState() {
  try {
    const data = await apiGet('/tables');
    tablesSnapshot = Array.isArray(data) ? data : [];
    availableTables = tablesSnapshot.filter(t => t.status === 'AVAILABLE');
    tabMetaById = new Map();
    tablesSnapshot.forEach((table) => {
      const tabs = Array.isArray(table.activeTabs) ? table.activeTabs : [];
      tabs.forEach((tab) => {
        if (tab?.id) {
          tabMetaById.set(String(tab.id), {
            tableId: table.id,
            tableNumber: table.number,
          });
        }
      });
    });
    tableMetrics = {
      total: tablesSnapshot.length,
      available: availableTables.length,
      occupied: tablesSnapshot.filter(t => t.status === 'OCCUPIED').length,
    };
    renderCurrentPanel();
    updateNavBadges();
  } catch (e) {
    console.warn('Failed to load tables:', e);
    tablesSnapshot = [];
    availableTables = [];
    tabMetaById = new Map();
    tableMetrics = { total: 0, available: 0, occupied: 0 };
    renderCurrentPanel();
    updateNavBadges();
  }
}

async function loadWaiterChats() {
  try {
    const data = await apiGet('/tables/waiter/chats/open');
    waiterChats = Array.isArray(data) ? data : [];
    if (activePanel === 'salao') {
      renderSalaoStats(getSalaoStatsValues());
      renderWaiterChats();
    }
    updateNavBadges();

    if (activeWaiterChatId) {
      const stillOpen = waiterChats.some((chat) => chat.id === activeWaiterChatId);
      if (!stillOpen) {
        closeWaiterChatModal();
      } else {
        loadWaiterChatMessages(activeWaiterChatId);
      }
    }
  } catch (e) {
    console.warn('Failed to load waiter chats:', e);
  }
}

async function loadCloseRequests() {
  try {
    const data = await apiGet('/tables/waiter/close-requests');
    closeBillRequests = Array.isArray(data) ? data : [];
    if (activePanel === 'salao') {
      renderSalaoStats(getSalaoStatsValues());
      renderCloseBillRequests();
    }
    updateNavBadges();
  } catch (e) {
    console.warn('Failed to load close bill requests:', e);
  }
}

function renderWaiterChats() {
  const list = document.getElementById('salao-chat-list');
  if (!list) return;

  const countEl = document.getElementById('salao-chat-count');
  if (countEl) countEl.textContent = waiterChats.length;

  if (waiterChats.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">💬</div>
      Nenhuma conversa em atendimento
      <div class="empty-sub">Conversas ativas aparecerão aqui</div>
    </div>`;
    return;
  }

  list.innerHTML = waiterChats.map((chat) => {
    const lastAt = chat.lastMessageAt || chat.openedAt;
    const elapsed = getElapsed(lastAt);
    const tableRaw = String(chat.tableNumber || '').trim();
    const tableLabel = tableRaw ? `Mesa ${formatTableNumber(tableRaw)}` : 'Sem mesa';
    const lastText = String(chat.lastMessage || 'Aguardando mensagem do cliente...');
    const sender = String(chat.lastSenderType || '').toUpperCase() === 'STAFF' ? 'Equipe' :
      String(chat.lastSenderType || '').toUpperCase() === 'SYSTEM' ? 'Sistema' : 'Cliente';

    return `<div class="ready-item">
      <div style="font-size:20px;flex-shrink:0">💬</div>
      <div class="ready-item-left">
        <div class="ready-item-title">${escapeHTML(chat.userPhone || '')} · ${escapeHTML(tableLabel)}</div>
        <div class="ready-item-sub">${escapeHTML(sender)}: ${escapeHTML(lastText)}</div>
        <div class="waiter-chat-meta">Atualizado há ${escapeHTML(elapsed.text)}</div>
      </div>
      <div class="waiter-chat-actions">
        <button class="action-btn accept-btn" style="flex-shrink:0" onclick="openWaiterChat('${escapeHTML(chat.id)}')">Abrir chat</button>
        <button class="action-btn reject-btn" style="flex-shrink:0" onclick="closeWaiterChat('${escapeHTML(chat.id)}')">Encerrar</button>
      </div>
    </div>`;
  }).join('');
}

function renderCloseBillRequests() {
  const list = document.getElementById('salao-close-list');
  if (!list) return;

  const countEl = document.getElementById('salao-close-count');
  if (countEl) countEl.textContent = closeBillRequests.length;

  if (closeBillRequests.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">💰</div>
      Nenhum pedido de fechamento aguardando
      <div class="empty-sub">Solicitações de fechamento aparecerão aqui</div>
    </div>`;
    return;
  }

  list.innerHTML = closeBillRequests.map((request) => {
    const elapsed = getElapsed(request.createdAt);
    const tableRaw = String(request.tableNumber || '').trim();
    const tableLabel = tableRaw ? `Mesa ${formatTableNumber(tableRaw)}` : 'Sem mesa';
    const amountDue = Number(request.amountDue || 0);

    return `<div class="ready-item">
      <div style="font-size:20px;flex-shrink:0">💰</div>
      <div class="ready-item-left">
        <div class="ready-item-title">${escapeHTML(request.userPhone || 'Cliente')} · ${escapeHTML(tableLabel)}</div>
        <div class="ready-item-sub">Pendente ${escapeHTML(formatMoney(amountDue))} · solicitado há ${escapeHTML(elapsed.text)}</div>
      </div>
      <button class="action-btn accept-btn" style="flex-shrink:0" onclick="finalizeCloseBillRequest('${escapeHTML(request.id)}')">Conta finalizada</button>
    </div>`;
  }).join('');
}

async function openWaiterChat(chatId) {
  const chat = waiterChats.find((row) => row.id === chatId);
  if (!chat) return;
  activeWaiterChatId = chatId;

  const tableRaw = String(chat.tableNumber || '').trim();
  const tableLabel = tableRaw ? `Mesa ${formatTableNumber(tableRaw)}` : 'Sem mesa';
  document.getElementById('waiter-chat-modal-title').textContent = `${chat.userPhone || ''} · ${tableLabel}`;
  document.getElementById('waiterChatModal').classList.add('open');

  await loadWaiterChatMessages(chatId);
  document.getElementById('waiter-chat-input').focus();
}

function closeWaiterChatModal() {
  document.getElementById('waiterChatModal').classList.remove('open');
  activeWaiterChatId = null;
}

document.getElementById('waiterChatModal').addEventListener('click', (e) => {
  if (e.target.id === 'waiterChatModal') {
    closeWaiterChatModal();
  }
});

async function loadWaiterChatMessages(chatId) {
  try {
    const payload = await apiGet(`/tables/waiter/chats/${chatId}/messages`);
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    waiterChatMessagesById.set(chatId, messages);

    if (activeWaiterChatId === chatId) {
      renderWaiterChatThread(payload?.chat || null, messages);
    }
  } catch (e) {
    console.warn('Failed to load waiter chat messages:', e);
  }
}

function renderWaiterChatThread(chat, messages) {
  const thread = document.getElementById('waiter-chat-thread');
  if (!thread) return;

  if (!messages || messages.length === 0) {
    thread.innerHTML = '<div class="empty-state">Sem mensagens ainda</div>';
    return;
  }

  thread.innerHTML = messages.map((msg) => {
    const senderType = String(msg.senderType || '').toUpperCase();
    const cls = senderType === 'STAFF' ? 'staff' : senderType === 'SYSTEM' ? 'system' : 'customer';
    const sender = senderType === 'STAFF'
      ? (msg.senderName || 'Equipe')
      : senderType === 'SYSTEM'
        ? 'Sistema'
        : 'Cliente';
    const when = msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '--:--';

    return `<div class="chat-bubble ${escapeHTML(cls)}">
      <div class="chat-bubble-head">${escapeHTML(sender)}</div>
      <div class="chat-bubble-text">${escapeHTML(msg.message || '')}</div>
      <div class="chat-bubble-time">${escapeHTML(when)}</div>
    </div>`;
  }).join('');

  thread.scrollTop = thread.scrollHeight;
}

async function sendWaiterChatMessage() {
  if (!activeWaiterChatId) return;
  const input = document.getElementById('waiter-chat-input');
  const message = String(input?.value || '').trim();
  if (!message) {
    input?.focus();
    return;
  }

  try {
    const payload = await apiPost(`/tables/waiter/chats/${activeWaiterChatId}/messages`, { message });
    input.value = '';
    await Promise.all([loadWaiterChats(), loadWaiterChatMessages(activeWaiterChatId)]);
    broadcastKdsSync('waiter.chat.message_sent');
    toast('t-success', '✅ Mensagem enviada', payload?.deliveryChannel === 'PORTAL' ? 'Cliente notificado no portal' : 'Cliente notificado no WhatsApp');
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}

async function closeWaiterChat(chatId) {
  try {
    await apiPost(`/tables/waiter/chats/${chatId}/close`, {});
    waiterChatMessagesById.delete(chatId);
    if (activeWaiterChatId === chatId) {
      closeWaiterChatModal();
    }
    await loadWaiterChats();
    broadcastKdsSync('waiter.chat.closed');
    toast('t-success', '✅ Conversa encerrada', 'Atendimento finalizado com sucesso');
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}

function closeWaiterChatByButton() {
  if (!activeWaiterChatId) return;
  closeWaiterChat(activeWaiterChatId);
}

async function finalizeCloseBillRequest(requestId) {
  try {
    await apiPost(`/tables/waiter/close-requests/${requestId}/finalize`, {});
    await Promise.all([loadCloseRequests(), loadTableState()]);
    broadcastKdsSync('waiter.close_request.finalized');
    toast('t-success', 'Conta finalizada', 'Comanda encerrada com sucesso');
  } catch (e) {
    toast('t-error', 'Erro ao finalizar', e.message);
  }
}

function openAssignModal(requestId, phone, pax) {
  assignModalState = { requestId, selectedTableId: null };
  document.getElementById('assign-phone').textContent = phone;
  document.getElementById('assign-pax').textContent = pax;
  document.getElementById('err-no-table').classList.remove('show');

  loadTableState().then(() => {
    const grid = document.getElementById('assign-tables-grid');
    if (availableTables.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Nenhuma mesa disponível</div>';
    } else {
      grid.innerHTML = availableTables.map(t => {
        const rawNumber = String(t.number || '--');
        const displayNumber = /^\d+$/.test(rawNumber) ? rawNumber.padStart(2, '0') : rawNumber;
        const capacity = Number(t.capacity || 0);
        const seatsText = capacity > 0
          ? `Disponibilidade de ${String(capacity).padStart(2, '0')} ${capacity === 1 ? 'lugar' : 'lugares'}`
          : 'Capacidade não informada';
        return `<div class="assign-table-option" onclick="selectAssignTable(this, '${escapeHTML(t.id)}')">
          <div class="assign-table-option-icon">🪑</div>
          <div class="assign-table-option-title">Mesa ${escapeHTML(displayNumber)}</div>
          <div class="assign-table-option-subtitle">${escapeHTML(seatsText)}</div>
        </div>`;
      }).join('');
    }
    document.getElementById('assignTableModal').classList.add('open');
  });
}

function closeAssignModal() {
  document.getElementById('assignTableModal').classList.remove('open');
  assignModalState = { requestId: null, selectedTableId: null };
}

document.getElementById('assignTableModal').addEventListener('click', e => {
  if (e.target.id === 'assignTableModal') closeAssignModal();
});

document.getElementById('requestRejectModal').addEventListener('click', e => {
  if (e.target.id === 'requestRejectModal') closeRequestRejectModal();
});

function selectAssignTable(el, tableId) {
  document.querySelectorAll('#assign-tables-grid .assign-table-option').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  assignModalState.selectedTableId = tableId;
  document.getElementById('err-no-table').classList.remove('show');
}

async function confirmAssignTable() {
  if (!assignModalState.selectedTableId) {
    document.getElementById('err-no-table').classList.add('show');
    return;
  }

  try {
    const r = await fetch(`${CONFIG.API_URL}/tables/requests/${assignModalState.requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authSession ? `Bearer ${authSession.token}` : ''
      },
      body: JSON.stringify({ tableId: assignModalState.selectedTableId }),
    });
    if (r.status === 401 || r.status === 403) { window.location.href = loginPagePath; return; }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API ${r.status}`);
    }

    closeAssignModal();
    playNotificationSound();
    toast('t-success', '✅ Cliente alocado!', 'Mesa atribuída com sucesso');
    await Promise.all([loadPendingRequests(), loadTableState()]);
    broadcastKdsSync('table.request.approved');
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}
