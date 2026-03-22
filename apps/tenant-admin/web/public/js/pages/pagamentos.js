let pagamentosState = {
  filters: buildPagamentosDefaultFilters(),
  data: null,
};

async function loadPagamentos(reset = false) {
  if (reset || !pagamentosState.filters?.startDate || !pagamentosState.filters?.endDate) {
    pagamentosState.filters = buildPagamentosDefaultFilters();
  }

  const container = document.getElementById('page-pagamentos');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando pagamentos...</div>';

  try {
    const params = {
      start_date: pagamentosState.filters.startDate,
      end_date: pagamentosState.filters.endDate,
      status: pagamentosState.filters.status,
      reconciliation: pagamentosState.filters.reconciliation,
      search: pagamentosState.filters.search,
    };

    pagamentosState.data = await api.get('/tables/payments/overview', params);
    renderPagamentos();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function renderPagamentos() {
  const container = document.getElementById('page-pagamentos');
  const data = pagamentosState.data;

  if (!data) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Sem dados de pagamento.</p></div>';
    return;
  }

  const summary = data.summary || {};
  const filters = pagamentosState.filters;
  const divergences = data.tabs_with_divergence || [];
  const payments = data.payments || [];

  container.innerHTML = `
    <div class="full-card" style="margin-bottom:20px">
      <div class="card-header">
        <div>
          <div class="card-title">Pagamentos & Conciliação</div>
          <div class="card-subtitle">Leitura operacional do período ${escapeHTML(data.period?.label || '')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end">
        <div class="form-group" style="margin:0">
          <label>Data inicial</label>
          <input type="date" id="pagamentos-start-date" value="${escapeHTML(filters.startDate)}">
        </div>
        <div class="form-group" style="margin:0">
          <label>Data final</label>
          <input type="date" id="pagamentos-end-date" value="${escapeHTML(filters.endDate)}">
        </div>
        <div class="form-group" style="margin:0">
          <label>Status</label>
          <select id="pagamentos-status-filter">
            ${renderPagamentosOption('ALL', 'Todos', filters.status)}
            ${renderPagamentosOption('CONFIRMED', 'Confirmado local', filters.status)}
            ${renderPagamentosOption('PENDING', 'Pendente local', filters.status)}
            ${renderPagamentosOption('PROVIDER_APPROVED', 'Aprovado no provedor', filters.status)}
            ${renderPagamentosOption('REJECTED', 'Recusado', filters.status)}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Conciliação</label>
          <select id="pagamentos-reconciliation-filter">
            ${renderPagamentosOption('ALL', 'Todas', filters.reconciliation)}
            ${renderPagamentosOption('RECONCILED', 'Conciliada', filters.reconciliation)}
            ${renderPagamentosOption('MANUAL_ADJUSTMENT', 'Ajuste manual', filters.reconciliation)}
            ${renderPagamentosOption('PROVIDER_PENDING', 'Provedor pendente', filters.reconciliation)}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Busca</label>
          <input type="text" id="pagamentos-search-filter" placeholder="Mesa, telefone, referência..." value="${escapeHTML(filters.search || '')}">
        </div>
        <div style="display:flex;gap:8px;align-items:end">
          <button class="btn-sm btn-dark" onclick="applyPagamentosFilters()">Atualizar</button>
          <button class="btn-sm btn-outline" onclick="resetPagamentosFilters()">Limpar</button>
        </div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-label">Confirmado Local</div>
        <div class="stat-value">${formatCurrency(summary.confirmed_amount || 0)}</div>
        <div class="stat-change change-up">${summary.confirmed_count || 0} pagamentos conciliados</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-label">Pendente Local</div>
        <div class="stat-value">${formatCurrency(summary.pending_amount || 0)}</div>
        <div class="stat-change">${summary.pending_count || 0} pagamentos aguardando baixa</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🛰</div>
        <div class="stat-label">Aprovado no Provedor</div>
        <div class="stat-value">${formatCurrency(summary.provider_approved_pending_amount || 0)}</div>
        <div class="stat-change" style="color:#b45309">${summary.provider_approved_pending_count || 0} casos para acompanhamento</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-label">Divergência Aberta</div>
        <div class="stat-value">${formatCurrency(summary.divergence_amount || 0)}</div>
        <div class="stat-change" style="color:#b91c1c">${summary.divergence_tabs_count || 0} comandas exigem conferência</div>
      </div>
    </div>

    <div class="section-grid" style="margin-bottom:20px">
      <div class="card" style="grid-column:1/-1">
        <div class="card-header">
          <div>
            <div class="card-title">Comandas com Divergência</div>
            <div class="card-subtitle">Gap entre comanda, pagamentos confirmados e tentativas do provedor</div>
          </div>
        </div>
        ${renderPagamentosDivergences(divergences)}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Fila de Pagamentos</div>
          <div class="card-subtitle">${payments.length} pagamentos encontrados no filtro atual</div>
        </div>
      </div>
      ${renderPagamentosTable(payments)}
    </div>
  `;
}

function renderPagamentosOption(value, label, current) {
  return `<option value="${escapeHTML(value)}" ${String(current || '').toUpperCase() === value ? 'selected' : ''}>${escapeHTML(label)}</option>`;
}

function renderPagamentosDivergences(rows) {
  if (!rows.length) {
    return '<div class="empty-state"><div class="icon">✅</div><p>Nenhuma comanda com divergência aberta no filtro atual.</p></div>';
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px">
      ${rows.map((tab) => {
        const financial = tab.financial || {};
        return `
          <div style="border:1px solid var(--border);border-radius:16px;padding:16px;background:#fff">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text)">Mesa ${escapeHTML(formatPagamentoTableLabel(tab.tableNumber))}</div>
                <div style="font-size:12px;color:var(--muted)">Comanda ${escapeHTML(String(tab.tabId || '').slice(0, 8))}</div>
              </div>
              <span class="status-pill ${getPagamentoReconciliationMeta(financial.settlementStatus).cls}">
                ${escapeHTML(getPagamentoReconciliationMeta(financial.settlementStatus).label)}
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
              <div>
                <div style="font-size:12px;color:var(--muted)">Total comanda</div>
                <div class="mono" style="font-weight:700">${formatCurrency(tab.total || 0)}</div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--muted)">Pagamento aprovado</div>
                <div class="mono" style="font-weight:700">${formatCurrency(financial.approvedPaymentsAmount || 0)}</div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--muted)">Gap</div>
                <div class="mono" style="font-weight:700;color:${Number(financial.reconciliationGap || 0) > 0 ? '#b45309' : '#1d4ed8'}">${formatCurrency(Math.abs(financial.reconciliationGap || 0))}</div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--muted)">Saldo pendente</div>
                <div class="mono" style="font-weight:700;color:#b91c1c">${formatCurrency(financial.amountDue || 0)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
              <button class="btn-sm btn-outline" onclick="openPagamentoTabDetail('${tab.tabId}')">Ver detalhe</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPagamentosTable(rows) {
  if (!rows.length) {
    return '<div class="empty-state"><div class="icon">📭</div><p>Nenhum pagamento encontrado no recorte atual.</p></div>';
  }

  return `
    <div style="overflow:auto">
      <table>
        <thead>
          <tr>
            <th>Mesa / Comanda</th>
            <th>Pagamento</th>
            <th>Status</th>
            <th>Conciliação</th>
            <th>Data</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((payment) => {
            const paymentMeta = getPagamentoStatusMeta(payment);
            const reconciliationMeta = getPagamentoReconciliationMeta(payment.reconciliationStatus);
            return `
              <tr>
                <td>
                  <div style="font-weight:700">Mesa ${escapeHTML(formatPagamentoTableLabel(payment.tableNumber))}</div>
                  <div style="font-size:12px;color:var(--muted)">
                    ${payment.userPhone ? escapeHTML(payment.userPhone) : 'Telefone não identificado'}
                    · ${escapeHTML(String(payment.tabId || '').slice(0, 8))}
                  </div>
                </td>
                <td>
                  <div style="font-weight:700">${escapeHTML(payment.paymentType || 'FULL')} · ${escapeHTML(payment.method || 'Forma não informada')}</div>
                  <div style="font-size:12px;color:var(--muted)">
                    ${payment.latestAttemptProviderStatus ? `Provider ${escapeHTML(payment.latestAttemptProviderStatus)}` : 'Sem retorno do provedor'}
                  </div>
                </td>
                <td>
                  <span class="status-pill ${paymentMeta.cls}">${escapeHTML(paymentMeta.label)}</span>
                  ${payment.latestAttemptProviderDetail ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;max-width:220px">${escapeHTML(payment.latestAttemptProviderDetail)}</div>` : ''}
                </td>
                <td>
                  <span class="status-pill ${reconciliationMeta.cls}">${escapeHTML(reconciliationMeta.label)}</span>
                  <div style="font-size:11px;color:var(--muted);margin-top:6px">
                    Gap ${formatCurrency(Math.abs(payment.reconciliationGap || 0))}
                  </div>
                </td>
                <td>${escapeHTML(formatDateTime(payment.createdAt))}</td>
                <td class="mono">${formatCurrency(payment.amount || 0)}</td>
                <td><button class="btn-sm btn-outline" onclick="openPagamentoTabDetail('${payment.tabId}')">Detalhe</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openPagamentoTabDetail(tabId) {
  openModal(`
    <div class="modal-header">
      <h3>Carregando comanda...</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div> Consultando detalhes...</div></div>
  `);

  try {
    const detail = await api.get(`/tables/tabs/${tabId}/details`);
    renderPagamentoTabDetailModal(detail);
  } catch (err) {
    openModal(`
      <div class="modal-header">
        <h3>Erro ao carregar comanda</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body"><p>${escapeHTML(err.message)}</p></div>
    `);
  }
}

function renderPagamentoTabDetailModal(detail) {
  const financial = detail?.financial || {};
  const canFinalize = canFinalizePagamentoDetail(detail);

  openModal(`
    <div class="modal-header">
      <h3>Comanda Mesa ${escapeHTML(formatPagamentoTableLabel(detail?.tableNumber))}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
      <div style="padding:12px 14px;border-radius:12px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.16);font-size:13px;color:var(--text)">
        Cliente: <strong>${escapeHTML(detail?.userPhone || 'Telefone não identificado')}</strong>
        ${detail?.paymentNotifierPhone ? ` · Notificador: <strong>${escapeHTML(detail.paymentNotifierPhone)}</strong>` : ''}
      </div>
      ${renderSettlementAlert(detail)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        ${renderComandaMetric('Total da comanda', formatCurrency(financial.total || 0), 'Valor total consolidado', '#111827')}
        ${renderComandaMetric('Pagamento confirmado', formatCurrency(financial.approvedPaymentsAmount || 0), 'Confirmado localmente', '#0f766e')}
        ${renderComandaMetric('Aprovado no provedor', formatCurrency(financial.approvedAttemptAmount || 0), 'Retorno mais recente do gateway', '#b45309')}
        ${renderComandaMetric('Saldo pendente', formatCurrency(financial.amountDue || 0), 'Diferença ainda aberta', '#b91c1c')}
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:8px">Pagamentos</div>
        <div style="display:flex;flex-direction:column;gap:8px">${renderComandaPayments(detail)}</div>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:8px">Histórico</div>
        <div style="display:flex;flex-direction:column">${renderComandaHistory(detail)}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Fechar</button>
      ${canFinalize ? `<button class="btn-sm btn-primary" onclick="finalizePagamentoTab('${detail.id}')">Registrar baixa / finalizar</button>` : ''}
    </div>
  `);
}

async function finalizePagamentoTab(tabId) {
  const confirmed = window.confirm('Confirmar a baixa manual e finalizar esta comanda?');
  if (!confirmed) {
    return;
  }

  try {
    await api.post(`/tables/tabs/${tabId}/finalize`, {});
    showToast('Baixa registrada e comanda finalizada.');
    closeModal();
    await loadPagamentos();
  } catch (err) {
    showToast(`Erro ao finalizar: ${err.message}`, 'error');
  }
}

function canFinalizePagamentoDetail(detail) {
  if (!canPerformAction('manageSettlement')) {
    return false;
  }

  if (String(detail?.status || '').toUpperCase() === 'CLOSED') {
    return false;
  }

  const financial = detail?.financial || {};
  const total = Number(financial.total || 0);
  const approvedPayments = Number(financial.approvedPaymentsAmount || 0);
  const approvedAttempts = Number(financial.approvedAttemptAmount || 0);
  const amountDue = Number(financial.amountDue || 0);

  return amountDue <= 0.01 || approvedPayments >= total || approvedAttempts >= total;
}

function applyPagamentosFilters() {
  const startDate = document.getElementById('pagamentos-start-date')?.value || '';
  const endDate = document.getElementById('pagamentos-end-date')?.value || '';

  if (!startDate || !endDate) {
    showToast('Informe data inicial e final.', 'error');
    return;
  }

  if (startDate > endDate) {
    showToast('A data inicial não pode ser maior que a final.', 'error');
    return;
  }

  pagamentosState.filters = {
    startDate,
    endDate,
    status: document.getElementById('pagamentos-status-filter')?.value || 'ALL',
    reconciliation: document.getElementById('pagamentos-reconciliation-filter')?.value || 'ALL',
    search: document.getElementById('pagamentos-search-filter')?.value || '',
  };

  loadPagamentos();
}

function resetPagamentosFilters() {
  pagamentosState.filters = buildPagamentosDefaultFilters();
  loadPagamentos();
}

function buildPagamentosDefaultFilters() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 29);

  return {
    startDate: toPagamentoInputDate(start),
    endDate: toPagamentoInputDate(today),
    status: 'ALL',
    reconciliation: 'ALL',
    search: '',
  };
}

function getPagamentoStatusMeta(payment) {
  if (payment.providerApprovedPending) {
    return { label: 'Aprovado no provedor', cls: 'status-pending' };
  }
  if (payment.rejectedByProvider) {
    return { label: 'Recusado', cls: 'status-canceled' };
  }
  if (String(payment.localStatus || '').toUpperCase() === 'CONFIRMED') {
    return { label: 'Confirmado local', cls: 'status-done' };
  }
  return { label: 'Pendente local', cls: 'status-prep' };
}

function getPagamentoReconciliationMeta(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'RECONCILED') {
    return { label: 'Conciliada', cls: 'status-done' };
  }
  if (normalized === 'MANUAL_ADJUSTMENT') {
    return { label: 'Ajuste manual', cls: 'status-pending' };
  }
  if (normalized === 'PROVIDER_PENDING') {
    return { label: 'Provedor pendente', cls: 'status-prep' };
  }
  return { label: 'Aberta', cls: 'status-canceled' };
}

function formatPagamentoTableLabel(value) {
  const raw = String(value || '--').trim();
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw;
}

function toPagamentoInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
