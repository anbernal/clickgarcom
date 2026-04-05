// Dashboard Page
async function loadDashboard() {
    const container = document.getElementById('page-dashboard');
    container.innerHTML = renderSkeletonDashboard();

    try {
        const currentRole = getCurrentUserRole();
        const isOperationalDashboardView = ['WAITER', 'KITCHEN', 'BAR', 'CASHIER'].includes(currentRole);
        const [stats, weekly, orders] = await Promise.all([
            isOperationalDashboardView ? Promise.resolve({}) : api.get('/reports/stats'),
            isOperationalDashboardView ? Promise.resolve([]) : api.get('/reports/weekly'),
            api.get('/orders'),
        ]);

        // Get tables and top items info
        let tablesData = [];
        let topItems = [];
        try { tablesData = await api.get('/tables'); } catch (e) { }
        if (!isOperationalDashboardView) {
            try { topItems = await api.get('/reports/top-items?limit=3'); } catch (e) { }
        }

        const visibleOrders = getDashboardVisibleOrders(orders || [], currentRole);
        const tableNumbersByTabId = buildTableNumbersByTabId(tablesData);
        const recentOrders = visibleOrders.slice(0, 4);
        const pendingCount = visibleOrders.filter(o => o.status === 'PENDING').length;
        const acceptedCount = visibleOrders.filter(o => o.status === 'ACCEPTED').length;
        const readyCount = visibleOrders.filter(o => o.status === 'READY').length;
        const deliveredCount = visibleOrders.filter(o => o.status === 'DELIVERED').length;
        const openOrdersCount = pendingCount + acceptedCount + readyCount;
        const recentOrdersBlock = getDashboardRecentOrdersContent(currentRole);

        // Update badge
        const badge = document.getElementById('badge-pedidos');
        if (badge) badge.textContent = pendingCount > 0 ? pendingCount : '';

        const totalTables = tablesData.length || 0;
        const occupiedTables = tablesData.filter(t => t.status === 'OCCUPIED').length || 0;

        container.innerHTML = `
      <!-- EXPEDIENTE CARD -->
      <div class="full-card animate-slide-up" style="margin-bottom: 20px;">
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
        ${isOperationalDashboardView ? `
        <div class="stat-card animate-slide-up delay-1">
          <div class="stat-icon">🛎️</div>
          <div class="stat-label">Pedidos Abertos</div>
          <div class="stat-value" data-anim-value="${openOrdersCount}">${openOrdersCount}</div>
          <div class="stat-change" style="color:var(--muted)">${deliveredCount} concluídos</div>
        </div>
        ` : `
        <div class="stat-card animate-slide-up delay-1">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Faturamento Hoje</div>
          <div class="stat-value" data-anim-value="${stats.revenue || 0}" data-anim-currency="true">R$ 0,00</div>
          <div class="stat-change change-up">📈 ${stats.ordersCount || 0} pedidos</div>
        </div>
        `}
        <div class="stat-card animate-slide-up delay-2">
          <div class="stat-icon">🛒</div>
          <div class="stat-label">${isOperationalDashboardView ? 'Pendentes' : 'Pedidos Hoje'}</div>
          <div class="stat-value" data-anim-value="${isOperationalDashboardView ? pendingCount : (stats.ordersCount || 0)}">${isOperationalDashboardView ? pendingCount : (stats.ordersCount || 0)}</div>
          <div class="stat-change" style="color:var(--muted)">${isOperationalDashboardView ? `${acceptedCount} em preparo` : `${pendingCount} pendentes`}</div>
        </div>
        <div class="stat-card animate-slide-up delay-3">
          <div class="stat-icon">${isOperationalDashboardView ? '👨‍🍳' : '🪑'}</div>
          <div class="stat-label">${isOperationalDashboardView ? 'Em Preparo' : 'Mesas Ocupadas'}</div>
          <div class="stat-value">${isOperationalDashboardView
                ? `<span data-anim-value="${acceptedCount}">${acceptedCount}</span>`
                : `<span data-anim-value="${occupiedTables}">${occupiedTables}</span><span style="font-size:16px;color:var(--muted)">/${totalTables}</span>`}</div>
          <div class="stat-change" style="color:var(--muted)">${isOperationalDashboardView
                ? `${readyCount} prontos para entrega`
                : `${totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% de ocupação`}</div>
        </div>
        <div class="stat-card teal-card animate-slide-up delay-4">
          <div class="stat-icon" style="font-size:28px">${isOperationalDashboardView ? '🪑' : '⭐'}</div>
          <div class="stat-label">${isOperationalDashboardView ? 'Mesas Ocupadas' : 'Ticket Médio'}</div>
          <div class="stat-value">${isOperationalDashboardView
                ? `<span data-anim-value="${occupiedTables}">${occupiedTables}</span><span style="font-size:16px;color:rgba(255,255,255,0.75)">/${totalTables}</span>`
                : `<span data-anim-value="${stats.avgTicket || 0}" data-anim-currency="true">R$ 0,00</span>`}</div>
          ${isOperationalDashboardView ? `<div class="stat-change" style="color:rgba(255,255,255,0.85)">${totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% de ocupação</div>` : ''}
        </div>
      </div>

      <!-- MIDDLE GRID -->
      <div class="section-grid">
        <!-- PEDIDOS RECENTES -->
        <div class="card animate-slide-up delay-2">
          <div class="card-header">
            <div>
              <div class="card-title">${recentOrdersBlock.title}</div>
              <div class="card-subtitle">${recentOrdersBlock.subtitle}</div>
            </div>
            <button class="btn-sm btn-primary" onclick="navigate('pedidos')">Ver todos</button>
          </div>
          <div class="order-list">
            ${recentOrders.length === 0 ? `<div class="empty-state"><div class="icon">📭</div><p>${recentOrdersBlock.emptyLabel}</p></div>` : ''}
            ${recentOrders.map((order, i) => {
            const total = order.items ? order.items.reduce((s, item) => s + Number(item.unitPrice) * item.quantity, 0) : 0;
            return `
              <div class="order-item">
                <div class="order-avatar" style="background:${getGradient(i)}">#${(i + 1)}</div>
                <div>
                  <div class="order-name">Pedido #${getOrderDisplayCode(order, tableNumbersByTabId)}</div>
                  <div class="order-meta">${formatTime(order.createdAt)} · ${order.destination}</div>
                </div>
                ${isOperationalDashboardView ? '' : `<div class="order-amount">${formatCurrency(total)}</div>`}
                <div class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</div>
              </div>`;
        }).join('')}
          </div>
        </div>

        <!-- MESAS RESUMO -->
        <div class="card animate-slide-up delay-3">
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
            const tableInfo = isOperationalDashboardView
                ? (table.status === 'OCCUPIED' ? 'Em atendimento' : 'Sem comanda')
                : (table.currentTab ? formatCurrency(table.currentTab.total) : '—');
            return `
              <div class="table-item ${cls}">
                <div class="table-num">${table.number}</div>
                <div class="table-status">${labelMap[table.status] || table.status}</div>
                <div class="table-value">${tableInfo}</div>
              </div>`;
        }).join('')}
          </div>
        </div>
      </div>

      <!-- SALES CHART -->
      <div class="bottom-grid">
        ${isOperationalDashboardView ? renderWaiterOperationsCard({ pendingCount, acceptedCount, readyCount, deliveredCount, occupiedTables, totalTables }) : renderPerformanceCard(weekly, stats, topItems)}
        ${isOperationalDashboardView ? renderWaiterFlowCard(recentOrders, tableNumbersByTabId) : renderSalesChartCard(weekly)}
      </div>
    `;

        // Build chart and animations
        if (!isOperationalDashboardView) {
            buildChart(weekly);
        }
        animateAllDashboardValues();
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

function getDashboardVisibleOrders(orders, role) {
    const normalizedRole = String(role || '').toUpperCase();

    if (normalizedRole === 'KITCHEN') {
        return orders.filter((order) => String(order?.destination || '').toUpperCase() === 'KITCHEN');
    }

    if (normalizedRole === 'BAR') {
        return orders.filter((order) => String(order?.destination || '').toUpperCase() === 'BAR');
    }

    return orders;
}

function getDashboardRecentOrdersContent(role) {
    const normalizedRole = String(role || '').toUpperCase();

    if (normalizedRole === 'KITCHEN') {
        return {
            title: 'Fila da Cozinha',
            subtitle: 'Últimos pedidos enviados para a cozinha',
            emptyLabel: 'Nenhum pedido da cozinha no momento',
        };
    }

    if (normalizedRole === 'BAR') {
        return {
            title: 'Fila do Bar',
            subtitle: 'Últimos pedidos enviados para o bar',
            emptyLabel: 'Nenhum pedido do bar no momento',
        };
    }

    if (normalizedRole === 'WAITER') {
        return {
            title: 'Pedidos do Salão',
            subtitle: 'Últimas atualizações para atendimento e entrega',
            emptyLabel: 'Nenhum pedido em andamento no momento',
        };
    }

    if (normalizedRole === 'CASHIER') {
        return {
            title: 'Operação do Caixa',
            subtitle: 'Pedidos e comandas que impactam fechamento e conciliação',
            emptyLabel: 'Nenhum pedido impactando o caixa no momento',
        };
    }

    return {
        title: 'Pedidos Recentes',
        subtitle: 'Últimas atualizações',
        emptyLabel: 'Nenhum pedido ainda',
    };
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

function renderSalesChartCard(weekly) {
    return `
        <div class="card animate-slide-up delay-5">
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
    `;
}

function renderWaiterOperationsCard(summary) {
    const occupancyRate = summary.totalTables > 0 ? Math.round((summary.occupiedTables / summary.totalTables) * 100) : 0;

    return `
    <div class="upgrade-card animate-slide-up delay-4">
      <div style="font-size:22px; font-weight:700; margin-bottom:4px;">Resumo Operacional</div>
      <div style="font-size:12px; opacity:0.7; margin-bottom:18px;">Indicadores do turno para o salão</div>

      <div style="display:flex; gap:16px; margin-bottom:16px;">
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.6px; opacity:0.6; margin-bottom:6px;">Fila ativa</div>
          <div style="font-size:18px; font-weight:700;">${summary.pendingCount + summary.acceptedCount + summary.readyCount}</div>
          <div style="font-size:12px; opacity:0.7; margin-top:4px;">${summary.readyCount} pedidos aguardando entrega</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.6px; opacity:0.6; margin-bottom:6px;">Mesas ocupadas</div>
          <div style="font-size:18px; font-weight:700;">${summary.occupiedTables}/${summary.totalTables || 0}</div>
          <div style="font-size:12px; opacity:0.7; margin-top:4px;">${occupancyRate}% de ocupação</div>
        </div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.12); padding-top:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">⏳</span>
          <span style="font-size:12px; opacity:0.9;">${summary.pendingCount} pedidos aguardando aceite</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">🍽️</span>
          <span style="font-size:12px; opacity:0.9;">${summary.acceptedCount} pedidos em preparo e ${summary.deliveredCount} já concluídos</span>
        </div>
      </div>
    </div>`;
}

function renderWaiterFlowCard(orders, tableNumbersByTabId) {
    const openOrders = (orders || []).filter((order) => ['PENDING', 'ACCEPTED', 'READY'].includes(order.status)).slice(0, 5);

    return `
        <div class="card animate-slide-up delay-5">
          <div class="card-header">
            <div>
              <div class="card-title">Fluxo de Atendimento</div>
              <div class="card-subtitle">Pedidos que ainda exigem ação</div>
            </div>
            <button class="btn-sm btn-outline" onclick="navigate('pedidos')">Abrir pedidos</button>
          </div>
          <div class="order-list">
            ${openOrders.length === 0 ? '<div class="empty-state"><div class="icon">✅</div><p>Nenhum pedido pendente no momento</p></div>' : ''}
            ${openOrders.map((order, index) => `
              <div class="order-item">
                <div class="order-avatar" style="background:${getGradient(index)}">#${getOrderTableCode(order, tableNumbersByTabId)}</div>
                <div>
                  <div class="order-name">Pedido #${getOrderDisplayCode(order, tableNumbersByTabId)}</div>
                  <div class="order-meta">${formatTime(order.createdAt)} · ${order.destination}</div>
                </div>
                <div class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</div>
              </div>
            `).join('')}
          </div>
        </div>
    `;
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

// --- Dashboard Modernization Helpers ---

function renderSkeletonDashboard() {
    return `
      <div class="full-card skeleton-card" style="margin-bottom:20px; border-radius:14px; padding:30px;">
          <div class="skeleton skeleton-bar title"></div>
          <div class="skeleton skeleton-bar"></div>
      </div>
      <div class="stats-grid">
          ${[...Array(4)].map(() => `
          <div class="skeleton-card">
              <div class="skeleton skeleton-bar short"></div>
              <div class="skeleton skeleton-bar title" style="height:36px; width:80%; margin-top:8px;"></div>
              <div class="skeleton skeleton-bar" style="height:14px; width:50%; margin-top:auto;"></div>
          </div>
          `).join('')}
      </div>
      <div class="section-grid" style="margin-top:20px;">
          <div class="skeleton-card" style="height: 380px;">
              <div class="skeleton skeleton-bar title"></div>
              ${[...Array(4)].map(() => '<div class="skeleton skeleton-bar" style="margin-top:16px; height:48px;"></div>').join('')}
          </div>
          <div class="skeleton-card" style="height: 380px;">
              <div class="skeleton skeleton-bar title"></div>
              <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; margin-top:20px;">
                  ${[...Array(8)].map(() => '<div class="skeleton skeleton-bar" style="height:70px; border-radius:12px;"></div>').join('')}
              </div>
          </div>
      </div>
    `;
}

function animateAllDashboardValues() {
    const statElements = document.querySelectorAll('[data-anim-value]');
    statElements.forEach(el => {
        const endValue = parseFloat(el.getAttribute('data-anim-value')) || 0;
        const isCurrency = el.getAttribute('data-anim-currency') === 'true';
        animateValue(el, 0, endValue, 1000, isCurrency);
    });
}

function animateValue(obj, start, end, duration, isCurrency) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // easeOutQuart
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        
        const currentVal = progress * (end - start) + start;
        if (isCurrency) {
            obj.innerHTML = formatCurrency(currentVal);
        } else {
            obj.innerHTML = Math.floor(currentVal);
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            // Guarantee final exact value
            if (isCurrency) {
                obj.innerHTML = formatCurrency(end);
            } else {
                obj.innerHTML = Math.floor(end);
            }
        }
    };
    window.requestAnimationFrame(step);
}

function renderPerformanceCard(weekly, stats, topItems) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? '☀️ Bom dia' : hour < 18 ? '🌤️ Boa tarde' : '🌙 Boa noite';

    // Today vs Yesterday from weekly data
    const todayData = (weekly || []).find(d => d.date === new Date().toISOString().slice(0, 10));
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayData = (weekly || []).find(d => d.date === yesterdayDate.toISOString().slice(0, 10));

    const todayRev = todayData ? todayData.revenue : (stats.revenue || 0);
    const yesterdayRev = yesterdayData ? yesterdayData.revenue : 0;
    const todayOrders = todayData ? todayData.orders : (stats.ordersCount || 0);
    const yesterdayOrders = yesterdayData ? yesterdayData.orders : 0;

    const revDelta = yesterdayRev > 0 ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100) : (todayRev > 0 ? 100 : 0);
    const revTrend = revDelta > 0 ? '↑' : revDelta < 0 ? '↓' : '→';
    const revColor = revDelta > 0 ? '#86efac' : revDelta < 0 ? '#fca5a5' : 'rgba(255,255,255,0.7)';

    // Top item
    const topItem = (topItems || [])[0];
    const topName = topItem ? (topItem.itemName || 'Item') : null;
    const topQty = topItem ? (parseInt(topItem.totalQuantity) || 0) : 0;

    // Best day of the week
    const bestDay = (weekly || []).reduce((best, d) => (!best || d.revenue > best.revenue) ? d : best, null);
    const dayNames = { Dom: 'Domingo', Seg: 'Segunda', Ter: 'Terça', Qua: 'Quarta', Qui: 'Quinta', Sex: 'Sexta', 'Sáb': 'Sábado' };
    const bestDayLabel = bestDay ? (dayNames[bestDay.day] || bestDay.day) : null;

    return `
    <div class="upgrade-card animate-slide-up delay-4">
      <div style="font-size:22px; font-weight:700; margin-bottom:4px;">${greeting}</div>
      <div style="font-size:12px; opacity:0.7; margin-bottom:18px;">Comparativo com ontem</div>

      <div style="display:flex; gap:16px; margin-bottom:16px;">
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.6px; opacity:0.6; margin-bottom:6px;">Faturamento</div>
          <div style="font-size:18px; font-weight:700;">${formatCurrency(todayRev)}</div>
          <div style="font-size:12px; color:${revColor}; margin-top:4px; font-weight:600;">${revTrend} ${Math.abs(revDelta)}% vs ontem</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.6px; opacity:0.6; margin-bottom:6px;">Pedidos</div>
          <div style="font-size:18px; font-weight:700;">${todayOrders}</div>
          <div style="font-size:12px; opacity:0.7; margin-top:4px;">ontem: ${yesterdayOrders}</div>
        </div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.12); padding-top:12px; display:flex; flex-direction:column; gap:8px;">
        ${topName ? `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">🥇</span>
          <span style="font-size:12px; opacity:0.9;">Mais vendido: <strong>${topName}</strong> (${topQty}x)</span>
        </div>` : ''}
        ${bestDayLabel && bestDay.revenue > 0 ? `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">📅</span>
          <span style="font-size:12px; opacity:0.9;">Melhor dia da semana: <strong>${bestDayLabel}</strong> (${formatCurrency(bestDay.revenue)})</span>
        </div>` : ''}
      </div>
    </div>`;
}
