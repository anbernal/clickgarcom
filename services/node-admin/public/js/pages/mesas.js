// Mesas Page
let mesasTableCache = [];

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
    AVAILABLE: { cls: 'free', label: 'Livre', emoji: '🪑' },
    OCCUPIED: { cls: 'occupied', label: 'Ocupada', emoji: '🍽' },
    RESERVED: { cls: 'reserved', label: 'Reservada', emoji: '📅' },
    CLEANING: { cls: 'closed', label: 'Limpeza', emoji: '🧹' },
  };
  return map[status] || { cls: 'free', label: status || 'Livre', emoji: '🪑' };
}

function renderTableActions(table) {
  if (table.status === 'OCCUPIED') {
    return `
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-sm btn-primary" style="flex:1" onclick="viewComandas('${table.id}', '${escapeHTML(String(table.number))}')">Ver Comanda(s)</button>
        <button class="btn-sm btn-outline" style="flex:1" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Liberar</button>
      </div>
    `;
  }

  if (table.status === 'RESERVED') {
    return `
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-sm btn-primary" style="flex:1" onclick="changeTableStatus('${table.id}', 'OCCUPIED')">Confirmar Chegada</button>
        <button class="btn-sm btn-outline" style="flex:1" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Liberar Reserva</button>
      </div>
    `;
  }

  if (table.status === 'CLEANING') {
    return `
      <button class="btn-sm btn-outline" style="margin-top:10px; width:100%" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Marcar Livre</button>
    `;
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
      <div style="font-size:28px">${meta.emoji}</div>
      <div class="table-num" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span>Mesa ${escapeHTML(formatTableNumber(table.number))}</span>
        <span style="font-size:12px; color:var(--text-light); font-weight:normal; background:var(--bg); padding:2px 6px; border-radius:4px;">${escapeHTML(getCapacityLabel(table.capacity))}</span>
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

  return `
    <div class="full-card" style="margin-bottom:24px; padding:24px; border:none; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
      
      <!-- Header Area -->
      <div style="display:flex; align-items:flex-start; margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg, rgba(59,130,246,0.1), rgba(124,58,237,0.1)); border:1px solid rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">
            🪑
          </div>
          <div>
            <h2 style="margin:0 0 6px 0; font-size:18px; font-weight:700; color:var(--text); letter-spacing:-0.4px;">Cadastro de Mesas</h2>
            <p style="margin:0; font-size:13px; color:var(--text-light); max-width:400px; line-height:1.4;">
              Adicione as mesas do seu salão e defina a capacidade de lugares de cada uma para otimizar o fluxo de atendimento.
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
                <span style="position:absolute; right:12px; top:12px; font-size:13px; color:var(--text-light); pointer-events:none;">👤</span>
              </div>
            </div>

            <button class="btn btn-primary" type="button" onclick="createTable()" style="height:42px; padding:0 24px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:0.2px; transition:transform 0.1s;">
              + Adicionar
            </button>
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
            <span style="font-size:14px; margin-right:6px;">🔔</span>
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
        <div class="stat-card"><div class="stat-icon">🪑</div><div class="stat-label">Total de Mesas</div><div class="stat-value">${statsData.total || tables.length}</div></div>
        <div class="stat-card"><div class="stat-icon">🔴</div><div class="stat-label">Ocupadas</div><div class="stat-value">${statsData.occupied || 0}</div><div class="stat-change" style="color:var(--pending-text)">${statsData.total > 0 ? Math.round((statsData.occupied / statsData.total) * 100) : 0}% de ocupacao</div></div>
        <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-label">Reservadas</div><div class="stat-value">${reservedCount}</div></div>
        <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-label">Disponiveis</div><div class="stat-value">${statsData.available || 0}</div><div class="stat-change" style="color:var(--text-light)">Prontas para o Atendimento</div></div>
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
          ${tables.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🪑</div><h3>Nenhuma mesa</h3><p>Cadastre a primeira mesa e informe a quantidade de lugares.</p></div>' : ''}
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
  try {
    await api.patch(`/tables/${id}/status`, { status });
    showToast('Status atualizado');
    await loadMesas();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function deleteTable(id) {
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

async function viewComandas(tableId, tableNumber) {
  try {
    const tabs = await api.get(`/tables/${tableId}/tabs`);

    if (!tabs || tabs.length === 0) {
      showToast('Nenhuma comanda aberta para esta mesa', 'info');
      return;
    }

    const tabsHtml = tabs.map((tab, idx) => `
      <div style="border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px; background:var(--bg-color)">
        <div style="display:flex; justify-content:space-between; margin-bottom:12px">
          <div>
            <strong>Comanda ${idx + 1}</strong> <span style="font-size:12px; color:var(--text-light)">(${tab.id.substring(0, 8)})</span><br/>
            <span class="status-pill status-done" style="margin-top:4px; display:inline-block">${tab.status}</span>
          </div>
          <div style="text-align:right; font-size:12px; color:var(--text-light)">
            <div><strong>Abertura:</strong></div>
            <div>${formatDate(tab.openedAt)}</div>
          </div>
        </div>
        <div style="background:var(--card-bg); border-radius:6px; padding:10px; margin-bottom:12px">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px">
            <span style="color:var(--muted); font-size:14px">Subtotal</span>
            <span class="mono" style="font-size:14px">${formatCurrency(tab.subtotal)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px">
            <span style="color:var(--muted); font-size:14px">Taxa de servico</span>
            <span class="mono" style="font-size:14px">${formatCurrency(tab.serviceFee)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; padding-top:6px; border-top:1px solid var(--border); font-size:16px">
            <span>Total a Pagar</span>
            <span class="mono" style="color:var(--teal)">${formatCurrency(tab.total)}</span>
          </div>
        </div>
      </div>
    `).join('');

    openModal(`
      <div class="modal-header">
        <h3>Mesa ${escapeHTML(formatTableNumber(tableNumber))} - Detalhamento das Comandas</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="max-height:60vh; overflow-y:auto; padding-right:8px">
        ${tabs.length > 1 ? '<div class="alert alert-info" style="margin-bottom:16px"><i class="fas fa-info-circle"></i> Esta mesa possui comandas individuais/divididas.</div>' : ''}
        ${tabsHtml}
      </div>
    `);
  } catch (err) {
    showToast(`Erro ao carregar as comandas: ${err.message}`, 'error');
  }
}
