// Mesas Page
let pendingRequestsInterval = null;

async function loadMesas() {
  const container = document.getElementById('mesas-grid-container');
  if (!container) return; // Element not found, might be on another page

  try {
    const [tables, statsData] = await Promise.all([
      api.get('/tables'),
      api.get('/tables/stats'),
    ]);

    const statusMap = { AVAILABLE: 'free', OCCUPIED: 'occupied', RESERVED: 'reserved', CLEANING: 'closed' };
    const labelMap = { AVAILABLE: 'Livre', OCCUPIED: 'Ocupada', RESERVED: 'Reservada', CLEANING: 'Limpeza' };
    const emojiMap = { AVAILABLE: '🪑', OCCUPIED: '🍽', RESERVED: '📅', CLEANING: '🧹' };

    container.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon">🪑</div><div class="stat-label">Total de Mesas</div><div class="stat-value">${statsData.total || tables.length}</div></div>
        <div class="stat-card"><div class="stat-icon">🔴</div><div class="stat-label">Ocupadas</div><div class="stat-value">${statsData.occupied || 0}</div><div class="stat-change" style="color:var(--pending-text)">${statsData.total > 0 ? Math.round((statsData.occupied / statsData.total) * 100) : 0}% de ocupação</div></div>
        <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-label">Disponíveis</div><div class="stat-value">${statsData.available || 0}</div></div>
        <div class="stat-card"><div class="stat-icon">💵</div><div class="stat-label">Comandas Abertas</div><div class="stat-value">${formatCurrency(statsData.openTabsTotal || 0)}</div></div>
      </div>
      <div class="full-card">
        <div class="card-header">
          <div>
            <div class="card-title">Grid de Mesas</div>
            <div class="card-subtitle">Gerencie o status das mesas e comandas</div>
          </div>
        </div>
        <div class="tables-grid-6">
          ${tables.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🪑</div><h3>Nenhuma mesa</h3><p>Adicione mesas para começar</p></div>' : ''}
          ${tables.map(table => {
      const cls = statusMap[table.status] || 'free';
      const label = labelMap[table.status] || table.status;
      const emoji = emojiMap[table.status] || '🪑';
      let tabTotalDisplay = '—';
      let multipleTabsNote = '';

      if (table.activeTabs && table.activeTabs.length > 0) {
        const totalSum = table.activeTabs.reduce((acc, tab) => acc + parseFloat(tab.total || 0), 0);
        tabTotalDisplay = formatCurrency(totalSum);

        if (table.activeTabs.length > 1) {
          multipleTabsNote = `<div style="font-size:12px; color:var(--text-light); margin-top:4px">${table.activeTabs.length} Comandas na mesa</div>`;
        }
      }

      let btnHtml = '';
      if (table.status === 'OCCUPIED') {
        btnHtml = `<button class="btn-sm btn-primary" style="margin-top:8px;width:100%" onclick="viewComandas('${table.id}', '${table.number}')">Ver Comanda(s)</button>`;
      } else if (table.status === 'AVAILABLE') {
        btnHtml = `<button class="btn-sm btn-outline" style="margin-top:8px;width:100%" onclick="changeTableStatus('${table.id}', 'OCCUPIED')">Abrir</button>`;
      } else if (table.status === 'RESERVED') {
        btnHtml = `<button class="btn-sm btn-outline" style="margin-top:8px;width:100%">Ver Reserva</button>`;
      } else {
        btnHtml = `<button class="btn-sm btn-outline" style="margin-top:8px;width:100%" onclick="changeTableStatus('${table.id}', 'AVAILABLE')">Liberar</button>`;
      }

      return `
            <div class="table-item ${cls}" style="padding:20px">
              <div style="font-size:28px">${emoji}</div>
              <div class="table-num">Mesa ${table.number}</div>
              <div class="table-status">${label}</div>
              <div class="table-value">${tabTotalDisplay}</div>
              ${multipleTabsNote}
              ${btnHtml}
            </div>`;
    }).join('')}
        </div>
      </div>
    `;

    // Load Pending Requests
    await loadPendingRequests();

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

async function loadPendingRequests() {
  const listContainer = document.getElementById('pending-requests-list');
  const sidebar = document.querySelector('.pending-requests-sidebar');
  if (!listContainer || !sidebar) return;

  try {
    const requests = await api.get('/tables/requests/pending');

    if (requests.length > 0) {
      sidebar.style.display = 'block';
      let html = '';
      requests.forEach(req => {
        const tableNum = req.table ? req.table.number : 'Desconhecida';
        // WhatsApp URL for direct message if needed
        const waUrl = `https://wa.me/${req.userPhone}`;

        html += `
                <div style="border:1px solid var(--border); border-radius:8px; padding:12px; background:var(--bg-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px">
                        <strong>Mesa ${escapeHTML(tableNum)}</strong>
                        <span style="font-size:0.85rem; color:var(--text-light)">${escapeHTML(req.paxCount)} pax</span>
                    </div>
                    <div style="font-size:0.9rem; margin-bottom:12px; font-family:var(--font-mono)">
                        <a href="${escapeHTML(waUrl)}" target="_blank" style="color:var(--primary-color); text-decoration:none">
                            <i class="fab fa-whatsapp"></i> ${escapeHTML(req.userPhone)}
                        </a>
                    </div>
                    <div style="display:flex; gap:8px">
                        <button class="btn-sm btn-primary" style="flex:1; padding:6px" onclick="approveTableRequest('${req.id}')">Aprovar</button>
                        <button class="btn-sm btn-outline" style="flex:1; padding:6px; color:var(--danger); border-color:var(--danger)" onclick="rejectTableRequest('${req.id}')">Recusar</button>
                    </div>
                </div>`;
      });
      listContainer.innerHTML = html;
    } else {
      sidebar.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to load pending requests', err);
  }
}

async function approveTableRequest(id) {
  try {
    await api.post(`/tables/requests/${id}/approve`);
    showToast('Mesa aprovada e cliente notificado!');
    loadMesas();
  } catch (err) {
    showToast('Erro ao aprovar mesa: ' + err.message, 'error');
  }
}

async function rejectTableRequest(id) {
  if (!confirm('Tem certeza que deseja recusar essa solicitação?')) return;
  try {
    await api.post(`/tables/requests/${id}/reject`);
    showToast('Solicitação recusada', 'info');
    loadMesas();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

function openNewTableModal() {
  openModal(`
    <div class="modal-header">
      <h3>Nova Mesa</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Número da Mesa</label>
        <input type="text" id="table-number" placeholder="Ex: 01, 02, VIP-1">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" onclick="createTable()">Criar Mesa</button>
    </div>
  `);
}

function openManualRequestModal() {
  // Busca as mesas livres para o select
  api.get('/tables').then(tables => {
    const availableTables = tables.filter(t => t.status === 'AVAILABLE');

    let optionsHtml = availableTables.map(t => `<option value="${t.id}">Mesa ${t.number}</option>`).join('');
    if (availableTables.length === 0) {
      optionsHtml = '<option value="" disabled selected>Nenhuma mesa livre</option>';
    }

    openModal(`
        <div class="modal-header">
          <h3>Alocar Cliente Manualmente</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:16px; font-size:14px; color:var(--text-light)">
            Use esta opção para clientes que chegaram sem ler o QR Code mas que desejam receber o cardápio no WhatsApp.
          </p>
          <div class="form-group">
            <label>Mesa Disponível</label>
            <select id="req-table-id" class="input">
              ${optionsHtml}
            </select>
          </div>
          <div class="form-group">
            <label>WhatsApp do Cliente</label>
            <input type="text" id="req-user-phone" placeholder="Ex: 5511999999999" class="input">
            <small style="color:var(--text-light)">Com código do país e DDD, apenas números.</small>
          </div>
          <div class="form-group">
            <label>Quantidade de Pessoas</label>
            <input type="number" id="req-pax-count" value="1" min="1" max="20" class="input">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
          <button class="btn-sm btn-primary" onclick="createManualRequest()" ${availableTables.length === 0 ? 'disabled' : ''}>Salvar e Autenticar</button>
        </div>
      `);
  }).catch(err => showToast('Erro ao carregar mesas', 'error'));
}

async function createManualRequest() {
  const tableId = document.getElementById('req-table-id').value;
  const userPhone = document.getElementById('req-user-phone').value;
  const paxCount = parseInt(document.getElementById('req-pax-count').value, 10);

  if (!tableId || !userPhone || !paxCount) {
    showToast('Preencha os dados corretamente', 'error');
    return;
  }

  try {
    await api.post('/tables/requests/manual', { tableId, userPhone, paxCount });
    showToast('Mesa alocada! Confirmação enviada no WhatsApp.');
    closeModal();
    loadMesas();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

async function createTable() {
  const number = document.getElementById('table-number').value;
  if (!number) { showToast('Número é obrigatório', 'error'); return; }

  try {
    await api.post('/tables', { number });
    showToast('Mesa criada');
    closeModal();
    loadMesas();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

async function changeTableStatus(id, status) {
  try {
    await api.patch(`/tables/${id}/status`, { status });
    showToast('Status atualizado');
    loadMesas();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

async function viewComandas(tableId, tableNumber) {
  try {
    const tabs = await api.get(`/tables/${tableId}/tabs`);

    if (!tabs || tabs.length === 0) {
      showToast('Nenhuma comanda aberta para esta mesa', 'info');
      return;
    }

    let tabsHtml = tabs.map((tab, idx) => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px; background:var(--bg-color)">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <div>
            <strong>Comanda ${idx + 1}</strong> <span style="font-size:12px;color:var(--text-light)">(${tab.id.substring(0, 8)})</span><br/>
            <span class="status-pill status-done" style="margin-top:4px; display:inline-block">${tab.status}</span>
          </div>
          <div style="text-align:right; font-size:12px; color:var(--text-light)">
            <div><strong>Abertura:</strong></div>
            <div>${formatDate(tab.openedAt)}</div>
          </div>
        </div>
        <div style="background:var(--card-bg); border-radius:6px; padding:10px; margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:var(--muted); font-size:14px">Subtotal</span>
            <span class="mono" style="font-size:14px">${formatCurrency(tab.subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:var(--muted); font-size:14px">Taxa de serviço</span>
            <span class="mono" style="font-size:14px">${formatCurrency(tab.serviceFee)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:6px;border-top:1px solid var(--border); font-size:16px">
            <span>Total a Pagar</span>
            <span class="mono" style="color:var(--teal)">${formatCurrency(tab.total)}</span>
          </div>
        </div>
      </div>
    `).join('');

    openModal(`
      <div class="modal-header">
        <h3>Mesa ${tableNumber} - Detalhamento das Comandas</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="max-height:60vh; overflow-y:auto; padding-right:8px">
        ${tabs.length > 1 ? `<div class="alert alert-info" style="margin-bottom:16px"><i class="fas fa-info-circle"></i> Esta mesa possui comandas individuais/divididas.</div>` : ''}
        ${tabsHtml}
      </div>
    `);
  } catch (err) {
    showToast('Erro ao carregar as comandas: ' + err.message, 'error');
  }
}
