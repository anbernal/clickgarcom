// ─── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  API_URL: '/admin/api',
  WS_URL: 'ws://localhost:8080/ws/kds',
  TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
  POLL_INTERVAL: 15000,
  URGENT_MINUTES: 10,
  WARNING_MINUTES: 5,
};

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
  window.location.href = '/login.html';
}

if (authSession?.token) {
  try {
    const payloadB64 = authSession.token.split('.')[1];
    const payload = JSON.parse(atob(payloadB64));
    CONFIG.TENANT_ID = payload.tenant_id;
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

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  loadOrders().then(() => {
    connectWebSocket();
    startTimerUpdates();
  });
});

// ─── API ───────────────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(`${CONFIG.API_URL}${path}`, {
    headers: { 'Authorization': authSession ? `Bearer ${authSession.token}` : '' }
  });
  if (r.status === 401 || r.status === 403) window.location.href = '/login.html';
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
  if (r.status === 401 || r.status === 403) window.location.href = '/login.html';
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `API ${r.status}`);
  }
  return r.json();
}

async function loadOrders() {
  try {
    const data = await apiGet(`/orders?tenant_id=${CONFIG.TENANT_ID}&status=PENDING,ACCEPTED,READY`);
    allOrders = {};
    (data.orders || []).forEach(o => { allOrders[o.id] = o; });
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
    const order = event.data;
    allOrders[order.id] = order;
    renderAll();
    playNotificationSound();
    toast('t-info', '🆕 Novo Pedido', `#${shortId(order.id)} · ${order.destination}`);
  }

  if (event.type === 'order.status_changed') {
    const order = event.data;
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
  renderWaiter();
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
      `<div class="order-item"><span class="item-qty">${escapeHTML(i.quantity)}x</span><span class="item-name">${i.menu_item_id ? escapeHTML(shortId(i.menu_item_id)) : 'Item'}</span>${i.observations ? `<span class="item-note">${escapeHTML(i.observations)}</span>` : ''}</div>`
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
      <span class="order-id">#${shortId(order.id)}</span>
      <span class="table-badge">${order.notes && order.notes.includes('WhatsApp') ? '📱 WhatsApp' : 'Mesa'}</span>
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

function renderWaiter() {
  const readyOrders = Object.values(allOrders).filter(o => o.status === 'READY');
  const prepOrders = Object.values(allOrders).filter(o => o.status === 'ACCEPTED');

  // Stats
  const statsEl = document.getElementById('stats-waiter');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-bg)">🍽</div><div><div class="stat-value" style="color:var(--green)">${readyOrders.length}</div><div class="stat-label">Prontos p/ entregar</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-bg)">⏱</div><div><div class="stat-value" style="color:#8a6e00">${prepOrders.length}</div><div class="stat-label">Em preparo</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-bg)">🛎</div><div><div class="stat-value" style="color:var(--blue)">${Object.keys(allOrders).length}</div><div class="stat-label">Pedidos ativos</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--surface-2)">✅</div><div><div class="stat-value">—</div><div class="stat-label">Entregues hoje</div></div></div>`;
  }

  // Ready list
  const readyList = document.getElementById('waiter-ready-list');
  if (readyList) {
    if (readyOrders.length === 0) {
      readyList.innerHTML = '<div class="empty-state">Nenhum pedido pronto</div>';
    } else {
      readyList.innerHTML = readyOrders.map(o => {
        const elapsed = getElapsed(o.ready_at || o.created_at);
        const icon = o.destination === 'KITCHEN' ? '🍳' : '🍹';
        const tag = o.destination === 'KITCHEN'
          ? '<span class="ready-tag" style="background:var(--orange-bg);color:var(--orange)">Cozinha</span>'
          : '<span class="ready-tag" style="background:var(--blue-bg);color:var(--blue)">Bar</span>';
        const itemNames = escapeHTML((o.items || []).map(i => `${i.quantity}x ${shortId(i.menu_item_id)}`).join(', ') || 'Itens');
        return `<div class="ready-item ${elapsed.urgent ? 'style="background:var(--red-bg);border-color:#f0c4be"' : ''}">
          <div style="font-size:20px;flex-shrink:0">${icon}</div>
          <div class="ready-item-left">
            <div class="ready-item-title">Pedido #${escapeHTML(shortId(o.id))}</div>
            <div class="ready-item-sub">${itemNames}</div>
            <div style="font-size:10px;color:var(--text-3);font-family:'DM Mono';margin-top:3px">Pronto há ${escapeHTML(elapsed.text)}</div>
          </div>
          ${tag}
          <button class="action-btn deliver-btn" style="flex-shrink:0" onclick="updateStatus('${o.id}','DELIVERED')">Entregar</button>
        </div>`;
      }).join('');
    }
    document.getElementById('waiter-ready-count').textContent = readyOrders.length;
  }

  // Prep list
  const prepList = document.getElementById('waiter-prep-list');
  if (prepList) {
    if (prepOrders.length === 0) {
      prepList.innerHTML = '<div class="empty-state">Nenhum pedido em preparo</div>';
    } else {
      prepList.innerHTML = prepOrders.map(o => {
        const elapsed = getElapsed(o.accepted_at || o.created_at);
        const icon = o.destination === 'KITCHEN' ? '🍳' : '🍹';
        return `<div class="ready-item">
          <div style="font-size:20px;flex-shrink:0">${icon}</div>
          <div class="ready-item-left">
            <div class="ready-item-title">Pedido #${shortId(o.id)}</div>
            <div class="ready-item-sub">Em preparo há ${elapsed.text}</div>
          </div>
        </div>`;
      }).join('');
    }
    document.getElementById('waiter-prep-count').textContent = prepOrders.length;
  }
}

function updateNavBadges() {
  const kitchen = Object.values(allOrders).filter(o => o.destination === 'KITCHEN' && o.status === 'PENDING').length;
  const bar = Object.values(allOrders).filter(o => o.destination === 'BAR' && o.status === 'PENDING').length;
  document.getElementById('nb-kitchen').textContent = kitchen;
  document.getElementById('nb-bar').textContent = bar;
}

// ─── ACTIONS ───────────────────────────────────────────────────
async function updateStatus(orderId, newStatus, cancelReason) {
  try {
    const body = { status: newStatus };
    if (cancelReason) body.cancel_reason = cancelReason;
    await apiPatch(`/orders/${orderId}/status?tenant_id=${CONFIG.TENANT_ID}`, body);

    // Optimistic update
    if (newStatus === 'DELIVERED' || newStatus === 'CANCELED') {
      delete allOrders[orderId];
    } else if (allOrders[orderId]) {
      allOrders[orderId].status = newStatus;
    }
    renderAll();

    const labels = { ACCEPTED: 'aceito', READY: 'pronto', DELIVERED: 'entregue', CANCELED: 'cancelado' };
    toast('t-success', `✅ Pedido ${labels[newStatus]}!`, `#${shortId(orderId)}`);
  } catch (e) {
    toast('t-error', '❌ Erro', e.message);
  }
}

// ─── MODAL ─────────────────────────────────────────────────────
function openModal(orderId, tab) {
  modalState.orderId = orderId;
  const order = allOrders[orderId];
  if (!order) return;

  document.getElementById('mi-id').textContent = '#' + shortId(orderId);
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
  updateStatus(modalState.orderId, 'ACCEPTED');
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
  waiter: ['Painel do Garçom', '— acompanhe os pedidos prontos e chamados'],
};

function switchPanel(name) {
  activePanel = name;
  document.querySelectorAll('.screen-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.screen-tab').forEach((t, i) => t.classList.toggle('active', ['kitchen', 'bar', 'waiter'][i] === name));
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((n, i) => n.classList.toggle('active', i === ['kitchen', 'bar', 'waiter'].indexOf(name)));
  document.getElementById('topbar-title').textContent = TITLES[name][0];
  document.getElementById('topbar-sub').textContent = TITLES[name][1];
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

// ─── CLOCK ─────────────────────────────────────────────────────
function startClock() {
  const update = () => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}
