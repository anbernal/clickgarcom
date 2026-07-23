// Comandas Page
let comandasOpenTabsCache = [];
let comandasClosedTabsCache = [];
let comandasTablesCache = [];
let comandasViewState = {
  search: '',
  status: 'OPEN',
  location: 'ALL',
  sort: 'RECENT',
  page: 1,
  perPage: 20,
};

const COMANDAS_ICONS = {
  ticket: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  table: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16"/><path d="M5 10V6h14v4"/><path d="M6 10v10"/><path d="M18 10v10"/></svg>',
  noTable: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16"/><path d="M5 10V6h14v4"/><path d="M6 10v10"/><path d="M18 10v10"/><path d="m3 3 18 18"/></svg>',
  total: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
};

function formatComandaTableNumber(value) {
  const raw = String(value || '--').trim();
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw;
}

function formatComandaDateTime(dateStr) {
  if (!dateStr) return 'Horário não informado';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Horário não informado';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderComandasStats(openTabs) {
  const withTable = openTabs.filter((tab) => Boolean(tab.tableNumber || tab.tableId)).length;
  const withoutTable = openTabs.length - withTable;
  const openTotal = openTabs.reduce((sum, tab) => sum + Number(tab.total || 0), 0);

  return `
    <div class="mesas-stats-grid">
      <div class="mesas-stat-card mesas-stat-card--primary">
        <div class="mesas-stat-icon">${COMANDAS_ICONS.ticket}</div>
        <div class="mesas-stat-label">Comandas abertas</div>
        <div class="mesas-stat-value">${openTabs.length}</div>
        <div class="mesas-stat-helper">Em atendimento agora</div>
      </div>
      <div class="mesas-stat-card mesas-stat-card--occupied">
        <div class="mesas-stat-icon">${COMANDAS_ICONS.table}</div>
        <div class="mesas-stat-label">Com mesa</div>
        <div class="mesas-stat-value">${withTable}</div>
        <div class="mesas-stat-helper">Vinculadas ao salão</div>
      </div>
      <div class="mesas-stat-card mesas-stat-card--reserved">
        <div class="mesas-stat-icon">${COMANDAS_ICONS.noTable}</div>
        <div class="mesas-stat-label">Sem mesa</div>
        <div class="mesas-stat-value">${withoutTable}</div>
        <div class="mesas-stat-helper">Atendimento independente</div>
      </div>
      <div class="mesas-stat-card mesas-stat-card--available">
        <div class="mesas-stat-icon">${COMANDAS_ICONS.total}</div>
        <div class="mesas-stat-label">Consumo em aberto</div>
        <div class="mesas-stat-value mesas-stat-value--currency">${escapeHTML(formatCurrency(openTotal))}</div>
        <div class="mesas-stat-helper">Soma das comandas abertas</div>
      </div>
    </div>
  `;
}

function getCurrentComandas() {
  return comandasViewState.status === 'CLOSED' ? comandasClosedTabsCache : comandasOpenTabsCache;
}

function getVisibleComandas() {
  const search = comandasViewState.search.toLowerCase().trim();
  const searchDigits = search.replace(/\D/g, '');

  return getCurrentComandas()
    .filter((tab) => {
      const hasTable = Boolean(tab.tableNumber || tab.tableId);
      if (comandasViewState.location === 'WITH_TABLE' && !hasTable) return false;
      if (comandasViewState.location === 'WITHOUT_TABLE' && hasTable) return false;
      if (!search) return true;

      const text = [
        tab.publicCode,
        tab.userPhone,
        tab.customerInstagram,
        tab.tableNumber,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      const phoneDigits = String(tab.userPhone || '').replace(/\D/g, '');
      return text.includes(search) || Boolean(searchDigits && phoneDigits.includes(searchDigits));
    })
    .sort((left, right) => {
      if (comandasViewState.sort === 'OLDEST') {
        return new Date(left.openedAt || 0).getTime() - new Date(right.openedAt || 0).getTime();
      }
      if (comandasViewState.sort === 'TOTAL_DESC') {
        return Number(right.total || 0) - Number(left.total || 0);
      }
      return new Date(right.openedAt || 0).getTime() - new Date(left.openedAt || 0).getTime();
    });
}

function renderComandaCustomer(tab) {
  return `
    <div class="comandas-customer-lines">
      <span><b>Tel.</b> ${tab.userPhone ? escapeHTML(tab.userPhone) : '<em>Adicionar telefone</em>'}</span>
      <span><b>Instagram</b> ${tab.customerInstagram ? escapeHTML(tab.customerInstagram) : '<em>Adicionar perfil</em>'}</span>
    </div>
  `;
}

function renderComandasResults() {
  const currentTabs = getCurrentComandas();
  const isClosedView = comandasViewState.status === 'CLOSED';
  const visibleTabs = getVisibleComandas();
  const totalPages = Math.max(1, Math.ceil(visibleTabs.length / comandasViewState.perPage));
  comandasViewState.page = Math.min(Math.max(1, comandasViewState.page), totalPages);
  const start = (comandasViewState.page - 1) * comandasViewState.perPage;
  const pageTabs = visibleTabs.slice(start, start + comandasViewState.perPage);
  const canFinalize = canPerformAction('manageSettlement');

  if (currentTabs.length === 0) {
    return `
      <div class="comandas-empty">
        <div class="comandas-empty-icon">${COMANDAS_ICONS.ticket}</div>
        <div>
          <strong>${isClosedView ? 'Nenhuma comanda finalizada' : 'Nenhuma comanda aberta'}</strong>
          <span>${isClosedView ? 'As próximas finalizações ficarão disponíveis aqui para consulta.' : 'As novas comandas aparecerão aqui para consulta rápida.'}</span>
        </div>
      </div>
    `;
  }

  if (visibleTabs.length === 0) {
    return `
      <div class="comandas-empty">
        <div class="comandas-empty-icon">🔎</div>
        <div>
          <strong>Nenhuma comanda encontrada</strong>
          <span>Revise a busca ou remova os filtros aplicados.</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="comandas-results-summary">
      <span><strong>${visibleTabs.length}</strong> comanda${visibleTabs.length === 1 ? '' : 's'} encontrada${visibleTabs.length === 1 ? '' : 's'}</span>
      <span>Exibindo ${start + 1}-${Math.min(start + comandasViewState.perPage, visibleTabs.length)}</span>
    </div>
    <div class="comandas-table">
      <div class="comandas-table-head">
        <span>Comanda</span>
        <span>Cliente</span>
        <span>Local</span>
        <span>${isClosedView ? 'Finalização' : 'Abertura'}</span>
        <span>Total</span>
        <span>Ações</span>
      </div>
      <div class="comandas-table-body">
        ${pageTabs.map((tab) => {
          const code = escapeHTML(tab.publicCode || tab.id);
          const total = Number(tab.total || 0);
          const paidAmount = Number(tab.paidAmount || 0);
          const outstanding = Math.max(0, total - paidAmount);
          const statusLabel = isClosedView ? 'Finalizada' : 'Aberta';
          const actionButtons = isClosedView
            ? `<button class="btn-sm btn-outline" type="button" onclick="openComandaConsultation('${code}')">Consultar</button>`
            : `
              <button class="btn-sm btn-outline" type="button" onclick="openComandaConsultation('${code}')">Consultar</button>
              <button class="btn-sm btn-outline" type="button" onclick="openEditComandaTable('${escapeHTML(tab.id)}')">${tab.tableId ? 'Alterar mesa' : 'Vincular mesa'}</button>
              ${canFinalize ? `<button class="btn-sm btn-danger" type="button" onclick="finalizeComandaFromPanel('${escapeHTML(tab.id)}')">Finalizar</button>` : ''}
            `;
          return `
            <article class="comandas-table-row">
              <div class="comandas-code-cell" data-label="Comanda">
                <button class="comandas-code-button mono" type="button" onclick="copyTabCode('${code}')" title="Copiar código">
                  ${code} ${COMANDAS_ICONS.copy}
                </button>
                <span class="comanda-card-status ${isClosedView ? 'comanda-card-status--closed' : ''}"><span></span> ${statusLabel}</span>
              </div>
              <div class="comandas-customer-cell" data-label="Cliente">
                ${renderComandaCustomer(tab)}
                ${isClosedView ? '' : `<button class="comandas-inline-edit" type="button" onclick="openEditComandaCustomer('${escapeHTML(tab.id)}')">
                  ${COMANDAS_ICONS.edit} Editar cliente
                </button>`}
              </div>
              <div class="comandas-location-cell" data-label="Local">
                <strong>${tab.tableNumber ? `Mesa ${escapeHTML(formatComandaTableNumber(tab.tableNumber))}` : 'Sem mesa'}</strong>
              </div>
              <div class="comandas-opened-cell" data-label="Abertura">
                <strong>${escapeHTML(formatComandaDateTime(isClosedView ? tab.closedAt : tab.openedAt))}</strong>
                <span>${isClosedView
                  ? (tab.closedByUserName ? `finalizada por ${escapeHTML(tab.closedByUserName)}` : 'Finalização registrada')
                  : (tab.openedByUserName ? `por ${escapeHTML(tab.openedByUserName)}` : 'Origem não informada')}</span>
              </div>
              <div class="comandas-total-cell" data-label="Total">
                <strong>${escapeHTML(formatCurrency(total))}</strong>
                ${isClosedView ? `<span>Baixa ${escapeHTML(formatCurrency(paidAmount))}</span>` : (paidAmount > 0 ? `<span>Falta ${escapeHTML(formatCurrency(outstanding))}</span>` : '<span>Sem baixa registrada</span>')}
              </div>
              <div class="comandas-row-actions" data-label="Ações">
                ${actionButtons}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>
    <div class="comandas-pagination">
      <button class="btn-sm btn-outline" type="button" onclick="setComandasPage(${comandasViewState.page - 1})" ${comandasViewState.page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página <strong>${comandasViewState.page}</strong> de <strong>${totalPages}</strong></span>
      <button class="btn-sm btn-outline" type="button" onclick="setComandasPage(${comandasViewState.page + 1})" ${comandasViewState.page >= totalPages ? 'disabled' : ''}>Próxima</button>
    </div>
  `;
}

function renderComandasManager(openTabs, tables) {
  return `
    <section class="full-card comandas-panel">
      <div class="comandas-panel-header">
        <div class="comandas-panel-heading">
          <div class="comandas-panel-icon">${COMANDAS_ICONS.ticket}</div>
          <div>
          <div class="card-title">Gerenciamento de comandas</div>
            <div class="card-subtitle">Abra, vincule mesas, consulte o histórico e finalize comandas em um único fluxo operacional.</div>
          </div>
        </div>
        <div class="comandas-panel-actions">
          <button class="btn-sm btn-outline" type="button" onclick="openComandaConsultation()">🔎 Consultar QR / código</button>
          <div class="comandas-count"><strong>${openTabs.length}</strong> aberta${openTabs.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div class="comandas-open-box">
        <div class="comandas-open-title">
          <strong>Nova comanda</strong>
          <span>Telefone, Instagram e mesa são opcionais.</span>
        </div>
        <div class="comandas-open-form">
          <label class="comandas-field">
            <span>Telefone do cliente</span>
            <input id="tab-open-phone" class="input" type="tel" inputmode="tel" placeholder="(11) 99999-9999">
          </label>
          <label class="comandas-field">
            <span>Instagram</span>
            <input id="tab-open-instagram" class="input" type="text" placeholder="@usuario">
          </label>
          <label class="comandas-field">
            <span>Mesa</span>
            <select id="tab-open-table" class="input">
              <option value="">Sem mesa</option>
              ${tables.map((table) => `<option value="${escapeHTML(table.id)}">Mesa ${escapeHTML(formatComandaTableNumber(table.number))}</option>`).join('')}
            </select>
          </label>
          <button class="btn-sm btn-primary comandas-open-button" type="button" onclick="openNewTabFromPanel()">
            <span>+</span> Abrir comanda
          </button>
        </div>
        <div class="comandas-open-hint">
          Os dados do cliente também podem ser adicionados ou corrigidos depois, diretamente na lista.
        </div>
      </div>

      <div class="comandas-toolbar">
        <label class="comandas-search-field">
          <span>Buscar comanda</span>
          <input id="comandas-search" class="input" type="search" value="${escapeHTML(comandasViewState.search)}"
            placeholder="Código, telefone, Instagram ou mesa" oninput="updateComandasView()">
        </label>
        <label class="comandas-filter-field">
          <span>Situação</span>
          <select id="comandas-status-filter" class="input" onchange="updateComandasView()">
            <option value="OPEN" ${comandasViewState.status === 'OPEN' ? 'selected' : ''}>Abertas</option>
            <option value="CLOSED" ${comandasViewState.status === 'CLOSED' ? 'selected' : ''}>Finalizadas</option>
          </select>
        </label>
        <label class="comandas-filter-field">
          <span>Local</span>
          <select id="comandas-location-filter" class="input" onchange="updateComandasView()">
            <option value="ALL" ${comandasViewState.location === 'ALL' ? 'selected' : ''}>Todas</option>
            <option value="WITH_TABLE" ${comandasViewState.location === 'WITH_TABLE' ? 'selected' : ''}>Com mesa</option>
            <option value="WITHOUT_TABLE" ${comandasViewState.location === 'WITHOUT_TABLE' ? 'selected' : ''}>Sem mesa</option>
          </select>
        </label>
        <label class="comandas-filter-field">
          <span>Ordenar</span>
          <select id="comandas-sort" class="input" onchange="updateComandasView()">
            <option value="RECENT" ${comandasViewState.sort === 'RECENT' ? 'selected' : ''}>Mais recentes</option>
            <option value="OLDEST" ${comandasViewState.sort === 'OLDEST' ? 'selected' : ''}>Mais antigas</option>
            <option value="TOTAL_DESC" ${comandasViewState.sort === 'TOTAL_DESC' ? 'selected' : ''}>Maior consumo</option>
          </select>
        </label>
      </div>

      <div id="comandas-results-container">
        ${renderComandasResults()}
      </div>
    </section>
  `;
}

function refreshComandasResults() {
  const container = document.getElementById('comandas-results-container');
  if (container) container.innerHTML = renderComandasResults();
}

function updateComandasView() {
  comandasViewState.search = document.getElementById('comandas-search')?.value || '';
  comandasViewState.status = document.getElementById('comandas-status-filter')?.value || 'OPEN';
  comandasViewState.location = document.getElementById('comandas-location-filter')?.value || 'ALL';
  comandasViewState.sort = document.getElementById('comandas-sort')?.value || 'RECENT';
  comandasViewState.page = 1;
  refreshComandasResults();
}

function setComandasPage(page) {
  comandasViewState.page = Number(page || 1);
  refreshComandasResults();
  document.getElementById('comandas-results-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadComandas() {
  const container = document.getElementById('comandas-grid-container');
  if (!container) return;

  if (!canPerformAction('manageTabs')) {
    container.innerHTML = `
      <section class="full-card comandas-consultation-only">
        <div>
          <div class="comandas-consultation-icon">🔎</div>
          <div class="card-title">Consultar comanda</div>
          <div class="card-subtitle">Leia o QR Code ou informe o código para conferir pedidos, pagamentos e situação de saída.</div>
        </div>
        <button class="btn-sm btn-primary" type="button" onclick="openComandaConsultation()">Consultar QR / código</button>
      </section>
    `;
    return;
  }

  try {
    const [openTabs, closedTabs, tables] = await Promise.all([
      api.get('/tables/tabs/open'),
      api.get('/tables/tabs/closed?limit=200'),
      api.get('/tables'),
    ]);
    comandasOpenTabsCache = Array.isArray(openTabs) ? openTabs : [];
    comandasClosedTabsCache = Array.isArray(closedTabs) ? closedTabs : [];
    comandasTablesCache = Array.isArray(tables) ? tables : [];

    container.innerHTML = `
      ${renderComandasStats(comandasOpenTabsCache)}
      ${renderComandasManager(comandasOpenTabsCache, comandasTablesCache)}
    `;
  } catch (error) {
    comandasOpenTabsCache = [];
    comandasClosedTabsCache = [];
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar comandas</h3><p>${escapeHTML(error.message)}</p></div>`;
  }
}

async function openNewTabFromPanel() {
  if (!canPerformAction('manageTabs')) {
    showToast('Seu perfil não pode abrir comandas.', 'error');
    return;
  }

  const phone = document.getElementById('tab-open-phone')?.value || '';
  const instagram = document.getElementById('tab-open-instagram')?.value || '';
  const tableId = document.getElementById('tab-open-table')?.value || '';

  try {
    const created = await api.post('/tables/tabs/open', {
      user_phone: phone,
      customer_instagram: instagram,
      table_id: tableId || undefined,
    });
    comandasViewState.page = 1;
    comandasViewState.sort = 'RECENT';
    showToast(`Comanda ${created.publicCode || created.id} aberta. Informe esse código ao cliente.`);
    await loadComandas();
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
  }
}

function openEditComandaCustomer(tabId) {
  const tab = comandasOpenTabsCache.find((item) => String(item.id) === String(tabId));
  if (!tab) {
    showToast('Comanda não encontrada na lista atual.', 'error');
    return;
  }

  openModal(`
    <div class="modal-header">
      <div>
        <h3>Identificar cliente</h3>
        <div class="comandas-modal-code">Comanda <strong class="mono">${escapeHTML(tab.publicCode || tab.id)}</strong></div>
      </div>
      <button class="modal-close" type="button" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="comandas-edit-customer-grid">
        <label class="comandas-field">
          <span>Telefone do cliente</span>
          <input id="tab-edit-phone" class="input" type="tel" inputmode="tel" value="${escapeHTML(tab.userPhone || '')}" placeholder="(11) 99999-9999">
        </label>
        <label class="comandas-field">
          <span>Instagram</span>
          <input id="tab-edit-instagram" class="input" type="text" value="${escapeHTML(tab.customerInstagram || '')}" placeholder="@usuario">
        </label>
      </div>
      <div class="comandas-edit-note">
        Telefone e Instagram não podem estar vinculados a outra comanda aberta deste restaurante.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" type="button" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" id="tab-edit-save" type="button" onclick="saveComandaCustomer('${escapeHTML(tab.id)}')">Salvar cliente</button>
    </div>
  `);
}

async function saveComandaCustomer(tabId) {
  const saveButton = document.getElementById('tab-edit-save');
  const phone = document.getElementById('tab-edit-phone')?.value || '';
  const instagram = document.getElementById('tab-edit-instagram')?.value || '';

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
  }

  try {
    await api.patch(`/tables/tabs/${tabId}/customer`, {
      user_phone: phone,
      customer_instagram: instagram,
    });
    closeModal();
    showToast('Dados do cliente atualizados.');
    await loadComandas();
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Salvar cliente';
    }
  }
}

function openEditComandaTable(tabId) {
  const tab = comandasOpenTabsCache.find((item) => String(item.id) === String(tabId));
  if (!tab) {
    showToast('Comanda não encontrada na lista atual.', 'error');
    return;
  }

  const tableOptions = [...comandasTablesCache]
    .sort((left, right) => String(left.number || '').localeCompare(String(right.number || ''), 'pt-BR', { numeric: true }))
    .map((table) => {
      const isSelected = String(table.id) === String(tab.tableId || '');
      const statusSuffix = String(table.status || '').toUpperCase() === 'OCCUPIED' ? ' · ocupada' : '';
      return `<option value="${escapeHTML(table.id)}" ${isSelected ? 'selected' : ''}>Mesa ${escapeHTML(formatComandaTableNumber(table.number))}${statusSuffix}</option>`;
    }).join('');

  openModal(`
    <div class="modal-header">
      <div>
        <h3>${tab.tableId ? 'Alterar mesa da comanda' : 'Vincular comanda a uma mesa'}</h3>
        <div class="comandas-modal-code">Comanda <strong class="mono">${escapeHTML(tab.publicCode || tab.id)}</strong></div>
      </div>
      <button class="modal-close" type="button" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <label class="comandas-field">
        <span>Mesa</span>
        <select id="tab-edit-table" class="input">
          <option value="">Sem mesa</option>
          ${tableOptions}
        </select>
      </label>
      <div class="comandas-edit-note">
        Vincular a comanda marca a mesa como ocupada. Ao remover ou trocar a mesa, ela só será liberada se não houver outra comanda aberta vinculada a ela.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" type="button" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" id="tab-edit-table-save" type="button" onclick="saveComandaTable('${escapeHTML(tab.id)}')">Salvar mesa</button>
    </div>
  `);
}

async function saveComandaTable(tabId) {
  const saveButton = document.getElementById('tab-edit-table-save');
  const tableId = document.getElementById('tab-edit-table')?.value || '';

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
  }

  try {
    const updated = await api.patch(`/tables/tabs/${tabId}/table`, {
      table_id: tableId || null,
    });
    closeModal();
    showToast(updated.tableNumber
      ? `Comanda vinculada à Mesa ${formatComandaTableNumber(updated.tableNumber)}.`
      : 'Comanda desvinculada da mesa.');
    await loadComandas();
  } catch (error) {
    showToast(`Erro ao alterar mesa: ${error.message}`, 'error');
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Salvar mesa';
    }
  }
}

function finalizeComandaFromPanel(tabId) {
  if (!canPerformAction('manageSettlement')) {
    showToast('Seu perfil não pode finalizar comandas.', 'error');
    return;
  }

  const tab = comandasOpenTabsCache.find((item) => String(item.id) === String(tabId));
  if (!tab) {
    showToast('Comanda não encontrada na lista atual.', 'error');
    return;
  }

  const total = Number(tab.total || 0);
  const paidAmount = Number(tab.paidAmount || 0);
  const outstanding = Math.max(0, total - paidAmount);

  openModal(`
    <div class="modal-header">
      <div>
        <h3>Finalizar comanda</h3>
        <div class="comandas-modal-code">Comanda <strong class="mono">${escapeHTML(tab.publicCode || tab.id)}</strong></div>
      </div>
      <button class="modal-close" type="button" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="comandas-finalize-summary">
        <div class="comandas-finalize-metric">
          <span>Total da comanda</span>
          <strong>${escapeHTML(formatCurrency(total))}</strong>
        </div>
        <div class="comandas-finalize-metric">
          <span>Já recebido</span>
          <strong>${escapeHTML(formatCurrency(paidAmount))}</strong>
        </div>
        <div class="comandas-finalize-metric comandas-finalize-metric--due">
          <span>Baixa a registrar</span>
          <strong>${escapeHTML(formatCurrency(outstanding))}</strong>
        </div>
      </div>
      <div class="comandas-finalize-note">
        <strong>Confira o pagamento antes de continuar.</strong>
        A confirmação registra a baixa manual, fecha esta comanda e libera a mesa quando não houver outra comanda aberta nela.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" type="button" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-danger" id="tab-finalize-confirm" type="button" onclick="confirmFinalizeComanda('${escapeHTML(tab.id)}')">Registrar baixa e finalizar</button>
    </div>
  `);
}

async function confirmFinalizeComanda(tabId) {
  if (!canPerformAction('manageSettlement')) {
    showToast('Seu perfil não pode finalizar comandas.', 'error');
    return;
  }

  const finalizeButton = document.getElementById('tab-finalize-confirm');
  if (finalizeButton?.disabled) return;

  const tab = comandasOpenTabsCache.find((item) => String(item.id) === String(tabId));
  if (!tab) {
    closeModal();
    showToast('Comanda não encontrada na lista atual.', 'error');
    return;
  }

  if (finalizeButton) {
    finalizeButton.disabled = true;
    finalizeButton.textContent = 'Finalizando...';
  }

  try {
    await api.post(`/tables/tabs/${tabId}/finalize`, {});
    showToast(`Comanda ${tab.publicCode || tab.id} finalizada.`);
    closeModal();
    await loadComandas();
  } catch (error) {
    showToast(`Erro ao finalizar: ${error.message}`, 'error');
    if (finalizeButton) {
      finalizeButton.disabled = false;
      finalizeButton.textContent = 'Registrar baixa e finalizar';
    }
  }
}

async function copyTabCode(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) return;

  try {
    await navigator.clipboard.writeText(normalizedCode);
    showToast(`Código ${normalizedCode} copiado.`);
  } catch (_error) {
    showToast(`Código da comanda: ${normalizedCode}`);
  }
}
