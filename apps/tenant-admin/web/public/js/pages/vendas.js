const VENDAS_PRESET_LABELS = {
  today: 'Hoje',
  last7: '7 dias',
  last30: '30 dias',
  month: 'Mês atual',
  custom: 'Personalizado',
};

let vendasState = {
  filters: buildVendasPresetRange('last30', ''),
  management: null,
  sales: [],
  tablesData: [],
};

async function loadVendas(preset = null) {
  if (preset) {
    vendasState.filters = buildVendasPresetRange(preset);
  } else if (!vendasState.filters?.startDate || !vendasState.filters?.endDate) {
    vendasState.filters = buildVendasPresetRange('last30');
  }

  const container = document.getElementById('page-vendas');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando relatórios gerenciais...</div>';

  try {
    const params = {
      start_date: vendasState.filters.startDate,
      end_date: vendasState.filters.endDate,
    };

    const [management, sales, tablesData] = await Promise.all([
      api.get('/reports/management', params),
      api.get('/reports/sales', params),
      api.get('/tables').catch(() => []),
    ]);

    vendasState.management = management;
    vendasState.sales = sales || [];
    vendasState.tablesData = tablesData || [];

    renderVendas();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function renderVendas() {
  const container = document.getElementById('page-vendas');
  const management = vendasState.management;
  const sales = vendasState.sales || [];
  const filters = vendasState.filters;

  if (!management) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Sem dados para o período selecionado.</p></div>';
    return;
  }

  const tableNumbersByTabId = buildTableNumbersByTabId(vendasState.tablesData);
  const marginSummary = buildMarginSummary(management.category_ranking || []);
  const visibleSales = getFilteredSalesRows(sales, tableNumbersByTabId);
  const dailySeries = management.daily_performance || [];
  const hourlySeries = management.hourly_performance || [];
  const peakDay = management.overview?.peak_day;
  const peakHour = management.overview?.peak_hour;

  container.innerHTML = `
    <div class="full-card" style="margin-bottom:20px">
      <div class="card-header" style="align-items:flex-start;gap:16px">
        <div>
          <div class="card-title">Relatórios Gerenciais</div>
          <div class="card-subtitle">Leitura financeira e operacional do período ${escapeHTML(management.period?.label || '')}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
          ${Object.entries(VENDAS_PRESET_LABELS)
            .filter(([key]) => key !== 'custom')
            .map(([key, label]) => `
              <button class="btn-sm ${filters.preset === key ? 'btn-primary' : 'btn-outline'}" onclick="selectVendasPreset('${key}')">${escapeHTML(label)}</button>
            `).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end">
        <div class="form-group" style="margin:0">
          <label>Data inicial</label>
          <input type="date" id="vendas-start-date" value="${escapeHTML(filters.startDate)}">
        </div>
        <div class="form-group" style="margin:0">
          <label>Data final</label>
          <input type="date" id="vendas-end-date" value="${escapeHTML(filters.endDate)}">
        </div>
        <div style="display:flex;gap:8px;align-items:end">
          <button class="btn-sm btn-dark" onclick="applyVendasCustomRange()">Atualizar</button>
          <button class="btn-sm btn-outline" onclick="resetVendasRange()">Limpar</button>
        </div>
        <div style="display:flex;justify-content:flex-end;align-items:end;color:var(--muted);font-size:12px">
          Comparação automática contra ${escapeHTML(management.comparison_period?.label || '')}
        </div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-label">Receita do Período</div>
        <div class="stat-value">${formatCurrency(management.overview?.revenue || 0)}</div>
        <div class="stat-change ${comparisonClass(management.overview?.comparisons?.revenue)}">${formatComparison(management.overview?.comparisons?.revenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📉</div>
        <div class="stat-label">Margem Estimada</div>
        <div class="stat-value">${formatCurrency(marginSummary.estimatedMargin)}</div>
        <div class="stat-change" style="color:var(--muted)">Cobertura de custo em ${formatPercent(marginSummary.coverageRate)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧾</div>
        <div class="stat-label">Ticket Médio</div>
        <div class="stat-value">${formatCurrency(management.overview?.average_ticket || 0)}</div>
        <div class="stat-change ${comparisonClass(management.overview?.comparisons?.average_ticket)}">${formatComparison(management.overview?.comparisons?.average_ticket)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-label">Cancelamento e Perda</div>
        <div class="stat-value">${formatPercent(management.overview?.cancellation_rate || 0)}</div>
        <div class="stat-change ${comparisonClass(management.overview?.comparisons?.cancellation_rate, true)}">
          ${management.overview?.canceled_orders_count || 0} cancelados · ${formatCurrency(management.overview?.lost_revenue || 0)}
        </div>
      </div>
    </div>

    <div class="section-grid" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Velocidade Operacional</div>
            <div class="card-subtitle">Tempo médio por etapa do pedido</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          ${renderInsightMetric('Aceite médio', formatMinutes(management.overview?.average_acceptance_minutes))}
          ${renderInsightMetric('Preparo médio', formatMinutes(management.overview?.average_preparation_minutes))}
          ${renderInsightMetric('Entrega média', formatMinutes(management.overview?.average_delivery_minutes))}
          ${renderInsightMetric('Pedidos faturados', String(management.overview?.billed_orders_count || 0))}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Picos de Operação</div>
            <div class="card-subtitle">Onde o caixa aperta mais</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${renderInsightMetric('Pico por hora', peakHour ? `${escapeHTML(peakHour.label)} · ${formatCurrency(peakHour.revenue)}` : 'Sem pico')}
          ${renderInsightMetric('Pedidos na hora pico', peakHour ? String(peakHour.orders_count || 0) : '0')}
          ${renderInsightMetric('Melhor dia', peakDay ? `${escapeHTML(peakDay.label)} · ${formatCurrency(peakDay.revenue)}` : 'Sem pico')}
          ${renderInsightMetric('Cobertura de custo', `${formatPercent(management.cost_coverage?.coverage_rate || 0)} do cardápio`)}
        </div>
      </div>
    </div>

    <div class="section-grid" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Ticket Médio por Faixa Horária</div>
            <div class="card-subtitle">Faixas com maior valor por pedido</div>
          </div>
        </div>
        <div class="chart-bars" id="chart-bars-vendas-hourly"></div>
        <div class="chart-footer">
          <span style="font-size:12px;color:var(--muted)">Baseado nos pedidos faturados do período</span>
          <span style="font-size:12px;color:var(--teal);font-weight:700">${hourlySeries.length} faixas com movimento</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Receita por Dia</div>
            <div class="card-subtitle">Pico por dia e comparativo visual</div>
          </div>
        </div>
        <div class="chart-bars" id="chart-bars-vendas-daily"></div>
        <div class="chart-footer">
          <span style="font-size:12px;color:var(--muted)">Período filtrado</span>
          <span style="font-size:12px;color:var(--teal);font-weight:700">Total: ${formatCurrency(management.overview?.revenue || 0)}</span>
        </div>
      </div>
    </div>

    <div class="section-grid" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Ranking de Categorias</div>
            <div class="card-subtitle">Receita, margem estimada e cobertura de custo</div>
          </div>
        </div>
        ${renderRankingTable(management.category_ranking || [], 'categoria')}
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Itens com Margem Estimada</div>
            <div class="card-subtitle">Itens mais relevantes financeiramente</div>
          </div>
        </div>
        ${renderItemMarginTable(management.item_margins || [])}
      </div>
    </div>

    <div class="section-grid" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Itens com Baixa Saída</div>
            <div class="card-subtitle">Leitura de participação no mix do período, não de visualização do cardápio</div>
          </div>
        </div>
        ${renderLowSalesGrid(management.low_sales_items || [])}
      </div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <div class="card-header">
        <div>
          <div class="card-title">Relatório de Vendas</div>
          <div class="card-subtitle">${sales.length} pedidos no período selecionado</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div class="search-box">
            <span>🔍</span>
            <input type="text" placeholder="Buscar por código, destino ou status..." id="vendas-search" value="${escapeHTML(filters.search || '')}">
          </div>
          <button class="btn-sm btn-outline" onclick="exportVendasCsv()">📥 Exportar CSV</button>
        </div>
      </div>
      <div style="overflow:auto">
        <table>
          <thead>
            <tr><th>#</th><th>Destino</th><th>Status</th><th>Data</th><th>Itens</th><th>Total</th></tr>
          </thead>
          <tbody id="vendas-table-body">
            ${visibleSales.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Nenhum pedido encontrado para o filtro atual</td></tr>' : ''}
            ${visibleSales.map((entry) => `
              <tr data-search="${escapeHTML(entry.searchText)}">
                <td class="mono">#${escapeHTML(entry.displayCode)}</td>
                <td>${escapeHTML(entry.order.destination || '-')}</td>
                <td><span class="status-pill ${statusClass(entry.order.status)}">${statusLabel(entry.order.status)}</span></td>
                <td>${formatDate(entry.order.createdAt)}</td>
                <td>${entry.itemsCount} itens</td>
                <td class="mono">${formatCurrency(entry.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderVendasCharts(hourlySeries, dailySeries);
  attachVendasHandlers();
}

function attachVendasHandlers() {
  const searchInput = document.getElementById('vendas-search');
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener('input', (event) => {
    vendasState.filters.search = event.target.value || '';
    filterVendasRows(vendasState.filters.search);
  });

  filterVendasRows(vendasState.filters.search || '');
}

function renderVendasCharts(hourlySeries, dailySeries) {
  const hourlyEl = document.getElementById('chart-bars-vendas-hourly');
  const dailyEl = document.getElementById('chart-bars-vendas-daily');

  if (hourlyEl) {
    hourlyEl.innerHTML = buildBarChart(
      hourlySeries,
      'average_ticket',
      (point) => point.label,
      (point) => formatCurrency(point.average_ticket || 0),
      'var(--accent-orange)',
    );
  }

  if (dailyEl) {
    dailyEl.innerHTML = buildBarChart(
      dailySeries,
      'revenue',
      (point) => point.weekday_label || point.label,
      (point) => formatCurrency(point.revenue || 0),
      'var(--teal)',
    );
  }
}

function renderRankingTable(rows, label) {
  if (!rows.length) {
    return '<div class="empty-state"><div class="icon">📭</div><p>Sem vendas no período para montar ranking.</p></div>';
  }

  return `
    <div style="overflow:auto">
      <table>
        <thead>
          <tr>
            <th>${escapeHTML(capitalize(label))}</th>
            <th>Qtd.</th>
            <th>Receita</th>
            <th>Margem Est.</th>
            <th>Cobertura</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <div style="font-weight:700">${escapeHTML(row.name || 'Sem nome')}</div>
                <div style="font-size:12px;color:var(--muted)">${row.orders_count || 0} pedidos</div>
              </td>
              <td>${row.quantity_sold || 0}</td>
              <td class="mono">${formatCurrency(row.revenue || 0)}</td>
              <td class="mono">${formatCurrency(row.estimated_margin || 0)}</td>
              <td>${formatPercent(row.coverage_rate || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderItemMarginTable(rows) {
  if (!rows.length) {
    return '<div class="empty-state"><div class="icon">📭</div><p>Sem itens vendidos no período.</p></div>';
  }

  return `
    <div style="overflow:auto">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtd.</th>
            <th>Receita</th>
            <th>Custo</th>
            <th>Margem</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>
                <div style="font-weight:700">${escapeHTML(row.name || 'Sem nome')}</div>
                <div style="font-size:12px;color:var(--muted)">
                  ${escapeHTML(row.context || 'Sem categoria')}
                  ${row.cost_price !== null ? ` · custo base ${escapeHTML(formatCurrency(row.cost_price))}` : ' · custo não configurado'}
                </div>
              </td>
              <td>${row.quantity_sold || 0}</td>
              <td class="mono">${formatCurrency(row.revenue || 0)}</td>
              <td class="mono">${formatCurrency(row.estimated_cost || 0)}</td>
              <td class="mono">${formatCurrency(row.estimated_margin || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLowSalesGrid(rows) {
  if (!rows.length) {
    return '<div class="empty-state"><div class="icon">✅</div><p>Nenhum item com baixa saída detectado no período.</p></div>';
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      ${rows.map((row) => `
        <div style="border:1px solid var(--border);border-radius:16px;padding:16px;background:#fff7ed">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div>
              <div style="font-weight:700">${escapeHTML(row.name)}</div>
              <div style="font-size:12px;color:var(--muted)">${escapeHTML(row.category_name || 'Sem categoria')}</div>
            </div>
            <span class="status-pill ${row.performance_band === 'NO_SALES' ? 'status-canceled' : 'status-pending'}">
              ${row.performance_band === 'NO_SALES' ? 'Sem venda' : 'Baixa saída'}
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            <div>
              <div style="font-size:12px;color:var(--muted)">Quantidade</div>
              <div style="font-weight:700">${row.quantity_sold || 0}</div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--muted)">Share</div>
              <div style="font-weight:700">${formatPercent(row.sales_share || 0)}</div>
            </div>
            <div style="grid-column:1/-1">
              <div style="font-size:12px;color:var(--muted)">Última venda</div>
              <div style="font-weight:600">${row.last_sold_at ? `${formatDate(row.last_sold_at)} ${formatTime(row.last_sold_at)}` : 'Sem venda registrada no período'}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderInsightMetric(label, value) {
  return `
    <div style="border:1px solid var(--border);border-radius:16px;padding:14px;background:#fff">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${escapeHTML(label)}</div>
      <div style="font-size:20px;font-weight:800;color:var(--text)">${escapeHTML(value)}</div>
    </div>
  `;
}

function buildBarChart(series, valueKey, labelGetter, tooltipGetter, color) {
  if (!series.length) {
    return '<div class="empty-state" style="padding:16px 0"><div class="icon">📉</div><p>Sem dados para gerar o gráfico.</p></div>';
  }

  const maxValue = Math.max(...series.map((point) => Number(point[valueKey] || 0)), 1);

  return series.map((point) => {
    const value = Number(point[valueKey] || 0);
    const height = Math.max(Math.round((value / maxValue) * 90), 6);
    return `
      <div class="bar-col">
        <div class="bar-val">${escapeHTML(shortCurrency(value))}</div>
        <div class="bar" style="height:${height}px;background:${color}" title="${escapeHTML(tooltipGetter(point))}"></div>
        <div class="bar-label">${escapeHTML(labelGetter(point))}</div>
      </div>
    `;
  }).join('');
}

function buildMarginSummary(categoryRows) {
  return (categoryRows || []).reduce((acc, row) => {
    acc.revenue += Number(row.revenue || 0);
    acc.revenueWithCost += Number(row.revenue_with_cost || 0);
    acc.estimatedCost += Number(row.estimated_cost || 0);
    acc.estimatedMargin += Number(row.estimated_margin || 0);
    return acc;
  }, {
    revenue: 0,
    revenueWithCost: 0,
    estimatedCost: 0,
    estimatedMargin: 0,
    get coverageRate() {
      return this.revenue > 0 ? (this.revenueWithCost / this.revenue) * 100 : 0;
    },
  });
}

function buildVendasPresetRange(preset, search = '') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start = new Date(today);
  let end = new Date(today);

  switch (preset) {
    case 'today':
      break;
    case 'last7':
      start.setDate(start.getDate() - 6);
      break;
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'last30':
    default:
      start.setDate(start.getDate() - 29);
      preset = 'last30';
      break;
  }

  return {
    preset,
    startDate: toInputDate(start),
    endDate: toInputDate(end),
    search,
  };
}

function selectVendasPreset(preset) {
  vendasState.filters = buildVendasPresetRange(preset, vendasState.filters?.search || '');
  loadVendas();
}

function resetVendasRange() {
  vendasState.filters = buildVendasPresetRange('last30', '');
  loadVendas();
}

function applyVendasCustomRange() {
  const startDate = document.getElementById('vendas-start-date')?.value;
  const endDate = document.getElementById('vendas-end-date')?.value;

  if (!startDate || !endDate) {
    showToast('Informe data inicial e final.', 'error');
    return;
  }

  if (startDate > endDate) {
    showToast('A data inicial não pode ser maior que a final.', 'error');
    return;
  }

  vendasState.filters = {
    ...vendasState.filters,
    preset: 'custom',
    startDate,
    endDate,
  };

  loadVendas();
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

function getFilteredSalesRows(sales, tableNumbersByTabId) {
  const search = String(vendasState.filters?.search || '').trim().toLowerCase();

  return (sales || [])
    .map((order) => {
      const total = order.items ? order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0) : 0;
      const displayCode = getOrderDisplayCode(order, tableNumbersByTabId);
      const itemsCount = order.items ? order.items.length : 0;
      const searchText = [
        displayCode,
        order.destination,
        order.status,
        formatDate(order.createdAt),
        total,
      ].join(' ').toLowerCase();

      return {
        order,
        total,
        displayCode,
        itemsCount,
        searchText,
      };
    })
    .filter((entry) => !search || entry.searchText.includes(search));
}

function filterVendasRows(searchValue) {
  const search = String(searchValue || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#vendas-table-body tr[data-search]');
  rows.forEach((row) => {
    row.style.display = row.dataset.search.includes(search) ? '' : 'none';
  });
}

function exportVendasCsv() {
  const tableNumbersByTabId = buildTableNumbersByTabId(vendasState.tablesData);
  const rows = getFilteredSalesRows(vendasState.sales, tableNumbersByTabId);

  if (!rows.length) {
    showToast('Sem dados para exportar no filtro atual.', 'info');
    return;
  }

  const csvRows = [
    ['codigo', 'destino', 'status', 'data_hora', 'itens', 'total'],
    ...rows.map((entry) => [
      entry.displayCode,
      entry.order.destination || '',
      entry.order.status || '',
      new Date(entry.order.createdAt).toISOString(),
      String(entry.itemsCount),
      String(Number(entry.total || 0).toFixed(2)),
    ]),
  ];

  const csv = csvRows.map((row) => row.map(escapeCsvValue).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-vendas-${vendasState.filters.startDate}-${vendasState.filters.endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!minutes) return '0 min';
  return `${minutes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function comparisonClass(comparison, lowerIsBetter = false) {
  const change = Number(comparison?.change_percent || 0);
  if (change === 0) {
    return '';
  }

  const favorable = lowerIsBetter ? change <= 0 : change >= 0;
  return favorable ? 'change-up' : 'change-down';
}

function formatComparison(comparison) {
  if (!comparison) {
    return 'Sem base comparativa';
  }

  const change = Number(comparison.change_percent || 0);
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% vs período anterior`;
}

function shortCurrency(value) {
  const amount = Number(value || 0);
  if (amount >= 1000) {
    return `${(amount / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
  }

  return amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}
