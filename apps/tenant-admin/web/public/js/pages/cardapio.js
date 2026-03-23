// Cardápio Page
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
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
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
    ));
  }

  const categoryEmojis = {
    Pizzas: '🍕',
    'Hambúrgueres': '🍔',
    Bebidas: '🍹',
    Sobremesas: '🍰',
    Entradas: '🥗',
  };

  const getEmoji = (item) => {
    if (item.category) return categoryEmojis[item.category.name] || '🍽';
    return '🍽';
  };

  const getBg = (item) => {
    const map = { '🍕': '#fff7ed', '🍔': '#fff7ed', '🍹': '#f0fdf4', '🍰': '#fef2f2', '🥗': '#eff6ff' };
    return map[getEmoji(item)] || '#f0f2f5';
  };

  const renderItemThumb = (item) => {
    if (item.imageUrl) {
      return `<div class="menu-img" style="background-image:url('${escapeHTML(item.imageUrl)}');background-size:cover;background-position:center"></div>`;
    }
    return `<div class="menu-img" style="background:${getBg(item)}">${getEmoji(item)}</div>`;
  };

  container.innerHTML = `
    <div class="full-card">
      <div class="card-header">
        <div>
          <div class="card-title">Gestao de Cardapio</div>
          <div class="card-subtitle">${canManageMenu ? 'Itens com estoque simples, janela de venda e leitura operacional em tempo real' : 'Visualizacao em modo leitura para seu perfil atual'}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div class="search-box">
            <span>🔍</span>
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
              <div style="font-size:28px">➕</div>
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

  return `
    <div class="menu-card">
      ${renderItemThumb(item)}
      <div class="menu-body">
        <div class="menu-name">${escapeHTML(item.name)}</div>
        <div class="menu-cat">${escapeHTML(item.category ? item.category.name : 'Sem categoria')}${item.whatsappShortName ? ' · WA: ' + escapeHTML(item.whatsappShortName) : ''}</div>
        <div class="menu-price">${escapeHTML(formatCurrency(item.price))}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">
          ${item.costPrice !== null && item.costPrice !== undefined
            ? `Custo: ${escapeHTML(formatCurrency(item.costPrice))} · Margem bruta: ${escapeHTML(formatCurrency(Number(item.price || 0) - Number(item.costPrice || 0)))}`
            : 'Custo nao informado para margem'}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">${escapeHTML(item.whatsappShortDescription || item.description || 'Sem descricao curta configurada')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <span class="status-pill ${availabilityMeta.cls}">${escapeHTML(availabilityMeta.label)}</span>
          <span class="status-pill ${item.available ? 'status-done' : 'status-canceled'}">${item.available ? 'Base ativa' : 'Base inativa'}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.5">
          <div>${escapeHTML(stockSummary)}</div>
          <div>${escapeHTML(scheduleSummary)}</div>
          ${item.unavailableReason ? `<div style="color:#b45309">${escapeHTML(item.unavailableReason)}</div>` : ''}
        </div>
        <div class="menu-footer">
          <div style="font-size:11px;color:var(--muted)">${escapeHTML(item.destination === 'BAR' ? 'Producao: Bar' : 'Producao: Cozinha')}</div>
          ${canManageMenu ? `
            <div style="display:flex;gap:6px">
              <button class="btn-sm btn-outline" onclick="openMenuItemModal('${item.id}')">✏️</button>
              <button class="btn-sm btn-outline" onclick="deleteMenuItem('${item.id}')">🗑</button>
            </div>
          ` : '<div style="font-size:11px;color:var(--muted)">Somente leitura</div>'}
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

  openModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Editar Item' : 'Novo Item'}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nome do Item</label>
        <input type="text" id="mi-name" value="${item ? escapeHTML(item.name) : ''}" placeholder="Ex: Pizza Margherita">
      </div>
      <div class="form-group">
        <label>Descricao</label>
        <textarea id="mi-description" placeholder="Descricao do item">${item ? escapeHTML(item.description) || '' : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Imagem do Item</label>
        <input type="url" id="mi-image-url" value="${item ? escapeHTML(item.imageUrl || '') : ''}" placeholder="https://...">
        <div style="font-size:12px;color:var(--muted);margin-top:6px">Usada no preview ilustrativo do item no WhatsApp.</div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Preco (R$)</label>
          <input type="number" step="0.01" id="mi-price" value="${item ? item.price : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Custo Base (R$)</label>
          <input type="number" step="0.01" id="mi-cost-price" value="${item && item.costPrice !== null && item.costPrice !== undefined ? item.costPrice : ''}" placeholder="Opcional">
          <div style="font-size:12px;color:var(--muted);margin-top:6px">Usado nos relatorios de margem e ranking gerencial.</div>
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Categoria</label>
          <select id="mi-category">
            <option value="">Sem categoria</option>
            ${cardapioCategories.map((category) => `<option value="${category.id}" ${item && item.categoryId === category.id ? 'selected' : ''}>${escapeHTML(category.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ordem de Exibicao</label>
          <input type="number" id="mi-display-order" value="${item?.displayOrder ?? 0}" min="0">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Destino</label>
          <select id="mi-destination">
            <option value="KITCHEN" ${item && item.destination === 'KITCHEN' ? 'selected' : ''}>🍳 Cozinha</option>
            <option value="BAR" ${item && item.destination === 'BAR' ? 'selected' : ''}>🍹 Bar</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tempo Preparo (min)</label>
          <input type="number" id="mi-prep" value="${item ? item.prepTimeMinutes : 15}" min="0">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Nome Curto para WhatsApp</label>
          <input type="text" id="mi-whatsapp-short-name" value="${item ? escapeHTML(item.whatsappShortName || '') : ''}" placeholder="Ex: Burger Grande">
        </div>
        <div class="form-group">
          <label>Descricao Curta para WhatsApp</label>
          <input type="text" id="mi-whatsapp-short-description" value="${item ? escapeHTML(item.whatsappShortDescription || '') : ''}" placeholder="Ex: R$ 35,00 · Pao brioche, carne 180g">
        </div>
      </div>
      <div style="margin-top:20px;padding:16px;border:1px solid var(--border);border-radius:16px;background:rgba(15,23,42,0.02)">
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Disponibilidade Operacional</div>
        <div class="form-group" style="margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:10px;font-weight:600">
            <input type="checkbox" id="mi-available" ${item ? (item.available ? 'checked' : '') : 'checked'}>
            Item liberado no cardapio
          </label>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">Desligue aqui apenas quando quiser tirar o item de circulacao manualmente.</div>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:10px;font-weight:600">
            <input type="checkbox" id="mi-track-stock" ${stockTracked ? 'checked' : ''}>
            Controlar estoque simples
          </label>
        </div>
        <div id="mi-stock-fields" style="${stockTracked ? '' : 'display:none;'}">
          <div class="form-row-2">
            <div class="form-group">
              <label>Quantidade em estoque</label>
              <input type="number" id="mi-stock-quantity" min="0" value="${stockTracked ? (item?.stockQuantity ?? 0) : 0}">
            </div>
            <div class="form-group">
              <label>Alerta de estoque baixo</label>
              <input type="number" id="mi-low-stock-threshold" min="0" value="${stockTracked && item?.lowStockThreshold !== null && item?.lowStockThreshold !== undefined ? item.lowStockThreshold : 3}">
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Janela de venda</label>
          <select id="mi-schedule-mode">
            <option value="ALWAYS" ${scheduleEnabled ? '' : 'selected'}>Sempre disponivel</option>
            <option value="CUSTOM" ${scheduleEnabled ? 'selected' : ''}>Somente em horarios especificos</option>
          </select>
        </div>
        <div id="mi-schedule-fields" style="${scheduleEnabled ? '' : 'display:none;'}">
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Use horarios especificos quando o item so pode ser vendido em determinadas faixas. Horarios que cruzam meia-noite sao aceitos.</div>
          ${renderCardapioScheduleRows(scheduleWindows)}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" onclick="saveMenuItem('${itemId || ''}')">${isEdit ? 'Salvar' : 'Criar Item'}</button>
    </div>
  `);

  bindCardapioModalInteractions();
}

function bindCardapioModalInteractions() {
  const stockCheckbox = document.getElementById('mi-track-stock');
  const stockFields = document.getElementById('mi-stock-fields');
  const scheduleMode = document.getElementById('mi-schedule-mode');
  const scheduleFields = document.getElementById('mi-schedule-fields');

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
}

async function saveMenuItem(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardapio.', 'error');
    return;
  }

  const trackStock = document.getElementById('mi-track-stock').checked;
  const scheduleMode = document.getElementById('mi-schedule-mode').value;
  const availabilityWindows = scheduleMode === 'CUSTOM' ? collectCardapioAvailabilityWindows() : [];
  if (availabilityWindows === null) {
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
    track_stock: trackStock,
    stock_quantity: trackStock ? parseInt(stockQuantityRaw || '0', 10) : null,
    low_stock_threshold: trackStock ? (lowStockThresholdRaw === '' ? null : parseInt(lowStockThresholdRaw, 10)) : null,
    availability_windows: availabilityWindows,
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
