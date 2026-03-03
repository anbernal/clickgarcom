// Vendas Page
async function loadVendas() {
    const container = document.getElementById('page-vendas');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando relatórios...</div>';

    try {
        const [stats, sales, topItems, weekly, menuItems, tablesData] = await Promise.all([
            api.get('/reports/stats'),
            api.get('/reports/sales'),
            api.get('/reports/top-items'),
            api.get('/reports/weekly'),
            api.get('/menu'),
            api.get('/tables').catch(() => []),
        ]);

        const menuItemNameById = new Map(
            (menuItems || []).map((item) => [String(item.id), String(item.name || '')]),
        );
        const tableNumbersByTabId = buildTableNumbersByTabId(tablesData);

        const totalMonth = sales.reduce((sum, order) => {
            const t = order.items ? order.items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0) : 0;
            return sum + t;
        }, 0);

        container.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-label">Total Período</div><div class="stat-value">${formatCurrency(totalMonth)}</div></div>
        <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-label">Total Pedidos</div><div class="stat-value">${sales.length}</div></div>
        <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-label">Ticket Médio</div><div class="stat-value">${formatCurrency(stats.avgTicket || 0)}</div></div>
        <div class="stat-card"><div class="stat-icon">🍕</div><div class="stat-label">Itens Diferentes</div><div class="stat-value">${topItems.length}</div></div>
      </div>

      <div class="section-grid">
        <!-- REPORT TABLE -->
        <div class="card" style="grid-column:1/-1">
          <div class="card-header">
            <div>
              <div class="card-title">Relatório de Vendas</div>
              <div class="card-subtitle">Todas as transações</div>
            </div>
            <div style="display:flex;gap:10px">
              <div class="search-box">
                <span>🔍</span>
                <input type="text" placeholder="Buscar..." id="vendas-search">
              </div>
              <button class="btn-sm btn-outline" onclick="exportCSV()">📥 Exportar CSV</button>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Destino</th><th>Status</th><th>Data</th><th>Itens</th><th>Total</th></tr>
            </thead>
            <tbody id="vendas-table-body">
              ${sales.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Nenhuma venda encontrada</td></tr>' : ''}
              ${sales.map((order, i) => {
            const total = order.items ? order.items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0) : 0;
            return `<tr>
                  <td class="mono">#${escapeHTML(getOrderDisplayCode(order, tableNumbersByTabId))}</td>
                  <td>${order.destination}</td>
                  <td><span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span></td>
                  <td>${formatDate(order.createdAt)}</td>
                  <td>${order.items ? order.items.length + ' itens' : '-'}</td>
                  <td class="mono">${formatCurrency(total)}</td>
                </tr>`;
        }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- TOP ITEMS + CHART -->
      <div class="section-grid">
        <div class="card">
          <div class="card-header"><div class="card-title">📊 Top Produtos</div></div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
            ${topItems.length === 0 ? '<div style="text-align:center;color:var(--muted);padding:20px">Sem dados</div>' : ''}
            ${topItems.map((item, i) => {
            const maxQty = topItems[0]?.totalQuantity || 1;
            const pct = Math.round((item.totalQuantity / maxQty) * 100);
            const colors = ['var(--teal)', 'var(--accent-orange)', 'var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-red)'];
            return `
              <div style="display:flex;align-items:center;gap:12px">
                <div style="font-size:16px;font-weight:700;color:var(--muted);width:24px">${i + 1}</div>
                <div style="flex:1">
                  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px">
                    <span>${escapeHTML(getTopItemLabel(item, menuItemNameById))}</span>
                    <span class="mono">${item.totalQuantity} und</span>
                  </div>
                  <div style="background:var(--border);border-radius:20px;height:6px">
                    <div style="background:${colors[i % colors.length]};width:${pct}%;height:100%;border-radius:20px"></div>
                  </div>
                </div>
              </div>`;
        }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">📈 Vendas Semanal</div>
              <div class="card-subtitle">Últimos 7 dias</div>
            </div>
          </div>
          <div class="chart-bars" id="chart-bars-vendas"></div>
          <div class="chart-footer">
            <span style="font-size:12px;color:var(--muted)">▼ Últimos 7 dias</span>
            <span style="font-size:12px;color:var(--teal);font-weight:700" id="chart-total-vendas"></span>
          </div>
        </div>
      </div>
    `;

        // Build chart
        if (weekly && weekly.length > 0) {
            const barsEl = document.getElementById('chart-bars-vendas');
            const max = Math.max(...weekly.map(d => d.revenue), 1);
            const total = weekly.reduce((s, d) => s + d.revenue, 0);
            document.getElementById('chart-total-vendas').textContent = 'Total: ' + formatCurrency(total);

            barsEl.innerHTML = weekly.map(d => {
                const h = Math.max(Math.round((d.revenue / max) * 90), 4);
                return `<div class="bar-col">
          <div class="bar-val">${d.revenue >= 1000 ? (d.revenue / 1000).toFixed(1) + 'k' : d.revenue}</div>
          <div class="bar" style="height:${h}px;background:var(--teal)" title="${d.day}: ${formatCurrency(d.revenue)}"></div>
          <div class="bar-label">${d.day}</div>
        </div>`;
            }).join('');
        }

        // Search filter
        document.getElementById('vendas-search')?.addEventListener('input', (e) => {
            const s = e.target.value.toLowerCase();
            document.querySelectorAll('#vendas-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(s) ? '' : 'none';
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${err.message}</p></div>`;
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

function getTopItemLabel(item, menuItemNameById) {
    const menuItemId = String(item?.menuItemId || '');
    if (menuItemId && menuItemNameById.has(menuItemId)) {
        return menuItemNameById.get(menuItemId);
    }

    if (menuItemId) {
        return menuItemId.substring(0, 8);
    }

    return '—';
}

function exportCSV() {
    showToast('Exportação CSV será implementada em breve', 'info');
}
