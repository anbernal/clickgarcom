// ─── CONFIG ────────────────────────────────────────────────────
const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const loginPagePath = String(runtimeConfig.loginPagePath || '/login.html').trim() || '/login.html';

const CONFIG = {
  API_URL: String(runtimeConfig.apiBaseUrl || '/admin/api').replace(/\/+$/, ''),
  WS_URL: resolveWebSocketUrl(),
  TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
  TENANT_NAME: 'ClickGarcom',
  POLL_INTERVAL: 15000,
  DELIVERY_RECONCILE_INTERVAL: 4000,
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
let allDeliveries = {}; // id -> delivery operational snapshot
let kdsFleet = { mode: 'CAPACITY_ONLY', drivers: [], assignments: [] };
const KDS_FLEET_API_ENABLED = window.CLICKGARCOM_RUNTIME_CONFIG?.fleetApiEnabled === true;
let tenantPrintProfile = {
  name: String(authSession?.user?.tenant_name || CONFIG.TENANT_NAME || 'Restaurante').trim() || 'Restaurante',
  contact: String(
    authSession?.user?.tenant_whatsapp_number ||
    authSession?.user?.tenant_whatsapp ||
    authSession?.user?.whatsapp_number ||
    ''
  ).trim(),
};
let notificationSoundLastStartedAt = 0;
const NOTIFICATION_SOUND_DEBOUNCE_MS = 1500;
const NOTIFICATION_SOUND_ENTITY_WINDOW_MS = 30000;
const NEW_ORDER_CHIME_DELAY_MS = 520;
const notificationSoundEntityTimes = new Map();
let ordersLoadPromise = null;
let deliveriesLoadPromise = null;
let deliveryReloadQueued = false;
let deliverySnapshotSignature = '';
const announcedAutoAcceptedDeliveries = new Set();
let activePanel = 'kitchen';
let kdsFleetAssignSubmitting = false;
let modalState = { orderId: null, tab: 'accept' };
let ws = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let pollTimer = null;
let timerInterval = null;
let recentWSEventKeys = new Map();
let deliveryRefreshTimer = null;
let deliveryReconcileTimer = null;
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
let manualOpenTabs = [];
let manualOpenTabsSearch = '';
let manualOpenTabsPage = 1;
let manualOpenTabsPageSize = 25;
let manualOpenTabsLocationFilter = 'all';
let manualOpenTabsSort = 'recent';
let manualTabDataState = { tabId: '', userPhone: '', customerInstagram: '', tableId: '' };
let activeSalaoView = 'agora';
const pendingOrderTransitions = new Set();
const stationPresentationByPanel = { kitchen: 'orders', bar: 'orders' };
const stationSummaryStageByPanel = { kitchen: 'ACCEPTED', bar: 'ACCEPTED' };
let currentKdsDensity = 'comfortable';
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
const STATION_MODE_STATS_CARD_KEYS = ['pending', 'accepted', 'ready', 'delayed'];
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
  DISPATCHER: 'DISPATCHER',
  DESPACHANTE: 'DISPATCHER',
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
  const searchParams = new URLSearchParams(window.location.search);
  const requestedPanel = resolveRequestedPanel(searchParams.get('panel'));
  const requestedMode = String(searchParams.get('mode') || '').trim().toLowerCase();
  // Delivery has its own operational screen. It deliberately reuses the
  // mature KDS delivery board, but is not part of the presencial KDS.
  const deliveryStation = requestedMode === 'delivery';
  const canOperateDelivery = ['ADMIN', 'MANAGER', 'DISPATCHER'].includes(role);
  const rolePanels = getPanelsAllowedForRole(role);
  const hasFullKdsAccess = ['ADMIN', 'MANAGER'].includes(role);
  const attendanceEnabled = authSession?.user?.attendance_enabled !== false;
  const deliveryEnabled = authSession?.user?.delivery_enabled === true;

  if (deliveryStation) {
    return {
      role,
      requestedPanel: 'delivery',
      requestedMode,
      deliveryStation,
      canOperateDelivery,
      availablePanels: ['delivery'],
      defaultPanel: 'delivery',
      stationMode: false,
      canExitStationMode: false,
      canOpenSalao: false,
      attendanceEnabled: false,
      canViewSalao: false,
      deliveryEnabled,
      canOpenDelivery: canOperateDelivery,
      canViewDelivery: deliveryEnabled && canOperateDelivery,
      canLoadTables: false,
    };
  }

  // O KDS presencial fica exclusivo para cozinha, bar e salão. A operação
  // de Delivery é aberta somente pelo acesso "Operação de entregas".
  const entitledPanels = rolePanels;
  const operationalPanels = hasFullKdsAccess
    ? entitledPanels
    : (requestedPanel && entitledPanels.includes(requestedPanel)
      ? [requestedPanel]
      : entitledPanels);
  // KDS is a presencial operation. A tenant without Atendimento keeps the
  // page safe for stale bookmarks, but sees only the unavailable state; food
  // delivery is operated from the Admin Delivery board instead.
  const availablePanels = attendanceEnabled && operationalPanels.length ? operationalPanels : ['salao'];
  const roleDefaultPanel = role === 'WAITER' && entitledPanels.includes('salao') ? 'salao' : (operationalPanels[0] || 'kitchen');
  const defaultPanel = !attendanceEnabled
    ? 'salao'
    : requestedPanel && entitledPanels.includes(requestedPanel)
    ? requestedPanel
    : roleDefaultPanel;
  const isDedicatedStationRole = role === 'KITCHEN' || role === 'BAR';
  const stationMode = isDedicatedStationRole
    || (hasFullKdsAccess && requestedMode === 'station' && ['kitchen', 'bar'].includes(defaultPanel));

  return {
    role,
    requestedPanel,
    requestedMode,
    deliveryStation,
    canOperateDelivery,
    availablePanels,
    defaultPanel,
    stationMode,
    canExitStationMode: stationMode && hasFullKdsAccess,
    canOpenSalao: attendanceEnabled && rolePanels.includes('salao'),
    attendanceEnabled,
    canViewSalao: attendanceEnabled && rolePanels.includes('salao'),
    deliveryEnabled,
    canOpenDelivery: false,
    canViewDelivery: false,
    canLoadTables: ['ADMIN', 'MANAGER', 'WAITER'].includes(role),
  };
}

function applyKdsPanelAccess() {
  const allowedPanels = new Set(KDS_ACCESS.availablePanels);

  document.body.classList.toggle('station-mode', KDS_ACCESS.stationMode);
  document.body.classList.toggle('delivery-station-mode', KDS_ACCESS.deliveryStation === true);
  document.body.dataset.kdsRole = KDS_ACCESS.role || 'UNKNOWN';
  const exitStationButton = document.getElementById('exit-station-mode');
  if (exitStationButton) {
    exitStationButton.hidden = !KDS_ACCESS.canExitStationMode;
  }

  document.querySelectorAll('[data-panel]').forEach((element) => {
    element.style.display = allowedPanels.has(element.dataset.panel) ? '' : 'none';
  });

  const attendanceDisabled = !KDS_ACCESS.attendanceEnabled;
  const status = document.getElementById('kds-module-status');
  if (status) {
    const deliveryDisabled = !KDS_ACCESS.deliveryEnabled || !KDS_ACCESS.canOperateDelivery;
    status.className = `kds-module-status${(KDS_ACCESS.deliveryStation ? deliveryDisabled : attendanceDisabled) ? ' kds-module-status--disabled' : ''}`;
    status.innerHTML = KDS_ACCESS.deliveryStation
      ? (deliveryDisabled
        ? '<strong>Delivery</strong><span>Indisponível para este acesso</span>'
        : '<strong>Delivery</strong><span>Operação ativa</span>')
      : (attendanceDisabled
        ? '<strong>Atendimento</strong><span>Desativado para esta conta</span>'
        : '<strong>Atendimento</strong><span>Ativo</span>');
  }

  if (KDS_ACCESS.deliveryStation) {
    const sectionLabel = document.querySelector('.nav-section-label');
    if (sectionLabel) sectionLabel.textContent = 'Operação de entregas';
  }

  document.querySelectorAll('.screen-panel').forEach((panel) => {
    const panelName = String(panel.id || '').replace('panel-', '');
    panel.style.display = allowedPanels.has(panelName) ? '' : 'none';
  });
}

function exitStationMode() {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.href = url.toString();
}

function initializeKdsDisplayPreferences() {
  try {
    const storedDensity = localStorage.getItem('clickgarcom_kds_density');
    if (storedDensity === 'compact' || storedDensity === 'comfortable') {
      currentKdsDensity = storedDensity;
    }
  } catch (error) {
    console.warn('KDS density preference unavailable:', error);
  }
  applyKdsDensity();
  updateFullscreenButtons();
}

function setKdsDensity(density) {
  if (!['comfortable', 'compact'].includes(density)) return;
  currentKdsDensity = density;
  try {
    localStorage.setItem('clickgarcom_kds_density', density);
  } catch (error) {
    console.warn('KDS density preference unavailable:', error);
  }
  applyKdsDensity();
}

function applyKdsDensity() {
  document.body.classList.toggle('density-compact', currentKdsDensity === 'compact');
  document.querySelectorAll('[data-kds-density]').forEach((button) => {
    const active = button.dataset.kdsDensity === currentKdsDensity;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

async function toggleKdsFullscreen() {
  if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
    toast('t-info', 'Tela cheia indisponível', 'Este navegador não permite ativar tela cheia por aqui.');
    return;
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    toast('t-error', 'Não foi possível alternar a tela', error.message);
  }
}

function updateFullscreenButtons() {
  document.querySelectorAll('[data-fullscreen-button]').forEach((button) => {
    const label = button.querySelector('span');
    if (label) label.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
    button.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
    button.disabled = !document.fullscreenEnabled;
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
  if (KDS_ACCESS.attendanceEnabled && activePanel !== 'delivery') loadOrders();
  if (KDS_ACCESS.canViewDelivery) loadDeliveries();
  if (KDS_ACCESS.canViewSalao) {
    loadPendingRequests();
    loadWaiterChats();
    loadCloseRequests();
    loadManualOpenTabs();
  }
  if (KDS_ACCESS.canLoadTables) {
    loadTableState();
  }
}

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initKdsRealtimeSync();
  applyKdsPanelAccess();
  initializeKdsDisplayPreferences();
  document.querySelectorAll('.salao-view-tab[data-salao-view]').forEach((tab) => {
    tab.addEventListener('keydown', handleSalaoTabKeydown);
  });
  document.addEventListener('fullscreenchange', updateFullscreenButtons);
  switchPanel(resolveInitialPanel());
  applySidebarTenantName();
  loadTenantPrintProfile();
  startClock();
  // Connect immediately. Delivery updates use their own KDS invalidation
  // event and must not wait for the broader orders query to finish.
  connectWebSocket();
  startDeliveryReconciliation();
  startTimerUpdates();
  // O KDS atende somente a operação presencial. A fila de Delivery é
  // carregada no painel administrativo de Entregas.
  if (KDS_ACCESS.attendanceEnabled && activePanel !== 'delivery') loadOrders();
  loadMenuItems().then(renderAll);
  const startupTasks = [];
  if (KDS_ACCESS.canViewDelivery) startupTasks.push(loadDeliveries());
  if (KDS_ACCESS.canViewSalao) {
    startupTasks.push(loadPendingRequests(), loadWaiterChats(), loadCloseRequests(), loadManualOpenTabs());
  }
  if (KDS_ACCESS.canLoadTables) {
    startupTasks.push(loadTableState());
  }
  Promise.all(startupTasks);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && KDS_ACCESS.canViewDelivery) loadDeliveries({ silent: true });
  });

  if (KDS_ACCESS.canViewSalao || KDS_ACCESS.canLoadTables) {
    setInterval(() => {
      if (KDS_ACCESS.canViewSalao) {
        loadPendingRequests();
        loadManualOpenTabs();
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

async function loadTenantPrintProfile() {
  try {
    const profile = await apiGet('/auth/me');
    const attendanceEnabled = profile?.attendance_enabled !== false;
    const rolePanels = getPanelsAllowedForRole(KDS_ACCESS.role);
    const deliveryEnabled = profile?.delivery_enabled === true;
    KDS_ACCESS.deliveryEnabled = deliveryEnabled;
    KDS_ACCESS.attendanceEnabled = attendanceEnabled;
    const availablePanels = KDS_ACCESS.deliveryStation
      ? ['delivery']
      : attendanceEnabled
      ? (['ADMIN', 'MANAGER'].includes(KDS_ACCESS.role)
        ? rolePanels
        : (KDS_ACCESS.requestedPanel && rolePanels.includes(KDS_ACCESS.requestedPanel) ? [KDS_ACCESS.requestedPanel] : rolePanels))
      : ['salao'];
    KDS_ACCESS.availablePanels = availablePanels.length ? availablePanels : ['salao'];
    KDS_ACCESS.defaultPanel = KDS_ACCESS.availablePanels.includes(KDS_ACCESS.defaultPanel)
      ? KDS_ACCESS.defaultPanel
      : KDS_ACCESS.availablePanels[0];
    KDS_ACCESS.canOpenSalao = !KDS_ACCESS.deliveryStation && attendanceEnabled && rolePanels.includes('salao');
    KDS_ACCESS.canViewSalao = attendanceEnabled && KDS_ACCESS.canOpenSalao;
    KDS_ACCESS.canOpenDelivery = KDS_ACCESS.deliveryStation && KDS_ACCESS.canOperateDelivery;
    KDS_ACCESS.canViewDelivery = deliveryEnabled && KDS_ACCESS.canOpenDelivery;
    if (KDS_ACCESS.canViewDelivery) startDeliveryReconciliation();
    else if (deliveryReconcileTimer) {
      clearInterval(deliveryReconcileTimer);
      deliveryReconcileTimer = null;
    }
    applyKdsPanelAccess();
    if (activePanel === 'delivery') switchPanel('delivery');
    else if (activePanel === 'salao') renderSalao();
    tenantPrintProfile = {
      name: String(profile?.tenant_name || tenantPrintProfile.name || 'Restaurante').trim() || 'Restaurante',
      contact: String(profile?.tenant_whatsapp_number || tenantPrintProfile.contact || '').trim(),
    };
  } catch (error) {
    console.warn('Não foi possível atualizar os dados do restaurante para impressão:', error);
  }
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
    throw new Error(formatApiErrorMessage(err, r.status));
  }
  return r.json();
}

async function apiPost(path, body, options = {}) {
  const r = await fetch(`${CONFIG.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authSession ? `Bearer ${authSession.token}` : '',
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401 || r.status === 403) window.location.href = loginPagePath;
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(formatApiErrorMessage(err, r.status));
  }
  return r.json().catch(() => ({}));
}

function formatApiErrorMessage(payload, status) {
  const message = payload?.message;
  if (Array.isArray(message) && message.length) {
    return message.map((item) => String(item || '').trim()).filter(Boolean).join(' · ') || `API ${status}`;
  }
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim();
  return `API ${status}`;
}

async function loadOrders() {
  if (ordersLoadPromise) return ordersLoadPromise;
  ordersLoadPromise = (async () => {
    try {
      const data = await apiGet(`/orders?tenant_id=${CONFIG.TENANT_ID}&status=PENDING,ACCEPTED,READY`);
      const orders = Array.isArray(data) ? data : (data.orders || []);
      allOrders = {};
      orders.forEach((order) => {
        const normalized = normalizeOrder(order);
        allOrders[normalized.id] = normalized;
      });
      renderAll();
      // Operational indicators are secondary information. Load them after
      // the cards are visible so an aggregate query never blocks the KDS.
      apiGet(`/orders/operations/summary?tenant_id=${CONFIG.TENANT_ID}`)
        .then((summary) => {
          operationsSummary = summary;
          renderAll();
        })
        .catch((error) => console.warn('Failed to load operations summary:', error));
    } catch (e) {
      console.error('Failed to load orders:', e);
      toast('t-error', '❌ Erro', 'Falha ao carregar pedidos');
    }
  })();
  try {
    return await ordersLoadPromise;
  } finally {
    ordersLoadPromise = null;
  }
}

async function loadDeliveries(options = {}) {
  if (deliveriesLoadPromise) {
    deliveryReloadQueued = true;
    return deliveriesLoadPromise;
  }
  deliveriesLoadPromise = (async () => {
    try {
      await loadKdsFleet().catch((error) => console.warn('Failed to load own fleet:', error));
      const response = await apiGet('/deliveries?status=PENDING_RESTAURANT_ACCEPTANCE,ACCEPTED,PREPARING,READY_FOR_DISPATCH,IN_TRANSIT,ASSIGNED,PICKED_UP,ARRIVED&limit=100');
      const deliveries = Array.isArray(response) ? response : (response?.data || []);
      const nextSignature = JSON.stringify(deliveries.map((delivery) => [
        delivery?.id,
        delivery?.version,
        delivery?.status,
        delivery?.acceptance_mode || delivery?.acceptanceMode,
        delivery?.updated_at || delivery?.updatedAt,
        delivery?.orders,
      ]));
      allDeliveries = {};
      deliveries.forEach((delivery) => {
        if (delivery?.id) allDeliveries[delivery.id] = delivery;
      });
      announceAutomaticDeliveryAcceptances(deliveries);
      const changed = deliverySnapshotSignature !== nextSignature;
      deliverySnapshotSignature = nextSignature;
      if (activePanel === 'delivery' && changed) renderAll();
      else updateNavBadges();
    } catch (error) {
      console.error('Failed to load deliveries:', error);
      if (activePanel === 'delivery' && !options.silent) toast('t-error', '❌ Erro', 'Falha ao carregar a fila de entregas');
    }
  })();
  try {
    return await deliveriesLoadPromise;
  } finally {
    deliveriesLoadPromise = null;
    if (deliveryReloadQueued) {
      deliveryReloadQueued = false;
      window.setTimeout(() => loadDeliveries({ silent: true }), 0);
    }
  }
}

function kdsFleetPreviewKey() {
  return `clickgarcom_fleet_preview_v1_${CONFIG.TENANT_ID || 'tenant'}`;
}

async function loadKdsFleet() {
  if (KDS_FLEET_API_ENABLED) {
    const [config, drivers, assignments] = await Promise.all([
      apiGet('/delivery/fleet/config'), apiGet('/delivery/drivers?include_inactive=false'), apiGet('/delivery/fleet/assignments?status=ACTIVE'),
    ]);
    kdsFleet = {
      mode: String(config?.config?.mode || config?.mode || 'CAPACITY_ONLY'),
      drivers: drivers?.data || drivers?.drivers || drivers || [],
      assignments: assignments?.data || assignments?.assignments || assignments || [],
    };
    return;
  }
  try {
    const preview = JSON.parse(localStorage.getItem(kdsFleetPreviewKey()) || 'null');
    if (preview) kdsFleet = { mode: preview.config?.mode || 'CAPACITY_ONLY', drivers: preview.drivers || [], assignments: preview.assignments || [] };
  } catch (_) {}
}

function kdsUsesIdentifiedFleet() {
  return kdsFleet.mode === 'IDENTIFIED_DRIVERS';
}

function kdsFleetDriver(driverId) {
  return kdsFleet.drivers.find((driver) => String(driver.id) === String(driverId));
}

function renderKdsDriverBadge(delivery) {
  if (!kdsUsesIdentifiedFleet() || String(delivery.default_fulfillment_mode || 'OWN').toUpperCase() !== 'OWN') return '';
  const driver = kdsFleetDriver(delivery.assigned_driver_id);
  return `<div class="delivery-driver-badge ${driver ? '' : 'is-unassigned'}"><span aria-hidden="true">🛵</span><div><small>Motoboy</small><strong>${escapeHTML(driver?.name || 'Ainda não atribuído')}</strong>${driver ? `<em>${escapeHTML(driver.plate || '')} · ${Number(driver.active_deliveries || 0)}/${Number(driver.delivery_limit || 1)} entrega(s)</em>` : '<em>Atribuição opcional para esta saída</em>'}</div></div>`;
}

function startDeliveryReconciliation() {
  if (!KDS_ACCESS.canViewDelivery || deliveryReconcileTimer) return;
  deliveryReconcileTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadDeliveries({ silent: true });
  }, CONFIG.DELIVERY_RECONCILE_INTERVAL);
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
  pollTimer = setInterval(() => {
    if (activePanel !== 'delivery') loadOrders();
    if (KDS_ACCESS.canViewDelivery) loadDeliveries();
  }, CONFIG.POLL_INTERVAL);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function setConnectionStatus(online) {
  document.querySelectorAll('[data-connection-status]').forEach((el) => {
    const txt = el.querySelector('.status-text');
    el.classList.toggle('offline', !online);
    if (txt) txt.textContent = online ? 'Sistema online' : 'Reconectando…';
  });
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

  if (event.type === 'delivery.updated') {
    scheduleDeliveryRefresh();
    return;
  }

  if (event.type === 'order.created') {
    const order = normalizeOrder(event.data);
    allOrders[order.id] = order;
    renderAll();
    refreshOperationsSummary();
    toast('t-info', '🆕 Novo Pedido', `#${getOrderDisplayCode(order)} · ${order.destination}`);
    // Give the visual alert a short head start so the notification is readable
    // before the new-order audio begins.
    window.setTimeout(() => playNotificationSound(order.id), 400);
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

  if (event.type === 'order.updated' || event.type === 'order.item_voided') {
    const order = normalizeOrder(event.data);
    allOrders[order.id] = order;
    renderAll();
    refreshOperationsSummary();
  }
}

function scheduleDeliveryRefresh() {
  if (!KDS_ACCESS.canViewDelivery) return;
  clearTimeout(deliveryRefreshTimer);
  deliveryRefreshTimer = setTimeout(() => {
    loadDeliveries({ silent: true });
  }, 80);
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
  if (activePanel === 'delivery') {
    renderDeliveryPanel();
    return;
  }
  renderPanel('kitchen', 'KITCHEN');
}

const DELIVERY_COLUMNS = [
  { id: 'waiting', label: 'Aguardando preparo', statuses: ['PENDING_RESTAURANT_ACCEPTANCE', 'ACCEPTED'], color: 'var(--red)' },
  { id: 'preparing', label: 'Em preparo', statuses: ['PREPARING'], color: 'var(--yellow)' },
  { id: 'ready', label: 'Pronto para saída', statuses: ['READY_FOR_DISPATCH'], color: 'var(--blue)' },
  { id: 'route', label: 'Em rota', statuses: ['IN_TRANSIT', 'ASSIGNED', 'PICKED_UP', 'ARRIVED'], color: 'var(--green)' },
];

function deliveryOrders(delivery) {
  if (Array.isArray(delivery?.orders)) return delivery.orders;
  return Object.values(allOrders).filter((order) => String(order.batch_id || order.batchId || '') === String(delivery.batch_id || ''));
}

function deliveryItemsTotal(delivery) {
  return deliveryOrders(delivery).reduce((total, order) => {
    const reportedTotal = Number(order.total || order.total_amount || order.subtotal || 0);
    if (reportedTotal > 0) return total + reportedTotal;
    return total + (Array.isArray(order.items) ? order.items.reduce((itemsTotal, item) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
      return itemsTotal + quantity * unitPrice;
    }, 0) : 0);
  }, 0);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function deliveryAddress(delivery) {
  if (delivery.formatted_address) return String(delivery.formatted_address);
  return [delivery.street, delivery.address_number, delivery.address_complement, delivery.neighborhood, delivery.city, delivery.state, delivery.postal_code]
    .filter((part) => String(part || '').trim())
    .join(' · ') || 'Endereço não informado';
}

function deliveryItems(delivery) {
  return deliveryOrders(delivery).flatMap((order) => Array.isArray(order.items) ? order.items : []);
}

function deliveryItemName(item) {
  return String(item.name || item.menu_item_name || item.menuItemName || item.item_name_snapshot || item.itemNameSnapshot || 'Item');
}

function deliveryItemSummary(delivery, options = {}) {
  const detailed = Boolean(options.detailed);
  const checklist = Boolean(options.checklist);
  const items = deliveryItems(delivery).map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
    const selectedOptions = formatSelectedOptionsSummary(item.selected_options || item.selectedOptions);
    const observation = normalizeOptionalDisplayText(item.observations);
    if (!detailed && !checklist) {
      return `<div class="delivery-card-item-row"><span><b>${quantity}x</b> ${escapeHTML(deliveryItemName(item))}</span><strong>${formatCurrency(quantity * unitPrice)}</strong></div>`;
    }
    return `<div class="delivery-production-item${checklist ? ' delivery-production-item--checklist' : ''}">
      <div class="delivery-production-item-title">${checklist ? '<span class="delivery-check" aria-hidden="true">□</span>' : ''}<b>${quantity}x</b><strong>${escapeHTML(deliveryItemName(item))}</strong></div>
      ${selectedOptions ? `<div class="delivery-item-options">${escapeHTML(selectedOptions)}</div>` : ''}
      ${observation ? `<div class="delivery-item-observation"><b>Observação:</b> ${escapeHTML(observation)}</div>` : ''}
    </div>`;
  });
  return items.length ? items.join('') : '<div class="delivery-card-loading">Itens ainda não disponíveis.</div>';
}

function deliveryMeaningfulNotes(delivery) {
  const ignored = [
    'pedido delivery pelo cardápio digital',
    'pedido delivery pelo cardapio digital',
    'pedido delivery pelo whatsapp',
  ];
  return deliveryOrders(delivery)
    .map((order) => normalizeOptionalDisplayText(order.notes))
    .filter((note) => note && !ignored.some((prefix) => note.toLocaleLowerCase('pt-BR').startsWith(prefix)));
}

function deliveryElapsedLabel(value) {
  const timestamp = new Date(value || '').getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `há ${hours}h${remainder ? ` ${remainder}min` : ''}`;
}

function deliveryPreparationTiming(delivery) {
  const startedAt = delivery.preparing_at || delivery.preparingAt || delivery.accepted_at || delivery.acceptedAt;
  const startedTimestamp = new Date(startedAt || '').getTime();
  const etaSeconds = Math.max(0, Number(delivery.eta_seconds || delivery.etaSeconds || 0));
  if (!Number.isFinite(startedTimestamp)) return '';
  const deadline = etaSeconds ? new Date(startedTimestamp + etaSeconds * 1000) : null;
  const late = deadline && Date.now() > deadline.getTime();
  return `<div class="delivery-stage-timing${late ? ' is-late' : ''}"><span>⏱ Em preparo ${escapeHTML(deliveryElapsedLabel(startedAt))}</span>${deadline ? `<strong>${late ? 'Previsão vencida' : 'Previsão'} ${deadline.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>` : ''}</div>`;
}

function deliveryActionButtons(delivery) {
  const id = escapeHTML(String(delivery.id));
  const status = String(delivery.status || '');
  const own = String(delivery.default_fulfillment_mode || 'OWN').toUpperCase() === 'OWN';
  if (['PENDING_RESTAURANT_ACCEPTANCE', 'ACCEPTED'].includes(status)) {
    return `<button class="action-btn accept" onclick="openDeliveryPreparationModal('${id}')">🍳 Definir previsão e iniciar preparo</button>`;
  }
  if (status === 'READY_FOR_DISPATCH') {
    const dispatch = own
      ? (kdsUsesIdentifiedFleet()
        ? `${!delivery.assigned_driver_id ? `<button class="action-btn secondary" onclick="openKdsNoDriverStart('${id}')">🏪 Continuar sem motoboy</button>` : ''}<button class="action-btn accept" onclick="openKdsFleetAssign('${id}')">${delivery.assigned_driver_id ? '↻ Reatribuir motoboy' : '🛵 Atribuir motoboy'}</button>`
        : `<button class="action-btn accept" onclick="startOwnDelivery('${id}')">🛵 Registrar saída</button>`)
      : '<span class="delivery-external-note">Aguardando operador externo</span>';
    return `<button class="action-btn secondary" onclick="printDeliveryDispatch('${id}')">🖨️ Imprimir expedição</button>${dispatch}`;
  }
  if (status === 'PREPARING' && own) {
    const autoPrint = String(delivery.acceptance_mode || delivery.acceptanceMode || '').toUpperCase() === 'AUTO'
      ? `<button class="action-btn secondary" onclick="printDeliveryDispatch('${id}')">🖨️ Ver expedição</button>`
      : '';
    return `${autoPrint}<button class="action-btn accept" onclick="markOwnDeliveryReady('${id}')">✅ Marcar pronto para saída</button>`;
  }
  if (status === 'IN_TRANSIT' && own) {
    return `<button class="action-btn accept" onclick="completeOwnDelivery('${id}')">✅ Confirmar entrega</button>`;
  }
  return '<span class="delivery-external-note">Atualização recebida do operador.</span>';
}

function deliveryModeLabel(mode) {
  return String(mode || 'OWN').toUpperCase() === 'OWN' ? 'Entrega própria' : 'Entrega iFood';
}

function deliveryCardHeader(delivery, contextLabel) {
  const mode = String(delivery.default_fulfillment_mode || 'OWN').toUpperCase();
  return `<div class="delivery-card-head"><div><span class="delivery-card-eyebrow">${escapeHTML(contextLabel)}</span><strong>🛵 #${escapeHTML(delivery.display_code || String(delivery.id).slice(0, 8))}</strong></div><span class="delivery-mode-badge delivery-mode-badge--${mode === 'OWN' ? 'own' : 'external'}">${escapeHTML(deliveryModeLabel(mode))}</span></div>`;
}

function deliveryCustomerBlock(delivery, showPhone = true) {
  const customerName = String(delivery.customer_name || 'Cliente do WhatsApp');
  const phone = String(delivery.customer_phone || '').trim();
  return `<div class="delivery-card-customer"><span class="delivery-card-avatar" aria-hidden="true">👤</span><div><span class="delivery-card-eyebrow">Cliente</span><strong>${escapeHTML(customerName)}</strong>${showPhone && phone ? `<a href="tel:${escapeHTML(phone)}">📞 ${escapeHTML(formatBrazilianPhoneMask(phone))}</a>` : ''}</div></div>`;
}

function deliveryAddressBlock(delivery, label = 'Entregar em') {
  return `<div class="delivery-card-section delivery-card-address"><span class="delivery-card-eyebrow">${escapeHTML(label)}</span><strong>📍 ${escapeHTML(deliveryAddress(delivery))}</strong>${delivery.address_reference ? `<small>Referência: ${escapeHTML(String(delivery.address_reference))}</small>` : ''}</div>`;
}

function deliveryCompactTotal(delivery) {
  const itemsTotal = deliveryItemsTotal(delivery);
  const deliveryFee = Number(delivery.customer_delivery_fee ?? delivery.delivery_fee ?? 0);
  return `<div class="delivery-compact-total"><span>${deliveryItems(delivery).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0)} itens · frete ${formatCurrency(deliveryFee)}</span><strong>${formatCurrency(itemsTotal + deliveryFee)}</strong></div>`;
}

function renderWaitingDeliveryCard(delivery) {
  return `${deliveryCardHeader(delivery, 'Novo pedido')}
    <div class="delivery-stage-callout delivery-stage-callout--waiting"><strong>Conferir e aceitar</strong><span>Recebido ${escapeHTML(deliveryElapsedLabel(delivery.created_at || delivery.createdAt))}</span></div>
    ${deliveryCustomerBlock(delivery, false)}
    <div class="delivery-card-section"><span class="delivery-card-eyebrow">Resumo do pedido</span>${deliveryItemSummary(delivery)}</div>
    ${deliveryAddressBlock(delivery, 'Destino')}
    ${deliveryCompactTotal(delivery)}
    <div class="order-actions">${deliveryActionButtons(delivery)}</div>`;
}

function renderPreparingDeliveryCard(delivery) {
  const notes = deliveryMeaningfulNotes(delivery);
  const automatic = String(delivery.acceptance_mode || delivery.acceptanceMode || '').toUpperCase() === 'AUTO';
  return `${deliveryCardHeader(delivery, automatic ? 'Aceito automaticamente' : 'Produção')}
    ${automatic ? '<div class="delivery-auto-accepted"><span aria-hidden="true">⚡</span><div><strong>Preparo iniciado automaticamente</strong><small>As regras de aceite foram atendidas.</small></div></div>' : ''}
    ${deliveryPreparationTiming(delivery)}
    <div class="delivery-card-section delivery-card-items delivery-card-items--production"><span class="delivery-card-eyebrow">Preparar estes itens</span>${deliveryItemSummary(delivery, { detailed: true })}</div>
    ${notes.length ? `<div class="delivery-order-note"><b>Observação geral</b>${notes.map((note) => `<span>${escapeHTML(note)}</span>`).join('')}</div>` : ''}
    <div class="order-actions">${deliveryActionButtons(delivery)}</div>`;
}

function renderReadyDeliveryCard(delivery) {
  return `${deliveryCardHeader(delivery, 'Conferência e expedição')}
    <div class="delivery-stage-callout delivery-stage-callout--ready"><strong>Pedido pronto</strong><span>Confira a embalagem antes da saída</span></div>
    <div class="delivery-card-section delivery-card-items"><span class="delivery-card-eyebrow">Checklist da sacola</span>${deliveryItemSummary(delivery, { checklist: true })}</div>
    ${deliveryAddressBlock(delivery)}
    ${deliveryCustomerBlock(delivery, true)}
    ${renderKdsDriverBadge(delivery)}
    <div class="order-actions">${deliveryActionButtons(delivery)}</div>`;
}

function renderRouteDeliveryCard(delivery) {
  const statusLabels = { ASSIGNED: 'Entregador definido', PICKED_UP: 'Pedido coletado', IN_TRANSIT: 'A caminho', ARRIVED: 'Entregador chegou' };
  const status = String(delivery.status || 'IN_TRANSIT');
  const stageStartedAt = delivery.in_transit_at || delivery.inTransitAt || delivery.picked_up_at || delivery.pickedUpAt || delivery.updated_at || delivery.updatedAt;
  return `${deliveryCardHeader(delivery, 'Entrega em andamento')}
    <div class="delivery-route-status"><span class="delivery-route-pulse"></span><div><strong>${escapeHTML(statusLabels[status] || 'Em rota')}</strong><small>Atualizado ${escapeHTML(deliveryElapsedLabel(stageStartedAt))}</small></div></div>
    ${deliveryAddressBlock(delivery, 'Próxima parada')}
    ${deliveryCustomerBlock(delivery, true)}
    ${renderKdsDriverBadge(delivery)}
    ${deliveryCompactTotal(delivery)}
    <div class="order-actions">${deliveryActionButtons(delivery)}</div>`;
}

function renderDeliveryCard(delivery, columnId) {
  const contents = columnId === 'preparing'
    ? renderPreparingDeliveryCard(delivery)
    : columnId === 'ready'
      ? renderReadyDeliveryCard(delivery)
      : columnId === 'route'
        ? renderRouteDeliveryCard(delivery)
        : renderWaitingDeliveryCard(delivery);
  const automatic = columnId === 'preparing' && String(delivery.acceptance_mode || delivery.acceptanceMode || '').toUpperCase() === 'AUTO';
  return `<article class="order-card delivery-card delivery-card--${escapeHTML(columnId)}${automatic ? ' delivery-card--auto-accepted' : ''}" data-id="${escapeHTML(String(delivery.id))}">${contents}</article>`;
}

function renderDeliveryPanel() {
  const panel = document.getElementById('panel-delivery');
  if (!KDS_ACCESS.deliveryEnabled) {
    if (panel) panel.innerHTML = renderKdsDeliveryUnavailable();
    return;
  }
  const deliveries = Object.values(allDeliveries);
  DELIVERY_COLUMNS.forEach((column) => {
    const columnDeliveries = deliveries
      .filter((delivery) => column.statuses.includes(String(delivery.status || '')))
      .sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));
    const count = document.getElementById(`cc-d-${column.id}`);
    const body = document.getElementById(`col-d-${column.id}`);
    if (count) count.textContent = String(columnDeliveries.length);
    if (!body) return;
    body.innerHTML = columnDeliveries.length
      ? columnDeliveries.map((delivery) => renderDeliveryCard(delivery, column.id)).join('')
      : '<div class="empty-column">Nenhuma entrega nesta etapa.</div>';
  });
}

function renderKdsDeliveryUnavailable() {
  if (!KDS_ACCESS.canOperateDelivery) {
    return `<section class="kds-delivery-unavailable" aria-labelledby="kds-delivery-unavailable-title">
      <div class="kds-delivery-unavailable-icon" aria-hidden="true">🔒</div>
      <span class="kds-delivery-unavailable-eyebrow">OPERAÇÃO DE ENTREGAS</span>
      <h2 id="kds-delivery-unavailable-title">Seu perfil não possui acesso a esta operação.</h2>
      <p>Peça a um administrador para liberar a permissão de Delivery para o seu usuário.</p>
    </section>`;
  }
  const tenantName = String(authSession?.user?.tenant_name || CONFIG.TENANT_NAME || 'seu restaurante').trim();
  const subject = encodeURIComponent(`Ativar Delivery - ${tenantName}`);
  return `<section class="kds-delivery-unavailable" aria-labelledby="kds-delivery-unavailable-title">
    <div class="kds-delivery-unavailable-glow kds-delivery-unavailable-glow--one" aria-hidden="true"></div>
    <div class="kds-delivery-unavailable-glow kds-delivery-unavailable-glow--two" aria-hidden="true"></div>
    <div class="kds-delivery-unavailable-icon" aria-hidden="true">⚡</div>
    <span class="kds-delivery-unavailable-eyebrow">AGILIDADE OPERACIONAL</span>
    <h2 id="kds-delivery-unavailable-title">Mais velocidade para cada entrega.</h2>
    <p>O Delivery organiza preparo, expedição e rota em uma única fila para sua equipe ganhar tempo e o cliente acompanhar tudo.</p>
    <div class="kds-delivery-unavailable-features">
      <span>⚡ Fluxo sem espera</span><span>📍 Rota acompanhada</span><span>✓ Confirmação segura</span>
    </div>
    <div class="kds-delivery-unavailable-cta">
      <div><strong>Delivery não está disponível para esta conta</strong><small>Fale com a equipe ClickGarçom para ativar o módulo.</small></div>
      <a href="mailto:suporte@clickgarcom.com.br?subject=${subject}">Fale com a gente</a>
    </div>
  </section>`;
}

function renderKdsAttendanceUnavailable() {
  const tenantName = String(authSession?.user?.tenant_name || CONFIG.TENANT_NAME || 'seu restaurante').trim();
  const subject = encodeURIComponent(`Ativar Atendimento - ${tenantName}`);
  return `<section class="kds-attendance-unavailable" aria-labelledby="kds-attendance-unavailable-title">
    <div class="kds-attendance-unavailable-icon" aria-hidden="true">⚡</div>
    <span class="kds-attendance-unavailable-eyebrow">OPERAÇÃO PRESENCIAL</span>
    <h2 id="kds-attendance-unavailable-title">Atendimento mais ágil, quando você precisar.</h2>
    <p>Mesas, comandas e chamados de garçom ficam organizados em um único painel para sua equipe atender sem perder tempo.</p>
    <div class="kds-attendance-unavailable-features"><span>🪑 Mesas</span><span>🔖 Comandas</span><span>⚡ KDS Salão</span></div>
    <div class="kds-attendance-unavailable-cta"><div><strong>Atendimento não está disponível para esta conta</strong><small>Fale com a equipe ClickGarçom para ativar o módulo.</small></div><a href="mailto:suporte@clickgarcom.com.br?subject=${subject}">Fale com a gente</a></div>
  </section>`;
}

function renderPanel(panel, destination) {
  const deliveryBatchIds = new Set(Object.values(allDeliveries).map((delivery) => String(delivery.batch_id || '')));
  const orders = Object.values(allOrders).filter((order) => (
    order.destination === destination
    && String(order.service_type || order.serviceType || '').toUpperCase() !== 'DELIVERY'
    && !deliveryBatchIds.has(String(order.batch_id || order.batchId || ''))
  ));
  const pending = orders.filter(o => o.status === 'PENDING');
  const accepted = orders.filter(o => o.status === 'ACCEPTED');
  const ready = orders.filter(o => o.status === 'READY');
  const stationSummary = getStationOperations(destination);
  const localDelayedCount = orders.filter((order) => getOrderStageSnapshot(order).elapsed.severity === 'critical').length;
  const localWarningCount = orders.filter((order) => getOrderStageSnapshot(order).elapsed.severity === 'warning').length;
  const effectiveStationSummary = {
    ...(stationSummary || {}),
    delayedCount: Math.max(Number(stationSummary?.delayedCount || 0), localDelayedCount),
    warningCount: Math.max(Number(stationSummary?.warningCount || 0), localWarningCount),
  };

  const prefix = panel === 'kitchen' ? 'k' : 'b';
  renderColumn(`col-${prefix}-pending`, pending, 'PENDING');
  renderColumn(`col-${prefix}-accepted`, accepted, 'ACCEPTED');
  renderColumn(`col-${prefix}-ready`, ready, 'READY');

  document.getElementById(`cc-${prefix}-pending`).textContent = pending.length;
  document.getElementById(`cc-${prefix}-accepted`).textContent = accepted.length;
  document.getElementById(`cc-${prefix}-ready`).textContent = ready.length;

  if (activePanel === panel) {
    const lateCount = document.getElementById('station-late-count');
    if (lateCount) {
      const delayedCount = effectiveStationSummary.delayedCount;
      lateCount.textContent = String(delayedCount);
      lateCount.closest('.station-late-indicator')?.classList.toggle('has-late-orders', delayedCount > 0);
    }
  }

  renderStats(`stats-${panel}`, pending.length, accepted.length, ready.length, destination, effectiveStationSummary);
  renderProductionSummary(panel, destination, orders);
  applyStationPresentation(panel);
}

function switchStationPresentation(presentation) {
  if (!['orders', 'summary'].includes(presentation) || !['kitchen', 'bar'].includes(activePanel)) return;
  stationPresentationByPanel[activePanel] = presentation;
  applyStationPresentation(activePanel);
}

function setStationSummaryStage(stage) {
  if (!['PENDING', 'ACCEPTED', 'READY'].includes(stage) || !['kitchen', 'bar'].includes(activePanel)) return;
  stationSummaryStageByPanel[activePanel] = stage;
  renderCurrentPanel();
}

function applyStationPresentation(panel) {
  if (!['kitchen', 'bar'].includes(panel)) return;
  const presentation = stationPresentationByPanel[panel] || 'orders';
  const toolbar = document.querySelector(`[data-station-toolbar="${panel}"]`);
  const orders = document.querySelector(`[data-station-orders="${panel}"]`);
  const summary = document.querySelector(`[data-station-summary="${panel}"]`);
  if (!toolbar || !orders || !summary) return;

  toolbar.querySelectorAll('[data-station-presentation]').forEach((button) => {
    const active = button.dataset.stationPresentation === presentation;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const stageControls = toolbar.querySelector('[data-station-stage-controls]');
  if (stageControls) stageControls.hidden = presentation !== 'summary';
  toolbar.querySelectorAll('[data-station-summary-stage]').forEach((button) => {
    const active = button.dataset.stationSummaryStage === stationSummaryStageByPanel[panel];
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  orders.hidden = presentation !== 'orders';
  summary.hidden = presentation !== 'summary';
}

function renderProductionSummary(panel, destination, stationOrders) {
  const container = document.querySelector(`[data-station-summary="${panel}"]`);
  if (!container) return;
  const startedAt = performance.now();
  const stage = stationSummaryStageByPanel[panel] || 'ACCEPTED';
  const stageLabels = { PENDING: 'Novos pedidos', ACCEPTED: 'Em preparo', READY: 'Prontos para entrega' };
  const aggregate = aggregateProductionItems(
    stationOrders.filter((order) => order.destination === destination && order.status === stage)
  );
  const totalQuantity = aggregate.reduce((total, item) => total + item.quantity, 0);

  container.innerHTML = `
    <div class="production-summary-heading">
      <div><h2>${escapeHTML(stageLabels[stage])}</h2><p>Consolidado para apoio à bancada; os pedidos continuam disponíveis na visão principal.</p></div>
      <span class="production-summary-total">${escapeHTML(totalQuantity)} unidade(s)</span>
    </div>
    <div class="production-summary-grid">
      ${aggregate.length ? aggregate.map((item) => `
        <article class="production-summary-item">
          <div class="production-summary-qty">${escapeHTML(item.quantity)}x</div>
          <div><div class="production-summary-name">${escapeHTML(item.name)}</div>${item.details ? `<div class="production-summary-details">${escapeHTML(item.details)}</div>` : ''}</div>
        </article>
      `).join('') : '<div class="empty-state" style="grid-column:1/-1">Nenhum item neste estágio.</div>'}
    </div>`;
  container.dataset.renderDurationMs = (performance.now() - startedAt).toFixed(2);
  container.dataset.aggregateRows = String(aggregate.length);
}

function aggregateProductionItems(orders) {
  const aggregate = new Map();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      if (isVoidedOrderItem(item)) return;
      const quantity = Number(item.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const name = resolveItemName(item);
      const details = buildProductionItemDetails(item);
      const signature = [name.trim().toLowerCase(), buildProductionOptionSignature(item), details.trim().toLowerCase()].join('|');
      const current = aggregate.get(signature) || { name, details, quantity: 0 };
      current.quantity += quantity;
      aggregate.set(signature, current);
    });
  });
  return Array.from(aggregate.values()).sort((a, b) => (
    b.quantity - a.quantity || a.name.localeCompare(b.name, 'pt-BR')
  ));
}

function isVoidedOrderItem(item) {
  const status = String(item?.status || '').trim().toUpperCase();
  return status === 'VOIDED' || status === 'CANCELED' || Boolean(item?.voided_at || item?.voidedAt || item?.is_voided || item?.isVoided);
}

function buildProductionOptionSignature(item) {
  const options = Array.isArray(item?.selected_options || item?.selectedOptions)
    ? (item.selected_options || item.selectedOptions)
    : [];
  return options.map((option) => [
    option?.group_name || option?.groupName || option?.group || '',
    option?.option_name || option?.optionName || option?.name || '',
    Number(option?.price_delta ?? option?.priceDelta ?? 0),
  ].map((value) => String(value).trim().toLowerCase()).join(':')).sort().join('|');
}

function buildProductionItemDetails(item) {
  const selectedOptions = item.selected_options || item.selectedOptions;
  const formattedOptions = formatSelectedOptionsSummary(selectedOptions)
    || (Array.isArray(selectedOptions)
      ? selectedOptions.map((option) => option?.option_name || option?.optionName || option?.name || '').filter(Boolean).join(', ')
      : '');
  const observations = normalizeOptionalDisplayText(item.observations);
  return [
    resolveComboSummary(item) ? `Combo: ${resolveComboSummary(item)}` : '',
    formattedOptions ? `Opções: ${formattedOptions}` : '',
    observations ? `Obs.: ${observations}` : '',
  ].filter(Boolean).join(' · ');
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

  // Atrasos e pedidos em atenção aparecem primeiro; dentro da mesma urgência,
  // preservamos a fila por tempo de entrada no estágio.
  orders.sort(compareOrdersByOperationalUrgency);
  orders.forEach(o => {
    let card = container.querySelector(`[data-id="${o.id}"]`);
    if (!card) {
      card = createOrderCard(o);
    } else {
      updateOrderCard(card, o);
    }
    container.appendChild(card);
  });

  if (orders.length === 0 && !container.querySelector('.empty-state')) {
    container.innerHTML = '<div class="empty-state">Nenhum pedido</div>';
  } else if (orders.length > 0) {
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();
  }
}

function compareOrdersByOperationalUrgency(a, b) {
  const severityWeight = { critical: 0, warning: 1, normal: 2 };
  const stageA = getOrderStageSnapshot(a);
  const stageB = getOrderStageSnapshot(b);
  const severityDifference = (severityWeight[stageA.elapsed.severity] ?? 2)
    - (severityWeight[stageB.elapsed.severity] ?? 2);
  if (severityDifference !== 0) return severityDifference;

  const startedAtA = new Date(stageA.startedAt || a.created_at || 0).getTime();
  const startedAtB = new Date(stageB.startedAt || b.created_at || 0).getTime();
  return startedAtA - startedAtB;
}

function reorderOrderColumn(container) {
  if (!container) return;
  const cards = Array.from(container.querySelectorAll('.order-card'));
  cards.sort((cardA, cardB) => {
    const orderA = allOrders[cardA.dataset.id];
    const orderB = allOrders[cardB.dataset.id];
    if (!orderA || !orderB) return 0;
    return compareOrdersByOperationalUrgency(orderA, orderB);
  });
  cards.forEach((card) => container.appendChild(card));
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
    itemsHtml = order.items.map((item) => {
      const comboSummary = resolveComboSummary(item);
      const optionsSummary = formatSelectedOptionsSummary(item.selected_options || item.selectedOptions);
      const observations = normalizeOptionalDisplayText(item.observations);
      const details = [
        comboSummary ? `<div class="item-modifier">Combo: ${escapeHTML(comboSummary)}</div>` : '',
        optionsSummary ? `<div class="item-modifier">Adicionais: ${escapeHTML(optionsSummary)}</div>` : '',
        observations ? `<div class="item-observation"><span aria-hidden="true">⚠</span><span>${escapeHTML(observations)}</span></div>` : '',
      ].filter(Boolean).join('');

      return `
        <div class="order-item">
          <div class="item-main">
            <span class="item-qty">${escapeHTML(item.quantity)}x</span>
            <span class="item-name">${escapeHTML(resolveItemName(item))}</span>
          </div>
          ${details ? `<div class="item-details">${details}</div>` : ''}
        </div>`;
    }).join('');
  }

  let actions = '';
  if (order.status === 'PENDING') {
    const secondaryActions = `${KDS_ACCESS.canViewSalao ? `<button class="action-btn secondary-btn" onclick="openManualEditOrderModal('${order.id}')">✎ Editar</button>` : ''}<button class="action-btn reject-btn" onclick="openModal('${order.id}','reject')">${KDS_ICONS.x} Recusar</button>`;
    actions = `<div class="order-secondary-actions">${secondaryActions}</div><button class="action-btn action-primary accept-btn" onclick="openModal('${order.id}','accept')">${KDS_ICONS.check} Aceitar</button>`;
  } else if (order.status === 'ACCEPTED') {
    actions = `<button class="action-btn action-primary done-btn" onclick="updateStatus('${order.id}','READY')">${KDS_ICONS.check} Marcar pronto</button>`;
  } else if (order.status === 'READY') {
    actions = `<button class="action-btn action-primary deliver-btn" onclick="updateStatus('${order.id}','DELIVERED')">${KDS_ICONS.package} Confirmar entrega</button>`;
  }

  return `
    <div class="order-card-header">
      <span class="table-badge">${escapeHTML(getOrderTableLabel(order))}</span>
      <span class="order-id">Pedido #${escapeHTML(getOrderDisplayCode(order))}</span>
      <span class="order-type-badge ${badge}">${destLabel}</span>
    </div>
    <div class="order-items">${itemsHtml || '<div class="order-item"><span class="item-name" style="color:var(--text-3)">Sem itens</span></div>'}</div>
    <div class="order-card-footer">
      <span
        class="order-timer ${stage.elapsed.warning ? 'warning' : ''} ${stage.elapsed.urgent ? 'urgent' : ''}"
        data-start="${escapeHTML(stage.startedAt || '')}"
        data-stage="${escapeHTML(stage.key)}"
        data-station="${escapeHTML(stage.stationKey || 'ATTENDANCE')}"
        data-severity="${escapeHTML(stage.elapsed.severity)}"
      >
        ⏱ ${escapeHTML(stage.label)} ${escapeHTML(stage.elapsed.text)} · limite ${escapeHTML(String(stage.criticalMinutes))} min
      </span>
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
  const visibleKeys = getVisibleStationStatsCardKeys();
  const presentationMode = KDS_ACCESS.stationMode ? 'station' : 'full';
  if (
    container.dataset.initialized === 'true'
    && container.dataset.destination === destination
    && container.dataset.presentationMode === presentationMode
  ) return;

  container.innerHTML = visibleKeys.map((key) => `
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
  container.dataset.presentationMode = presentationMode;
}

function updateStationStatsCards(container, values) {
  getVisibleStationStatsCardKeys().forEach((key) => {
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

function getVisibleStationStatsCardKeys() {
  return KDS_ACCESS.stationMode ? STATION_MODE_STATS_CARD_KEYS : STATION_STATS_CARD_KEYS;
}

function renderSalao() {
  if (!KDS_ACCESS.attendanceEnabled) {
    const panel = document.getElementById('panel-salao');
    if (panel) panel.innerHTML = renderKdsAttendanceUnavailable();
    return;
  }
  applySalaoViewState();
  updateSalaoNavigationCounters();
  renderSalaoNow();
  renderWaiterChats();
  renderSalaoTables();
  renderManualOpenTabs();
}

function switchSalaoView(view) {
  const allowedViews = ['agora', 'comandas', 'mesas', 'conversas'];
  if (!allowedViews.includes(view)) return;
  activeSalaoView = view;
  applySalaoViewState();
}

function applySalaoViewState() {
  document.querySelectorAll('.salao-view-tab[data-salao-view]').forEach((tab) => {
    const active = tab.dataset.salaoView === activeSalaoView;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.salao-view[data-salao-view-panel]').forEach((panel) => {
    const active = panel.dataset.salaoViewPanel === activeSalaoView;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function handleSalaoTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll('.salao-view-tab[data-salao-view]'));
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  const nextTab = tabs[nextIndex];
  switchSalaoView(nextTab.dataset.salaoView);
  nextTab.focus();
}

function updateSalaoNavigationCounters() {
  const readyOrders = Object.values(allOrders).filter((order) => order.status === 'READY').length;
  const values = {
    agora: readyOrders + pendingRequests.length + closeBillRequests.length,
    comandas: manualOpenTabs.length,
    mesas: tableMetrics.available,
    conversas: waiterChats.filter((chat) => chat.status === 'OPEN').length,
  };
  Object.entries(values).forEach(([key, value]) => {
    const counter = document.getElementById(`salao-nav-${key}-count`);
    if (counter) counter.textContent = String(value);
  });
}

function renderSalaoNow() {
  const list = document.getElementById('salao-now-list');
  if (!list) return;

  const tasks = [];
  Object.values(allOrders).filter((order) => order.status === 'READY').forEach((order) => {
    const stage = getOrderStageSnapshot(order);
    tasks.push({ type: 'delivery', timestamp: stage.startedAt, severity: stage.elapsed.severity, order, elapsed: stage.elapsed });
  });
  pendingRequests.forEach((request) => {
    const timestamp = request.createdAt || request.created_at;
    tasks.push({ type: 'attendance', timestamp, severity: getElapsed(timestamp).severity, request, elapsed: getElapsed(timestamp) });
  });
  closeBillRequests.forEach((request) => {
    const timestamp = request.createdAt || request.created_at;
    tasks.push({ type: 'closing', timestamp, severity: getElapsed(timestamp).severity, request, elapsed: getElapsed(timestamp) });
  });

  const severityWeight = { critical: 0, warning: 1, normal: 2 };
  tasks.sort((a, b) => {
    const severityDifference = (severityWeight[a.severity] ?? 2) - (severityWeight[b.severity] ?? 2);
    if (severityDifference !== 0) return severityDifference;
    return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
  });

  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">✓</div>Nenhuma ação urgente agora<div class="empty-sub">Novas entregas e solicitações aparecerão aqui.</div></div>';
    return;
  }

  list.innerHTML = tasks.map(renderSalaoNowTask).join('');
}

function renderSalaoNowTask(task) {
  if (task.type === 'delivery') return renderSalaoDeliveryTask(task);
  if (task.type === 'attendance') return renderSalaoAttendanceTask(task);
  return renderSalaoClosingTask(task);
}

function renderSalaoDeliveryTask({ order, elapsed, severity }) {
  const tableCode = getOrderTableCode(order);
  const location = tableCode ? `Mesa ${tableCode}` : `Comanda #${getOrderDisplayCode(order)}`;
  const dishes = (order.items || []).map((item) => `
    <div class="salao-ready-dish"><strong>${escapeHTML(item.quantity)}x</strong><span>${escapeHTML(resolveItemName(item))}</span></div>
  `).join('') || '<div class="salao-ready-dish"><span></span><span>Itens não informados</span></div>';
  return `
    <article class="salao-now-card delivery ${escapeHTML(severity)}">
      <div class="salao-now-kind" aria-hidden="true">${order.destination === 'BAR' ? '🍹' : '🍽'}</div>
      <div class="salao-now-content">
        <div class="salao-now-location">${escapeHTML(location)}</div>
        <div class="salao-now-label">Entregar · Pedido #${escapeHTML(getOrderDisplayCode(order))}</div>
        <div class="salao-ready-dishes">${dishes}</div>
        <div class="salao-now-meta">Pronto há ${escapeHTML(elapsed.text)}</div>
      </div>
      <div class="salao-now-actions"><button class="action-btn action-primary deliver-btn" onclick="updateStatus('${order.id}','DELIVERED')">Confirmar entrega</button></div>
    </article>`;
}

function renderSalaoAttendanceTask({ request, elapsed, severity }) {
  const phone = String(request.userPhone || request.user_phone || 'Cliente');
  const tableId = request.tableId || request.table_id || null;
  const tableNumber = request.table?.number || request.table_number || null;
  const pax = request.paxCount || request.pax_count || '?';
  const location = tableNumber ? `Mesa ${formatTableNumber(tableNumber)}` : `Nova comanda · ${phone.slice(-4)}`;
  const approveAction = tableId
    ? `openAssignModal('${escapeHTML(request.id)}','${escapeHTML(phone)}','${escapeHTML(pax)}')`
    : `approvePendingRequest('${escapeHTML(request.id)}')`;
  const approveLabel = tableId ? 'Alocar mesa' : 'Abrir comanda';
  return `
    <article class="salao-now-card attendance ${escapeHTML(severity)}">
      <div class="salao-now-kind" aria-hidden="true">👤</div>
      <div class="salao-now-content">
        <div class="salao-now-location">${escapeHTML(location)}</div>
        <div class="salao-now-label">Novo atendimento</div>
        <div class="salao-now-meta">${escapeHTML(String(pax))} pessoa(s) · aguardando há ${escapeHTML(elapsed.text)}</div>
      </div>
      <div class="salao-now-actions">
        <button class="action-btn reject-btn" onclick="openRequestRejectModal('${escapeHTML(request.id)}')">Recusar</button>
        <button class="action-btn action-primary accept-btn" onclick="${approveAction}">${approveLabel}</button>
      </div>
    </article>`;
}

function renderSalaoClosingTask({ request, elapsed, severity }) {
  const tableRaw = String(request.tableNumber || '').trim();
  const location = tableRaw ? `Mesa ${formatTableNumber(tableRaw)}` : `Comanda · ${String(request.userPhone || '').slice(-4) || 'sem mesa'}`;
  return `
    <article class="salao-now-card closing ${escapeHTML(severity)}">
      <div class="salao-now-kind" aria-hidden="true">💰</div>
      <div class="salao-now-content">
        <div class="salao-now-location">${escapeHTML(location)}</div>
        <div class="salao-now-label">Fechar conta</div>
        <div class="salao-now-meta">${escapeHTML(formatMoney(request.amountDue || 0))} pendente · solicitado há ${escapeHTML(elapsed.text)}</div>
      </div>
      <div class="salao-now-actions"><button class="action-btn action-primary accept-btn" onclick="finalizeCloseBillRequest('${escapeHTML(request.id)}')">Conta finalizada</button></div>
    </article>`;
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

function renderManualOpenTabs() {
  const list = document.getElementById('salao-tabs-list');
  const count = document.getElementById('salao-tabs-count');
  if (!list) return;
  if (count) count.textContent = String(manualOpenTabs.length);
  ensureManualTabsWorkspace(list);
  syncManualTabsControls();
  renderManualTabsResults();
}

function ensureManualTabsWorkspace(list) {
  if (list.dataset.comandasWorkspace === 'true') return;
  list.classList.add('kds-comandas-workspace');
  list.innerHTML = `
    <div class="kds-comandas-toolbar" aria-label="Filtros de comandas">
      <label class="kds-comandas-field">
        <span>Buscar comanda</span>
        <div class="kds-comandas-search-control">
          <span aria-hidden="true">⌕</span>
          <input id="kds-comandas-search" class="input" type="search" autocomplete="off" placeholder="Código, mesa, telefone ou cliente" oninput="setManualOpenTabsSearch(this.value)">
        </div>
      </label>
      <label class="kds-comandas-field">
        <span>Local</span>
        <select id="kds-comandas-location-filter" class="input" onchange="setManualOpenTabsLocationFilter(this.value)">
          <option value="all">Todas</option>
          <option value="table">Com mesa</option>
          <option value="counter">Sem mesa</option>
        </select>
      </label>
      <label class="kds-comandas-field">
        <span>Ordenar por</span>
        <select id="kds-comandas-sort" class="input" onchange="setManualOpenTabsSort(this.value)">
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="table">Número da mesa</option>
          <option value="value">Maior consumo</option>
        </select>
      </label>
      <label class="kds-comandas-field">
        <span>Por página</span>
        <select id="kds-comandas-page-size" class="input" onchange="setManualOpenTabsPageSize(this.value)">
          <option value="15">15</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </label>
    </div>
    <div class="kds-comandas-results-summary" id="kds-comandas-results-summary"></div>
    <div class="kds-comandas-table" role="table" aria-label="Comandas abertas">
      <div class="kds-comandas-table-head" role="row">
        <span role="columnheader">Comanda</span>
        <span role="columnheader">Cliente</span>
        <span role="columnheader">Local</span>
        <span role="columnheader">Consumo</span>
        <span role="columnheader">Abertura</span>
        <span role="columnheader" style="text-align:right">Ações</span>
      </div>
      <div id="kds-comandas-table-body" role="rowgroup"></div>
    </div>
    <div class="kds-comandas-pagination" id="kds-comandas-pagination" aria-label="Paginação de comandas"></div>`;
  list.dataset.comandasWorkspace = 'true';
}

function syncManualTabsControls() {
  const searchInput = document.getElementById('kds-comandas-search');
  const locationFilter = document.getElementById('kds-comandas-location-filter');
  const sort = document.getElementById('kds-comandas-sort');
  const pageSize = document.getElementById('kds-comandas-page-size');
  if (searchInput && searchInput !== document.activeElement) searchInput.value = manualOpenTabsSearch;
  if (locationFilter) locationFilter.value = manualOpenTabsLocationFilter;
  if (sort) sort.value = manualOpenTabsSort;
  if (pageSize) pageSize.value = String(manualOpenTabsPageSize);
}

function setManualOpenTabsSearch(value) {
  manualOpenTabsSearch = String(value || '');
  manualOpenTabsPage = 1;
  renderManualTabsResults();
}

function setManualOpenTabsLocationFilter(value) {
  manualOpenTabsLocationFilter = ['all', 'table', 'counter'].includes(value) ? value : 'all';
  manualOpenTabsPage = 1;
  renderManualTabsResults();
}

function setManualOpenTabsSort(value) {
  manualOpenTabsSort = ['recent', 'oldest', 'table', 'value'].includes(value) ? value : 'recent';
  manualOpenTabsPage = 1;
  renderManualTabsResults();
}

function setManualOpenTabsPageSize(value) {
  const nextSize = Number(value);
  manualOpenTabsPageSize = [15, 25, 50].includes(nextSize) ? nextSize : 25;
  manualOpenTabsPage = 1;
  renderManualTabsResults();
}

function setManualOpenTabsPage(page) {
  manualOpenTabsPage = Math.max(1, Number(page) || 1);
  renderManualTabsResults();
  document.getElementById('salao-view-comandas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearManualOpenTabsFilters() {
  manualOpenTabsSearch = '';
  manualOpenTabsLocationFilter = 'all';
  manualOpenTabsSort = 'recent';
  manualOpenTabsPage = 1;
  syncManualTabsControls();
  renderManualTabsResults();
  document.getElementById('kds-comandas-search')?.focus();
}

function getFilteredManualOpenTabs() {
  const search = normalizeManualTabSearchText(manualOpenTabsSearch);
  const filtered = manualOpenTabs.filter((tab) => {
    const hasTable = Boolean(String(tab.tableNumber || '').trim());
    if (manualOpenTabsLocationFilter === 'table' && !hasTable) return false;
    if (manualOpenTabsLocationFilter === 'counter' && hasTable) return false;
    if (!search) return true;
    return normalizeManualTabSearchText([
      tab.publicCode,
      tab.tableNumber,
      tab.userPhone,
      tab.customerName,
      tab.customerInstagram,
    ].filter(Boolean).join(' ')).includes(search);
  });

  filtered.sort((a, b) => {
    if (manualOpenTabsSort === 'oldest') return getManualTabTimestamp(a) - getManualTabTimestamp(b);
    if (manualOpenTabsSort === 'table') {
      return String(a.tableNumber || '999999').localeCompare(String(b.tableNumber || '999999'), 'pt-BR', { numeric: true });
    }
    if (manualOpenTabsSort === 'value') return Number(b.total || 0) - Number(a.total || 0);
    return getManualTabTimestamp(b) - getManualTabTimestamp(a);
  });
  return filtered;
}

function normalizeManualTabSearchText(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getManualTabTimestamp(tab) {
  const value = tab?.openedAt || tab?.opened_at || tab?.createdAt || tab?.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatManualTabOpenedAt(tab) {
  const timestamp = getManualTabTimestamp(tab);
  if (!timestamp) return { primary: 'Não informado', secondary: '' };
  const date = new Date(timestamp);
  return {
    primary: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    secondary: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function renderManualTabsResults() {
  const body = document.getElementById('kds-comandas-table-body');
  const summary = document.getElementById('kds-comandas-results-summary');
  const pagination = document.getElementById('kds-comandas-pagination');
  if (!body || !summary || !pagination) return;

  const filteredTabs = getFilteredManualOpenTabs();
  const totalPages = Math.max(1, Math.ceil(filteredTabs.length / manualOpenTabsPageSize));
  manualOpenTabsPage = Math.min(Math.max(1, manualOpenTabsPage), totalPages);
  const startIndex = (manualOpenTabsPage - 1) * manualOpenTabsPageSize;
  const endIndex = Math.min(startIndex + manualOpenTabsPageSize, filteredTabs.length);
  const pageTabs = filteredTabs.slice(startIndex, endIndex);
  const hasFilters = Boolean(manualOpenTabsSearch.trim()) || manualOpenTabsLocationFilter !== 'all';

  summary.innerHTML = `
    <span><strong>${filteredTabs.length}</strong> de ${manualOpenTabs.length} comanda(s) encontrada(s)${filteredTabs.length ? ` · exibindo ${startIndex + 1}–${endIndex}` : ''}</span>
    ${hasFilters ? '<span class="kds-comandas-filter-state">Filtros ativos <button onclick="clearManualOpenTabsFilters()">Limpar filtros</button></span>' : '<span>Use a busca para localizar rapidamente entre muitas comandas.</span>'}`;

  body.innerHTML = pageTabs.length
    ? pageTabs.map(renderManualTabTableRow).join('')
    : `<div class="kds-comandas-empty"><strong>${manualOpenTabs.length ? 'Nenhuma comanda encontrada' : 'Nenhuma comanda aberta'}</strong><span>${manualOpenTabs.length ? 'Ajuste a busca ou limpe os filtros.' : 'As comandas abertas aparecerão aqui.'}</span></div>`;

  pagination.innerHTML = `
    <button class="kds-comandas-btn" onclick="setManualOpenTabsPage(1)" ${manualOpenTabsPage <= 1 ? 'disabled' : ''} aria-label="Primeira página">«</button>
    <button class="kds-comandas-btn" onclick="setManualOpenTabsPage(${manualOpenTabsPage - 1})" ${manualOpenTabsPage <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="kds-comandas-page-status">Página <strong>${manualOpenTabsPage}</strong> de <strong>${totalPages}</strong></span>
    <button class="kds-comandas-btn" onclick="setManualOpenTabsPage(${manualOpenTabsPage + 1})" ${manualOpenTabsPage >= totalPages ? 'disabled' : ''}>Próxima</button>
    <button class="kds-comandas-btn" onclick="setManualOpenTabsPage(${totalPages})" ${manualOpenTabsPage >= totalPages ? 'disabled' : ''} aria-label="Última página">»</button>`;
}

function renderManualTabTableRow(tab) {
  const editableOrders = Object.values(allOrders).filter((order) => (
    getOrderTabId(order) === String(tab.id) && order.status === 'PENDING'
  ));
  const editActions = editableOrders.map((order) => `
    <button class="kds-comandas-btn" onclick="openManualEditOrderModal('${escapeHTML(order.id)}')">Editar pedido #${escapeHTML(getOrderDisplayCode(order))}</button>
  `).join('');
  const openedAt = formatManualTabOpenedAt(tab);
  const customerPrimary = tab.customerName || tab.userPhone || 'Cliente não identificado';
  const customerSecondary = tab.customerInstagram
    ? `@${String(tab.customerInstagram).replace(/^@/, '')}`
    : (tab.customerName && tab.userPhone ? tab.userPhone : 'Sem identificação adicional');
  const location = tab.tableNumber ? `Mesa ${formatTableNumber(tab.tableNumber)}` : 'Sem mesa';
  const locationDetail = tab.tableNumber ? 'Atendimento no salão' : 'Balcão / retirada';

  return `
    <div class="kds-comandas-table-row" role="row" data-tab-id="${escapeHTML(tab.id)}">
      <div class="kds-comandas-code" role="cell"><strong>${escapeHTML(tab.publicCode || shortId(tab.id))}</strong><span class="kds-comandas-open-pill">Aberta</span></div>
      <div class="kds-comandas-client" role="cell"><span class="kds-comandas-primary-text">${escapeHTML(customerPrimary)}</span><span class="kds-comandas-secondary-text">${escapeHTML(customerSecondary)}</span></div>
      <div class="kds-comandas-location" role="cell"><span class="kds-comandas-primary-text">${escapeHTML(location)}</span><span class="kds-comandas-secondary-text">${escapeHTML(locationDetail)}</span></div>
      <div class="kds-comandas-total" role="cell"><strong>${escapeHTML(formatMoney(tab.total || 0))}</strong><span class="kds-comandas-secondary-text">Consumo atual</span></div>
      <div class="kds-comandas-opened" role="cell"><span class="kds-comandas-primary-text">${escapeHTML(openedAt.primary)}</span><span class="kds-comandas-secondary-text">${escapeHTML(openedAt.secondary)}</span></div>
      <div class="kds-comandas-actions" role="cell">
        <button class="kds-comandas-btn primary" onclick="openManualOrderModal('${escapeHTML(tab.id)}')">+ Lançar item</button>
        <details class="salao-action-menu">
          <summary class="kds-comandas-btn" aria-label="Mais ações da comanda ${escapeHTML(tab.publicCode || shortId(tab.id))}">Mais ações</summary>
          <div class="salao-action-menu-items">
            ${editActions}
            <button class="kds-comandas-btn" onclick="openManualTabDataModal('${escapeHTML(tab.id)}')">Editar dados</button>
            <button class="kds-comandas-btn" onclick="openManualTabHistory('${escapeHTML(tab.id)}')">Histórico completo</button>
            <button class="kds-comandas-btn" onclick="openManualTabPortalAccess('${escapeHTML(tab.id)}')">QR do portal</button>
            <button class="kds-comandas-btn" onclick="printTabConsumption('${escapeHTML(tab.id)}')">Imprimir consumo</button>
            <button class="kds-comandas-btn danger" onclick="openManualTabFinalizeModal('${escapeHTML(tab.id)}')">Finalizar comanda</button>
          </div>
        </details>
      </div>
    </div>`;
}

async function loadManualOpenTabs() {
  if (!KDS_ACCESS.canViewSalao) return;
  try {
    const data = await apiGet('/tables/tabs/open');
    manualOpenTabs = Array.isArray(data) ? data : [];
    if (activePanel === 'salao') renderSalao();
  } catch (error) {
    console.warn('Failed to load open tabs for manual orders:', error);
  }
}

function formatBrazilianPhoneMask(value) {
  let digits = String(value || '').replace(/\D/g, '').slice(0, 13);
  if (!digits) return '';
  const hasBrazilCountryCode = digits.length >= 12 && digits.startsWith('55');
  const prefix = hasBrazilCountryCode ? '+55 ' : '';
  if (hasBrazilCountryCode) digits = digits.slice(2);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

document.getElementById('new-salao-tab-phone')?.addEventListener('input', (event) => {
  event.target.value = formatBrazilianPhoneMask(event.target.value);
});

function renderNewSalaoTabTableOptions() {
  const select = document.getElementById('new-salao-tab-table');
  const help = document.getElementById('new-salao-tab-table-help');
  if (!select) return;
  const options = ['<option value="">Sem mesa</option>'].concat(
    [...availableTables]
      .sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR', { numeric: true }))
      .map((table) => {
        const number = formatTableNumber(table.number || '--');
        const capacity = Number(table.capacity || 0);
        const suffix = capacity > 0 ? ` · ${capacity} lugares` : '';
        return `<option value="${escapeHTML(table.id)}">Mesa ${escapeHTML(number)}${escapeHTML(suffix)}</option>`;
      }),
  );
  select.innerHTML = options.join('');
  if (help) {
    help.textContent = availableTables.length
      ? 'Sem mesa permite iniciar no balcão; mesas livres aparecem nesta lista.'
      : 'Nenhuma mesa livre no momento. A comanda será aberta sem mesa.';
  }
}

async function openNewSalaoTabModal() {
  if (!KDS_ACCESS.canViewSalao) {
    toast('t-error', 'Acesso negado', 'Seu perfil não pode abrir comandas.');
    return;
  }
  const modal = document.getElementById('newSalaoTabModal');
  if (!modal) return;
  const error = document.getElementById('err-new-salao-tab');
  const form = document.getElementById('newSalaoTabForm');
  if (form) form.reset();
  if (error) {
    error.textContent = '';
    error.classList.remove('show');
  }
  await loadTableState();
  renderNewSalaoTabTableOptions();
  modal.classList.add('open');
  document.getElementById('new-salao-tab-table')?.focus();
}

function closeNewSalaoTabModal() {
  document.getElementById('newSalaoTabModal')?.classList.remove('open');
}

async function submitNewSalaoTab() {
  const button = document.getElementById('btn-submit-new-salao-tab');
  const error = document.getElementById('err-new-salao-tab');
  const tableId = String(document.getElementById('new-salao-tab-table')?.value || '').trim();
  const phone = String(document.getElementById('new-salao-tab-phone')?.value || '').trim();
  const instagram = String(document.getElementById('new-salao-tab-instagram')?.value || '').trim();
  if (error) {
    error.textContent = '';
    error.classList.remove('show');
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Abrindo…';
  }
  try {
    const openedTab = await apiPost('/tables/tabs/open', {
      table_id: tableId || undefined,
      user_phone: phone || undefined,
      customer_instagram: instagram || undefined,
    });
    closeNewSalaoTabModal();
    await Promise.all([loadManualOpenTabs(), loadTableState()]);
    switchSalaoView('comandas');
    const code = openedTab?.publicCode || openedTab?.public_code || openedTab?.id || 'nova comanda';
    const location = tableId ? `Mesa ${formatTableNumber(availableTables.find((table) => String(table.id) === tableId)?.number || '')}` : 'sem mesa';
    toast('t-success', 'Comanda aberta', `${code} · ${location}`);
    broadcastKdsSync('tab.opened.staff');
  } catch (e) {
    if (error) {
      error.textContent = `⚠ ${e.message || 'Não foi possível abrir a comanda.'}`;
      error.classList.add('show');
    } else {
      toast('t-error', 'Erro ao abrir comanda', e.message);
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '✓ Abrir comanda';
    }
  }
}

document.getElementById('newSalaoTabModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'newSalaoTabModal') closeNewSalaoTabModal();
});

function findManualOpenTab(tabId) {
  return manualOpenTabs.find((tab) => String(tab.id) === String(tabId || '')) || null;
}

function normalizeTabPhoneForComparison(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTabInstagramForComparison(value) {
  const username = String(value || '').trim().replace(/^@+/, '').toLocaleLowerCase('pt-BR');
  return username ? `@${username}` : '';
}

function formatManualTabTableOption(table, currentTableId) {
  const tableId = String(table?.id || '');
  const number = formatTableNumber(table?.number || '--');
  const status = String(table?.status || '').toUpperCase();
  const suffix = tableId === String(currentTableId || '')
    ? ' · atual'
    : status === 'AVAILABLE'
      ? ' · livre'
      : status === 'OCCUPIED'
        ? ' · ocupada'
        : status === 'CLEANING'
          ? ' · em limpeza'
          : '';
  return `<option value="${escapeHTML(tableId)}"${tableId === String(currentTableId || '') ? ' selected' : ''}>Mesa ${escapeHTML(number)}${escapeHTML(suffix)}</option>`;
}

async function openManualTabDataModal(tabId) {
  const tab = findManualOpenTab(tabId);
  if (!tab) {
    toast('t-error', 'Comanda não encontrada', 'Atualize a lista e tente novamente.');
    return;
  }

  await loadTableState();
  manualTabDataState = {
    tabId: String(tab.id),
    userPhone: normalizeTabPhoneForComparison(tab.userPhone),
    customerInstagram: normalizeTabInstagramForComparison(tab.customerInstagram),
    tableId: String(tab.tableId || ''),
  };

  document.getElementById('manualTabDataModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'manualTabDataModal';
  overlay.className = 'modal-overlay open manual-tab-data-modal';
  const tableOptions = [...tablesSnapshot]
    .sort((left, right) => String(left.number || '').localeCompare(String(right.number || ''), 'pt-BR', { numeric: true }))
    .map((table) => formatManualTabTableOption(table, tab.tableId))
    .join('');
  overlay.innerHTML = '<div class="modal">' +
    '<div class="modal-header"><div><div class="modal-title">Editar dados da comanda</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Comanda ' + escapeHTML(tab.publicCode || shortId(tab.id)) + ' · toda alteração fica registrada no histórico.</div></div><button class="modal-close" onclick="closeManualTabDataModal()" aria-label="Fechar">✕</button></div>' +
    '<div class="modal-body"><form class="manual-tab-modal-form" id="manualTabDataForm" onsubmit="event.preventDefault(); saveManualTabData()">' +
    '<div class="form-grid"><div class="form-field"><label for="manual-tab-data-phone">Telefone / WhatsApp</label><input id="manual-tab-data-phone" class="input" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="' + escapeHTML(formatBrazilianPhoneMask(tab.userPhone || '')) + '" placeholder="(11) 99999-9999"></div>' +
    '<div class="form-field"><label for="manual-tab-data-instagram">Instagram</label><input id="manual-tab-data-instagram" class="input" type="text" autocomplete="off" value="' + escapeHTML(tab.customerInstagram || '') + '" placeholder="@cliente"></div></div>' +
    '<div class="form-field"><label for="manual-tab-data-table">Mesa</label><select id="manual-tab-data-table" class="input"><option value="">Sem mesa</option>' + tableOptions + '</select></div>' +
    '<div class="manual-tab-modal-note">Você pode identificar o cliente, vincular ou trocar a mesa. Os dados não podem duplicar outra comanda aberta e cada mudança registra o usuário responsável.</div>' +
    '<div class="error-msg-inline" id="manual-tab-data-error"></div></form></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeManualTabDataModal()">Cancelar</button><button class="btn btn-green" id="manual-tab-data-save" type="submit" form="manualTabDataForm">Salvar alterações</button></div></div>';
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeManualTabDataModal(); });
  document.body.appendChild(overlay);
  document.getElementById('manual-tab-data-phone')?.addEventListener('input', (event) => {
    event.target.value = formatBrazilianPhoneMask(event.target.value);
  });
}

function closeManualTabDataModal() {
  document.getElementById('manualTabDataModal')?.remove();
  manualTabDataState = { tabId: '', userPhone: '', customerInstagram: '', tableId: '' };
}

async function openManualTabPortalAccess(tabId) {
  const tab = findManualOpenTab(tabId);
  if (!tab) {
    toast('t-error', 'Comanda não encontrada', 'Atualize a lista e tente novamente.');
    return;
  }
  try {
    const access = await apiPost(`/tables/tabs/${tab.id}/portal-access`, {});
    document.getElementById('manualTabPortalModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'manualTabPortalModal';
    overlay.className = 'modal-overlay open manual-tab-portal-modal';
    overlay.innerHTML = '<div class="modal">' +
      '<div class="modal-header"><div><div class="modal-title">Portal da comanda</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Comanda ' + escapeHTML(tab.publicCode || shortId(tab.id)) + '</div></div><button class="modal-close" onclick="closeManualTabPortalModal()" aria-label="Fechar">✕</button></div>' +
      '<div class="modal-body"><div class="manual-tab-portal-content"><p>Mostre este QR Code ao cliente ou copie o link para encaminhar. O portal permite consultar e acompanhar a comanda sem precisar do WhatsApp.</p><img class="manual-tab-portal-qr" src="' + escapeHTML(access.qrImagePath || '') + '" alt="QR Code do portal da comanda"><input class="input manual-tab-portal-link" id="manual-tab-portal-link" readonly value="' + escapeHTML(access.portalUrl || '') + '" aria-label="Link do portal da comanda"><p style="font-size:11px">Ao gerar um novo acesso, o link anterior deixa de funcionar.</p></div></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeManualTabPortalModal()">Fechar</button><button class="btn btn-green" type="button" onclick="copyManualTabPortalLink()">Copiar link</button><a class="btn btn-ghost" href="' + escapeHTML(access.portalPath || '#') + '" target="_blank" rel="noopener">Testar portal</a></div></div>';
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeManualTabPortalModal(); });
    document.body.appendChild(overlay);
    toast('t-success', 'Acesso ao portal criado', 'Apresente o QR Code ou encaminhe o link ao cliente.');
  } catch (exception) {
    toast('t-error', 'Erro ao gerar QR do portal', exception.message);
  }
}

function closeManualTabPortalModal() {
  document.getElementById('manualTabPortalModal')?.remove();
}

async function copyManualTabPortalLink() {
  const field = document.getElementById('manual-tab-portal-link');
  const value = String(field?.value || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast('t-success', 'Link copiado', 'Agora você pode encaminhar o acesso ao cliente.');
  } catch (_error) {
    field?.select();
    toast('t-success', 'Link selecionado', 'Copie o link para encaminhar ao cliente.');
  }
}

async function saveManualTabData() {
  const state = manualTabDataState;
  const button = document.getElementById('manual-tab-data-save');
  const error = document.getElementById('manual-tab-data-error');
  const phone = String(document.getElementById('manual-tab-data-phone')?.value || '').trim();
  const instagram = String(document.getElementById('manual-tab-data-instagram')?.value || '').trim();
  const tableId = String(document.getElementById('manual-tab-data-table')?.value || '').trim();
  const customerChanged = normalizeTabPhoneForComparison(phone) !== state.userPhone
    || normalizeTabInstagramForComparison(instagram) !== state.customerInstagram;
  const tableChanged = tableId !== state.tableId;

  if (!customerChanged && !tableChanged) {
    closeManualTabDataModal();
    toast('t-success', 'Nenhuma alteração', 'Os dados da comanda já estavam atualizados.');
    return;
  }
  if (error) {
    error.textContent = '';
    error.classList.remove('show');
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando…';
  }

  let customerSaved = false;
  try {
    if (customerChanged) {
      await apiPatch(`/tables/tabs/${state.tabId}/customer`, {
        user_phone: phone || undefined,
        customer_instagram: instagram || undefined,
      });
      customerSaved = true;
    }
    if (tableChanged) {
      await apiPatch(`/tables/tabs/${state.tabId}/table`, { table_id: tableId || null });
    }
    closeManualTabDataModal();
    await Promise.all([loadManualOpenTabs(), loadTableState()]);
    broadcastKdsSync('tab.data.updated');
    toast('t-success', 'Dados atualizados', 'A alteração foi registrada no histórico da comanda.');
  } catch (exception) {
    if (customerSaved) {
      await Promise.all([loadManualOpenTabs(), loadTableState()]);
      broadcastKdsSync('tab.data.updated.partial');
    }
    if (error) {
      error.textContent = `⚠ ${customerSaved ? 'Cliente atualizado, mas a mesa não foi alterada: ' : ''}${exception.message || 'Não foi possível salvar os dados.'}`;
      error.classList.add('show');
    } else {
      toast('t-error', 'Erro ao atualizar dados', exception.message);
    }
    if (button) {
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }
}

function openManualTabFinalizeModal(tabId) {
  const tab = findManualOpenTab(tabId);
  if (!tab) {
    toast('t-error', 'Comanda não encontrada', 'Atualize a lista e tente novamente.');
    return;
  }
  const total = Number(tab.total || 0);
  const paidAmount = Number(tab.paidAmount || 0);
  const amountDue = Math.max(0, total - paidAmount);
  document.getElementById('manualTabFinalizeModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'manualTabFinalizeModal';
  overlay.className = 'modal-overlay open manual-tab-finalize-modal';
  const paymentField = amountDue > 0
    ? '<div class="form-field"><label for="manual-tab-finalize-method">Forma de pagamento recebida</label><select id="manual-tab-finalize-method" class="input"><option value="">Selecione a forma recebida</option><option value="CASH">Dinheiro</option><option value="PIX">Pix recebido pela equipe</option><option value="CREDIT_CARD">Cartão de crédito</option><option value="DEBIT_CARD">Cartão de débito</option><option value="OTHER">Outro meio</option></select></div>'
    : '<div class="manual-tab-modal-note">Esta comanda não possui saldo pendente. A finalização apenas concluirá o atendimento e liberará a mesa quando aplicável.</div>';
  overlay.innerHTML = '<div class="modal">' +
    '<div class="modal-header"><div><div class="modal-title">Finalizar comanda</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Comanda ' + escapeHTML(tab.publicCode || shortId(tab.id)) + '</div></div><button class="modal-close" onclick="closeManualTabFinalizeModal()" aria-label="Fechar">✕</button></div>' +
    '<div class="modal-body"><div class="manual-tab-finalize-summary"><div><span>Total</span><strong>' + escapeHTML(formatMoney(total)) + '</strong></div><div><span>Já recebido</span><strong>' + escapeHTML(formatMoney(paidAmount)) + '</strong></div><div class="manual-tab-finalize-due"><span>Baixa a registrar</span><strong>' + escapeHTML(formatMoney(amountDue)) + '</strong></div></div>' +
    '<form class="manual-tab-modal-form" id="manualTabFinalizeForm" onsubmit="event.preventDefault(); confirmManualTabFinalize(\'' + escapeHTML(tab.id) + '\')">' + paymentField +
    '<div class="manual-tab-modal-note"><strong>Confira o pagamento antes de concluir.</strong><br>A confirmação registra a baixa manual, finaliza a comanda, libera a mesa quando possível e mantém a trilha com seu usuário.</div><div class="error-msg-inline" id="manual-tab-finalize-error"></div></form></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeManualTabFinalizeModal()">Cancelar</button><button class="btn btn-red-solid" id="manual-tab-finalize-confirm" type="submit" form="manualTabFinalizeForm">Registrar baixa e finalizar</button></div></div>';
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeManualTabFinalizeModal(); });
  document.body.appendChild(overlay);
}

function closeManualTabFinalizeModal() {
  document.getElementById('manualTabFinalizeModal')?.remove();
}

async function confirmManualTabFinalize(tabId) {
  const tab = findManualOpenTab(tabId);
  const button = document.getElementById('manual-tab-finalize-confirm');
  const error = document.getElementById('manual-tab-finalize-error');
  if (!tab) {
    closeManualTabFinalizeModal();
    toast('t-error', 'Comanda não encontrada', 'Atualize a lista e tente novamente.');
    return;
  }
  const amountDue = Math.max(0, Number(tab.total || 0) - Number(tab.paidAmount || 0));
  const paymentMethod = String(document.getElementById('manual-tab-finalize-method')?.value || '').trim();
  if (amountDue > 0 && !paymentMethod) {
    if (error) {
      error.textContent = '⚠ Informe a forma de pagamento recebida para registrar a baixa.';
      error.classList.add('show');
    }
    return;
  }
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Finalizando…';
  }
  try {
    await apiPost(`/tables/tabs/${tab.id}/finalize`, {
      manual_payment_method: paymentMethod || undefined,
    });
    closeManualTabFinalizeModal();
    await Promise.all([loadManualOpenTabs(), loadTableState(), loadCloseRequests()]);
    broadcastKdsSync('tab.finalized.manual');
    toast('t-success', 'Comanda finalizada', 'Baixa registrada e atendimento encerrado com sucesso.');
  } catch (exception) {
    if (error) {
      error.textContent = `⚠ ${exception.message || 'Não foi possível finalizar a comanda.'}`;
      error.classList.add('show');
    } else {
      toast('t-error', 'Erro ao finalizar comanda', exception.message);
    }
    if (button) {
      button.disabled = false;
      button.textContent = 'Registrar baixa e finalizar';
    }
  }
}

var manualOrderDraft = { tabId: '', lines: [], notes: '' };

async function openManualOrderModal(tabId) {
  if (!KDS_ACCESS.canViewSalao) {
    toast('t-error', 'Acesso negado', 'Seu perfil não pode lançar pedidos manuais.');
    return;
  }
  if (!menuItemMetaById.size) {
    await loadMenuItems();
  }
  var selectedTab = manualOpenTabs.find(function (tab) {
    return String(tab.id) === String(tabId || '');
  }) || manualOpenTabs[0];
  if (!selectedTab) {
    toast('t-error', 'Nenhuma comanda aberta', 'Abra uma comanda antes de lançar o consumo.');
    return;
  }
  manualOrderDraft = { tabId: String(selectedTab.id), lines: [{ menuItemId: '', quantity: 1, observations: '' }], notes: '' };
  var old = document.getElementById('manualOrderModal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'manualOrderModal';
  overlay.className = 'modal-overlay open';
  var tabOptions = manualOpenTabs.map(function (tab) {
    var label = String(tab.publicCode || shortId(tab.id));
    if (tab.tableNumber) label += ' · Mesa ' + String(tab.tableNumber);
    return '<option value="' + escapeHTML(tab.id) + '"' + (String(tab.id) === manualOrderDraft.tabId ? ' selected' : '') + '>' + escapeHTML(label) + '</option>';
  }).join('');
  overlay.innerHTML = '<div class="modal" style="width:min(720px,96vw)">' +
    '<div class="modal-header"><div><div class="modal-title">Lançar pedido manual</div><div style="font-size:12px;color:var(--muted);margin-top:4px">O lançamento ficará registrado com seu usuário.</div></div><button class="modal-close" onclick="closeManualOrderModal()">✕</button></div>' +
    '<div class="modal-body"><label class="modal-label">Comanda</label><select id="manual-order-tab" class="input" onchange="manualOrderDraft.tabId=this.value">' + tabOptions + '</select>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 8px"><div class="modal-label" style="margin:0">Itens</div><button class="action-btn accept-btn" onclick="addManualOrderLine()">+ Item</button></div>' +
    '<div id="manual-order-lines"></div><label class="modal-label" style="margin-top:16px">Observação do pedido</label><textarea id="manual-order-notes" class="input" rows="3" placeholder="Observação geral"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeManualOrderModal()">Cancelar</button><button class="btn btn-green" onclick="submitManualOrder()">Lançar na cozinha/bar</button></div></div>';
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeManualOrderModal();
  });
  document.body.appendChild(overlay);
  renderManualOrderLines();
}

function renderManualOrderLines() {
  var container = document.getElementById('manual-order-lines');
  if (!container) return;
  var items = Array.from(menuItemMetaById.values()).filter(function (item) {
    return item
      && item.available !== false
      && item.isCurrentlyAvailable !== false
      && ['KITCHEN', 'BAR'].includes(String(item.destination || '').toUpperCase());
  }).sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
  var options = '<option value="">Selecione um item</option>' + items.map(function (item) {
    return '<option value="' + escapeHTML(item.id) + '">' + escapeHTML(item.name || 'Item') + ' · ' + escapeHTML(formatMoney(item.price || 0)) + '</option>';
  }).join('');
  container.innerHTML = manualOrderDraft.lines.map(function (line, index) {
    var selectedOptions = options.replace('value="' + escapeHTML(line.menuItemId) + '"', 'value="' + escapeHTML(line.menuItemId) + '" selected');
    return '<div data-manual-order-line="' + index + '" style="display:grid;grid-template-columns:minmax(0,1fr) 76px 38px;gap:8px;align-items:start;margin-bottom:10px">' +
      '<div><select data-manual-order-item class="input" onchange="manualOrderDraft.lines[' + index + '].menuItemId=this.value">' + selectedOptions + '</select>' +
      '<input data-manual-order-observations class="input" style="margin-top:6px" value="' + escapeHTML(line.observations || '') + '" placeholder="Observação do item" oninput="manualOrderDraft.lines[' + index + '].observations=this.value"></div>' +
      '<input data-manual-order-quantity class="input" type="number" min="1" max="99" value="' + escapeHTML(line.quantity) + '" onchange="manualOrderDraft.lines[' + index + '].quantity=Number(this.value)">' +
      '<button class="action-btn reject-btn" onclick="removeManualOrderLine(' + index + ')">✕</button></div>';
  }).join('');
}

function addManualOrderLine() {
  manualOrderDraft.lines.push({ menuItemId: '', quantity: 1, observations: '' });
  renderManualOrderLines();
}

function removeManualOrderLine(index) {
  manualOrderDraft.lines.splice(index, 1);
  if (!manualOrderDraft.lines.length) manualOrderDraft.lines.push({ menuItemId: '', quantity: 1, observations: '' });
  renderManualOrderLines();
}

function closeManualOrderModal() {
  var modal = document.getElementById('manualOrderModal');
  if (modal) modal.remove();
  manualOrderDraft = { tabId: '', lines: [], notes: '' };
}

async function submitManualOrder() {
  var tabField = document.getElementById('manual-order-tab');
  if (tabField) manualOrderDraft.tabId = String(tabField.value || '').trim();
  var lineContainer = document.getElementById('manual-order-lines');
  if (lineContainer) {
    lineContainer.querySelectorAll('[data-manual-order-line]').forEach(function (row) {
      var index = Number(row.dataset.manualOrderLine);
      var line = manualOrderDraft.lines[index];
      if (!line) return;
      line.menuItemId = String(row.querySelector('[data-manual-order-item]')?.value || '').trim();
      line.quantity = Number(row.querySelector('[data-manual-order-quantity]')?.value || 0);
      line.observations = row.querySelector('[data-manual-order-observations]')?.value || '';
    });
  }
  var lines = manualOrderDraft.lines.filter(function (line) { return line.menuItemId; });
  if (!manualOrderDraft.tabId || !lines.length) {
    toast('t-error', 'Lançamento incompleto', 'Selecione a comanda e pelo menos um item.');
    return;
  }
  try {
    await apiPost('/orders/manual', {
      tab_id: manualOrderDraft.tabId,
      notes: document.getElementById('manual-order-notes')?.value || '',
      items: lines.map(function (line) {
        return { menu_item_id: line.menuItemId, quantity: Number(line.quantity || 1), observations: line.observations || '' };
      }),
    });
    closeManualOrderModal();
    toast('t-success', 'Pedido lançado', 'O lançamento foi registrado e enviado aos setores de preparo.');
    await Promise.all([loadOrders(), loadManualOpenTabs(), loadTableState()]);
    broadcastKdsSync('manual.order.created');
  } catch (error) {
    await Promise.all([loadManualOpenTabs(), loadTableState()]).catch(() => {});
    toast('t-error', 'Erro ao lançar pedido', error.message);
  }
}

function openManualEditOrderModal(orderId) {
  var order = allOrders[orderId];
  if (!order || order.status !== 'PENDING') return;
  var old = document.getElementById('manualEditOrderModal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'manualEditOrderModal';
  overlay.className = 'modal-overlay open';
  var rows = (order.items || []).map(function (item) {
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 76px auto;gap:8px;align-items:center;margin-bottom:10px">' +
      '<div><strong>' + escapeHTML(resolveItemName(item)) + '</strong><input id="manual-edit-obs-' + escapeHTML(item.id) + '" class="input" style="margin-top:5px" value="' + escapeHTML(normalizeOptionalDisplayText(item.observations)) + '" placeholder="Observação"></div>' +
      '<input id="manual-edit-qty-' + escapeHTML(item.id) + '" class="input" type="number" min="1" max="99" value="' + escapeHTML(item.quantity) + '">' +
      '<div style="display:flex;gap:5px"><button class="action-btn accept-btn" onclick="saveManualOrderItem(\'' + escapeHTML(order.id) + '\',\'' + escapeHTML(item.id) + '\')">Salvar</button><button class="action-btn reject-btn" onclick="voidManualOrderItem(\'' + escapeHTML(order.id) + '\',\'' + escapeHTML(item.id) + '\')">Anular</button></div></div>';
  }).join('');
  overlay.innerHTML = '<div class="modal" style="width:min(680px,96vw)"><div class="modal-header"><div><div class="modal-title">Editar pedido #' + escapeHTML(getOrderDisplayCode(order)) + '</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Somente pedidos pendentes podem ser editados diretamente.</div></div><button class="modal-close" onclick="closeManualEditOrderModal()">✕</button></div>' +
    '<div class="modal-body">' + (rows || '<div class="empty-state">Nenhum item ativo.</div>') + '<label class="modal-label" style="margin-top:16px">Observação geral</label><textarea id="manual-edit-notes" class="input" rows="3">' + escapeHTML(normalizeOptionalDisplayText(order.notes)) + '</textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeManualEditOrderModal()">Fechar</button><button class="btn btn-green" onclick="saveManualOrderNotes(\'' + escapeHTML(order.id) + '\')">Salvar observação</button></div></div>';
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeManualEditOrderModal();
  });
  document.body.appendChild(overlay);
}

function closeManualEditOrderModal() {
  var modal = document.getElementById('manualEditOrderModal');
  if (modal) modal.remove();
}

async function saveManualOrderItem(orderId, itemId) {
  try {
    await apiPatch('/orders/' + orderId + '/items/' + itemId + '/manual', {
      quantity: Number(document.getElementById('manual-edit-qty-' + itemId)?.value || 0),
      observations: document.getElementById('manual-edit-obs-' + itemId)?.value || '',
    });
    await loadOrders();
    closeManualEditOrderModal();
    toast('t-success', 'Item atualizado', 'A alteração foi registrada no histórico.');
  } catch (error) {
    toast('t-error', 'Erro ao atualizar item', error.message);
  }
}

async function voidManualOrderItem(orderId, itemId) {
  var reason = window.prompt('Informe o motivo da anulação:');
  if (!reason || !reason.trim()) return;
  try {
    await apiPost('/orders/' + orderId + '/items/' + itemId + '/void', { reason: reason.trim() });
    await loadOrders();
    closeManualEditOrderModal();
    toast('t-success', 'Item anulado', 'A anulação foi registrada com usuário e motivo.');
  } catch (error) {
    toast('t-error', 'Erro ao anular item', error.message);
  }
}

async function saveManualOrderNotes(orderId) {
  try {
    await apiPatch('/orders/' + orderId + '/manual', { notes: document.getElementById('manual-edit-notes')?.value || '' });
    await loadOrders();
    closeManualEditOrderModal();
    toast('t-success', 'Pedido atualizado', 'A observação foi registrada no histórico.');
  } catch (error) {
    toast('t-error', 'Erro ao atualizar pedido', error.message);
  }
}

async function printTabConsumption(tabId) {
  var printWindow = null;
  try {
    if (!window.ClickGarcomReceipt) throw new Error('O modelo de comprovante não foi carregado.');
    printWindow = window.ClickGarcomReceipt.openWindow();
    var documentData = await apiPost('/tables/tabs/' + tabId + '/documents/consumption', {});
    printDocumentSnapshot(documentData, printWindow);
    toast('t-success', 'Comprovante preparado', 'A janela de impressão foi aberta.');
  } catch (error) {
    if (printWindow && !printWindow.closed) printWindow.close();
    toast('t-error', 'Erro ao emitir comprovante', error.message);
  }
}

async function openManualTabHistory(tabId) {
  try {
    var detail = await apiGet('/tables/tabs/' + tabId + '/details');
    var history = Array.isArray(detail?.history) ? detail.history : [];
    var old = document.getElementById('manualTabHistoryModal');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'manualTabHistoryModal';
    overlay.className = 'modal-overlay open';
    var rows = history.map(function (event) {
      var actor = event.actorName ? ' · por ' + event.actorName : ' · sistema';
      var timestamp = event.createdAt ? new Date(event.createdAt).toLocaleString('pt-BR') : 'Horário não informado';
      return '<div class="ready-item" style="align-items:flex-start"><div style="font-size:18px">•</div><div class="ready-item-left"><div class="ready-item-title">' + escapeHTML(event.label || 'Evento') + '</div><div class="ready-item-sub">' + escapeHTML((event.description || 'Sem detalhes') + actor) + '</div><div style="font-size:10px;color:var(--text-3);margin-top:3px">' + escapeHTML(timestamp) + '</div></div></div>';
    }).join('');
    overlay.innerHTML = '<div class="modal" style="width:min(680px,96vw)"><div class="modal-header"><div><div class="modal-title">Histórico da comanda ' + escapeHTML(detail.publicCode || tabId) + '</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Trilha operacional imutável do atendimento.</div></div><button class="modal-close" onclick="closeManualTabHistory()">✕</button></div><div class="modal-body" style="max-height:65vh;overflow:auto">' + (rows || '<div class="empty-state">Nenhum evento registrado.</div>') + '</div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeManualTabHistory()">Fechar</button></div></div>';
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeManualTabHistory(); });
    document.body.appendChild(overlay);
  } catch (error) {
    toast('t-error', 'Erro ao carregar histórico', error.message);
  }
}

function closeManualTabHistory() {
  var modal = document.getElementById('manualTabHistoryModal');
  if (modal) modal.remove();
}

function printDocumentSnapshot(documentData, printWindow) {
  if (!window.ClickGarcomReceipt) throw new Error('O modelo de comprovante não foi carregado.');
  window.ClickGarcomReceipt.print(documentData, { targetWindow: printWindow });
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
let salaoTableStatusFilter = 'all';

function setSalaoTableFilter(filter) {
  salaoTableFilter = filter;
  renderSalaoTables();
}

function setSalaoTableStatusFilter(filter) {
  salaoTableStatusFilter = filter;
  renderSalaoTables();
}

function renderSalaoTables() {
  const statusFiltersEl = document.getElementById('salao-table-status-filters');
  if (statusFiltersEl) {
    const statuses = ['all', 'AVAILABLE', 'OCCUPIED', 'CLEANING'];
    const labels = { all: 'Todos os estados', AVAILABLE: 'Livres', OCCUPIED: 'Ocupadas', CLEANING: 'Em limpeza' };
    statusFiltersEl.innerHTML = statuses.map((status) => `
      <button class="table-filter-tab ${salaoTableStatusFilter === status ? 'active' : ''}" onclick="setSalaoTableStatusFilter('${status}')">${labels[status]}</button>
    `).join('');
  }

  const filtersEl = document.getElementById('salao-table-filters');
  if (filtersEl) {
    const capacities = ['all', '2', '4', '8+'];
    const labels = { 'all': 'Todas', '2': '2 lugares', '4': '4 lugares', '8+': '8+ lugares' };
    filtersEl.innerHTML = capacities.map(c =>
      `<button class="table-filter-tab ${salaoTableFilter === c ? 'active' : ''}" onclick="setSalaoTableFilter('${c}')">${labels[c]}</button>`
    ).join('');
  }

  let filtered = tablesSnapshot.length ? [...tablesSnapshot] : [...availableTables];
  if (salaoTableStatusFilter !== 'all') {
    filtered = filtered.filter((table) => String(table.status || '').toUpperCase() === salaoTableStatusFilter);
  }
  if (salaoTableFilter === '2') filtered = filtered.filter(t => (t.capacity || 0) <= 2);
  else if (salaoTableFilter === '4') filtered = filtered.filter(t => (t.capacity || 0) >= 3 && (t.capacity || 0) <= 6);
  else if (salaoTableFilter === '8+') filtered = filtered.filter(t => (t.capacity || 0) >= 7);

  filtered.sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR', { numeric: true }));

  const tablesList = document.getElementById('salao-tables-list');
  if (!tablesList) return;

  if (filtered.length === 0) {
    tablesList.innerHTML = `<div class="empty-state" style="padding:24px 16px;">
      <div class="empty-icon">🪑</div>
      Nenhuma mesa encontrada
      <div class="empty-sub">Ajuste os filtros de estado ou capacidade.</div>
    </div>`;
  } else {
    tablesList.innerHTML = filtered.map(table => {
      const cap = table.capacity || '?';
      const section = table.section || table.location || '';
      const meta = [cap + ' lugares', section].filter(Boolean).join(' · ');
      const status = String(table.status || 'UNAVAILABLE').toUpperCase();
      const statusConfig = {
        AVAILABLE: { label: 'Livre', className: 'available' },
        OCCUPIED: { label: 'Ocupada', className: 'occupied' },
        CLEANING: { label: 'Em limpeza', className: 'cleaning' },
      }[status] || { label: 'Indisponível', className: 'unavailable' };
      return `<div class="table-row">
        <div class="table-row-icon">🪑</div>
        <div class="table-row-info">
          <div class="table-row-name">Mesa ${escapeHTML(table.number || '--')}</div>
          <div class="table-row-meta">${escapeHTML(meta)}</div>
        </div>
        <span class="table-status-badge ${statusConfig.className}">${statusConfig.label}</span>
      </div>`;
    }).join('');
  }
  const count = document.getElementById('salao-tables-count');
  if (count) count.textContent = String(tablesSnapshot.length || availableTables.length);
}

function updateNavBadges() {
  const kitchen = Object.values(allOrders).filter(o => o.destination === 'KITCHEN' && o.status === 'PENDING').length;
  const bar = Object.values(allOrders).filter(o => o.destination === 'BAR' && o.status === 'PENDING').length;
  const readyOrders = Object.values(allOrders).filter(o => o.status === 'READY').length;
  document.getElementById('nb-kitchen').textContent = kitchen;
  document.getElementById('nb-bar').textContent = bar;
  document.getElementById('nb-salao').textContent = pendingRequests.length + readyOrders + waiterChats.length + closeBillRequests.length;
  const deliveryBadge = document.getElementById('nb-delivery');
  if (deliveryBadge) {
    const activeDeliveries = Object.values(allDeliveries).filter((delivery) => !['DELIVERED', 'CANCELED', 'REJECTED'].includes(String(delivery.status || ''))).length;
    deliveryBadge.textContent = KDS_ACCESS.canViewDelivery && activeDeliveries ? String(activeDeliveries) : '';
    deliveryBadge.style.display = KDS_ACCESS.canViewDelivery && activeDeliveries ? '' : 'none';
  }
}

// ─── ACTIONS ───────────────────────────────────────────────────
function openDeliveryPreparationModal(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery || document.getElementById('deliveryPreparationModal')) return;
  const initialMinutes = Math.max(1, Math.round(Number(delivery.eta_seconds || 0) / 60)) || 10;
  const overlay = document.createElement('div');
  overlay.id = 'deliveryPreparationModal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="width:min(440px,94vw)">
    <div class="modal-header"><div><div class="modal-title">Iniciar preparo da entrega</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Pedido ${escapeHTML(delivery.display_code || delivery.id)}</div></div><button class="modal-close" type="button" onclick="closeDeliveryPreparationModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body"><p style="margin:0 0 14px;color:var(--text-2);font-size:13px;line-height:1.45">Informe a previsão total para preparar o pedido. Ela será enviada ao cliente quando o preparo começar.</p><label class="modal-label" for="delivery-estimate-minutes">Previsão de preparo <span style="color:var(--red)">*</span></label><input class="input" id="delivery-estimate-minutes" type="number" min="1" max="240" step="1" value="${initialMinutes}" inputmode="numeric" autofocus><div id="delivery-estimate-error" class="error-msg-inline" style="margin-top:8px"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeDeliveryPreparationModal()">Cancelar</button><button class="btn btn-green" type="button" onclick="submitDeliveryPreparation('${escapeHTML(deliveryId)}')">Iniciar preparo</button></div>
  </div>`;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDeliveryPreparationModal();
  });
  document.body.appendChild(overlay);
  window.setTimeout(() => document.getElementById('delivery-estimate-minutes')?.focus(), 0);
}

function closeDeliveryPreparationModal() {
  document.getElementById('deliveryPreparationModal')?.remove();
}

async function submitDeliveryPreparation(deliveryId) {
  const estimateMinutes = Number(document.getElementById('delivery-estimate-minutes')?.value || 0);
  const error = document.getElementById('delivery-estimate-error');
  if (!Number.isInteger(estimateMinutes) || estimateMinutes < 1 || estimateMinutes > 240) {
    if (error) error.textContent = 'Informe uma previsão entre 1 e 240 minutos.';
    return;
  }
  await startDeliveryPreparation(deliveryId, estimateMinutes);
}

function applyDeliveryMutation(deliveryId, response, fallbackStatus) {
  const current = allDeliveries[deliveryId];
  if (!current) return;
  const candidate = response?.snapshot || response?.delivery || response?.data || response;
  const snapshot = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  allDeliveries[deliveryId] = {
    ...current,
    ...snapshot,
    id: current.id,
    status: snapshot.status || fallbackStatus || current.status,
    orders: Array.isArray(snapshot.orders) && snapshot.orders.length ? snapshot.orders : current.orders,
  };
  deliverySnapshotSignature = '';
  renderAll();
}

async function startDeliveryPreparation(deliveryId, estimateMinutes) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return;
  try {
    const response = await apiPost(`/deliveries/${encodeURIComponent(deliveryId)}/accept`, { estimated_minutes: estimateMinutes });
    applyDeliveryMutation(deliveryId, response, 'PREPARING');
    const orders = deliveryOrders(delivery).filter((order) => String(order.status) === 'PENDING');
    closeDeliveryPreparationModal();
    toast('t-success', '🍳 Preparo iniciado', `Previsão de ${estimateMinutes} minutos enviada ao cliente.`);
    Promise.allSettled(orders.map((order) => apiPatch(`/orders/${encodeURIComponent(order.id)}/status?tenant_id=${CONFIG.TENANT_ID}`, { status: 'ACCEPTED' })))
      .finally(() => loadDeliveries({ silent: true }));
  } catch (error) {
    console.error('Failed to start delivery preparation:', error);
    toast('t-error', '❌ Não foi possível iniciar', error.message || 'Atualize a fila e tente novamente.');
  }
}

function openKdsNoDriverStart(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery || document.getElementById('kdsNoDriverStartModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'kdsNoDriverStartModal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="width:min(460px,94vw)">
    <div class="modal-header"><div><div class="modal-title">Continuar sem motoboy?</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Pedido ${escapeHTML(delivery.display_code || delivery.id)} · entrega própria</div></div><button class="modal-close" type="button" onclick="closeKdsNoDriverStart()" aria-label="Fechar">✕</button></div>
    <div class="modal-body"><div class="delivery-stage-callout delivery-stage-callout--ready"><strong>O restaurante assumirá esta saída</strong><span>Use quando a equipe fará a entrega ou quando o cliente retirar no local. Nenhum motoboy será atribuído.</span></div><p style="margin:14px 0 0;color:var(--text-2);font-size:13px;line-height:1.45">A confirmação por código continua obrigatória no final da entrega.</p></div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeKdsNoDriverStart()">Cancelar</button><button class="btn btn-green" type="button" onclick="startOwnDelivery('${escapeHTML(deliveryId)}', true)">Continuar sem motoboy</button></div>
  </div>`;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeKdsNoDriverStart(); });
  document.body.appendChild(overlay);
}

function closeKdsNoDriverStart() {
  document.getElementById('kdsNoDriverStartModal')?.remove();
}

async function startOwnDelivery(deliveryId, withoutDriver = false) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return;
  try {
    const response = await apiPost(`/deliveries/${encodeURIComponent(deliveryId)}/own/start`, {
      expected_version: Number(delivery.version),
      ...(withoutDriver ? { without_driver: true } : {}),
    });
    applyDeliveryMutation(deliveryId, response, 'IN_TRANSIT');
    closeKdsNoDriverStart();
    toast('t-success', '🛵 Saída registrada', withoutDriver
      ? 'Saída registrada sem motoboy. A confirmação por código continua obrigatória.'
      : 'O cliente foi avisado que o pedido está a caminho.');
    loadDeliveries({ silent: true });
  } catch (error) {
    console.error('Failed to start own delivery:', error);
    toast('t-error', '❌ Não foi possível registrar a saída', error.message || 'Atualize a fila e tente novamente.');
  }
}

async function markOwnDeliveryReady(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return;
  try {
    const response = await apiPost(`/deliveries/${encodeURIComponent(deliveryId)}/own/ready`, {
      expected_version: Number(delivery.version),
    });
    applyDeliveryMutation(deliveryId, response, 'READY_FOR_DISPATCH');
    toast('t-success', '✅ Pedido pronto', 'A expedição já pode ser impressa e a saída registrada.');
    loadDeliveries({ silent: true });
  } catch (error) {
    console.error('Failed to mark own delivery ready:', error);
    toast('t-error', '❌ Não foi possível avançar', error.message || 'Atualize a fila e tente novamente.');
  }
}

function openKdsFleetAssign(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return;
  const drivers = kdsFleet.drivers.filter((driver) => driver.active && String(driver.availability) !== 'OFFLINE');
  if (!drivers.length) {
    toast('t-error', '🛵 Nenhum motoboy disponível', 'Cadastre ou reative um motoboy na Central de Frota.');
    return;
  }
  const reassigning = Boolean(delivery.assigned_driver_id);
  const overlay = document.createElement('div');
  overlay.id = 'kdsFleetAssignModal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="width:min(480px,94vw)"><div class="modal-header"><div><div class="modal-title">${reassigning ? 'Reatribuir motoboy' : 'Atribuir motoboy'}</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Pedido ${escapeHTML(delivery.display_code || delivery.id)}</div></div><button class="modal-close" onclick="closeKdsFleetAssign()" aria-label="Fechar">✕</button></div><div class="modal-body"><label class="modal-label" for="kds-fleet-driver">Motoboys elegíveis</label><select class="input" id="kds-fleet-driver"><option value="">Selecione</option>${drivers.map((driver) => { const load=Number(driver.active_deliveries||0); const limit=Math.max(1,Number(driver.delivery_limit||1)); const full=load>=limit; return `<option value="${escapeHTML(driver.id)}" ${String(driver.id)===String(delivery.assigned_driver_id)?'selected':''} ${full&&String(driver.id)!==String(delivery.assigned_driver_id)?'disabled':''}>${escapeHTML(driver.name)} · ${load}/${limit}${full?' · lotado':''}</option>`; }).join('')}</select><div class="kds-fleet-capacity-note">A capacidade será validada novamente ao confirmar.</div>${reassigning?'<label class="modal-label" for="kds-fleet-reason" style="margin-top:14px">Motivo da reatribuição</label><textarea class="input" id="kds-fleet-reason" maxlength="400" placeholder="Informe o contexto operacional"></textarea>':''}<div id="kds-fleet-error" class="error-msg-inline" style="margin-top:8px"></div></div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeKdsFleetAssign()">Cancelar</button><button id="kds-fleet-confirm" class="btn btn-green" onclick="submitKdsFleetAssign('${escapeHTML(deliveryId)}',${Number(delivery.version||1)},${reassigning})">Confirmar atribuição</button></div></div>`;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeKdsFleetAssign(); });
  document.body.appendChild(overlay);
}

function closeKdsFleetAssign() { document.getElementById('kdsFleetAssignModal')?.remove(); }

async function submitKdsFleetAssign(deliveryId, version, reassigning) {
  if (kdsFleetAssignSubmitting) return;
  const driverId = document.getElementById('kds-fleet-driver')?.value;
  const reason = document.getElementById('kds-fleet-reason')?.value.trim();
  const errorNode = document.getElementById('kds-fleet-error');
  if (!driverId) { if (errorNode) errorNode.textContent = 'Escolha um motoboy.'; return; }
  if (reassigning && !reason) { if (errorNode) errorNode.textContent = 'Informe o motivo da reatribuição.'; return; }
  kdsFleetAssignSubmitting = true;
  const confirmButton = document.getElementById('kds-fleet-confirm');
  if (confirmButton) { confirmButton.disabled = true; confirmButton.textContent = 'Atribuindo…'; }
  const idempotencyKey = window.crypto?.randomUUID?.() || `fleet-assign-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    if (KDS_FLEET_API_ENABLED) {
      const response = await apiPost(`/deliveries/${encodeURIComponent(deliveryId)}/assign`, { driver_id: driverId, expected_version: version, ...(reason ? { reason } : {}) }, { idempotencyKey });
      applyDeliveryMutation(deliveryId, response, 'ASSIGNED');
    } else {
      const delivery = allDeliveries[deliveryId];
      allDeliveries[deliveryId] = { ...delivery, assigned_driver_id: driverId, status: 'ASSIGNED', version: Number(version) + 1 };
      const preview = JSON.parse(localStorage.getItem(kdsFleetPreviewKey()) || '{}');
      preview.assignments = (preview.assignments || []).filter((assignment) => assignment.delivery_id !== deliveryId);
      preview.assignments.push({ id: `assignment-${deliveryId}`, delivery_id: deliveryId, delivery_code: delivery.display_code, driver_id: driverId, customer_name: delivery.customer_name, neighborhood: delivery.neighborhood || delivery.city, status: 'ASSIGNED', position: preview.assignments.filter((item) => item.driver_id === driverId).length + 1, assigned_at: new Date().toISOString(), eta_minutes: Math.round(Number(delivery.eta_seconds || 0) / 60), version: 1 });
      localStorage.setItem(kdsFleetPreviewKey(), JSON.stringify(preview));
      await loadKdsFleet(); renderAll();
    }
    closeKdsFleetAssign();
    if (KDS_FLEET_API_ENABLED) {
      loadKdsFleet().then(() => renderAll()).catch((refreshError) => console.warn('Failed to refresh fleet after assignment:', refreshError));
    }
    toast('t-success', '🛵 Motoboy atribuído', 'A entrega já apareceu na fila pessoal do motoboy.');
  } catch (error) {
    if (errorNode) errorNode.textContent = /conflito|alterada/i.test(error.message || '') ? 'A entrega foi alterada por outro operador. Atualize e tente novamente.' : (error.message || 'Não foi possível atribuir.');
    loadDeliveries({ silent: true });
  } finally {
    kdsFleetAssignSubmitting = false;
    const button = document.getElementById('kds-fleet-confirm');
    if (button) { button.disabled = false; button.textContent = 'Confirmar atribuição'; }
  }
}

function completeOwnDelivery(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery || document.getElementById('deliveryCompletionModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'deliveryCompletionModal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="width:min(440px,94vw)">
    <div class="modal-header"><div><div class="modal-title">Finalizar entrega</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Pedido ${escapeHTML(delivery.display_code || delivery.id)}</div></div><button class="modal-close" type="button" onclick="closeDeliveryCompletionModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body"><p style="margin:0 0 14px;color:var(--text-2);font-size:13px;line-height:1.45">Peça ao cliente o código enviado no WhatsApp e confirme somente depois da entrega.</p><label class="modal-label" for="kds-delivery-completion-pin">Código de entrega <span style="color:var(--red)">*</span></label><input class="input" id="kds-delivery-completion-pin" maxlength="6" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="A3F9" style="height:62px;text-align:center;text-transform:uppercase;letter-spacing:.28em;font-size:23px;font-weight:800" oninput="this.value=this.value.toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,6)" onkeydown="if(event.key==='Enter'){event.preventDefault();submitOwnDeliveryCompletion('${escapeHTML(deliveryId)}')}"><div style="margin-top:7px;color:var(--muted);font-size:11px">Novos códigos têm 4 caracteres. Entregas anteriores podem usar 6 números.</div><div id="kds-delivery-completion-error" class="error-msg-inline" style="margin-top:8px"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" onclick="closeDeliveryCompletionModal()">Cancelar</button><button class="btn btn-green" type="button" onclick="submitOwnDeliveryCompletion('${escapeHTML(deliveryId)}')">Confirmar entrega</button></div>
  </div>`;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeDeliveryCompletionModal(); });
  document.body.appendChild(overlay);
  window.setTimeout(() => document.getElementById('kds-delivery-completion-pin')?.focus(), 0);
}

function closeDeliveryCompletionModal() {
  document.getElementById('deliveryCompletionModal')?.remove();
}

async function submitOwnDeliveryCompletion(deliveryId) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return;
  const pin = String(document.getElementById('kds-delivery-completion-pin')?.value || '').trim().toUpperCase();
  const errorNode = document.getElementById('kds-delivery-completion-error');
  if (!/^(?:[0-9A-F]{4}|\d{6})$/.test(pin)) {
    if (errorNode) errorNode.textContent = 'Informe o código de 4 caracteres enviado ao cliente.';
    return;
  }
  try {
    const response = await apiPost(`/deliveries/${encodeURIComponent(deliveryId)}/own/complete`, {
      expected_version: Number(delivery.version),
      pin,
    });
    applyDeliveryMutation(deliveryId, response, 'DELIVERED');
    closeDeliveryCompletionModal();
    toast('t-success', '✅ Entrega confirmada', 'Capacidade liberada e cliente avisado.');
    loadDeliveries({ silent: true });
  } catch (error) {
    console.error('Failed to complete own delivery:', error);
    toast('t-error', '❌ Não foi possível confirmar a entrega', error.message || 'Atualize a fila e tente novamente.');
  }
}

function printDeliveryDispatch(deliveryId, suppressBlockedToast = false) {
  const delivery = allDeliveries[deliveryId];
  if (!delivery) return false;
  const items = deliveryOrders(delivery).flatMap((order) => Array.isArray(order.items) ? order.items : []);
  const itemRows = items.length
    ? items.map((item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const name = String(item.name || item.menu_item_name || item.menuItemName || item.item_name_snapshot || item.itemNameSnapshot || 'Item');
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
      return `<tr><td class="item-quantity">${escapeHTML(`${quantity}x`)}</td><td>${escapeHTML(name)}</td><td class="money">${escapeHTML(formatCurrency(quantity * unitPrice))}</td></tr>`;
    }).join('')
    : '<tr><td colspan="3" class="empty-items">Itens indisponíveis no painel; consulte os detalhes da entrega.</td></tr>';
  const itemsTotal = deliveryItemsTotal(delivery);
  const fee = Number(delivery.customer_delivery_fee ?? delivery.delivery_fee ?? 0);
  const total = itemsTotal + fee;
  const restaurantName = tenantPrintProfile.name || CONFIG.TENANT_NAME || 'Restaurante';
  const restaurantContact = tenantPrintProfile.contact
    ? formatBrazilianPhoneMask(tenantPrintProfile.contact)
    : '';
  const customerPhone = delivery.customer_phone
    ? formatBrazilianPhoneMask(String(delivery.customer_phone))
    : '';
  const orderCode = String(delivery.display_code || delivery.id || '').replace(/^#/, '');
  const printedAt = new Date().toLocaleString('pt-BR');
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) {
    if (!suppressBlockedToast) {
      toast('t-error', '⚠️ Impressão bloqueada', 'Permita pop-ups para imprimir a expedição.');
    }
    return false;
  }
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Expedição ${escapeHTML(orderCode)}</title>
  <style>
    *{box-sizing:border-box}
    :root{--ink:#111827;--muted:#5f6877;--line:#cbd2dc;--soft:#f3f5f7;--address:#fff4c7}
    html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{padding:20px;font-size:13px;line-height:1.35}
    .ticket{width:100%;max-width:760px;margin:0 auto;border:2px solid var(--ink);border-radius:14px;overflow:hidden}
    .restaurant{padding:17px 20px;text-align:center;border-bottom:2px solid var(--ink)}
    .restaurant-name{font-size:24px;font-weight:900;line-height:1.15;letter-spacing:-.3px}
    .restaurant-contact{margin-top:5px;color:var(--muted);font-size:12px;font-weight:700}
    .title-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 20px;background:var(--ink);color:#fff}
    .title{font-size:20px;font-weight:900;letter-spacing:.4px}.order-code{text-align:right}.order-code span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.75}.order-code strong{font-size:24px}
    .meta{display:flex;justify-content:space-between;gap:12px;padding:8px 20px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}
    .section{padding:15px 20px;border-bottom:1px dashed #8b94a2}.section:last-child{border-bottom:0}
    .label{display:block;margin-bottom:7px;font-size:10px;font-weight:900;letter-spacing:1.15px;text-transform:uppercase;color:var(--muted)}
    .address-box{padding:15px 16px;border:2px solid var(--ink);border-radius:10px;background:var(--address)}
    .address{font-size:21px;font-weight:900;line-height:1.25;overflow-wrap:anywhere}
    .reference{margin-top:9px;padding-top:8px;border-top:1px solid rgba(17,24,39,.3);font-size:13px;font-weight:700}
    .customer-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;margin-top:12px}
    .customer-grid strong{display:block;font-size:15px}.customer-phone{font-size:15px;font-weight:900;white-space:nowrap}
    table{width:100%;border-collapse:collapse}.items th{padding:0 5px 7px;border-bottom:2px solid var(--ink);font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.8px}.items td{padding:9px 5px;border-bottom:1px solid var(--line);font-size:14px}.items th:first-child,.items td:first-child{padding-left:0}.items th:last-child,.items td:last-child{padding-right:0}.item-quantity{width:48px;font-weight:900}.money{text-align:right;white-space:nowrap;font-weight:700}.empty-items{text-align:center;color:var(--muted)}
    .totals{margin:0 0 0 auto;width:min(100%,310px)}.totals td{padding:3px 0}.totals td:last-child{text-align:right;font-weight:700}.totals .grand td{padding-top:8px;border-top:2px solid var(--ink);font-size:20px;font-weight:900}
    .footer{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:17px 20px}.sign{padding-top:22px;border-bottom:1px solid var(--ink);text-align:center;font-size:10px;color:var(--muted)}
    @media(max-width:520px){body{padding:8px}.ticket{border-radius:0}.restaurant,.title-row,.meta,.section,.footer{padding-left:12px;padding-right:12px}.restaurant-name{font-size:20px}.address{font-size:18px}.customer-grid{grid-template-columns:1fr}.title{font-size:17px}.order-code strong{font-size:20px}}
    @media print{@page{margin:7mm}body{padding:0}.ticket{max-width:none}.footer{break-inside:avoid}}
  </style>
</head>
<body>
  <main class="ticket">
    <header class="restaurant">
      <div class="restaurant-name">${escapeHTML(restaurantName)}</div>
      ${restaurantContact ? `<div class="restaurant-contact">Contato do restaurante: ${escapeHTML(restaurantContact)}</div>` : ''}
    </header>
    <div class="title-row">
      <div class="title">🛵 EXPEDIÇÃO DELIVERY</div>
      <div class="order-code"><span>Pedido</span><strong>#${escapeHTML(orderCode)}</strong></div>
    </div>
    <div class="meta"><span>Impresso em ${escapeHTML(printedAt)}</span><strong>${escapeHTML(deliveryModeLabel(delivery.default_fulfillment_mode))}</strong></div>
    <section class="section">
      <span class="label">📍 Entregar em</span>
      <div class="address-box">
        <div class="address">${escapeHTML(deliveryAddress(delivery))}</div>
        ${delivery.address_reference ? `<div class="reference">Referência: ${escapeHTML(String(delivery.address_reference))}</div>` : ''}
      </div>
      <div class="customer-grid">
        <div><span class="label">Cliente</span><strong>${escapeHTML(delivery.customer_name || 'Cliente do WhatsApp')}</strong></div>
        ${customerPhone ? `<div><span class="label">Contato do cliente</span><div class="customer-phone">☎ ${escapeHTML(customerPhone)}</div></div>` : ''}
      </div>
    </section>
    <section class="section">
      <span class="label">Itens do pedido</span>
      <table class="items"><thead><tr><th>Qtd.</th><th>Item</th><th class="money">Valor</th></tr></thead><tbody>${itemRows}</tbody></table>
    </section>
    <section class="section">
      <table class="totals"><tbody><tr><td>Itens</td><td>${escapeHTML(formatCurrency(itemsTotal))}</td></tr><tr><td>Frete</td><td>${escapeHTML(formatCurrency(fee))}</td></tr><tr class="grand"><td>Total</td><td>${escapeHTML(formatCurrency(total))}</td></tr></tbody></table>
    </section>
    <footer class="footer"><div class="sign">Separado por</div><div class="sign">Saída às</div></footer>
  </main>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 150);
  return true;
}

async function updateStatus(orderId, newStatus, cancelReason, prepMinutes, cancelReasonCode, cancelCategory) {
  if (pendingOrderTransitions.has(orderId)) return;
  pendingOrderTransitions.add(orderId);
  const orderCard = document.querySelector(`.order-card[data-id="${orderId}"]`);
  orderCard?.querySelectorAll('.action-btn').forEach((button) => {
    button.disabled = true;
  });

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
  } finally {
    pendingOrderTransitions.delete(orderId);
    const currentOrderCard = document.querySelector(`.order-card[data-id="${orderId}"]`);
    currentOrderCard?.querySelectorAll('.action-btn').forEach((button) => {
      button.disabled = false;
    });
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

function normalizeOptionalDisplayText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || ['<nil>', 'nil', 'null', '<null>', 'undefined'].includes(text.toLowerCase())) return '';
  return text;
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
    notes: normalizeOptionalDisplayText(order.notes),
    batch_id: order.batch_id || order.batchId || null,
    batchId: order.batchId || order.batch_id || null,
    service_type: order.service_type || order.serviceType || '',
    serviceType: order.serviceType || order.service_type || '',
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
      observations: normalizeOptionalDisplayText(item.observations),
      menu_item_id: item.menu_item_id || item.menuItemId || null,
      menu_item_name: item.menu_item_name || item.menuItemName || item.name || item.item_name_snapshot || item.itemNameSnapshot || item.menuItem?.name || '',
      name: item.name || item.menu_item_name || item.menuItemName || item.item_name_snapshot || item.itemNameSnapshot || item.menuItem?.name || '',
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
  return getElapsedWithSla(dateStr, {
    warningMinutes: CONFIG.WARNING_MINUTES,
    criticalMinutes: CONFIG.URGENT_MINUTES,
  });
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
    let shouldRefreshOperationalCounters = false;
    document.querySelectorAll('.order-timer[data-start][data-stage]').forEach(el => {
      const stage = getStageSlaConfig(el.dataset.stage, el.dataset.station);
      const elapsed = getElapsedWithSla(el.dataset.start, stage);
      const previousSeverity = el.dataset.severity || 'normal';
      el.textContent = `⏱ ${stage.label} ${elapsed.text} · limite ${stage.criticalMinutes} min`;
      el.classList.toggle('warning', elapsed.warning);
      el.classList.toggle('urgent', elapsed.urgent);
      el.dataset.severity = elapsed.severity;

      const card = el.closest('.order-card');
      if (card) {
        card.classList.toggle('sla-warning', elapsed.severity === 'warning');
        card.classList.toggle('sla-critical', elapsed.severity === 'critical');
        if (previousSeverity !== elapsed.severity) {
          reorderOrderColumn(card.closest('.column-body'));
          shouldRefreshOperationalCounters = true;
        }
      }
    });
    if (shouldRefreshOperationalCounters && ['kitchen', 'bar'].includes(activePanel)) {
      renderCurrentPanel();
    }
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
  delivery: ['Operação de entregas', '— aceite, prepare, despache e acompanhe cada entrega'],
};

function switchPanel(name) {
  const nextPanel = KDS_ACCESS.availablePanels.includes(name) ? name : KDS_ACCESS.defaultPanel;
  activePanel = nextPanel;
  document.body.dataset.activePanel = nextPanel;
  document.querySelectorAll('.screen-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + nextPanel).classList.add('active');
  document.querySelectorAll('.screen-tab[data-panel]').forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === nextPanel));
  document.querySelectorAll('.sidebar-nav .nav-item[data-panel]').forEach((navItem) => navItem.classList.toggle('active', navItem.dataset.panel === nextPanel));
  const deliveryUnavailable = nextPanel === 'delivery' && !KDS_ACCESS.deliveryEnabled;
  const attendanceUnavailable = nextPanel === 'salao' && !KDS_ACCESS.attendanceEnabled;
  document.getElementById('topbar-title').textContent = deliveryUnavailable ? 'Agilidade nas entregas' : attendanceUnavailable ? 'Agilidade no atendimento' : (TITLES[nextPanel]?.[0] || 'ClickGarçom');
  document.getElementById('topbar-sub').textContent = deliveryUnavailable || attendanceUnavailable ? '— um fluxo mais rápido para sua operação' : (TITLES[nextPanel]?.[1] || '');
  if (nextPanel === 'delivery') {
    if (KDS_ACCESS.canViewDelivery) loadDeliveries();
  } else if (nextPanel !== 'salao' || KDS_ACCESS.attendanceEnabled) {
    loadOrders();
  }
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
function playNewOrderChime() {
  // A short two-note chime makes the alert recognizable before the supplied
  // female "novo pedido" announcement. It contains no spoken voice.
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = window.__clickgarcomAlertChimeContext || new AudioContextClass();
    window.__clickgarcomAlertChimeContext = context;
    const scheduleChime = () => {
      const startAt = context.currentTime + 0.02;
      [[740, 0, 0.15], [988, 0.18, 0.22]].forEach(([frequency, offset, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt + offset);
        gain.gain.setValueAtTime(0.0001, startAt + offset);
        gain.gain.exponentialRampToValueAtTime(0.23, startAt + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(startAt + offset);
        oscillator.stop(startAt + offset + duration + 0.03);
      });
    };
    if (context.state === 'suspended') context.resume().then(scheduleChime).catch(() => undefined);
    else scheduleChime();
  } catch (_error) {
    // The supplied announcement remains available when Web Audio is blocked.
  }
}

function playNotificationSound(entityKeys = []) {
  // The alert is a chime followed by the supplied female "novo pedido"
  // announcement. There is intentionally no browser-generated speech.
  const now = Date.now();
  if (now - notificationSoundLastStartedAt < NOTIFICATION_SOUND_DEBOUNCE_MS) {
    return window.__clickgarcomNewOrderAudio || null;
  }
  const keys = (Array.isArray(entityKeys) ? entityKeys : [entityKeys])
    .map((key) => String(key || '').trim())
    .filter(Boolean);
  for (const [key, startedAt] of notificationSoundEntityTimes.entries()) {
    if (now - startedAt >= NOTIFICATION_SOUND_ENTITY_WINDOW_MS) notificationSoundEntityTimes.delete(key);
  }
  if (keys.some((key) => now - Number(notificationSoundEntityTimes.get(key) || 0) < NOTIFICATION_SOUND_ENTITY_WINDOW_MS)) {
    return window.__clickgarcomNewOrderAudio || null;
  }
  try {
    // Use the exact file supplied for the operation. The .mpeg extension is
    // intentional: it avoids silently substituting another alert sound while
    // keeping the browser's audio/mpeg handling.
    const audio = window.__clickgarcomNewOrderAudio || new Audio('/audio/audio-novo-pedido.mpeg');
    window.__clickgarcomNewOrderAudio = audio;
    // A delivery can arrive through websocket and polling at nearly the same
    // time. Do not rewind an alert that is already playing.
    if (!audio.paused && !audio.ended) return audio;
    notificationSoundLastStartedAt = now;
    keys.forEach((key) => notificationSoundEntityTimes.set(key, now));
    playNewOrderChime();
    window.setTimeout(() => {
      // Do not restart a newer alert if another event reaches this callback.
      if (!audio.paused && !audio.ended) return;
      audio.currentTime = 0;
      audio.volume = 0.9;
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => undefined);
    }, NEW_ORDER_CHIME_DELAY_MS);
    return audio;
  } catch (_error) {
    // O operador ainda pode ouvir o arquivo após interagir com o KDS.
    return null;
  }
}

function automaticAcceptanceStorageKey() {
  return `clickgarcom:kds:auto-accepted:${CONFIG.TENANT_ID || 'tenant'}`;
}

function claimAutomaticAcceptanceAlert(delivery) {
  const id = String(delivery?.id || '').trim();
  if (!id || announcedAutoAcceptedDeliveries.has(id)) return false;
  announcedAutoAcceptedDeliveries.add(id);

  try {
    const key = automaticAcceptanceStorageKey();
    const now = Date.now();
    const stored = JSON.parse(window.localStorage.getItem(key) || '{}');
    if (stored && typeof stored === 'object' && stored[id]) return false;
    const recent = Object.entries(stored && typeof stored === 'object' ? stored : {})
      .filter(([, timestamp]) => now - Number(timestamp || 0) < 7 * 24 * 60 * 60 * 1000)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 199);
    const next = Object.fromEntries(recent);
    next[id] = now;
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch (_error) {
    // The in-memory set still prevents duplicate announcements when private
    // browsing or a restrictive browser blocks localStorage.
  }
  return true;
}

function playAutomaticAcceptanceSound(delivery) {
  // Automatic acceptance uses the same supplied “novo pedido” audio as the
  // regular KDS alert, rather than a generated tone.
  const keys = [
    delivery?.id,
    delivery?.order_id,
    delivery?.orderId,
    delivery?.batch_id,
    delivery?.batchId,
    ...deliveryOrders(delivery).map((order) => order?.id),
  ];
  return playNotificationSound(keys);
}

function announceAutomaticDeliveryAcceptances(deliveries) {
  const now = Date.now();
  (Array.isArray(deliveries) ? deliveries : []).forEach((delivery) => {
    const status = String(delivery?.status || '').toUpperCase();
    const acceptanceMode = String(delivery?.acceptance_mode || delivery?.acceptanceMode || '').toUpperCase();
    const createdAt = new Date(delivery?.created_at || delivery?.createdAt || 0).getTime();
    const recent = Number.isFinite(createdAt) && now - createdAt <= 15 * 60 * 1000;
    if (status !== 'PREPARING' || acceptanceMode !== 'AUTO' || !recent || !claimAutomaticAcceptanceAlert(delivery)) return;

    playAutomaticAcceptanceSound(delivery);
    const code = String(delivery?.display_code || delivery?.id || '').trim();
    toast('t-success', '⚡ Pedido aceito automaticamente', `${code ? `#${code} · ` : ''}Movido para Em preparo`);
    scheduleAutomaticDeliveryDispatchPrint(delivery);
  });
}

function automaticDispatchStorageKey() {
  return `clickgarcom:kds:auto-dispatch-printed:${CONFIG.TENANT_ID || 'tenant'}`;
}

function claimAutomaticDispatchPrint(delivery) {
  const id = String(delivery?.id || '').trim();
  if (!id) return false;
  try {
    const stored = JSON.parse(window.localStorage.getItem(automaticDispatchStorageKey()) || '{}');
    if (stored && stored[id]) return false;
    const now = Date.now();
    const recent = Object.entries(stored && typeof stored === 'object' ? stored : {})
      .filter(([, timestamp]) => now - Number(timestamp || 0) < 7 * 24 * 60 * 60 * 1000)
      .slice(-199);
    window.localStorage.setItem(automaticDispatchStorageKey(), JSON.stringify({ ...Object.fromEntries(recent), [id]: now }));
  } catch (_error) {
    window.__clickgarcomAutoDispatchPrinted = window.__clickgarcomAutoDispatchPrinted || new Set();
    if (window.__clickgarcomAutoDispatchPrinted.has(id)) return false;
    window.__clickgarcomAutoDispatchPrinted.add(id);
  }
  return true;
}

function scheduleAutomaticDeliveryDispatchPrint(delivery) {
  const mode = String(delivery?.default_fulfillment_mode || delivery?.defaultFulfillmentMode || 'OWN').toUpperCase();
  if (mode !== 'OWN') return;
  window.setTimeout(() => {
    const printed = printDeliveryDispatch(delivery.id, true);
    if (printed) {
      claimAutomaticDispatchPrint(delivery);
    } else {
      // Browsers only allow a print window after an explicit user gesture.
      // Keep the alert visible and tell the operator exactly how to continue;
      // the delivery card always keeps the “Ver expedição” action available.
      toast('t-error', '🖨️ Impressão automática bloqueada', 'Permita pop-ups para este site e use “Ver expedição” no pedido.');
    }
  }, 250);
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
      renderSalao();
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
      renderSalao();
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
      renderSalao();
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

  const prioritizedChats = [...waiterChats].sort((a, b) => {
    const waitingA = Number(a.unreadCount || a.unread_count || 0) > 0 || String(a.lastSenderType || '').toUpperCase() === 'CUSTOMER';
    const waitingB = Number(b.unreadCount || b.unread_count || 0) > 0 || String(b.lastSenderType || '').toUpperCase() === 'CUSTOMER';
    if (waitingA !== waitingB) return waitingA ? -1 : 1;
    return new Date(a.lastMessageAt || a.openedAt || 0).getTime() - new Date(b.lastMessageAt || b.openedAt || 0).getTime();
  });

  list.innerHTML = prioritizedChats.map((chat) => {
    const lastAt = chat.lastMessageAt || chat.openedAt;
    const elapsed = getElapsed(lastAt);
    const tableRaw = String(chat.tableNumber || '').trim();
    const tableLabel = tableRaw ? `Mesa ${formatTableNumber(tableRaw)}` : 'Sem mesa';
    const lastText = String(chat.lastMessage || 'Aguardando mensagem do cliente...');
    const sender = String(chat.lastSenderType || '').toUpperCase() === 'STAFF' ? 'Equipe' :
      String(chat.lastSenderType || '').toUpperCase() === 'SYSTEM' ? 'Sistema' : 'Cliente';
    const waitingReply = Number(chat.unreadCount || chat.unread_count || 0) > 0
      || String(chat.lastSenderType || '').toUpperCase() === 'CUSTOMER';

    return `<div class="ready-item ${waitingReply ? 'chat-waiting-reply' : ''}">
      <div style="font-size:20px;flex-shrink:0">💬</div>
      <div class="ready-item-left">
        <div class="ready-item-title">${escapeHTML(chat.userPhone || '')} · ${escapeHTML(tableLabel)}</div>
        <div class="ready-item-sub">${escapeHTML(sender)}: ${escapeHTML(lastText)}</div>
        <div class="waiter-chat-meta">${waitingReply ? 'Aguardando resposta · ' : ''}Atualizado há ${escapeHTML(elapsed.text)}</div>
      </div>
      <div class="waiter-chat-actions">
        <button class="action-btn action-primary accept-btn" style="flex-shrink:0" onclick="openWaiterChat('${escapeHTML(chat.id)}')">Abrir conversa</button>
        <button class="action-btn secondary-btn" style="flex-shrink:0" onclick="closeWaiterChat('${escapeHTML(chat.id)}')">Encerrar</button>
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
