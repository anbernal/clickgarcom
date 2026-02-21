// Mesas Page
async function loadMesas() {
    const container = document.getElementById('page-mesas');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando mesas...</div>';

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
            <div class="card-title">Mesas e Comandas</div>
            <div class="card-subtitle">Clique em uma mesa para ver ou editar a comanda</div>
          </div>
          <button class="btn-sm btn-dark" onclick="openNewTableModal()">+ Nova Mesa</button>
        </div>
        <div class="tables-grid-6">
          ${tables.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🪑</div><h3>Nenhuma mesa</h3><p>Adicione mesas para começar</p></div>' : ''}
          ${tables.map(table => {
            const cls = statusMap[table.status] || 'free';
            const label = labelMap[table.status] || table.status;
            const emoji = emojiMap[table.status] || '🪑';
            const tabTotal = table.currentTab ? formatCurrency(table.currentTab.total) : '—';
            const pax = table.status === 'OCCUPIED' ? ' • ' + (Math.floor(Math.random() * 6) + 1) + ' pax' : '';

            let btnHtml = '';
            if (table.status === 'OCCUPIED') {
                btnHtml = `<button class="btn-sm btn-primary" style="margin-top:8px;width:100%" onclick="viewComanda('${table.id}')">Ver Comanda</button>`;
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
              <div class="table-status">${label}${pax}</div>
              <div class="table-value">${tabTotal}</div>
              ${btnHtml}
            </div>`;
        }).join('')}
        </div>
      </div>
    `;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${err.message}</p></div>`;
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

async function viewComanda(tableId) {
    try {
        const tab = await api.get(`/tables/${tableId}/tab`);
        if (!tab) {
            showToast('Nenhuma comanda aberta para esta mesa', 'info');
            return;
        }
        openModal(`
      <div class="modal-header">
        <h3>Comanda</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:16px">
          <div><strong>Status:</strong> <span class="status-pill status-done">${tab.status}</span></div>
          <div><strong>Aberta:</strong> ${formatDate(tab.openedAt)}</div>
        </div>
        <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:var(--muted)">Subtotal</span>
            <span class="mono">${formatCurrency(tab.subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:var(--muted)">Taxa de serviço</span>
            <span class="mono">${formatCurrency(tab.serviceFee)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:8px;border-top:1px solid var(--border)">
            <span>Total</span>
            <span class="mono" style="color:var(--teal)">${formatCurrency(tab.total)}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Valor pago</span>
          <span class="mono">${formatCurrency(tab.paidAmount)}</span>
        </div>
      </div>
    `);
    } catch (err) {
        showToast('Erro ao carregar comanda', 'error');
    }
}
