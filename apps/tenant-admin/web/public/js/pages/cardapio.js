// Cardapio Page

// ─── SVG ICONS ─────────────────────────────────────────────────
const CARDAPIO_ICONS = {
  utensils: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  pizza: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>',
  burger: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8"/><path d="M3 14h18"/><path d="M4 18h16a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z"/></svg>',
  drink: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 22 4-12"/><path d="m18 22-4-12"/><path d="M3 10h18"/><path d="M14 2a2 2 0 0 1 2 2v4H8V4a2 2 0 0 1 2-2"/></svg>',
  cake: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v2"/><path d="M12 8v2"/><path d="M17 8v2"/><path d="M7 4h0.01"/><path d="M12 4h0.01"/><path d="M17 4h0.01"/></svg>',
  salad: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.36 1.93 2.4 2.4 0 0 1-1.6 3.93"/></svg>',
  box: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  plus: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  kitchen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  bar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 22 4-12"/><path d="m18 22-4-12"/><path d="M3 10h18"/><path d="M14 2a2 2 0 0 1 2 2v4H8V4a2 2 0 0 1 2-2"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};
const CARDAPIO_WEEKDAYS = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terca' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sab', label: 'Sabado' },
];

let cardapioCategories = [];
let cardapioItems = [];
let cardapioOptionGroupCounter = 0;
let cardapioOptionRowCounter = 0;
let cardapioComboRowCounter = 0;

async function loadCardapio() {
  const container = document.getElementById('page-cardapio');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando cardapio...</div>';

  try {
    const [items, categories] = await Promise.all([
      api.get('/menu'),
      api.get('/categories'),
    ]);

    cardapioItems = items || [];
    cardapioCategories = categories || [];

    renderCardapio();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="icon" style="color:#ef4444">${CARDAPIO_ICONS.alert}</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function renderCardapio(filterCatId = null, search = '') {
  const container = document.getElementById('page-cardapio');
  const canManageMenu = canPerformAction('manageMenu');

  let filtered = cardapioItems;
  if (filterCatId) {
    filtered = filtered.filter((item) => item.categoryId === filterCatId);
  }
  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter((item) => (
      item.name.toLowerCase().includes(term)
      || (item.description || '').toLowerCase().includes(term)
      || (item.whatsappShortDescription || '').toLowerCase().includes(term)
      || (item.configurationSummary || '').toLowerCase().includes(term)
    ));
  }

  const categorySvgs = {
    Pizzas: CARDAPIO_ICONS.pizza,
    'Hambúrgueres': CARDAPIO_ICONS.burger,
    Bebidas: CARDAPIO_ICONS.drink,
    Sobremesas: CARDAPIO_ICONS.cake,
    Entradas: CARDAPIO_ICONS.salad,
  };

  const getSvg = (item) => {
    if (item.category) return categorySvgs[item.category.name] || CARDAPIO_ICONS.utensils;
    return item.itemType === 'COMBO' ? CARDAPIO_ICONS.box : CARDAPIO_ICONS.utensils;
  };

  const getBg = (item) => {
    const name = item.category?.name;
    const map = { Pizzas: '#fff7ed', 'Hambúrgueres': '#fff7ed', Bebidas: '#f0fdf4', Sobremesas: '#fef2f2', Entradas: '#eff6ff' };
    return item.itemType === 'COMBO' ? '#eef2ff' : (map[name] || '#f0f2f5');
  };

  const renderItemThumb = (item) => {
    if (item.imageUrl) {
      return `<div class="menu-img" style="background-image:url('${escapeHTML(item.imageUrl)}');background-size:cover;background-position:center"></div>`;
    }
    return `<div class="menu-img" style="background:${getBg(item)};display:flex;align-items:center;justify-content:center;color:var(--muted)">${getSvg(item)}</div>`;
  };

  container.innerHTML = `
    <div class="full-card">
      <div class="card-header">
        <div>
          <div class="card-title">Gestao de Cardapio</div>
          <div class="card-subtitle">${canManageMenu ? 'Itens com estoque, janela de venda, opcionais e estrutura de combos' : 'Visualizacao em modo leitura para seu perfil atual'}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div class="search-box">
            <span>${CARDAPIO_ICONS.search}</span>
            <input type="text" placeholder="Buscar item..." id="cardapio-search" value="${escapeHTML(search)}">
          </div>
          ${canManageMenu ? '<button class="btn-sm btn-dark" onclick="openMenuItemModal()">+ Novo Item</button>' : ''}
        </div>
      </div>
      <div class="cat-tags" id="cardapio-cat-tags">
        <div class="cat-tag ${!filterCatId ? 'active' : ''}" data-cat="">Todos</div>
        ${cardapioCategories.map((category) => `
          <div class="cat-tag ${filterCatId === category.id ? 'active' : ''}" data-cat="${category.id}">${escapeHTML(category.name)}</div>
        `).join('')}
      </div>
      <div class="menu-grid">
        ${filtered.map((item) => renderCardapioItemCard(item, canManageMenu, renderItemThumb)).join('')}
        ${canManageMenu ? `
          <div class="menu-card" style="border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;min-height:160px" onclick="openMenuItemModal()">
            <div style="text-align:center;color:var(--muted)">
              <div style="display:flex;justify-content:center">${CARDAPIO_ICONS.plus}</div>
              <div style="font-size:13px;font-weight:600;margin-top:6px">Novo Item</div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('cardapio-search').addEventListener('input', (event) => {
    renderCardapio(filterCatId, event.target.value);
  });

  document.querySelectorAll('#cardapio-cat-tags .cat-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const categoryId = tag.dataset.cat || null;
      renderCardapio(categoryId, document.getElementById('cardapio-search')?.value || '');
    });
  });
}

function renderCardapioItemCard(item, canManageMenu, renderItemThumb) {
  const availabilityMeta = getCardapioAvailabilityMeta(item);
  const stockSummary = buildCardapioStockSummary(item);
  const scheduleSummary = buildCardapioScheduleSummary(item);
  const typeMeta = item.itemType === 'COMBO'
    ? { label: 'Combo', cls: 'status-pending' }
    : { label: 'Item simples', cls: 'status-done' };

  return `
    <div class="menu-card">
      ${renderItemThumb(item)}
      ${canManageMenu ? `
        <div class="menu-actions">
          <button class="btn-sm" onclick="event.stopPropagation();openMenuItemModal('${item.id}')">${CARDAPIO_ICONS.edit}</button>
          <button class="btn-sm" onclick="event.stopPropagation();deleteMenuItem('${item.id}')">${CARDAPIO_ICONS.trash}</button>
        </div>
      ` : ''}
      <div class="menu-body">
        <div class="menu-name">${escapeHTML(item.name)}</div>
        <div class="menu-cat">${escapeHTML(item.category ? item.category.name : 'Sem categoria')}${item.whatsappShortName ? ' · ' + escapeHTML(item.whatsappShortName) : ''}</div>
        <div class="menu-price">${escapeHTML(formatCurrency(item.price))}${item.costPrice !== null && item.costPrice !== undefined ? `<span style="font-size:11px;font-weight:500;color:var(--muted);margin-left:8px">margem ${escapeHTML(formatCurrency(Number(item.price || 0) - Number(item.costPrice || 0)))}</span>` : ''}</div>
        <div class="menu-pills">
          <span class="status-pill ${availabilityMeta.cls}">${escapeHTML(availabilityMeta.label)}</span>
          <span class="status-pill ${typeMeta.cls}">${escapeHTML(typeMeta.label)}</span>
          ${!item.available ? '<span class="status-pill status-canceled">Inativo</span>' : ''}
        </div>
        <div class="menu-details">
          <div>${escapeHTML(stockSummary)}</div>
          <div>${escapeHTML(scheduleSummary)}</div>
          <div>${escapeHTML(item.configurationSummary || '')}</div>
          ${item.unavailableReason ? `<div style="color:#b45309">${escapeHTML(item.unavailableReason)}</div>` : ''}
        </div>
        <div class="menu-footer">
          <div style="font-size:11px;color:var(--muted)">${escapeHTML(item.destination === 'BAR' ? 'Bar' : 'Cozinha')}</div>
          <div style="font-size:11px;color:var(--muted)">${escapeHTML(item.whatsappShortDescription || item.description || '').substring(0, 40)}${(item.whatsappShortDescription || item.description || '').length > 40 ? '...' : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function openMenuItemModal(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardapio.', 'error');
    return;
  }

  const item = itemId ? cardapioItems.find((entry) => entry.id === itemId) : null;
  const isEdit = !!item;
  const scheduleWindows = normalizeCardapioAvailabilityWindows(item?.availabilityWindows);
  const stockTracked = item?.trackStock === true;
  const scheduleEnabled = scheduleWindows.length > 0;
  const itemType = normalizeCardapioItemType(item?.itemType);
  const optionGroups = normalizeCardapioOptionGroups(item?.optionGroups);
  const comboComponents = normalizeCardapioComboComponents(item?.comboComponents);

  openModal(`
    <div class="modal-header">
      <div>
        <h3>${isEdit ? 'Editar Item' : 'Novo Item do Cardápio'}</h3>
        <div class="modal-header-subtitle">${isEdit ? 'Atualize as informações abaixo. Campos marcados como obrigatórios precisam estar preenchidos.' : 'Preencha as informações do produto. Você pode ajustar tudo depois — comece pelo essencial.'}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">

      <div class="form-section">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">1 · Identificação</div>
            <div class="form-section-subtitle">Como o item aparece para o cliente e para a equipe.</div>
          </div>
        </div>
        <div class="form-group">
          <div class="field-label-row">
            <label>Nome do item</label>
            <span class="field-badge field-badge--required">Obrigatório</span>
          </div>
          <input type="text" id="mi-name" value="${item ? escapeHTML(item.name) : ''}" placeholder="Ex: Pizza Margherita">
          <div class="field-hint">Use o nome completo, como o cliente verá no menu impresso ou digital.</div>
        </div>
        <div class="form-group">
          <div class="field-label-row">
            <label>Descrição</label>
            <span class="field-badge field-badge--optional">Opcional</span>
          </div>
          <textarea id="mi-description" placeholder="Ex: Massa fina, molho de tomate italiano, mussarela de búfala e manjericão fresco.">${item ? escapeHTML(item.description) || '' : ''}</textarea>
          <div class="field-hint">Texto mais longo, exibido em telas com mais espaço.</div>
        </div>
        <div class="form-group">
          <div class="field-label-row">
            <label>Imagem do item (URL)</label>
            <span class="field-badge field-badge--optional">Opcional</span>
          </div>
          <input type="url" id="mi-image-url" value="${item ? escapeHTML(item.imageUrl || '') : ''}" placeholder="https://exemplo.com/foto-do-item.jpg">
          <div class="field-hint">Aparece no preview ilustrativo enviado pelo WhatsApp. Use links públicos (não funciona com arquivos locais).</div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">2 · Preço e categorização</div>
            <div class="form-section-subtitle">Quanto custa para o cliente, o seu custo e onde o item aparece no cardápio.</div>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <div class="field-label-row">
              <label>Preço de venda (R$)</label>
              <span class="field-badge field-badge--required">Obrigatório</span>
            </div>
            <input type="number" step="0.01" id="mi-price" value="${item ? item.price : ''}" placeholder="0,00">
            <div class="field-hint">Valor cobrado do cliente, sem desconto.</div>
          </div>
          <div class="form-group">
            <div class="field-label-row">
              <label>Custo base (R$)</label>
              <span class="field-badge field-badge--optional">Opcional</span>
            </div>
            <input type="number" step="0.01" id="mi-cost-price" value="${item && item.costPrice !== null && item.costPrice !== undefined ? item.costPrice : ''}" placeholder="0,00">
            <div class="field-hint">Quanto o item custa para você. Usado nos relatórios de margem e no ranking gerencial.</div>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Categoria</label>
            <select id="mi-category">
              <option value="">Sem categoria</option>
              ${cardapioCategories.map((category) => `<option value="${category.id}" ${item && item.categoryId === category.id ? 'selected' : ''}>${escapeHTML(category.name)}</option>`).join('')}
            </select>
            <div class="field-hint">Agrupa o item no cardápio. Itens sem categoria aparecem no final.</div>
          </div>
          <div class="form-group">
            <label>Ordem de exibição</label>
            <input type="number" id="mi-display-order" value="${item?.displayOrder ?? 0}" min="0">
            <div class="field-hint">Menores aparecem antes. Use 0 para deixar o sistema decidir.</div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">3 · Operação na cozinha / bar</div>
            <div class="form-section-subtitle">Define para onde o pedido é roteado e o que esperar do preparo.</div>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Destino do pedido</label>
            <select id="mi-destination">
              <option value="KITCHEN" ${item && item.destination === 'KITCHEN' ? 'selected' : ''}>Cozinha</option>
              <option value="BAR" ${item && item.destination === 'BAR' ? 'selected' : ''}>Bar</option>
            </select>
            <div class="field-hint">Define em qual KDS o pedido aparece.</div>
          </div>
          <div class="form-group">
            <label>Tempo de preparo (min)</label>
            <input type="number" id="mi-prep" value="${item ? item.prepTimeMinutes : 15}" min="0">
            <div class="field-hint">Tempo médio estimado. Aparece no KDS e nos avisos ao cliente.</div>
          </div>
          <div class="form-group">
            <label>Tipo do item</label>
            <select id="mi-item-type">
              <option value="STANDARD" ${itemType === 'STANDARD' ? 'selected' : ''}>Item simples</option>
              <option value="COMBO" ${itemType === 'COMBO' ? 'selected' : ''}>Combo (vários itens)</option>
            </select>
            <div class="field-hint">Combos permitem agrupar outros itens em um único pedido.</div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">4 · Apresentação no WhatsApp</div>
            <div class="form-section-subtitle">Versões curtas usadas no atendimento automatizado e listagens rápidas.</div>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <div class="field-label-row">
              <label>Nome curto</label>
              <span class="field-badge field-badge--optional">Opcional</span>
            </div>
            <input type="text" id="mi-whatsapp-short-name" value="${item ? escapeHTML(item.whatsappShortName || '') : ''}" placeholder="Ex: Burger Grande">
            <div class="field-hint">Versão enxuta do nome, ideal para listas.</div>
          </div>
          <div class="form-group">
            <div class="field-label-row">
              <label>Descrição curta</label>
              <span class="field-badge field-badge--optional">Opcional</span>
            </div>
            <input type="text" id="mi-whatsapp-short-description" value="${item ? escapeHTML(item.whatsappShortDescription || '') : ''}" placeholder="Ex: R$ 35,00 · Pão brioche, carne 180g">
            <div class="field-hint">Aparece junto ao nome no WhatsApp. Use até 1 linha.</div>
          </div>
        </div>
      </div>

      <div class="form-section form-section--soft">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">5 · Disponibilidade operacional</div>
            <div class="form-section-subtitle">Controle se o item está liberado, com estoque ou apenas em determinados horários.</div>
          </div>
        </div>

        <label class="toggle-row" for="mi-available">
          <input type="checkbox" id="mi-available" ${item ? (item.available ? 'checked' : '') : 'checked'}>
          <span class="toggle-row-text">
            <span class="toggle-row-title">Item liberado no cardápio</span>
            <span class="toggle-row-hint">Desligue apenas quando quiser tirar o item de circulação manualmente (ex: acabou o ingrediente).</span>
          </span>
        </label>

        <label class="toggle-row" for="mi-track-stock">
          <input type="checkbox" id="mi-track-stock" ${stockTracked ? 'checked' : ''}>
          <span class="toggle-row-text">
            <span class="toggle-row-title">Controlar estoque simples</span>
            <span class="toggle-row-hint">Quando ativo, o sistema desconta automaticamente o estoque a cada venda.</span>
          </span>
        </label>

        <div id="mi-stock-fields" style="${stockTracked ? '' : 'display:none;'};margin-top:6px">
          <div class="form-row-2">
            <div class="form-group">
              <label>Quantidade em estoque</label>
              <input type="number" id="mi-stock-quantity" min="0" value="${stockTracked ? (item?.stockQuantity ?? 0) : 0}">
            </div>
            <div class="form-group">
              <label>Alerta de estoque baixo</label>
              <input type="number" id="mi-low-stock-threshold" min="0" value="${stockTracked && item?.lowStockThreshold !== null && item?.lowStockThreshold !== undefined ? item.lowStockThreshold : 3}">
              <div class="field-hint">Você recebe um alerta quando o estoque cair abaixo desse valor.</div>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top:10px;margin-bottom:0">
          <label>Janela de venda</label>
          <select id="mi-schedule-mode">
            <option value="ALWAYS" ${scheduleEnabled ? '' : 'selected'}>Sempre disponível</option>
            <option value="CUSTOM" ${scheduleEnabled ? 'selected' : ''}>Somente em horários específicos</option>
          </select>
          <div class="field-hint">Use horários específicos para itens vendidos apenas em certas faixas (almoço, happy hour). Horários que cruzam a meia-noite são aceitos.</div>
        </div>
        <div id="mi-schedule-fields" style="${scheduleEnabled ? '' : 'display:none;'};margin-top:12px">
          ${renderCardapioScheduleRows(scheduleWindows)}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">6 · Opcionais e complementos</div>
            <div class="form-section-subtitle">Monte grupos como tamanho, ponto da carne, molhos ou acompanhamentos. Útil quando o cliente personaliza o pedido.</div>
          </div>
          <button class="btn-sm btn-outline" type="button" onclick="addCardapioOptionGroup()">+ Grupo</button>
        </div>
        <div id="mi-option-groups-list">
          ${renderCardapioOptionGroups(optionGroups)}
        </div>
      </div>

      <div id="mi-combo-components-wrap" class="form-section" style="${itemType === 'COMBO' ? '' : 'display:none;'}">
        <div class="form-section-head">
          <div class="form-section-head-text">
            <div class="form-section-title">7 · Componentes do combo</div>
            <div class="form-section-subtitle">Defina quais itens compõem o combo e em que quantidade. Os componentes seguem o estoque dos itens originais.</div>
          </div>
          <button class="btn-sm btn-outline" type="button" onclick="addCardapioComboComponent()">+ Componente</button>
        </div>
        <div id="mi-combo-components-list">
          ${renderCardapioComboComponents(item?.id || '', comboComponents)}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" onclick="saveMenuItem('${itemId || ''}')">${isEdit ? 'Salvar alterações' : 'Criar item'}</button>
    </div>
  `, { size: 'lg' });

  bindCardapioModalInteractions(item?.id || '');
}

function bindCardapioModalInteractions(currentItemId) {
  const stockCheckbox = document.getElementById('mi-track-stock');
  const stockFields = document.getElementById('mi-stock-fields');
  const scheduleMode = document.getElementById('mi-schedule-mode');
  const scheduleFields = document.getElementById('mi-schedule-fields');
  const itemTypeSelect = document.getElementById('mi-item-type');
  const comboWrap = document.getElementById('mi-combo-components-wrap');

  if (stockCheckbox && stockFields) {
    stockCheckbox.addEventListener('change', () => {
      stockFields.style.display = stockCheckbox.checked ? '' : 'none';
    });
  }

  if (scheduleMode && scheduleFields) {
    scheduleMode.addEventListener('change', () => {
      scheduleFields.style.display = scheduleMode.value === 'CUSTOM' ? '' : 'none';
    });
  }

  if (itemTypeSelect && comboWrap) {
    itemTypeSelect.addEventListener('change', () => {
      const isCombo = itemTypeSelect.value === 'COMBO';
      comboWrap.style.display = isCombo ? '' : 'none';
      if (isCombo && !document.querySelector('.mi-combo-component-row')) {
        addCardapioComboComponent(currentItemId);
      }
    });
  }
}

function renderCardapioScheduleRows(windows) {
  const draftMap = new Map(windows.map((window) => [Number(window.dayOfWeek), window]));
  return CARDAPIO_WEEKDAYS.map((day) => {
    const current = draftMap.get(day.value);
    return `
      <div class="form-row-2 menu-availability-row" data-day="${day.value}" style="align-items:center;margin-bottom:8px">
        <div class="form-group" style="margin-bottom:0">
          <label style="display:flex;align-items:center;gap:10px;font-weight:600">
            <input type="checkbox" class="mi-schedule-enabled" ${current ? 'checked' : ''}>
            ${day.label}
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <input type="time" class="mi-schedule-start" value="${current?.startTime || '18:00'}">
          <input type="time" class="mi-schedule-end" value="${current?.endTime || '23:00'}">
        </div>
      </div>
    `;
  }).join('');
}

function addCardapioOptionGroup(group = null) {
  const list = document.getElementById('mi-option-groups-list');
  if (!list) return;
  if (!list.querySelector('.mi-option-group')) {
    list.innerHTML = '';
  }
  list.insertAdjacentHTML('beforeend', renderCardapioOptionGroup(group));
}

function removeCardapioOptionGroup(groupKey) {
  document.querySelector(`.mi-option-group[data-group-key="${groupKey}"]`)?.remove();
}

function addCardapioOptionRow(groupKey, option = null) {
  const list = document.getElementById(`mi-option-list-${groupKey}`);
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderCardapioOptionRow(groupKey, option));
}

function removeCardapioOptionRow(optionKey) {
  document.querySelector(`.mi-option-row[data-option-key="${optionKey}"]`)?.remove();
}

function renderCardapioOptionGroups(groups) {
  if (!groups.length) {
    return '<div style="font-size:12px;color:var(--muted)">Nenhum grupo criado ainda.</div>';
  }
  return groups.map((group) => renderCardapioOptionGroup(group)).join('');
}

function renderCardapioOptionGroup(group = null) {
  cardapioOptionGroupCounter += 1;
  const groupKey = `g${cardapioOptionGroupCounter}`;
  const options = group?.options?.length ? group.options : [null];

  return `
    <div class="mi-option-group" data-group-key="${groupKey}" style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;background:rgba(248,250,252,0.9)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Grupo de Opcionais</div>
        <button class="btn-sm btn-outline" type="button" onclick="removeCardapioOptionGroup('${groupKey}')">Remover grupo</button>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Nome do grupo</label>
          <input type="text" class="mi-og-name" value="${escapeHTML(group?.name || '')}" placeholder="Ex: Escolha o molho">
        </div>
        <div class="form-group">
          <label>Descricao do grupo</label>
          <input type="text" class="mi-og-description" value="${escapeHTML(group?.description || '')}" placeholder="Opcional">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:10px;font-weight:600">
            <input type="checkbox" class="mi-og-required" ${group?.required ? 'checked' : ''}>
            Grupo obrigatorio
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label>Minimo</label>
            <input type="number" min="0" class="mi-og-min" value="${group?.minSelect ?? 0}">
          </div>
          <div class="form-group">
            <label>Maximo</label>
            <input type="number" min="1" class="mi-og-max" value="${group?.maxSelect ?? Math.max(options.length, 1)}">
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary)">Opcoes do grupo</div>
        <button class="btn-sm btn-outline" type="button" onclick="addCardapioOptionRow('${groupKey}')">+ Opcao</button>
      </div>
      <div id="mi-option-list-${groupKey}">
        ${options.map((option) => renderCardapioOptionRow(groupKey, option)).join('')}
      </div>
    </div>
  `;
}

function renderCardapioOptionRow(groupKey, option = null) {
  cardapioOptionRowCounter += 1;
  const optionKey = `o${cardapioOptionRowCounter}`;

  return `
    <div class="mi-option-row" data-option-key="${optionKey}" style="border:1px dashed var(--border);border-radius:12px;padding:12px;margin-bottom:10px;background:#fff">
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px 120px auto;gap:10px;align-items:end">
        <div class="form-group" style="margin-bottom:0">
          <label>Nome</label>
          <input type="text" class="mi-option-name" value="${escapeHTML(option?.name || '')}" placeholder="Ex: Queijo extra">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Valor extra</label>
          <input type="number" step="0.01" min="0" class="mi-option-price" value="${option?.priceDelta ?? 0}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Status</label>
          <select class="mi-option-available">
            <option value="true" ${option?.available !== false ? 'selected' : ''}>Ativo</option>
            <option value="false" ${option?.available === false ? 'selected' : ''}>Inativo</option>
          </select>
        </div>
        <button class="btn-sm btn-outline" type="button" onclick="removeCardapioOptionRow('${optionKey}')">Remover</button>
      </div>
      <div class="form-group" style="margin-top:10px;margin-bottom:0">
        <label>Descricao curta</label>
        <input type="text" class="mi-option-description" value="${escapeHTML(option?.description || '')}" placeholder="Opcional">
      </div>
    </div>
  `;
}

function addCardapioComboComponent(currentItemId, component = null) {
  const list = document.getElementById('mi-combo-components-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderCardapioComboComponentRow(currentItemId, component));
}

function removeCardapioComboComponent(rowKey) {
  document.querySelector(`.mi-combo-component-row[data-row-key="${rowKey}"]`)?.remove();
}

function renderCardapioComboComponents(currentItemId, components) {
  if (!components.length) {
    return renderCardapioComboComponentRow(currentItemId, null);
  }
  return components.map((component) => renderCardapioComboComponentRow(currentItemId, component)).join('');
}

function renderCardapioComboComponentRow(currentItemId, component = null) {
  cardapioComboRowCounter += 1;
  const rowKey = `c${cardapioComboRowCounter}`;
  const options = cardapioItems
    .filter((item) => item.id !== currentItemId)
    .map((item) => `<option value="${item.id}" ${component?.menuItemId === item.id ? 'selected' : ''}>${escapeHTML(item.name)} · ${escapeHTML(formatCurrency(item.price))}</option>`)
    .join('');

  return `
    <div class="mi-combo-component-row" data-row-key="${rowKey}" style="display:grid;grid-template-columns:minmax(0,1fr) 120px auto;gap:10px;align-items:end;padding:12px;border:1px dashed var(--border);border-radius:12px;margin-bottom:10px;background:rgba(248,250,252,0.9)">
      <div class="form-group" style="margin-bottom:0">
        <label>Item do combo</label>
        <select class="mi-combo-item-id">
          <option value="">Selecione um item</option>
          ${options}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label>Quantidade</label>
        <input type="number" min="1" class="mi-combo-quantity" value="${component?.quantity ?? 1}">
      </div>
      <button class="btn-sm btn-outline" type="button" onclick="removeCardapioComboComponent('${rowKey}')">Remover</button>
    </div>
  `;
}

async function saveMenuItem(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardapio.', 'error');
    return;
  }

  const trackStock = document.getElementById('mi-track-stock').checked;
  const scheduleMode = document.getElementById('mi-schedule-mode').value;
  const itemType = normalizeCardapioItemType(document.getElementById('mi-item-type').value);
  const availabilityWindows = scheduleMode === 'CUSTOM' ? collectCardapioAvailabilityWindows() : [];
  if (availabilityWindows === null) {
    return;
  }

  const optionGroups = collectCardapioOptionGroups();
  if (optionGroups === null) {
    return;
  }

  const comboComponents = itemType === 'COMBO' ? collectCardapioComboComponents() : [];
  if (comboComponents === null) {
    return;
  }

  const stockQuantityRaw = document.getElementById('mi-stock-quantity').value;
  const lowStockThresholdRaw = document.getElementById('mi-low-stock-threshold').value;
  const data = {
    name: document.getElementById('mi-name').value.trim(),
    description: document.getElementById('mi-description').value.trim() || null,
    price: parseFloat(document.getElementById('mi-price').value),
    cost_price: document.getElementById('mi-cost-price').value === '' ? null : parseFloat(document.getElementById('mi-cost-price').value),
    category_id: document.getElementById('mi-category').value || null,
    destination: document.getElementById('mi-destination').value,
    prep_time_minutes: parseInt(document.getElementById('mi-prep').value, 10) || 15,
    image_url: document.getElementById('mi-image-url').value.trim() || null,
    whatsapp_short_name: document.getElementById('mi-whatsapp-short-name').value.trim() || null,
    whatsapp_short_description: document.getElementById('mi-whatsapp-short-description').value.trim() || null,
    available: document.getElementById('mi-available').checked,
    item_type: itemType,
    track_stock: trackStock,
    stock_quantity: trackStock ? parseInt(stockQuantityRaw || '0', 10) : null,
    low_stock_threshold: trackStock ? (lowStockThresholdRaw === '' ? null : parseInt(lowStockThresholdRaw, 10)) : null,
    availability_windows: availabilityWindows,
    option_groups: optionGroups,
    combo_components: comboComponents,
    display_order: parseInt(document.getElementById('mi-display-order').value, 10) || 0,
  };

  if (!data.name || Number.isNaN(data.price)) {
    showToast('Nome e preco sao obrigatorios', 'error');
    return;
  }

  if (data.cost_price !== null && Number.isNaN(data.cost_price)) {
    showToast('Custo base invalido', 'error');
    return;
  }

  if (trackStock && (Number.isNaN(data.stock_quantity) || data.stock_quantity < 0)) {
    showToast('Quantidade em estoque invalida', 'error');
    return;
  }

  if (trackStock && data.low_stock_threshold !== null && (Number.isNaN(data.low_stock_threshold) || data.low_stock_threshold < 0)) {
    showToast('Alerta de estoque baixo invalido', 'error');
    return;
  }

  try {
    if (itemId) {
      await api.put(`/menu/${itemId}`, data);
      showToast('Item atualizado com sucesso');
    } else {
      await api.post('/menu', data);
      showToast('Item criado com sucesso');
    }
    closeModal();
    loadCardapio();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

function collectCardapioAvailabilityWindows() {
  const rows = Array.from(document.querySelectorAll('.menu-availability-row'));
  const windows = [];

  for (const row of rows) {
    const enabled = row.querySelector('.mi-schedule-enabled')?.checked;
    if (!enabled) {
      continue;
    }

    const startTime = row.querySelector('.mi-schedule-start')?.value || '';
    const endTime = row.querySelector('.mi-schedule-end')?.value || '';
    if (!startTime || !endTime) {
      showToast('Preencha inicio e fim de cada faixa horaria ativa.', 'error');
      return null;
    }

    if (startTime === endTime) {
      showToast('Horarios de inicio e fim nao podem ser iguais na mesma faixa.', 'error');
      return null;
    }

    windows.push({
      day_of_week: Number(row.dataset.day),
      start_time: startTime,
      end_time: endTime,
    });
  }

  if (windows.length === 0) {
    showToast('Ative pelo menos um dia ao usar horario especifico.', 'error');
    return null;
  }

  return windows;
}

function collectCardapioOptionGroups() {
  const groups = [];
  const groupNodes = Array.from(document.querySelectorAll('.mi-option-group'));

  for (const groupNode of groupNodes) {
    const name = groupNode.querySelector('.mi-og-name')?.value.trim() || '';
    const description = groupNode.querySelector('.mi-og-description')?.value.trim() || '';
    const required = groupNode.querySelector('.mi-og-required')?.checked === true;
    const minSelect = parseInt(groupNode.querySelector('.mi-og-min')?.value || '0', 10);
    const maxSelect = parseInt(groupNode.querySelector('.mi-og-max')?.value || '1', 10);
    const options = [];
    const optionNodes = Array.from(groupNode.querySelectorAll('.mi-option-row'));

    for (const optionNode of optionNodes) {
      const optionName = optionNode.querySelector('.mi-option-name')?.value.trim() || '';
      const optionDescription = optionNode.querySelector('.mi-option-description')?.value.trim() || '';
      const optionPrice = parseFloat(optionNode.querySelector('.mi-option-price')?.value || '0');
      const optionAvailable = optionNode.querySelector('.mi-option-available')?.value !== 'false';

      if (!optionName && !optionDescription && Number(optionPrice || 0) === 0) {
        continue;
      }

      if (!optionName) {
        showToast('Toda opcao precisa ter um nome.', 'error');
        return null;
      }

      if (Number.isNaN(optionPrice) || optionPrice < 0) {
        showToast('Valor adicional invalido em um dos opcionais.', 'error');
        return null;
      }

      options.push({
        name: optionName,
        description: optionDescription || null,
        price_delta: optionPrice,
        available: optionAvailable,
        display_order: options.length,
      });
    }

    if (!name && options.length === 0 && !description) {
      continue;
    }

    if (!name) {
      showToast('Todo grupo de opcionais precisa ter um nome.', 'error');
      return null;
    }

    if (options.length === 0) {
      showToast(`O grupo "${name}" precisa ter pelo menos uma opcao.`, 'error');
      return null;
    }

    if (Number.isNaN(minSelect) || minSelect < 0 || Number.isNaN(maxSelect) || maxSelect < 1 || maxSelect < minSelect) {
      showToast(`Limites invalidos no grupo "${name}".`, 'error');
      return null;
    }

    groups.push({
      name,
      description: description || null,
      required,
      min_select: required && minSelect === 0 ? 1 : minSelect,
      max_select: maxSelect,
      display_order: groups.length,
      options,
    });
  }

  return groups;
}

function collectCardapioComboComponents() {
  const rows = Array.from(document.querySelectorAll('.mi-combo-component-row'));
  const components = [];

  for (const row of rows) {
    const menuItemId = row.querySelector('.mi-combo-item-id')?.value || '';
    const quantity = parseInt(row.querySelector('.mi-combo-quantity')?.value || '1', 10);

    if (!menuItemId) {
      continue;
    }

    if (Number.isNaN(quantity) || quantity < 1) {
      showToast('Quantidade invalida em um dos componentes do combo.', 'error');
      return null;
    }

    components.push({
      menu_item_id: menuItemId,
      quantity,
      display_order: components.length,
    });
  }

  if (components.length === 0) {
    showToast('Todo combo precisa ter pelo menos um componente.', 'error');
    return null;
  }

  return components;
}

function normalizeCardapioItemType(value) {
  return String(value || 'STANDARD').trim().toUpperCase() === 'COMBO' ? 'COMBO' : 'STANDARD';
}

function normalizeCardapioAvailabilityWindows(windows) {
  if (!Array.isArray(windows)) {
    return [];
  }

  return windows
    .map((window) => ({
      dayOfWeek: Number(window.dayOfWeek ?? window.day_of_week),
      startTime: String(window.startTime ?? window.start_time ?? '').slice(0, 5),
      endTime: String(window.endTime ?? window.end_time ?? '').slice(0, 5),
    }))
    .filter((window) => Number.isInteger(window.dayOfWeek) && window.dayOfWeek >= 0 && window.dayOfWeek <= 6 && window.startTime && window.endTime)
    .sort((left, right) => {
      if (left.dayOfWeek === right.dayOfWeek) {
        return left.startTime.localeCompare(right.startTime);
      }
      return left.dayOfWeek - right.dayOfWeek;
    });
}

function normalizeCardapioOptionGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups
    .map((group) => ({
      name: String(group.name || '').trim(),
      description: String(group.description || '').trim(),
      required: group.required === true,
      minSelect: Number(group.minSelect ?? group.min_select ?? 0),
      maxSelect: Number(group.maxSelect ?? group.max_select ?? 1),
      options: Array.isArray(group.options)
        ? group.options.map((option) => ({
          name: String(option.name || '').trim(),
          description: String(option.description || '').trim(),
          priceDelta: Number(option.priceDelta ?? option.price_delta ?? 0),
          available: option.available !== false,
        }))
        : [],
    }))
    .filter((group) => group.name);
}

function normalizeCardapioComboComponents(components) {
  if (!Array.isArray(components)) {
    return [];
  }

  return components
    .map((component) => ({
      menuItemId: String(component.menuItemId ?? component.menu_item_id ?? '').trim(),
      menuItemName: String(component.menuItemName ?? component.menu_item_name ?? '').trim(),
      quantity: Number(component.quantity || 1),
    }))
    .filter((component) => component.menuItemId);
}

function getCardapioAvailabilityMeta(item) {
  switch (item.currentAvailabilityStatus) {
    case 'low_stock':
      return { label: item.currentAvailabilityLabel || 'Estoque baixo', cls: 'status-pending' };
    case 'out_of_stock':
      return { label: item.currentAvailabilityLabel || 'Sem estoque', cls: 'status-canceled' };
    case 'scheduled_unavailable':
      return { label: item.currentAvailabilityLabel || 'Fora do horario', cls: 'status-pending' };
    case 'manual_inactive':
      return { label: item.currentAvailabilityLabel || 'Inativo manual', cls: 'status-canceled' };
    default:
      return { label: item.currentAvailabilityLabel || 'Ativo agora', cls: 'status-done' };
  }
}

function buildCardapioStockSummary(item) {
  if (item.stockLabel) {
    return item.stockLabel;
  }

  if (!item.trackStock) {
    return 'Controle de estoque desligado';
  }

  const quantity = Number(item.stockQuantity ?? 0);
  if (item.lowStockThreshold !== null && item.lowStockThreshold !== undefined) {
    return `Estoque atual: ${quantity} · alerta em ${item.lowStockThreshold}`;
  }
  return `Estoque atual: ${quantity}`;
}

function buildCardapioScheduleSummary(item) {
  if (item.availabilitySummary) {
    return `Janela de venda: ${item.availabilitySummary}`;
  }

  const windows = normalizeCardapioAvailabilityWindows(item.availabilityWindows);
  if (!windows.length) {
    return 'Janela de venda: Sempre disponivel';
  }

  return `Janela de venda: ${windows.map((window) => `${CARDAPIO_WEEKDAYS.find((day) => day.value === window.dayOfWeek)?.short || 'Dia'} ${window.startTime}-${window.endTime}`).join(' · ')}`;
}

async function deleteMenuItem(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardapio.', 'error');
    return;
  }

  if (!confirm('Tem certeza que deseja remover este item?')) return;

  try {
    await api.delete(`/menu/${itemId}`);
    showToast('Item removido');
    loadCardapio();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}
