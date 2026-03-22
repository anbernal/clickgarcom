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
let menuItemNameById = new Map();
let pendingRequests = [];
let availableTables = [];
let tablesSnapshot = [];
let tableMetrics = { total: 0, available: 0, occupied: 0 };
let tabMetaById = new Map();
let assignModalState = { requestId: null, selectedTableId: null };
let waiterChats = [];
let waiterChatMessagesById = new Map();
let activeWaiterChatId = null;
let closeBillRequests = [];
const PANEL_ORDER = ['kitchen', 'bar', 'salao'];

function resolveInitialPanel() {
  const panel = new URLSearchParams(window.location.search).get('panel');
  return PANEL_ORDER.includes(panel) ? panel : 'kitchen';
}

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchPanel(resolveInitialPanel());
  applySidebarTenantName();
  startClock();
  loadMenuItems().finally(() => {
    loadOrders().then(() => {
      connectWebSocket();
      startTimerUpdates();
    });
  });
  Promise.all([loadPendingRequests(), loadTableState(), loadWaiterChats(), loadCloseRequests()]);
  setInterval(() => {
    loadPendingRequests();
    loadTableState();
  }, 10000);
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
    menuItemNameById = new Map(
      items
        .filter((item) => item && item.id && item.name)
        .map((item) => [String(item.id), String(item.name)])
    );
  } catch (e) {
    console.warn('Failed to load menu items for KDS labels:', e);
    menuItemNameById = new Map();
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
    const data = await apiGet(`/orders?tenant_id=${CONFIG.TENANT_ID}&status=PENDING,ACCEPTED,READY`);
    const orders = Array.isArray(data) ? data : (data.orders || []);
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

function handleWSEvent(event) {
  if (event.type === 'connected') return;

  if (event.type === 'order.created') {
    const order = normalizeOrder(event.data);
    allOrders[order.id] = order;
    renderAll();
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
  }
}

// ─── RENDER ────────────────────────────────────────────────────
function renderAll() {
  renderPanel('kitchen', 'KITCHEN');
  renderPanel('bar', 'BAR');
  renderSalao();
  updateNavBadges();
}

function renderPanel(panel, destination) {
  const orders = Object.values(allOrders).filter(o => o.destination === destination);
  const pending = orders.filter(o => o.status === 'PENDING');
  const accepted = orders.filter(o => o.status === 'ACCEPTED');
  const ready = orders.filter(o => o.status === 'READY');

  const prefix = panel === 'kitchen' ? 'k' : 'b';
  renderColumn(`col-${prefix}-pending`, pending, 'PENDING');
  renderColumn(`col-${prefix}-accepted`, accepted, 'ACCEPTED');
  renderColumn(`col-${prefix}-ready`, ready, 'READY');

  document.getElementById(`cc-${prefix}-pending`).textContent = pending.length;
  document.getElementById(`cc-${prefix}-accepted`).textContent = accepted.length;
  document.getElementById(`cc-${prefix}-ready`).textContent = ready.length;

  renderStats(`stats-${panel}`, pending.length, accepted.length, ready.length, destination);
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
  card.className = `order-card ${getCardClass(order)}`;
  card.dataset.id = order.id;
  card.innerHTML = buildCardHTML(order);
  return card;
}

function updateOrderCard(card, order) {
  card.className = `order-card ${getCardClass(order)}`;
  card.innerHTML = buildCardHTML(order);
}

function getCardClass(order) {
  if (order.status === 'PENDING') return 'urgent';
  if (order.status === 'ACCEPTED') return 'accepted';
  if (order.status === 'READY') return 'ready';
  return '';
}

function buildCardHTML(order) {
  const badge = order.destination === 'KITCHEN' ? 'badge-kitchen' : 'badge-bar';
  const destLabel = order.destination === 'KITCHEN' ? 'Cozinha' : 'Bar';
  const elapsed = getElapsed(order.created_at);

  let itemsHtml = '';
  if (order.items && order.items.length) {
    itemsHtml = order.items.map(i =>
      `<div class="order-item"><span class="item-qty">${escapeHTML(i.quantity)}x</span><span class="item-name">${escapeHTML(resolveItemName(i))}</span>${i.observations ? `<span class="item-note">${escapeHTML(i.observations)}</span>` : ''}</div>`
    ).join('');
  }

  let actions = '';
  if (order.status === 'PENDING') {
    actions = `<button class="action-btn reject-btn" onclick="openModal('${order.id}','reject')">✕ Recusar</button><button class="action-btn accept-btn" onclick="openModal('${order.id}','accept')">✓ Aceitar</button>`;
  } else if (order.status === 'ACCEPTED') {
    actions = `<button class="action-btn done-btn" onclick="updateStatus('${order.id}','READY')">✓ Pronto</button>`;
  } else if (order.status === 'READY') {
    actions = `<button class="action-btn deliver-btn" onclick="updateStatus('${order.id}','DELIVERED')">📦 Entregar</button>`;
  }

  return `
    <div class="order-card-header">
      <span class="order-id">#${escapeHTML(getOrderDisplayCode(order))}</span>
      <span class="table-badge">${escapeHTML(getOrderTableLabel(order))}</span>
      <span class="order-type-badge ${badge}">${destLabel}</span>
    </div>
    <div class="order-items">${itemsHtml || '<div class="order-item"><span class="item-name" style="color:var(--text-3)">Sem itens</span></div>'}</div>
    <div class="order-card-footer">
      <span class="order-timer ${elapsed.urgent ? 'urgent' : ''}" data-created="${order.created_at}">⏱ ${elapsed.text}</span>
      <div class="order-actions">${actions}</div>
    </div>`;
}

function renderStats(containerId, pending, accepted, ready, destination) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icon = destination === 'KITCHEN' ? '🍳' : '🍹';
  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:var(--red-bg)">🔴</div><div><div class="stat-value" style="color:var(--red)">${pending}</div><div class="stat-label">Aguardando aceite</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-bg)">⏱</div><div><div class="stat-value" style="color:#8a6e00">${accepted}</div><div class="stat-label">Em preparo</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--green-bg)">✅</div><div><div class="stat-value" style="color:var(--green)">${ready}</div><div class="stat-label">Prontos</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--surface-2)">${icon}</div><div><div class="stat-value">${pending + accepted + ready}</div><div class="stat-label">Total ativos</div></div></div>`;
}

function renderSalao() {
  const readyOrders = Object.values(allOrders).filter(o => o.status === 'READY');
  const openChats = waiterChats.filter((chat) => chat.status === 'OPEN').length;

  // --- Stats ---
  const statsEl = document.getElementById('stats-salao');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-bg)">🪑</div><div><div class="stat-value" style="color:var(--green)">${tableMetrics.available}</div><div class="stat-label">Mesas Livres</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-bg)">✅</div><div><div class="stat-value" style="color:var(--green)">${readyOrders.length}</div><div class="stat-label">Prontos p/ Entrega</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-bg)">👤</div><div><div class="stat-value" style="color:#8a6e00">${pendingRequests.length}</div><div class="stat-label">Aguardando</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-bg)">💬</div><div><div class="stat-value" style="color:var(--blue)">${openChats}</div><div class="stat-label">WhatsApp</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--red-bg)">💰</div><div><div class="stat-value" style="color:var(--red)">${closeBillRequests.length}</div><div class="stat-label">Fechando Conta</div></div></div>`;
  }

  // --- Primeiro Contato ---
  const newList = document.getElementById('salao-new-list');
  if (newList) {
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
        return `<div class="ready-item">
          <div style="font-size:20px;flex-shrink:0">📱</div>
          <div class="ready-item-left">
            <div class="ready-item-title">${phone}</div>
            <div class="ready-item-sub">${pax} pessoa(s) · Aguardando há ${escapeHTML(elapsed.text)}</div>
          </div>
          <button class="action-btn accept-btn" style="flex-shrink:0" onclick="openAssignModal('${escapeHTML(req.id)}','${phone}','${pax}')">🥞 Alocar Mesa</button>
        </div>`;
      }).join('');
    }
    document.getElementById('salao-new-count').textContent = pendingRequests.length;
  }

  // --- Prontos para Entrega ---
  const readyList = document.getElementById('salao-ready-list');
  if (readyList) {
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

  // --- Fechar Conta + Chats + Mesas ---
  renderCloseBillRequests();
  renderWaiterChats();
  renderSalaoTables();
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
async function updateStatus(orderId, newStatus, cancelReason, prepMinutes) {
  try {
    const orderRef = allOrders[orderId];
    const displayCode = getOrderDisplayCode(orderRef || { id: orderId });
    const body = { status: newStatus };
    if (cancelReason) body.cancel_reason = cancelReason;
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
    renderAll();

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
  if (val === '__custom__') {
    const txt = document.getElementById('custom-text').value.trim();
    if (!txt) {
      document.getElementById('err-custom-empty').classList.add('show');
      document.getElementById('custom-text').focus();
      return;
    }
    updateStatus(modalState.orderId, 'CANCELED', txt);
  } else {
    updateStatus(modalState.orderId, 'CANCELED', val);
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
    items: items.map((item) => ({
      ...item,
      menu_item_id: item.menu_item_id || item.menuItemId || null,
      menu_item_name: item.menu_item_name || item.menuItemName || item.name || item.menuItem?.name || '',
      unit_price: item.unit_price || item.unitPrice || item.price || null,
    })),
  };
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
  if (!dateStr) return { text: '—', minutes: 0, urgent: false };
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    text: mins > 0 ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `00:${String(secs).padStart(2, '0')}`,
    minutes: mins,
    urgent: mins >= CONFIG.URGENT_MINUTES,
  };
}

function startTimerUpdates() {
  timerInterval = setInterval(() => {
    document.querySelectorAll('.order-timer[data-created]').forEach(el => {
      const elapsed = getElapsed(el.dataset.created);
      el.textContent = `⏱ ${elapsed.text}`;
      el.classList.toggle('urgent', elapsed.urgent);
    });
  }, 1000);
}

// ─── PANEL SWITCH ──────────────────────────────────────────────
const TITLES = {
  kitchen: ['Estação da Cozinha', '— aceite e gerencie os pedidos da cozinha'],
  bar: ['Estação do Bar', '— aceite e gerencie os pedidos do bar'],
  salao: ['Painel do Salão', '— gerencie clientes, entregas, contas e conversas'],
};

function switchPanel(name) {
  const nextPanel = PANEL_ORDER.includes(name) ? name : 'kitchen';
  activePanel = nextPanel;
  document.querySelectorAll('.screen-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + nextPanel).classList.add('active');
  document.querySelectorAll('.screen-tab').forEach((t, i) => t.classList.toggle('active', PANEL_ORDER[i] === nextPanel));
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((n, i) => n.classList.toggle('active', PANEL_ORDER[i] === nextPanel));
  document.getElementById('topbar-title').textContent = TITLES[nextPanel][0];
  document.getElementById('topbar-sub').textContent = TITLES[nextPanel][1];
}

// ─── TOAST ─────────────────────────────────────────────────────
function toast(type, title, sub) {
  const el = document.createElement('div');
  el.className = `toast ${escapeHTML(type)}`;
  const icon = type === 't-success' ? '✅' : type === 't-error' ? '🚫' : '🔔';
  el.innerHTML = `<div style="font-size:18px">${icon}</div><div class="toast-content"><div class="toast-title">${escapeHTML(title)}</div><div class="toast-sub">${escapeHTML(sub)}</div></div>`;
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
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
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
    renderSalao();
    updateNavBadges();
  } catch (e) {
    console.warn('Failed to load pending requests:', e);
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
    renderAll();
  } catch (e) {
    console.warn('Failed to load tables:', e);
    tablesSnapshot = [];
    availableTables = [];
    tabMetaById = new Map();
    tableMetrics = { total: 0, available: 0, occupied: 0 };
    renderAll();
  }
}

async function loadWaiterChats() {
  try {
    const data = await apiGet('/tables/waiter/chats/open');
    waiterChats = Array.isArray(data) ? data : [];
    renderWaiterChats();
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
    renderSalao();
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
    await apiPost(`/tables/waiter/chats/${activeWaiterChatId}/messages`, { message });
    input.value = '';
    await Promise.all([loadWaiterChats(), loadWaiterChatMessages(activeWaiterChatId)]);
    toast('t-success', '✅ Mensagem enviada', 'Cliente notificado no WhatsApp');
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
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}
