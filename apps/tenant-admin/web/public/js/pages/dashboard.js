// Dashboard Page
async function loadDashboard() {
    const container = document.getElementById('page-dashboard');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando...</div>';

    try {
        const [stats, weekly, orders] = await Promise.all([
            api.get('/reports/stats'),
            api.get('/reports/weekly'),
            api.get('/orders'),
        ]);

        // Get tables info
        let tablesData = [];
        try { tablesData = await api.get('/tables'); } catch (e) { }

        const tableNumbersByTabId = buildTableNumbersByTabId(tablesData);
        const recentOrders = (orders || []).slice(0, 4);
        const pendingCount = (orders || []).filter(o => o.status === 'PENDING').length;

        // Update badge
        const badge = document.getElementById('badge-pedidos');
        if (badge) badge.textContent = pendingCount > 0 ? pendingCount : '';

        const totalTables = tablesData.length || 0;
        const occupiedTables = tablesData.filter(t => t.status === 'OCCUPIED').length || 0;

        container.innerHTML = `
      <!-- EXPEDIENTE CARD -->
      <div class="full-card" style="margin-bottom: 20px;">
          <div class="card-header">
              <div>
                  <div class="card-title">🕐 Expediente do Restaurante</div>
                  <div class="card-subtitle">Controle o funcionamento e bloqueie novos pedidos</div>
              </div>
          </div>
          <div style="padding: 20px 22px;">
              <div class="config-expediente-box" id="dashboard-expediente-box">
                  ${renderDashboardExpedienteContent()}
              </div>
          </div>
      </div>

      <!-- STAT CARDS -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Faturamento Hoje</div>
          <div class="stat-value">${formatCurrency(stats.revenue || 0)}</div>
          <div class="stat-change change-up">📈 ${stats.ordersCount || 0} pedidos</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🛒</div>
          <div class="stat-label">Pedidos Hoje</div>
          <div class="stat-value">${stats.ordersCount || 0}</div>
          <div class="stat-change" style="color:var(--muted)">${pendingCount} pendentes</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🪑</div>
          <div class="stat-label">Mesas Ocupadas</div>
          <div class="stat-value">${occupiedTables}<span style="font-size:16px;color:var(--muted)">/${totalTables}</span></div>
          <div class="stat-change" style="color:var(--muted)">${totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% de ocupação</div>
        </div>
        <div class="stat-card teal-card">
          <div class="stat-icon" style="font-size:28px">⭐</div>
          <div class="stat-label">Ticket Médio</div>
          <div class="stat-value">${formatCurrency(stats.avgTicket || 0)}</div>
        </div>
      </div>

      <!-- MIDDLE GRID -->
      <div class="section-grid">
        <!-- PEDIDOS RECENTES -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Pedidos Recentes</div>
              <div class="card-subtitle">Últimas atualizações</div>
            </div>
            <button class="btn-sm btn-primary" onclick="navigate('pedidos')">Ver todos</button>
          </div>
          <div class="order-list">
            ${recentOrders.length === 0 ? '<div class="empty-state"><div class="icon">📭</div><p>Nenhum pedido ainda</p></div>' : ''}
            ${recentOrders.map((order, i) => {
            const total = order.items ? order.items.reduce((s, item) => s + Number(item.unitPrice) * item.quantity, 0) : 0;
            return `
              <div class="order-item">
                <div class="order-avatar" style="background:${getGradient(i)}">#${(i + 1)}</div>
                <div>
                  <div class="order-name">Pedido #${getOrderDisplayCode(order, tableNumbersByTabId)}</div>
                  <div class="order-meta">${formatTime(order.createdAt)} · ${order.destination}</div>
                </div>
                <div class="order-amount">${formatCurrency(total)}</div>
                <div class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</div>
              </div>`;
        }).join('')}
          </div>
        </div>

        <!-- MESAS RESUMO -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Status das Mesas</div>
              <div class="card-subtitle">Visão rápida</div>
            </div>
            <button class="btn-sm btn-outline" onclick="navigate('mesas')">Gerenciar</button>
          </div>
          <div class="tables-grid">
            ${tablesData.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🪑</div><p>Nenhuma mesa cadastrada</p></div>' : ''}
            ${tablesData.slice(0, 8).map(table => {
            const statusMap = { AVAILABLE: 'free', OCCUPIED: 'occupied', RESERVED: 'reserved', CLEANING: 'closed' };
            const labelMap = { AVAILABLE: 'Livre', OCCUPIED: 'Ocupada', RESERVED: 'Reservada', CLEANING: 'Limpeza' };
            const cls = statusMap[table.status] || 'free';
            const tabTotal = table.currentTab ? formatCurrency(table.currentTab.total) : '—';
            return `
              <div class="table-item ${cls}">
                <div class="table-num">${table.number}</div>
                <div class="table-status">${labelMap[table.status] || table.status}</div>
                <div class="table-value">${tabTotal}</div>
              </div>`;
        }).join('')}
          </div>
        </div>
      </div>

      <!-- SALES CHART -->
      <div class="bottom-grid">
        <div class="upgrade-card">
          <div class="price">${formatCurrency(stats.revenue || 0)}</div>
          <div class="sub">Faturado hoje</div>
          <h3>🚀 ClickGarçom Admin</h3>
          <p>Gerencie seu restaurante com eficiência. Cardápio, mesas, pedidos e relatórios em um só lugar.</p>
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Vendas por Período</div>
              <div class="card-subtitle">Últimos 7 dias</div>
            </div>
            <button class="btn-sm btn-outline" onclick="navigate('vendas')">Ver mais</button>
          </div>
          <div class="chart-bars" id="chart-bars-dashboard"></div>
          <div class="chart-footer">
            <span style="font-size:12px;color:var(--muted)">▼ Últimos 7 dias</span>
            <span style="font-size:12px;color:var(--teal);font-weight:700" id="chart-total"></span>
          </div>
        </div>
      </div>
    `;

        // Build chart
        buildChart(weekly);
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
}

function buildTableNumbersByTabId(tablesData) {
    const map = {};
    (tablesData || []).forEach((table) => {
        const tableNumber = formatTableNumber(table.number);
        (table.activeTabs || []).forEach((tab) => {
            if (tab && tab.id) {
                map[String(tab.id)] = tableNumber;
            }
        });
    });
    return map;
}

function getOrderDisplayCode(order, tableNumbersByTabId) {
    const phoneSuffix = getOrderPhoneSuffix(order);
    const tableCode = getOrderTableCode(order, tableNumbersByTabId);
    const orderSuffix = String(order?.id || '').slice(-4) || '----';
    return [phoneSuffix, tableCode, orderSuffix].join('-');
}

function getOrderPhoneSuffix(order) {
    const notes = String(order?.notes || '');
    const digits = notes.replace(/\D/g, '');
    return digits.slice(-4) || '0000';
}

function getOrderTableCode(order, tableNumbersByTabId) {
    const tabId = String(order?.tabId || order?.tab_id || '');
    if (!tabId) return '--';
    return tableNumbersByTabId[tabId] || '--';
}

function formatTableNumber(number) {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (!digits) return '--';
    return digits.padStart(2, '0');
}

function buildChart(data) {
    const barsEl = document.getElementById('chart-bars-dashboard');
    if (!barsEl || !data || data.length === 0) return;

    const max = Math.max(...data.map(d => d.revenue), 1);
    const total = data.reduce((s, d) => s + d.revenue, 0);
    const totalEl = document.getElementById('chart-total');
    if (totalEl) totalEl.textContent = 'Total: ' + formatCurrency(total);

    barsEl.innerHTML = data.map(d => {
        const h = Math.max(Math.round((d.revenue / max) * 90), 4);
        return `<div class="bar-col">
      <div class="bar-val">${d.revenue >= 1000 ? (d.revenue / 1000).toFixed(1) + 'k' : d.revenue}</div>
      <div class="bar" style="height:${h}px;background:var(--teal)" title="${d.day}: ${formatCurrency(d.revenue)}"></div>
      <div class="bar-label">${d.day}</div>
    </div>`;
    }).join('');
}

window.updateDashboardExpediente = function() {
    const box = document.getElementById('dashboard-expediente-box');
    if (box) {
        box.innerHTML = renderDashboardExpedienteContent();
    }
};

function renderDashboardExpedienteContent() {
    const isOpen = window.isExpedienteAberto;
    const canToggle = canPerformAction('toggleTenantStatus');
    return `
        <div class="config-expediente-indicator ${isOpen ? 'open' : 'closed'}">
            <span class="config-expediente-dot"></span>
            <div>
                <div class="config-expediente-title">${isOpen ? 'Aberto para pedidos' : 'Fechado para novos pedidos'}</div>
                <div class="config-expediente-desc">${isOpen
                    ? 'Clientes podem enviar pedidos normalmente pelo WhatsApp.'
                    : 'Novos pedidos bloqueados. Clientes com comanda aberta podem finalizar.'}</div>
            </div>
        </div>
        ${canToggle ? `
            <button type="button" class="btn-sm ${isOpen ? 'btn-danger' : 'btn-primary'}" onclick="window.confirmAndToggleExpediente()">
                ${isOpen ? '⏸ Fechar Expediente' : '▶ Abrir Expediente'}
            </button>
        ` : `
            <div style="font-size:12px; color:var(--text-light); max-width:220px; text-align:right;">
                Alteração de expediente liberada apenas para perfis de gestão.
            </div>
        `}
    `;
}
