// Mesas Page
let mesasTableCache = [];

// ─── SVG ICONS ─────────────────────────────────────────────────
const MESAS_ICONS = {
  chair: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z"/><path d="M5 16V9h14v7"/></svg>',
  utensils: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  calendar: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  broom: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 11 9-9"/><path d="M14.6 12.6c-1.2-1.2-3.1-1.2-4.2 0l-2.8 2.8c-1.2 1.2-1.2 3.1 0 4.2l2.8 2.8c1.2 1.2 3.1 1.2 4.2 0l2.8-2.8c1.2-1.2 1.2-3.1 0-4.2Z"/><path d="m2 22 4-4"/></svg>',
  chairSm: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z"/><path d="M5 16V9h14v7"/></svg>',
  occupied: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
  available: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 10 11 15 8 12"/></svg>',
  reserved: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};
let mesasComandaModalState = {
  tableId: null,
  tableNumber: '',
  details: [],
  splitStateByTabId: {},
};

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatTableNumber(value) {
  const raw = String(value || '--').trim();
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw;
}

function getCapacityLabel(capacity) {
  const seats = Number(capacity || 0);
  if (seats <= 0) return 'Capacidade nao informada';
  return `${seats} ${seats === 1 ? 'lugar' : 'lugares'}`;
}

function getTableStatusMeta(status) {
  const map = {
    AVAILABLE: { cls: 'free', label: 'Livre', icon: MESAS_ICONS.chair },
    OCCUPIED: { cls: 'occupied', label: 'Ocupada', icon: MESAS_ICONS.utensils },
    RESERVED: { cls: 'reserved', label: 'Reservada', icon: MESAS_ICONS.calendar },
    CLEANING: { cls: 'closed', label: 'Limpeza', icon: MESAS_ICONS.broom },
  };
  return map[status] || { cls: 'free', label: status || 'Livre', icon: MESAS_ICONS.chair };
}

function renderTableActions(table) {
  const canManageTables = canPerformAction('manageTables');

  if (table.status === 'OCCUPIED') {
    return `
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-sm btn-primary" style="flex:1" onclick="viewComandas('${table.id}', '${escapeHTML(String(table.number))}')">Ver Comanda(s)</button>
        ${canManageTables ? `<button class="btn-sm btn-outline" style="flex:1" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Liberar</button>` : ''}
      </div>
    `;
  }

  if (table.status === 'RESERVED') {
    if (!canManageTables) {
      return '<div style="font-size:12px; color:var(--text-light); margin-top:10px;">Aguardando ação de um gestor.</div>';
    }
    return `
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-sm btn-primary" style="flex:1" onclick="changeTableStatus('${table.id}', 'OCCUPIED')">Confirmar Chegada</button>
        <button class="btn-sm btn-outline" style="flex:1" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Liberar Reserva</button>
      </div>
    `;
  }

  if (table.status === 'CLEANING') {
    if (!canManageTables) {
      return '<div style="font-size:12px; color:var(--text-light); margin-top:10px;">Aguardando liberação da mesa.</div>';
    }
    return `
      <button class="btn-sm btn-outline" style="margin-top:10px; width:100%" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Marcar Livre</button>
    `;
  }

  if (!canManageTables) {
    return '<div style="font-size:12px; color:var(--text-light); margin-top:10px;">Somente leitura para este perfil.</div>';
  }

  return `
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn-sm btn-outline" style="flex:1" onclick="changeTableStatus('${table.id}', 'RESERVED')">Reservar</button>
      <button class="btn-sm btn-primary" style="flex:1" onclick="changeTableStatus('${table.id}', 'OCCUPIED')">Abrir Mesa</button>
    </div>
    <button class="btn-sm btn-danger" style="margin-top:8px; width:100%" onclick="deleteTable('${table.id}')">Excluir Mesa</button>
  `;
}

function renderTableCard(table) {
  const meta = getTableStatusMeta(table.status);
  let tabTotalDisplay = 'Sem comanda';
  let secondaryNote = `<div style="font-size:12px; color:var(--text-light); margin-top:4px;">Capacidade: ${escapeHTML(getCapacityLabel(table.capacity))}</div>`;

  if (table.activeTabs && table.activeTabs.length > 0) {
    const totalSum = table.activeTabs.reduce((acc, tab) => acc + parseFloat(tab.total || 0), 0);
    tabTotalDisplay = formatCurrency(totalSum);

    secondaryNote += table.activeTabs.length > 1
      ? `<div style="font-size:12px; color:var(--text-light); margin-top:4px;">${table.activeTabs.length} comandas ativas</div>`
      : `<div style="font-size:12px; color:var(--text-light); margin-top:4px;">1 comanda ativa</div>`;
  } else if (table.status === 'RESERVED') {
    secondaryNote += '<div style="font-size:12px; color:var(--text-light); margin-top:4px;">Bloqueada para o Atendimento</div>';
  }

  return `
    <div class="table-item ${meta.cls}" style="padding:20px">
      <div class="mesas-table-icon">${meta.icon}</div>
      <div class="table-num" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span>Mesa ${escapeHTML(formatTableNumber(table.number))}</span>
        <span style="font-size:11px; color:var(--text-light); font-weight:600; background:var(--bg); padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">${MESAS_ICONS.users} ${escapeHTML(getCapacityLabel(table.capacity))}</span>
      </div>
      <div class="table-status">${meta.label}</div>
      <div class="table-value">${tabTotalDisplay}</div>
      ${secondaryNote}
      ${renderTableActions(table)}
    </div>
  `;
}

function renderManagementCard(tables) {
  const reservedCount = tables.filter((table) => table.status === 'RESERVED').length;
  const canManageTables = canPerformAction('manageTables');

  return `
    <div class="full-card" style="margin-bottom:24px; padding:24px; border:none; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
      
      <!-- Header Area -->
      <div style="display:flex; align-items:flex-start; margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg, rgba(59,130,246,0.1), rgba(124,58,237,0.1)); border:1px solid rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#3b82f6;">
            ${MESAS_ICONS.chair}
          </div>
          <div>
            <h2 style="margin:0 0 6px 0; font-size:18px; font-weight:700; color:var(--text); letter-spacing:-0.4px;">Cadastro de Mesas</h2>
            <p style="margin:0; font-size:13px; color:var(--text-light); max-width:400px; line-height:1.4;">
              ${canManageTables
                ? 'Adicione as mesas do seu salão e defina a capacidade de lugares de cada uma para otimizar o fluxo de atendimento.'
                : 'Seu perfil acompanha ocupação e comandas em modo leitura, sem alterar o cadastro das mesas.'}
            </p>
          </div>
        </div>
      </div>

      <!-- Main Content Split -->
      <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:stretch;">

        <!-- Form Section -->
        <div style="flex:1.8; min-width:320px; padding:20px; background:var(--bg); border:1px solid var(--border); border-radius:14px;">
          <h3 style="margin:0 0 16px 0; font-size:14px; font-weight:600; color:var(--text); letter-spacing:-0.2px;">Adicionar Nova Mesa</h3>
          
          <div style="display:flex; gap:12px; align-items:flex-end;">
            <div style="flex:1;">
              <label style="display:block; font-size:12px; font-weight:600; color:var(--text-light); margin-bottom:6px;">
                Identificação / Número
              </label>
              <input type="text" id="table-number-inline" placeholder="Ex: 01, M-10" class="input" style="width:100%; height:42px; border-radius:8px; padding:0 14px; font-size:14px;">
            </div>
            
            <div style="width:110px;">
              <label style="display:block; font-size:12px; font-weight:600; color:var(--text-light); margin-bottom:6px;">
                Lugares
              </label>
              <div style="position:relative;">
                <input type="number" id="table-capacity-inline" value="4" min="1" max="20" class="input" style="width:100%; height:42px; border-radius:8px; padding:0 14px; padding-right:32px; font-size:14px; text-align:center;">
                <span style="position:absolute; right:12px; top:12px; display:flex; color:var(--text-light); pointer-events:none;">${MESAS_ICONS.users}</span>
              </div>
            </div>

            ${canManageTables ? `
              <button class="btn btn-primary" type="button" onclick="createTable()" style="height:42px; padding:0 24px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:0.2px; transition:transform 0.1s;">
                + Adicionar
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Info / Callout Section -->
        <div style="flex:1; min-width:280px; padding:20px; background:rgba(245,158,11,0.04); border:1px solid rgba(245,158,11,0.2); border-radius:14px; position:relative; overflow:hidden;">
          <div style="position:absolute; top:-16px; right:-16px; font-size:86px; opacity:0.04; pointer-events:none; filter:grayscale(1);">
            📅
          </div>
          
          <div style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700; color:#b45309; margin-bottom:8px;">
            Regra de Reservas
          </div>
          
          <p style="font-size:13px; color:var(--text-light); margin:0 0 16px 0; line-height:1.5;">
            Mesas marcadas como <strong style="color:var(--text);">Reservadas</strong> são ocultadas da distribuição automática de novos clientes vindos do WhatsApp.
          </p>
          
          <div style="display:inline-flex; align-items:center; background:#fffbf0; border:1px solid rgba(245,158,11,0.3); color:#92400e; font-size:12px; font-weight:600; padding:4px 12px; border-radius:20px;">
            <span style="font-size:14px; margin-right:6px; display:inline-flex; color:#92400e;">${MESAS_ICONS.bell}</span>
            ${reservedCount} mesa(s) separada(s) agora
          </div>
        </div>

      </div>
    </div>
  `;
}

async function loadMesas() {
  const container = document.getElementById('mesas-grid-container');
  if (!container) return;

  try {
    const [tables, statsData] = await Promise.all([
      api.get('/tables'),
      api.get('/tables/stats'),
    ]);
    mesasTableCache = Array.isArray(tables) ? tables : [];

    const reservedCount = tables.filter((table) => table.status === 'RESERVED').length;

    container.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon" style="color:#3b82f6">${MESAS_ICONS.chairSm}</div><div class="stat-label">Total de Mesas</div><div class="stat-value">${statsData.total || tables.length}</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:#ea580c">${MESAS_ICONS.occupied}</div><div class="stat-label">Ocupadas</div><div class="stat-value">${statsData.occupied || 0}</div><div class="stat-change" style="color:var(--pending-text)">${statsData.total > 0 ? Math.round((statsData.occupied / statsData.total) * 100) : 0}% de ocupacao</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:#2563eb">${MESAS_ICONS.reserved}</div><div class="stat-label">Reservadas</div><div class="stat-value">${reservedCount}</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:#16a34a">${MESAS_ICONS.available}</div><div class="stat-label">Disponiveis</div><div class="stat-value">${statsData.available || 0}</div><div class="stat-change" style="color:var(--text-light)">Prontas para o Atendimento</div></div>
      </div>
      ${renderManagementCard(tables)}
      <div class="full-card">
        <div class="card-header">
          <div>
            <div class="card-title">Grid de Mesas</div>
            <div class="card-subtitle">Controle abertura, reserva e liberacao das mesas</div>
          </div>
        </div>
        <div class="tables-grid-6">
          ${tables.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="icon">' + MESAS_ICONS.chair + '</div><h3>Nenhuma mesa</h3><p>Cadastre a primeira mesa e informe a quantidade de lugares.</p></div>' : ''}
          ${tables.map(renderTableCard).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    mesasTableCache = [];
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

if (window.registerPageHandler) {
  window.registerPageHandler('mesas', () => {
    loadMesas();
  }, () => {
    // cleanup if needed
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('[data-page="mesas"]');
    if (btn) btn.addEventListener('click', loadMesas);
  });
}

async function createTable() {
  if (!canPerformAction('manageTables')) {
    showToast('Seu perfil nao pode cadastrar mesas.', 'error');
    return;
  }
  const numberInput = document.getElementById('table-number-inline');
  const capacityInput = document.getElementById('table-capacity-inline');
  const number = numberInput ? numberInput.value.trim() : '';
  const capacity = capacityInput ? parseInt(capacityInput.value, 10) : NaN;

  if (!number) {
    showToast('Numero da mesa e obrigatorio', 'error');
    return;
  }

  if (!Number.isFinite(capacity) || capacity < 1) {
    showToast('Informe uma capacidade valida para a mesa', 'error');
    return;
  }

  try {
    await api.post('/tables', { number, capacity });
    showToast('Mesa cadastrada com sucesso');
    if (numberInput) numberInput.value = '';
    if (capacityInput) capacityInput.value = '4';
    await loadMesas();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function changeTableStatus(id, status) {
  if (!canPerformAction('manageTables')) {
    showToast('Seu perfil nao pode alterar o status das mesas.', 'error');
    return;
  }
  try {
    await api.patch(`/tables/${id}/status`, { status });
    showToast('Status atualizado');
    await loadMesas();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function deleteTable(id) {
  if (!canPerformAction('manageTables')) {
    showToast('Seu perfil nao pode excluir mesas.', 'error');
    return;
  }
  const table = mesasTableCache.find((item) => item.id === id);
  if (!table) {
    showToast('Mesa não encontrada na listagem atual', 'error');
    return;
  }

  if (table.status !== 'AVAILABLE') {
    showToast('Só é possível excluir mesas livres', 'error');
    return;
  }

  const tableNumber = formatTableNumber(table.number);
  const confirmed = window.confirm(`Excluir a Mesa ${tableNumber}? Esta ação não pode ser desfeita.`);
  if (!confirmed) return;

  try {
    await api.delete(`/tables/${id}`);
    showToast(`Mesa ${tableNumber} excluída com sucesso`);
    await loadMesas();
  } catch (err) {
    showToast(`Erro ao excluir mesa: ${err.message}`, 'error');
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return `${formatDate(dateStr)} às ${formatTime(dateStr)}`;
}

function getComandaStatusMeta(status) {
  if (status === 'CLOSED') {
    return { label: 'Fechada', cls: 'status-canceled' };
  }
  return { label: 'Aberta', cls: 'status-done' };
}

function renderComandaMetric(label, value, helper, accent = 'var(--text)') {
  return `
    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--card-bg);">
      <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:6px;">${escapeHTML(label)}</div>
      <div style="font-size:22px; font-weight:800; color:${accent};">${escapeHTML(value)}</div>
      <div style="font-size:12px; color:var(--text-light); margin-top:6px;">${escapeHTML(helper)}</div>
    </div>
  `;
}

function renderSettlementAlert(detail) {
  const financial = detail?.financial || {};
  const gap = Number(financial.reconciliationGap || 0);
  const amountDue = Number(financial.amountDue || 0);

  if (Math.abs(gap) >= 0.01) {
    const tone = gap > 0 ? '#b45309' : '#2563eb';
    const bg = gap > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)';
    const text = gap > 0
      ? `A comanda registra ${formatCurrency(gap)} a mais do que os pagamentos confirmados.`
      : `Existem ${formatCurrency(Math.abs(gap))} em pagamentos confirmados ainda não refletidos no fechamento.`;
    return `
      <div style="padding:14px 16px; border-radius:12px; background:${bg}; border:1px solid ${bg}; color:${tone}; font-size:13px; line-height:1.45;">
        <strong>Conciliação em atenção.</strong> ${escapeHTML(text)}
      </div>
    `;
  }

  if (amountDue > 0 && detail.status !== 'CLOSED') {
    return `
      <div style="padding:14px 16px; border-radius:12px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.14); color:#b91c1c; font-size:13px; line-height:1.45;">
        <strong>Pagamento pendente.</strong> Ainda faltam ${escapeHTML(formatCurrency(amountDue))} para encerrar a comanda.
      </div>
    `;
  }

  return `
    <div style="padding:14px 16px; border-radius:12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.14); color:#047857; font-size:13px; line-height:1.45;">
      <strong>Conciliação em dia.</strong> Valores da comanda e pagamentos registrados estão coerentes.
    </div>
  `;
}

function renderComandaPayments(detail) {
  const payments = Array.isArray(detail?.payments) ? detail.payments : [];
  if (!payments.length) {
    return '<div style="font-size:12px; color:var(--text-light);">Nenhum pagamento registrado para esta comanda.</div>';
  }

  return payments.map((payment) => {
    const attemptStatus = payment.latestAttemptStatus ? ` · Tentativa ${payment.latestAttemptStatus}` : '';
    return `
      <div style="border:1px solid var(--border); border-radius:10px; padding:12px; background:var(--bg);">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div>
            <div style="font-weight:700; color:var(--text);">${escapeHTML(payment.paymentType || 'FULL')} · ${escapeHTML(payment.method || 'Forma não informada')}</div>
            <div style="font-size:12px; color:var(--text-light); margin-top:4px;">${escapeHTML(formatDateTime(payment.createdAt))}${escapeHTML(attemptStatus)}</div>
          </div>
          <div style="text-align:right;">
            <div class="mono" style="font-weight:700;">${formatCurrency(payment.amount)}</div>
            <div style="font-size:12px; color:var(--text-light);">${escapeHTML(payment.status || 'PENDING')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderComandaHistory(detail) {
  const history = Array.isArray(detail?.history) ? detail.history : [];
  if (!history.length) {
    return '<div style="font-size:12px; color:var(--text-light);">Sem eventos registrados ainda.</div>';
  }

  return history.map((event) => `
    <div style="display:grid; grid-template-columns:110px 1fr; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--border);">
      <div style="font-size:12px; color:var(--text-light);">${escapeHTML(formatDateTime(event.createdAt))}</div>
      <div>
        <div style="font-weight:700; color:var(--text);">${escapeHTML(event.label || 'Evento')}</div>
        <div style="font-size:12px; color:var(--text-light); margin-top:4px;">${escapeHTML(event.description || 'Sem detalhe')}</div>
        ${event.actorName ? `<div style="font-size:11px; color:var(--text-light); margin-top:4px;">por ${escapeHTML(event.actorName)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function ensureComandaSplitState(detail) {
  const tabId = String(detail?.id || '');
  if (!tabId) {
    return { peopleCount: 2, itemQuantities: {} };
  }

  if (!mesasComandaModalState.splitStateByTabId[tabId]) {
    mesasComandaModalState.splitStateByTabId[tabId] = {
      peopleCount: 2,
      itemQuantities: {},
    };
  }

  const current = mesasComandaModalState.splitStateByTabId[tabId];
  const nextQuantities = { ...current.itemQuantities };
  (detail?.items || []).forEach((item) => {
    const key = String(item.id);
    const max = Math.max(0, Number(item.remainingQuantity || item.quantity || 0));
    const value = Math.max(0, Math.min(max, Number(nextQuantities[key] || 0)));
    nextQuantities[key] = value;
  });
  current.itemQuantities = nextQuantities;
  current.peopleCount = Math.max(2, Number(current.peopleCount || 2));
  return current;
}

function buildEqualSplitPreview(detail, peopleCountRaw) {
  const peopleCount = Math.max(2, parseInt(peopleCountRaw, 10) || 2);
  const totalCents = Math.round(Number(detail?.financial?.total || 0) * 100);
  const baseCents = Math.floor(totalCents / peopleCount);
  const remainderCents = totalCents % peopleCount;
  const largerShare = (baseCents + (remainderCents > 0 ? 1 : 0)) / 100;
  const baseShare = baseCents / 100;

  return {
    peopleCount,
    largerShare,
    baseShare,
    remainderCents,
    summary: remainderCents > 0
      ? `${remainderCents} pessoa(s) pagam ${formatCurrency(largerShare)} e ${peopleCount - remainderCents} pagam ${formatCurrency(baseShare)}`
      : `${peopleCount} pessoa(s) pagam ${formatCurrency(baseShare)} cada`,
  };
}

function buildItemSplitPreview(detail, itemQuantities) {
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const selected = items
    .map((item) => {
      const selectedQuantity = Math.max(0, Math.min(Number(item.remainingQuantity || item.quantity || 0), Number(itemQuantities?.[item.id] || 0)));
      return {
        ...item,
        selectedQuantity,
      };
    })
    .filter((item) => item.selectedQuantity > 0);

  const selectedSubtotal = roundMoney(
    selected.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.selectedQuantity || 0), 0),
  );
  const financial = detail?.financial || {};
  const subtotalBase = Number(financial.subtotal || 0);
  const serviceFeeShare = subtotalBase > 0
    ? roundMoney(Number(financial.serviceFee || 0) * (selectedSubtotal / subtotalBase))
    : 0;
  const selectedTotal = roundMoney(selectedSubtotal + serviceFeeShare);
  const remainingTotal = roundMoney(Math.max(0, Number(financial.total || 0) - selectedTotal));

  return {
    selectedItems: selected,
    selectedLines: selected.length,
    selectedQuantity: selected.reduce((sum, item) => sum + Number(item.selectedQuantity || 0), 0),
    selectedSubtotal,
    serviceFeeShare,
    selectedTotal,
    remainingTotal,
  };
}

function renderSplitEqualSection(detail, splitState) {
  const preview = buildEqualSplitPreview(detail, splitState.peopleCount);
  return `
    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg); display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--text);">Split por pessoa</div>
          <div style="font-size:12px; color:var(--text-light);">Divide o total da comanda igualmente.</div>
        </div>
        <input
          type="number"
          min="2"
          max="20"
          value="${escapeHTML(String(preview.peopleCount))}"
          onchange="setComandaSplitPeopleCount('${escapeHTML(String(detail.id))}', this.value)"
          style="width:90px; height:38px; border-radius:10px; border:1px solid var(--border); background:var(--card-bg); text-align:center; font-weight:700;"
        />
      </div>
      <div style="padding:12px; border-radius:10px; background:var(--card-bg); border:1px solid var(--border);">
        <div style="font-size:24px; font-weight:800; color:var(--teal);">${escapeHTML(formatCurrency(preview.largerShare))}</div>
        <div style="font-size:12px; color:var(--text-light); margin-top:6px;">${escapeHTML(preview.summary)}</div>
      </div>
    </div>
  `;
}

function renderSplitItemsSection(detail, splitState) {
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const preview = buildItemSplitPreview(detail, splitState.itemQuantities);

  if (!items.length) {
    return `
      <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
        <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:6px;">Split por item</div>
        <div style="font-size:12px; color:var(--text-light);">Sem itens carregados nesta comanda.</div>
      </div>
    `;
  }

  return `
    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg); display:flex; flex-direction:column; gap:10px;">
      <div>
        <div style="font-size:13px; font-weight:700; color:var(--text);">Split por item</div>
        <div style="font-size:12px; color:var(--text-light);">Selecione quantidades para calcular um rateio parcial.</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;">
        ${items.map((item) => `
          <div style="display:grid; grid-template-columns:minmax(0, 1fr) 88px 90px; gap:10px; align-items:center; padding:10px; border-radius:10px; background:var(--card-bg); border:1px solid var(--border);">
            <div style="min-width:0;">
              <div style="font-size:13px; font-weight:700; color:var(--text);">${escapeHTML(item.name || 'Item')}</div>
              <div style="font-size:12px; color:var(--text-light); margin-top:4px;">
                ${escapeHTML(`${item.quantity}x · ${formatCurrency(item.unitPrice || 0)} · restante ${item.remainingQuantity}`)}
                ${Number(item.allocatedQuantity || 0) > 0 ? ` · ${escapeHTML(String(item.allocatedQuantity))} já alocado(s)` : ''}
              </div>
            </div>
            <div class="mono" style="font-size:13px; text-align:right;">${escapeHTML(formatCurrency(Number(item.unitPrice || 0) * Number(item.quantity || 0)))}</div>
            <input
              type="number"
              min="0"
              max="${escapeHTML(String(item.remainingQuantity || 0))}"
              value="${escapeHTML(String(splitState.itemQuantities?.[item.id] || 0))}"
              onchange="setComandaSplitItemQuantity('${escapeHTML(String(detail.id))}', '${escapeHTML(String(item.id))}', this.value)"
              style="height:36px; border-radius:10px; border:1px solid var(--border); background:var(--bg); text-align:center; font-weight:700;"
            />
          </div>
        `).join('')}
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px;">
        ${renderComandaMetric('Itens selecionados', String(preview.selectedQuantity), `${preview.selectedLines} linha(s) no rateio`, '#2563eb')}
        ${renderComandaMetric('Subtotal selecionado', formatCurrency(preview.selectedSubtotal), 'Sem taxa proporcional', '#0f766e')}
        ${renderComandaMetric('Taxa proporcional', formatCurrency(preview.serviceFeeShare), 'Distribuída sobre o subtotal', '#b45309')}
        ${renderComandaMetric('Total selecionado', formatCurrency(preview.selectedTotal), 'Valor para este grupo', '#7c3aed')}
        ${renderComandaMetric('Diferença pendente', formatCurrency(preview.remainingTotal), 'Resto da comanda após o split', '#b91c1c')}
      </div>
    </div>
  `;
}

function renderSplitAssistSection(detail) {
  const splitState = ensureComandaSplitState(detail);
  return `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="font-size:13px; font-weight:700; color:var(--text);">Fechamento assistido</div>
      <div style="display:grid; grid-template-columns:0.9fr 1.1fr; gap:12px;">
        ${renderSplitEqualSection(detail, splitState)}
        ${renderSplitItemsSection(detail, splitState)}
      </div>
    </div>
  `;
}

function setComandaSplitPeopleCount(tabId, value) {
  const current = mesasComandaModalState.splitStateByTabId[String(tabId)] || { peopleCount: 2, itemQuantities: {} };
  current.peopleCount = Math.max(2, parseInt(value, 10) || 2);
  mesasComandaModalState.splitStateByTabId[String(tabId)] = current;
  rerenderComandasModal();
}

function setComandaSplitItemQuantity(tabId, itemId, value) {
  const detail = (mesasComandaModalState.details || []).find((item) => String(item.id) === String(tabId));
  const item = (detail?.items || []).find((row) => String(row.id) === String(itemId));
  const max = Math.max(0, Number(item?.remainingQuantity || 0));
  const current = mesasComandaModalState.splitStateByTabId[String(tabId)] || { peopleCount: 2, itemQuantities: {} };
  current.itemQuantities = {
    ...(current.itemQuantities || {}),
    [String(itemId)]: Math.max(0, Math.min(max, parseInt(value, 10) || 0)),
  };
  mesasComandaModalState.splitStateByTabId[String(tabId)] = current;
  rerenderComandasModal();
}

function renderComandasModal(tableId, tableNumber, details) {
  const tabsHtml = details.map((detail, idx) => renderComandaCard(detail, idx, tableId, tableNumber)).join('');
  const openCount = details.filter((detail) => detail.status !== 'CLOSED').length;
  const closedCount = details.filter((detail) => detail.status === 'CLOSED').length;
  return `
    <div class="modal-header">
      <h3>Mesa ${escapeHTML(formatTableNumber(tableNumber))} - Detalhamento das Comandas</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="max-height:60vh; overflow-y:auto; padding-right:8px">
      <div style="margin-bottom:16px; padding:14px 16px; border-radius:12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.12); font-size:13px; color:var(--text-light);">
        ${details.length > 1 ? 'Esta mesa possui comandas individuais/divididas.' : 'Esta mesa possui uma comanda principal.'}
        <strong style="color:var(--text); margin-left:6px;">${openCount} aberta(s)</strong>
        <span style="margin:0 6px;">·</span>
        <strong style="color:var(--text);">${closedCount} fechada(s)</strong>
      </div>
      ${tabsHtml}
    </div>
  `;
}

function rerenderComandasModal() {
  if (!mesasComandaModalState.tableId) return;
  openModal(renderComandasModal(
    mesasComandaModalState.tableId,
    mesasComandaModalState.tableNumber,
    mesasComandaModalState.details,
  ));
}

function renderComandaCard(detail, idx, tableId, tableNumber) {
  const financial = detail?.financial || {};
  const split = detail?.split || {};
  const permissions = detail?.permissions || {};
  const statusMeta = getComandaStatusMeta(detail?.status);
  const identifier = String(detail?.id || '').slice(0, 8) || '--------';
  const closeRequests = Array.isArray(detail?.closeRequests) ? detail.closeRequests : [];
  const splitAmount = Number(split.splitEqual?.amount || 0) + Number(split.splitItems?.amount || 0);

  return `
    <div style="border:1px solid var(--border); border-radius:16px; padding:18px; margin-bottom:14px; background:var(--card-bg); box-shadow:var(--shadow); display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <strong>Comanda ${idx + 1}</strong>
            <span class="status-pill ${statusMeta.cls}">${escapeHTML(statusMeta.label)}</span>
            <span style="font-size:12px; color:var(--text-light);">#${escapeHTML(identifier)}</span>
          </div>
          <div style="font-size:12px; color:var(--text-light); margin-top:8px;">
            Abertura: ${escapeHTML(formatDateTime(detail?.openedAt))}
            ${detail?.closedAt ? ` · Fechada: ${escapeHTML(formatDateTime(detail.closedAt))}` : ''}
          </div>
          ${detail?.openedByUserName ? `
            <div style="font-size:12px; color:var(--text-light); margin-top:4px;">
              Aberta por ${escapeHTML(detail.openedByUserName)}
            </div>
          ` : ''}
          <div style="font-size:12px; color:var(--text-light); margin-top:4px;">
            Cliente: ${escapeHTML(detail?.userPhone || 'Não identificado')}
            ${detail?.paymentNotifierPhone ? ` · Notificador: ${escapeHTML(detail.paymentNotifierPhone)}` : ''}
          </div>
        </div>
        <div style="text-align:right; font-size:12px; color:var(--text-light);">
          <div>${closeRequests.length} solicitação(ões) de fechamento</div>
          <div>${split.splitEqual?.count || 0} rateios por pessoa · ${split.splitItems?.count || 0} por item</div>
        </div>
      </div>

      ${renderSettlementAlert(detail)}

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
        ${renderComandaMetric('Total original', formatCurrency(financial.total || 0), 'Subtotal + taxa de serviço', 'var(--teal)')}
        ${renderComandaMetric('Total rateado', formatCurrency(splitAmount), 'Pagamentos em divisão por pessoa/item', '#7c3aed')}
        ${renderComandaMetric('Pago registrado', formatCurrency(financial.paidAmount || 0), 'Valor baixado na comanda', '#2563eb')}
        ${renderComandaMetric('Pagamento confirmado', formatCurrency(financial.approvedPaymentsAmount || 0), 'Confirmado pelo fluxo de pagamento', '#0f766e')}
        ${renderComandaMetric('Saldo pendente', formatCurrency(financial.amountDue || 0), detail?.status === 'CLOSED' ? 'Comanda encerrada' : 'Valor restante para fechar', '#b91c1c')}
      </div>

      ${renderSplitAssistSection(detail)}

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:13px; font-weight:700; color:var(--text);">Pagamentos e rateio</div>
          ${renderComandaPayments(detail)}
          <div style="font-size:12px; color:var(--text-light);">
            Divergência: <strong>${escapeHTML(formatCurrency(financial.reconciliationGap || 0))}</strong>
            · Alocações por item: <strong>${escapeHTML(String(split.allocationCount || 0))}</strong>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:13px; font-weight:700; color:var(--text);">Histórico da comanda</div>
          <div style="border:1px solid var(--border); border-radius:12px; padding:0 12px; background:var(--bg); max-height:260px; overflow-y:auto;">
            ${renderComandaHistory(detail)}
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
        ${detail?.status !== 'CLOSED' ? `
          ${canPerformAction('manageSettlement') ? `
            <button class="btn-sm btn-primary" onclick="finalizeTabFromModal('${escapeHTML(String(detail.id))}', '${escapeHTML(String(tableId))}', '${escapeHTML(String(tableNumber))}')">
              Conta finalizada
            </button>
          ` : '<span style="font-size:12px; color:var(--text-light);">Fechamento disponivel apenas para perfis de caixa/gestão.</span>'}
        ` : `
          <button
            class="btn-sm ${permissions.canReopen ? 'btn-outline' : 'btn-danger'}"
            ${permissions.canReopen && canPerformAction('manageSettlement') ? '' : 'disabled'}
            title="${escapeHTML(permissions.reason || '')}"
            onclick="reopenTabFromModal('${escapeHTML(String(detail.id))}', '${escapeHTML(String(tableId))}', '${escapeHTML(String(tableNumber))}')"
          >
            Reabrir comanda
          </button>
        `}
      </div>
    </div>
  `;
}

async function viewComandas(tableId, tableNumber) {
  try {
    const tabs = await api.get(`/tables/${tableId}/tabs`);

    if (!tabs || tabs.length === 0) {
      showToast('Nenhuma comanda aberta para esta mesa', 'info');
      return;
    }

    const details = await Promise.all(
      tabs.map((tab) => api.get(`/tables/tabs/${tab.id}/details`).catch(() => ({
        id: tab.id,
        status: tab.status,
        openedAt: tab.openedAt,
        items: [],
        financial: {
          subtotal: tab.subtotal || tab.total || 0,
          serviceFee: tab.serviceFee || 0,
          total: tab.total,
          paidAmount: tab.paidAmount || 0,
          approvedPaymentsAmount: 0,
          amountDue: Math.max(0, Number(tab.total || 0) - Number(tab.paidAmount || 0)),
          reconciliationGap: 0,
        },
        split: { splitEqual: { count: 0 }, splitItems: { count: 0 }, allocationCount: 0 },
        closeRequests: [],
        payments: [],
        history: [],
        permissions: { canReopen: false, reason: '' },
      }))),
    );
    mesasComandaModalState = {
      tableId,
      tableNumber,
      details,
      splitStateByTabId: { ...mesasComandaModalState.splitStateByTabId },
    };

    details.forEach((detail) => ensureComandaSplitState(detail));
    rerenderComandasModal();
  } catch (err) {
    showToast(`Erro ao carregar as comandas: ${err.message}`, 'error');
  }
}

async function reopenTabFromModal(tabId, tableId, tableNumber) {
  if (!canPerformAction('manageSettlement')) {
    showToast('Seu perfil nao pode reabrir comandas.', 'error');
    return;
  }
  const reason = window.prompt('Motivo da reabertura da comanda:') || '';
  try {
    await api.post(`/tables/tabs/${tabId}/reopen`, { reason });
    await loadMesas();
    await viewComandas(tableId, tableNumber);
    showToast('Comanda reaberta com sucesso');
  } catch (err) {
    showToast(`Erro ao reabrir a comanda: ${err.message}`, 'error');
  }
}

async function finalizeTabFromModal(tabId, tableId, tableNumber) {
  if (!canPerformAction('manageSettlement')) {
    showToast('Seu perfil nao pode finalizar comandas.', 'error');
    return;
  }
  const confirmed = window.confirm('Confirmar que o pagamento foi recebido e finalizar esta comanda?');
  if (!confirmed) return;

  try {
    await api.post(`/tables/tabs/${tabId}/finalize`, {});
    await loadMesas();
    const tabs = await api.get(`/tables/${tableId}/tabs`);
    showToast('Conta finalizada com sucesso');
    if (!tabs || tabs.length === 0) {
      closeModal();
      return;
    }
    await viewComandas(tableId, tableNumber);
  } catch (err) {
    showToast(`Erro ao finalizar a conta: ${err.message}`, 'error');
  }
}
