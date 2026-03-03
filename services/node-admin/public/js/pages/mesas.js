// Mesas Page

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
    <div class="full-card" style="margin-bottom:20px">
      <div class="card-header">
        <div>
          <div class="card-title">Cadastro Dinamico de Mesas</div>
          <div class="card-subtitle">Cadastre novas mesas e defina quantas pessoas cada uma comporta</div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:minmax(260px, 1.2fr) minmax(220px, 0.8fr); gap:16px; align-items:start;">
        <div style="padding:16px; border:1px solid var(--border); border-radius:12px; background:var(--bg);">
          <div style="display:grid; grid-template-columns:1.2fr 0.8fr auto; gap:10px; align-items:end;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-light);">Numero da Mesa</label>
              <input type="text" id="table-number-inline" placeholder="Ex: 01, 02, VIP-1" class="input">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-light);">Lugares</label>
              <input type="number" id="table-capacity-inline" value="4" min="1" max="20" class="input">
            </div>
            <button class="btn btn-primary" type="button" onclick="createTable()" style="white-space:nowrap;">Cadastrar Mesa</button>
          </div>
        </div>
        <div style="padding:16px; border:1px solid rgba(240,120,64,0.18); border-radius:12px; background:rgba(240,120,64,0.08);">
          <div style="font-size:13px; font-weight:700; margin-bottom:8px;">Regra de Reserva</div>
          <div style="font-size:13px; color:var(--text-light); line-height:1.45;">
            Mesas marcadas como <strong>Reservada</strong> nao entram na alocacao automatica do Atendimento.
            Elas ficam bloqueadas ate que voce libere a reserva ou confirme a chegada do cliente.
          </div>
          <div style="margin-top:10px; font-size:12px; color:var(--text-light);">
            Reservadas agora: <strong>${reservedCount}</strong>
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
