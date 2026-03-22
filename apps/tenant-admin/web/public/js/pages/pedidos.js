const PEDIDOS_SLA_DEFAULT = {
  pending: { warningMinutes: 3, criticalMinutes: 5, label: 'Aceite' },
  accepted: { warningMinutes: 12, criticalMinutes: 20, label: 'Preparo' },
  ready: { warningMinutes: 4, criticalMinutes: 8, label: 'Entrega' },
};

const PEDIDOS_STATION_SLA_DEFAULT = {
  ATTENDANCE: {
    pending: PEDIDOS_SLA_DEFAULT.pending,
    accepted: PEDIDOS_SLA_DEFAULT.accepted,
    ready: PEDIDOS_SLA_DEFAULT.ready,
  },
  KITCHEN: {
    pending: PEDIDOS_SLA_DEFAULT.pending,
    accepted: PEDIDOS_SLA_DEFAULT.accepted,
    ready: PEDIDOS_SLA_DEFAULT.ready,
  },
  BAR: {
    pending: PEDIDOS_SLA_DEFAULT.pending,
    accepted: { warningMinutes: 8, criticalMinutes: 14, label: 'Preparo' },
    ready: PEDIDOS_SLA_DEFAULT.ready,
  },
};

const PEDIDOS_CANCEL_OPTIONS = [
  { code: 'INGREDIENTE_EM_FALTA', category: 'stock', label: 'Ingrediente em falta', icon: '🥬' },
  { code: 'ITEM_FORA_CARDAPIO', category: 'stock', label: 'Item fora do cardápio hoje', icon: '📋' },
  { code: 'EQUIPAMENTO_COM_PROBLEMA', category: 'operational', label: 'Equipamento com problema', icon: '🔧' },
  { code: 'COZINHA_SOBRECARREGADA', category: 'operational', label: 'Cozinha sobrecarregada', icon: '🔥' },
  { code: 'CLIENTE_DESISTIU', category: 'customer', label: 'Cliente desistiu do pedido', icon: '🙋' },
  { code: 'PEDIDO_DUPLICADO', category: 'customer', label: 'Pedido duplicado / engano', icon: '🧾' },
  { code: 'OTHER', category: 'other', label: 'Outro motivo', icon: '✏️', custom: true },
];

const pedidosState = {
  orders: [],
  summary: null,
  tableNumbersByTabId: {},
  currentFilter: '',
  cancelDialog: {
    orderId: null,
    optionCode: null,
  },
};

async function loadPedidos() {
  const container = document.getElementById('page-pedidos');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando pedidos...</div>';

  try {
    const [orders, tablesData, operationsSummary] = await Promise.all([
      api.get('/orders'),
      api.get('/tables').catch(() => []),
      api.get('/orders/operations/summary').catch(() => null),
    ]);

    pedidosState.orders = (Array.isArray(orders) ? orders : []).map(normalizePedidoOrder);
    pedidosState.summary = operationsSummary || null;
    pedidosState.tableNumbersByTabId = buildTableNumbersByTabId(tablesData);

    renderPedidosPage();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function renderPedidosPage() {
  const container = document.getElementById('page-pedidos');
  if (!container) return;

  const orders = pedidosState.orders;
  const summary = pedidosState.summary || {};
  const overall = summary.overall || {};
  const pending = orders.filter((order) => order.status === 'PENDING').length;
  const prep = orders.filter((order) => order.status === 'ACCEPTED').length;
  const ready = orders.filter((order) => order.status === 'READY').length;
  const delivered = orders.filter((order) => order.status === 'DELIVERED').length;
  const canceled = orders.filter((order) => order.status === 'CANCELED').length;
  const delayedCount = Number(overall.delayedCount || 0);
  const warningCount = Number(overall.warningCount || 0);
  const shiftVolumeToday = Array.isArray(overall.shiftVolumeToday) ? overall.shiftVolumeToday : [];
  const delayBands = Array.isArray(overall.delayBands) ? overall.delayBands : [];
  const cancellationTopReason = String(overall.cancellationTopReason || '').trim();
  const cancellationCategories = overall.cancellationCategoryBreakdown || {};

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:18px;">
      <div style="
        background:linear-gradient(135deg, #1f2937 0%, #334155 100%);
        border-radius:20px;
        padding:26px 28px;
        color:#fff;
        box-shadow:var(--shadow-lg);
      ">
        <div style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:8px;">Operação do dia</div>
        <div style="font-size:30px; font-weight:800; font-family:'Sora',sans-serif; line-height:1.1; margin-bottom:10px;">
          ${pending} aguardando · ${prep} em preparo · ${ready} prontos
        </div>
        <div style="font-size:13px; color:rgba(255,255,255,0.68); max-width:760px;">
          Agora a fila mostra atraso por SLA, volume por turno e histórico de cancelamentos com categoria e responsável.
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
        ${renderPedidoStatCard('🔴', 'Pendentes', pending, `${delayedCount} acima do SLA`, 'rgba(239,68,68,0.08)', '#b91c1c')}
        ${renderPedidoStatCard('⏱️', 'Em preparo', prep, `${warningCount} em atenção`, 'rgba(245,158,11,0.10)', '#b45309')}
        ${renderPedidoStatCard('✅', 'Prontos', ready, `${delivered} entregues`, 'rgba(26,188,156,0.10)', '#0f766e')}
        ${renderPedidoStatCard('✖️', 'Cancelados', canceled, `${Number(overall.cancellationsLast7Days || 0)} nos últimos 7 dias`, 'rgba(59,130,246,0.10)', '#2563eb')}
      </div>

      <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:16px; align-items:stretch;">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Faixas de Atraso</div>
              <div class="card-subtitle">Pedidos acima do SLA distribuídos por faixa de atraso neste momento</div>
            </div>
          </div>
          <div style="padding:20px 22px;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">
              ${delayBands.length ? delayBands.map((band) => `
                <div style="border:1px solid var(--border); border-radius:14px; padding:16px; background:var(--surface);">
                  <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); margin-bottom:8px;">${escapeHTML(band.label || '-')}</div>
                  <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">${escapeHTML(String(band.count || 0))}</div>
                  <div style="font-size:12px; color:var(--muted); margin-top:6px;">pedido(s) atrasados</div>
                </div>
              `).join('') : `
                <div style="font-size:13px; color:var(--muted);">Sem atraso ativo agora.</div>
              `}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Volume por Turno</div>
              <div class="card-subtitle">Pedidos criados hoje por faixa operacional</div>
            </div>
          </div>
          <div style="padding:20px 22px; display:flex; flex-direction:column; gap:10px;">
            ${shiftVolumeToday.length ? shiftVolumeToday.map((shift) => `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1px solid var(--border); border-radius:12px; background:var(--surface);">
                <div style="font-size:13px; font-weight:700; color:var(--dark);">${escapeHTML(shift.label || '-')}</div>
                <div style="font-size:22px; font-weight:800; font-family:'Sora',sans-serif; color:var(--accent-blue);">${escapeHTML(String(shift.count || 0))}</div>
              </div>
            `).join('') : `
              <div style="font-size:13px; color:var(--muted);">Sem dados de turno disponíveis.</div>
            `}
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:16px;">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Cancelamentos Gerenciais</div>
              <div class="card-subtitle">Motivo mais recorrente e distribuição das categorias operacionais</div>
            </div>
          </div>
          <div style="padding:20px 22px; display:flex; flex-direction:column; gap:14px;">
            <div style="padding:16px; border-radius:14px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.12);">
              <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; margin-bottom:6px;">Motivo líder</div>
              <div style="font-size:18px; font-weight:800; color:var(--dark);">${escapeHTML(cancellationTopReason || 'Sem cancelamentos recentes')}</div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px;">
              ${renderCancelCategoryMiniCard('Estoque', cancellationCategories.stock || 0, '#2563eb')}
              ${renderCancelCategoryMiniCard('Operacional', cancellationCategories.operational || 0, '#b45309')}
              ${renderCancelCategoryMiniCard('Cliente', cancellationCategories.customer || 0, '#0f766e')}
              ${renderCancelCategoryMiniCard('Outros', cancellationCategories.other || 0, '#6b7280')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Filtros da Fila</div>
              <div class="card-subtitle">Refine a visualização por estágio do pedido</div>
            </div>
          </div>
          <div style="padding:20px 22px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;" id="pedidos-filters">
              ${renderPedidoFilterTag('', `Todos (${orders.length})`)}
              ${renderPedidoFilterTag('PENDING', `Pendentes (${pending})`)}
              ${renderPedidoFilterTag('ACCEPTED', `Em preparo (${prep})`)}
              ${renderPedidoFilterTag('READY', `Prontos (${ready})`)}
              ${renderPedidoFilterTag('DELIVERED', `Entregues (${delivered})`)}
              ${renderPedidoFilterTag('CANCELED', `Cancelados (${canceled})`)}
            </div>
          </div>
        </div>
      </div>

      <div class="full-card">
        <div class="card-header">
          <div>
            <div class="card-title">Fila de Pedidos</div>
            <div class="card-subtitle" id="pedidos-table-subtitle"></div>
          </div>
        </div>
        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Destino</th>
                <th>Itens</th>
                <th>Status</th>
                <th>Operação</th>
                <th>Horário</th>
                <th>Total</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody id="pedidos-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  bindPedidoFilters();
  renderPedidosTable();
}

function renderPedidosTable() {
  const orders = pedidosState.orders;
  const filteredOrders = pedidosState.currentFilter
    ? orders.filter((order) => order.status === pedidosState.currentFilter)
    : orders;
  const tbody = filteredOrders.map((order) => {
    const total = Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + Number(item.unitPrice || item.unit_price || 0) * Number(item.quantity || 0), 0)
      : 0;

    return `<tr>
      <td class="mono">#${escapeHTML(getOrderDisplayCode(order, pedidosState.tableNumbersByTabId))}</td>
      <td>${escapeHTML(resolvePedidoDestinationLabel(order.destination))}</td>
      <td>${escapeHTML(buildPedidoItemsSummary(order))}</td>
      <td>${renderPedidoStatusCell(order)}</td>
      <td>${renderPedidoOperationCell(order)}</td>
      <td>${renderPedidoDateCell(order)}</td>
      <td class="mono">${escapeHTML(formatCurrency(total))}</td>
      <td>${renderPedidoActionCell(order)}</td>
    </tr>`;
  }).join('');

  const subtitle = document.getElementById('pedidos-table-subtitle');
  if (subtitle) {
    const label = pedidosState.currentFilter ? statusLabel(pedidosState.currentFilter) : 'todos os status';
    subtitle.textContent = `${filteredOrders.length} pedido(s) em ${label}`;
  }

  const body = document.getElementById('pedidos-table-body');
  if (body) {
    body.innerHTML = tbody || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">Nenhum pedido encontrado neste filtro</td></tr>';
  }
}

function bindPedidoFilters() {
  document.querySelectorAll('#pedidos-filters .cat-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      pedidosState.currentFilter = tag.dataset.filter || '';
      document.querySelectorAll('#pedidos-filters .cat-tag').forEach((item) => item.classList.remove('active'));
      tag.classList.add('active');
      renderPedidosTable();
    });
  });
}

function renderPedidoStatCard(icon, label, value, detail, bg, color) {
  return `
    <div style="background:var(--card-bg); border-radius:16px; padding:18px 20px; border:1px solid var(--border); box-shadow:var(--shadow);">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <span style="width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:${bg};">${icon}</span>
        <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">${escapeHTML(label)}</span>
      </div>
      <div style="font-size:30px; font-weight:800; font-family:'Sora',sans-serif; color:${color};">${escapeHTML(String(value))}</div>
      <div style="font-size:12px; color:var(--muted); margin-top:6px;">${escapeHTML(detail)}</div>
    </div>
  `;
}

function renderCancelCategoryMiniCard(label, value, color) {
  return `
    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--surface);">
      <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700; margin-bottom:6px;">${escapeHTML(label)}</div>
      <div style="font-size:24px; font-weight:800; font-family:'Sora',sans-serif; color:${color};">${escapeHTML(String(value))}</div>
    </div>
  `;
}

function renderPedidoFilterTag(filter, label) {
  return `<div class="cat-tag ${pedidosState.currentFilter === filter ? 'active' : ''}" data-filter="${escapeHTML(filter)}">${escapeHTML(label)}</div>`;
}

function renderPedidoStatusCell(order) {
  return `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <span class="status-pill ${escapeHTML(statusClass(order.status))}">${escapeHTML(statusLabel(order.status))}</span>
      ${order.status === 'CANCELED' && order.cancelCategory ? `
        <span style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">
          ${escapeHTML(mapCancelCategoryLabel(order.cancelCategory))}
        </span>
      ` : ''}
    </div>
  `;
}

function renderPedidoOperationCell(order) {
  if (order.status === 'CANCELED') {
    return `
      <div style="display:flex; flex-direction:column; gap:6px; min-width:220px;">
        <div style="font-weight:700; color:var(--dark);">${escapeHTML(order.cancelReason || 'Sem motivo informado')}</div>
        <div style="font-size:12px; color:var(--muted);">
          ${escapeHTML(order.canceledByUserName ? `Cancelado por ${order.canceledByUserName}` : 'Sem responsável registrado')}
        </div>
      </div>
    `;
  }

  if (order.status === 'DELIVERED') {
    return `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="font-weight:700; color:var(--dark);">Fluxo concluído</div>
        <div style="font-size:12px; color:var(--muted);">${escapeHTML(formatPedidoDateTime(order.deliveredAt || order.delivered_at || order.updatedAt || order.createdAt))}</div>
      </div>
    `;
  }

  const stage = resolvePedidoStage(order);
  return `
    <div style="display:flex; flex-direction:column; gap:6px; min-width:220px;">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700;
          text-transform:uppercase; letter-spacing:0.4px;
          background:${stage.severity === 'critical' ? 'rgba(239,68,68,0.10)' : stage.severity === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.10)'};
          color:${stage.severity === 'critical' ? '#b91c1c' : stage.severity === 'warning' ? '#b45309' : '#2563eb'};
        ">${escapeHTML(stage.label)} · SLA ${escapeHTML(String(stage.criticalMinutes))} min</span>
      </div>
      <div style="font-size:13px; font-weight:700; color:var(--dark);">${escapeHTML(stage.elapsedText)}</div>
      <div style="font-size:12px; color:var(--muted);">${escapeHTML(stage.detail)}</div>
    </div>
  `;
}

function renderPedidoDateCell(order) {
  return `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <span>${escapeHTML(formatDate(order.createdAt || order.created_at))}</span>
      <span style="font-size:12px; color:var(--muted);">${escapeHTML(formatTime(order.createdAt || order.created_at))}</span>
    </div>
  `;
}

function renderPedidoActionCell(order) {
  const canManageOrders = canPerformAction('manageOrders');
  const canCancelOrders = canPerformAction('cancelOrders');

  if (!canManageOrders) {
    return '<span style="font-size:12px; color:var(--muted);">Sem ação</span>';
  }

  if (order.status === 'PENDING') {
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-sm btn-dark" onclick="updateOrderStatus('${order.id}', 'ACCEPTED')">Aceitar</button>
        ${canCancelOrders ? `<button class="btn-sm btn-outline" onclick="openOrderCancelDialog('${order.id}')">Cancelar</button>` : ''}
      </div>
    `;
  }

  if (order.status === 'ACCEPTED') {
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-sm btn-primary" onclick="updateOrderStatus('${order.id}', 'READY')">Pronto</button>
        ${canCancelOrders ? `<button class="btn-sm btn-outline" onclick="openOrderCancelDialog('${order.id}')">Cancelar</button>` : ''}
      </div>
    `;
  }

  if (order.status === 'READY') {
    return `<button class="btn-sm btn-outline" onclick="updateOrderStatus('${order.id}', 'DELIVERED')">Entregar</button>`;
  }

  return '<span style="font-size:12px; color:var(--muted);">Sem ação</span>';
}

function buildPedidoItemsSummary(order) {
  if (!Array.isArray(order.items) || !order.items.length) {
    return '-';
  }

  if (order.items.length === 1) {
    const item = order.items[0];
    return `${item.quantity} item`;
  }

  return `${order.items.length} itens`;
}

function resolvePedidoDestinationLabel(destination) {
  if (destination === 'KITCHEN') return 'Cozinha';
  if (destination === 'BAR') return 'Bar';
  return destination || '-';
}

function resolvePedidoStage(order) {
  if (order.status === 'ACCEPTED') {
    return buildPedidoStageSnapshot(
      'accepted',
      order.acceptedAt || order.accepted_at || order.createdAt || order.created_at,
      getPedidoStageSlaConfig('accepted', order),
    );
  }
  if (order.status === 'READY') {
    return buildPedidoStageSnapshot(
      'ready',
      order.readyAt || order.ready_at || order.createdAt || order.created_at,
      getPedidoStageSlaConfig('ready', order),
    );
  }
  return buildPedidoStageSnapshot(
    'pending',
    order.createdAt || order.created_at,
    getPedidoStageSlaConfig('pending', order),
  );
}

function buildPedidoStageSnapshot(key, startAt, stageConfig) {
  const elapsed = resolvePedidoElapsed(startAt, stageConfig);
  return {
    key,
    label: stageConfig?.label || 'Etapa',
    criticalMinutes: Number(stageConfig?.criticalMinutes || 0),
    severity: elapsed.severity,
    elapsedText: elapsed.text,
    detail: elapsed.severity === 'critical'
      ? 'Acima do SLA crítico'
      : elapsed.severity === 'warning'
        ? 'Em faixa de atenção'
        : 'Dentro do SLA',
  };
}

function getPedidoStageSlaConfig(stageKey, order) {
  const stationKey = resolvePedidoStationKey(order, stageKey);
  const stationSla = pedidosState.summary?.stationSla?.[stationKey]
    || PEDIDOS_STATION_SLA_DEFAULT[stationKey]
    || PEDIDOS_STATION_SLA_DEFAULT.ATTENDANCE;
  const genericSla = pedidosState.summary?.sla || PEDIDOS_SLA_DEFAULT;
  if (stageKey === 'accepted') return stationSla.accepted || genericSla.accepted || PEDIDOS_SLA_DEFAULT.accepted;
  if (stageKey === 'ready') return stationSla.ready || genericSla.ready || PEDIDOS_SLA_DEFAULT.ready;
  return stationSla.pending || genericSla.pending || PEDIDOS_SLA_DEFAULT.pending;
}

function resolvePedidoStationKey(order, stageKey) {
  if (stageKey !== 'accepted') {
    return 'ATTENDANCE';
  }
  const normalized = String(order?.destination || '').toUpperCase();
  if (normalized === 'BAR') return 'BAR';
  if (normalized === 'KITCHEN') return 'KITCHEN';
  return 'ATTENDANCE';
}

function resolvePedidoElapsed(value, stageConfig) {
  if (!value) {
    return { text: '—', severity: 'normal' };
  }

  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  const seconds = Math.max(0, Math.floor((diff % 60000) / 1000));
  const warningMinutes = Number(stageConfig?.warningMinutes || 0);
  const criticalMinutes = Number(stageConfig?.criticalMinutes || 0);
  const severity = minutes >= criticalMinutes
    ? 'critical'
    : minutes >= warningMinutes
      ? 'warning'
      : 'normal';

  return {
    text: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    severity,
  };
}

function mapCancelCategoryLabel(category) {
  if (category === 'stock') return 'Estoque';
  if (category === 'operational') return 'Operacional';
  if (category === 'customer') return 'Cliente';
  return 'Outros';
}

function formatPedidoDateTime(value) {
  if (!value) return '-';
  return `${formatDate(value)} ${formatTime(value)}`;
}

function normalizePedidoOrder(order) {
  return {
    ...order,
    createdAt: order.createdAt || order.created_at || null,
    acceptedAt: order.acceptedAt || order.accepted_at || null,
    readyAt: order.readyAt || order.ready_at || null,
    deliveredAt: order.deliveredAt || order.delivered_at || null,
    canceledAt: order.canceledAt || order.canceled_at || null,
    cancelReason: order.cancelReason || order.cancel_reason || '',
    cancelReasonCode: order.cancelReasonCode || order.cancel_reason_code || '',
    cancelCategory: order.cancelCategory || order.cancel_category || '',
    canceledByUserId: order.canceledByUserId || order.canceled_by_user_id || '',
    canceledByUserName: order.canceledByUserName || order.canceled_by_user_name || '',
    tabId: order.tabId || order.tab_id || '',
    items: Array.isArray(order.items) ? order.items : [],
  };
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

function openOrderCancelDialog(orderId) {
  if (!canPerformAction('cancelOrders')) {
    showToast('Seu perfil nao pode cancelar pedidos.', 'error');
    return;
  }
  const order = pedidosState.orders.find((item) => item.id === orderId);
  if (!order) return;

  pedidosState.cancelDialog = {
    orderId,
    optionCode: null,
  };

  openModal(`
    <div style="padding:24px; display:flex; flex-direction:column; gap:18px; min-width:min(92vw, 560px);">
      <div>
        <div style="font-size:22px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark); margin-bottom:6px;">Cancelar pedido</div>
        <div style="font-size:13px; color:var(--muted);">
          Pedido <strong>#${escapeHTML(getOrderDisplayCode(order, pedidosState.tableNumbersByTabId))}</strong> · ${escapeHTML(resolvePedidoDestinationLabel(order.destination))}
        </div>
      </div>

      <div id="pedido-cancel-options" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        ${PEDIDOS_CANCEL_OPTIONS.map((option) => `
          <button
            type="button"
            class="btn-sm btn-outline"
            data-code="${escapeHTML(option.code)}"
            style="padding:12px 14px; text-align:left; justify-content:flex-start;"
          >
            ${option.icon} ${escapeHTML(option.label)}
          </button>
        `).join('')}
      </div>

      <div id="pedido-cancel-custom-wrap" style="display:none; flex-direction:column; gap:8px;">
        <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Detalhe do motivo</label>
        <textarea id="pedido-cancel-custom-text" style="min-height:96px; border:1px solid var(--border); border-radius:12px; padding:12px; font-family:inherit;" maxlength="200" placeholder="Descreva o motivo do cancelamento"></textarea>
      </div>

      <div id="pedido-cancel-error" style="display:none; color:var(--accent-red); font-size:12px;">Selecione um motivo para continuar.</div>

      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button type="button" class="btn-sm btn-outline" onclick="closeModal()">Voltar</button>
        <button type="button" class="btn-sm btn-primary" onclick="confirmOrderCancel()">Confirmar cancelamento</button>
      </div>
    </div>
  `);

  bindOrderCancelDialog();
}

function bindOrderCancelDialog() {
  document.querySelectorAll('#pedido-cancel-options [data-code]').forEach((button) => {
    button.addEventListener('click', () => {
      pedidosState.cancelDialog.optionCode = button.dataset.code || '';
      document.querySelectorAll('#pedido-cancel-options [data-code]').forEach((item) => item.classList.remove('btn-primary'));
      document.querySelectorAll('#pedido-cancel-options [data-code]').forEach((item) => item.classList.add('btn-outline'));
      button.classList.remove('btn-outline');
      button.classList.add('btn-primary');

      const option = PEDIDOS_CANCEL_OPTIONS.find((item) => item.code === pedidosState.cancelDialog.optionCode);
      const customWrap = document.getElementById('pedido-cancel-custom-wrap');
      if (customWrap) {
        customWrap.style.display = option?.custom ? 'flex' : 'none';
      }
      const error = document.getElementById('pedido-cancel-error');
      if (error) {
        error.style.display = 'none';
      }
    });
  });
}

async function confirmOrderCancel() {
  const option = PEDIDOS_CANCEL_OPTIONS.find((item) => item.code === pedidosState.cancelDialog.optionCode);
  const error = document.getElementById('pedido-cancel-error');

  if (!option) {
    if (error) error.style.display = 'block';
    return;
  }

  let reason = option.label;
  if (option.custom) {
    const customText = document.getElementById('pedido-cancel-custom-text')?.value.trim() || '';
    if (!customText) {
      if (error) error.style.display = 'block';
      return;
    }
    reason = customText;
  }

  try {
    await updateOrderStatus(pedidosState.cancelDialog.orderId, 'CANCELED', {
      cancel_reason: reason,
      cancel_reason_code: option.code,
      cancel_category: option.category,
    });
    closeModal();
  } catch (err) {
    if (error) {
      error.textContent = err.message || 'Falha ao cancelar pedido.';
      error.style.display = 'block';
    }
  }
}

async function updateOrderStatus(orderId, newStatus, extraPayload = {}) {
  if (!canPerformAction('manageOrders')) {
    showToast('Seu perfil nao pode alterar pedidos.', 'error');
    return;
  }

  if (newStatus === 'CANCELED' && !canPerformAction('cancelOrders')) {
    showToast('Seu perfil nao pode cancelar pedidos.', 'error');
    return;
  }
  try {
    await api.patch(`/orders/${orderId}/status`, { status: newStatus, ...extraPayload });
    showToast(`Pedido atualizado para ${statusLabel(newStatus)}`);
    loadPedidos();
  } catch (err) {
    showToast('Erro ao atualizar pedido: ' + err.message, 'error');
    throw err;
  }
}
