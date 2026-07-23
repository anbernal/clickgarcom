// Comandas Page
let comandasOpenTabsCache = [];

const COMANDAS_ICONS = {
  ticket: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  table: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16"/><path d="M5 10V6h14v4"/><path d="M6 10v10"/><path d="M18 10v10"/></svg>',
  noTable: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16"/><path d="M5 10V6h14v4"/><path d="M6 10v10"/><path d="M18 10v10"/><path d="m3 3 18 18"/></svg>',
  total: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
};

function formatComandaTableNumber(value) {
  const raw = String(value || '--').trim();
  return /^\d+$/.test(raw) ? raw.padStart(2, '0') : raw;
}

function formatComandaDateTime(dateStr) {
  if (!dateStr) return 'horário não informado';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'horário não informado';

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

function renderComandasManager(openTabs, tables) {
  return `
    <section class="full-card comandas-panel">
      <div class="comandas-panel-header">
        <div class="comandas-panel-heading">
          <div class="comandas-panel-icon">${COMANDAS_ICONS.ticket}</div>
          <div>
            <div class="card-title">Gerenciamento de comandas</div>
            <div class="card-subtitle">Abra uma comanda, entregue o código ao cliente e acompanhe o consumo.</div>
          </div>
        </div>
        <div class="comandas-count"><strong>${openTabs.length}</strong> aberta${openTabs.length === 1 ? '' : 's'}</div>
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
          O cliente pode vincular o próprio telefone depois, informando o código pelo WhatsApp.
        </div>
      </div>

      ${openTabs.length === 0 ? `
        <div class="comandas-empty">
          <div class="comandas-empty-icon">${COMANDAS_ICONS.ticket}</div>
          <div>
            <strong>Nenhuma comanda aberta</strong>
            <span>As novas comandas aparecerão aqui para consulta rápida.</span>
          </div>
        </div>
      ` : `
        <div class="comandas-list-heading">
          <span>Em atendimento</span>
          <span>Ordenadas pela abertura</span>
        </div>
        <div class="comandas-list">
          ${openTabs.map((tab) => `
            <article class="comanda-card">
              <div class="comanda-card-top">
                <div>
                  <div class="comanda-card-eyebrow">Código da comanda</div>
                  <div class="comanda-card-code mono">${escapeHTML(tab.publicCode || tab.id)}</div>
                </div>
                <span class="comanda-card-status"><span></span> Aberta</span>
              </div>

              <div class="comanda-card-meta">
                <div>
                  <span>Cliente</span>
                  <strong>${tab.userPhone ? escapeHTML(tab.userPhone) : (tab.customerInstagram ? escapeHTML(tab.customerInstagram) : 'Aguardando vínculo')}</strong>
                </div>
                <div>
                  <span>Local</span>
                  <strong>${tab.tableNumber ? `Mesa ${escapeHTML(formatComandaTableNumber(tab.tableNumber))}` : 'Sem mesa'}</strong>
                </div>
              </div>

              <div class="comanda-card-time">Aberta em ${escapeHTML(formatComandaDateTime(tab.openedAt))}</div>

              <div class="comanda-card-footer">
                <div>
                  <span>Total atual</span>
                  <strong>${escapeHTML(formatCurrency(tab.total || 0))}</strong>
                </div>
                <div class="comanda-card-actions">
                  <button class="btn-sm btn-outline" type="button" onclick="copyTabCode('${escapeHTML(tab.publicCode || tab.id)}')">${COMANDAS_ICONS.copy} Copiar</button>
                  <button class="btn-sm btn-primary" type="button" onclick="consultarComanda('${escapeHTML(tab.publicCode || tab.id)}'); navigate('consultaComanda')">Consultar</button>
                </div>
              </div>
            </article>
          `).join('')}
        </div>
      `}
    </section>
  `;
}

async function loadComandas() {
  const container = document.getElementById('comandas-grid-container');
  if (!container) return;

  try {
    const [openTabs, tables] = await Promise.all([
      api.get('/tables/tabs/open'),
      api.get('/tables'),
    ]);
    comandasOpenTabsCache = Array.isArray(openTabs) ? openTabs : [];
    const tableList = Array.isArray(tables) ? tables : [];

    container.innerHTML = `
      ${renderComandasStats(comandasOpenTabsCache)}
      ${renderComandasManager(comandasOpenTabsCache, tableList)}
    `;
  } catch (error) {
    comandasOpenTabsCache = [];
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
    showToast(`Comanda ${created.publicCode || created.id} aberta. Informe esse código ao cliente.`);
    await loadComandas();
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
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
