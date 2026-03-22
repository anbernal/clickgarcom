// Pedidos Page
async function loadPedidos() {
  const container = document.getElementById('page-pedidos');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando pedidos...</div>';

  try {
    const [orders, tablesData] = await Promise.all([
      api.get('/orders'),
      api.get('/tables').catch(() => []),
    ]);
    const tableNumbersByTabId = buildTableNumbersByTabId(tablesData);
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const prep = orders.filter(o => o.status === 'ACCEPTED').length;
    const ready = orders.filter(o => o.status === 'READY').length;

    let filterStatus = null;

    function render(filteredOrders) {
      const tbody = filteredOrders.map((order, i) => {
        const total = order.items ? order.items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0) : 0;
        const itemNames = order.items ? order.items.map(it => `${it.quantity}x`).join(', ') : '-';

        let actionBtn = '';
        if (order.status === 'PENDING') {
          actionBtn = `<button class="btn-sm btn-dark" onclick="updateOrderStatus('${order.id}', 'ACCEPTED')">Aceitar</button>`;
        } else if (order.status === 'ACCEPTED') {
          actionBtn = `<button class="btn-sm btn-primary" onclick="updateOrderStatus('${order.id}', 'READY')">✅ Pronto</button>`;
        } else if (order.status === 'READY') {
          actionBtn = `<button class="btn-sm btn-outline" onclick="updateOrderStatus('${order.id}', 'DELIVERED')">Entregar</button>`;
        }

        return `<tr>
          <td class="mono">#${escapeHTML(getOrderDisplayCode(order, tableNumbersByTabId))}</td>
          <td>${escapeHTML(order.destination)}</td>
          <td>${escapeHTML(order.items ? order.items.length + ' itens' : '-')}</td>
          <td><span class="status-pill ${escapeHTML(statusClass(order.status))}">${escapeHTML(statusLabel(order.status))}</span></td>
          <td>${escapeHTML(formatTime(order.createdAt))}</td>
          <td class="mono">${escapeHTML(formatCurrency(total))}</td>
          <td>${actionBtn}</td>
        </tr>`;
      }).join('');

      document.getElementById('pedidos-table-body').innerHTML = tbody || '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Nenhum pedido encontrado</td></tr>';
    }

    container.innerHTML = `
      <div class="full-card">
        <div class="card-header">
          <div>
            <div class="card-title">Fila de Pedidos</div>
            <div class="card-subtitle">${pending} pedidos aguardando ação</div>
          </div>
          <div style="display:flex;gap:8px" id="pedidos-filters">
            <div class="cat-tag active" data-filter="">Todos (${orders.length})</div>
            <div class="cat-tag" data-filter="PENDING">Pendentes (${pending})</div>
            <div class="cat-tag" data-filter="ACCEPTED">Em preparo (${prep})</div>
            <div class="cat-tag" data-filter="READY">Prontos (${ready})</div>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>#</th><th>Destino</th><th>Itens</th><th>Status</th><th>Horário</th><th>Total</th><th>Ação</th></tr>
          </thead>
          <tbody id="pedidos-table-body"></tbody>
        </table>
      </div>
    `;

    // Filter handlers
    document.querySelectorAll('#pedidos-filters .cat-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        document.querySelectorAll('#pedidos-filters .cat-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        const f = tag.dataset.filter;
        const filtered = f ? orders.filter(o => o.status === f) : orders;
        render(filtered);
      });
    });

    render(orders);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
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

async function updateOrderStatus(orderId, newStatus) {
  try {
    await api.patch(`/orders/${orderId}/status`, { status: newStatus });
    showToast(`Pedido atualizado para ${statusLabel(newStatus)}`);
    loadPedidos();
  } catch (err) {
    showToast('Erro ao atualizar pedido: ' + err.message, 'error');
  }
}
