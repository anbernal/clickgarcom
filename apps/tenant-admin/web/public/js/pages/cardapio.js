// Cardápio Page
let cardapioCategories = [];
let cardapioItems = [];

async function loadCardapio() {
  const container = document.getElementById('page-cardapio');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando cardápio...</div>';

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
    filtered = filtered.filter(i => i.categoryId === filterCatId);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s));
  }

  const categoryEmojis = {
    'Pizzas': '🍕', 'Hambúrgueres': '🍔', 'Bebidas': '🍹', 'Sobremesas': '🍰', 'Entradas': '🥗',
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
          <div class="card-title">Gestão de Cardápio</div>
          <div class="card-subtitle">${canManageMenu ? 'Adicione, edite ou remova itens' : 'Visualização em modo leitura para seu perfil atual'}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div class="search-box">
            <span>🔍</span>
            <input type="text" placeholder="Buscar item..." id="cardapio-search" value="${search}">
          </div>
          ${canManageMenu ? '<button class="btn-sm btn-dark" onclick="openMenuItemModal()">+ Novo Item</button>' : ''}
        </div>
      </div>
      <div class="cat-tags" id="cardapio-cat-tags">
        <div class="cat-tag ${!filterCatId ? 'active' : ''}" data-cat="">Todos</div>
        ${cardapioCategories.map(c => `
          <div class="cat-tag ${filterCatId === c.id ? 'active' : ''}" data-cat="${c.id}">${escapeHTML(c.name)}</div>
        `).join('')}
      </div>
      <div class="menu-grid">
        ${filtered.map(item => `
          <div class="menu-card">
            ${renderItemThumb(item)}
            <div class="menu-body">
              <div class="menu-name">${escapeHTML(item.name)}</div>
              <div class="menu-cat">${escapeHTML(item.category ? item.category.name : 'Sem categoria')}${item.whatsappShortName ? ' · WA: ' + escapeHTML(item.whatsappShortName) : ''}</div>
              <div class="menu-price">${escapeHTML(formatCurrency(item.price))}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:4px">
                ${item.costPrice !== null && item.costPrice !== undefined
                    ? `Custo: ${escapeHTML(formatCurrency(item.costPrice))} · Margem bruta: ${escapeHTML(formatCurrency(Number(item.price || 0) - Number(item.costPrice || 0)))}`
                    : 'Custo não informado para margem'}
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:6px">${escapeHTML(item.whatsappShortDescription || item.description || 'Sem descrição curta configurada')}</div>
              <div class="menu-footer">
                <div class="status-pill ${item.available ? 'status-done' : 'status-pending'}">${item.available ? 'Ativo' : 'Inativo'}</div>
                ${canManageMenu ? `
                  <div style="display:flex;gap:6px">
                    <button class="btn-sm btn-outline" onclick="openMenuItemModal('${item.id}')">✏️</button>
                    <button class="btn-sm btn-outline" onclick="deleteMenuItem('${item.id}')">🗑</button>
                  </div>
                ` : '<div style="font-size:11px;color:var(--muted)">Somente leitura</div>'}
              </div>
            </div>
          </div>
        `).join('')}
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

  // Search handler
  document.getElementById('cardapio-search').addEventListener('input', (e) => {
    renderCardapio(filterCatId, e.target.value);
  });

  // Category filter handlers
  document.querySelectorAll('#cardapio-cat-tags .cat-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const catId = tag.dataset.cat || null;
      renderCardapio(catId, document.getElementById('cardapio-search')?.value || '');
    });
  });
}

function openMenuItemModal(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardápio.', 'error');
    return;
  }
  const item = itemId ? cardapioItems.find(i => i.id === itemId) : null;
  const isEdit = !!item;

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
        <label>Descrição</label>
        <textarea id="mi-description" placeholder="Descrição do item">${item ? escapeHTML(item.description) || '' : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Imagem do Item</label>
        <input type="url" id="mi-image-url" value="${item ? escapeHTML(item.imageUrl || '') : ''}" placeholder="https://...">
        <div style="font-size:12px;color:var(--muted);margin-top:6px">Usada no preview ilustrativo do item no WhatsApp.</div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Preço (R$)</label>
          <input type="number" step="0.01" id="mi-price" value="${item ? item.price : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Custo Base (R$)</label>
          <input type="number" step="0.01" id="mi-cost-price" value="${item && item.costPrice !== null && item.costPrice !== undefined ? item.costPrice : ''}" placeholder="Opcional">
          <div style="font-size:12px;color:var(--muted);margin-top:6px">Usado nos relatórios de margem e ranking gerencial.</div>
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Categoria</label>
          <select id="mi-category">
            <option value="">Sem categoria</option>
            ${cardapioCategories.map(c => `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
          </select>
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
          <input type="number" id="mi-prep" value="${item ? item.prepTimeMinutes : 15}">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Nome Curto para WhatsApp</label>
          <input type="text" id="mi-whatsapp-short-name" value="${item ? escapeHTML(item.whatsappShortName || '') : ''}" placeholder="Ex: Burger Grande">
        </div>
        <div class="form-group">
          <label>Descrição Curta para WhatsApp</label>
          <input type="text" id="mi-whatsapp-short-description" value="${item ? escapeHTML(item.whatsappShortDescription || '') : ''}" placeholder="Ex: R$ 35,00 · Pão brioche, carne 180g">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" onclick="saveMenuItem('${itemId || ''}')">${isEdit ? 'Salvar' : 'Criar Item'}</button>
    </div>
  `);
}

async function saveMenuItem(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardápio.', 'error');
    return;
  }
  const data = {
    name: document.getElementById('mi-name').value,
    description: document.getElementById('mi-description').value,
    price: parseFloat(document.getElementById('mi-price').value),
    cost_price: document.getElementById('mi-cost-price').value === '' ? null : parseFloat(document.getElementById('mi-cost-price').value),
    category_id: document.getElementById('mi-category').value || null,
    destination: document.getElementById('mi-destination').value,
    prep_time_minutes: parseInt(document.getElementById('mi-prep').value) || 15,
    image_url: document.getElementById('mi-image-url').value.trim() || null,
    whatsapp_short_name: document.getElementById('mi-whatsapp-short-name').value.trim() || null,
    whatsapp_short_description: document.getElementById('mi-whatsapp-short-description').value.trim() || null,
  };

  if (!data.name || !data.price) {
    showToast('Nome e preço são obrigatórios', 'error');
    return;
  }

  if (data.cost_price !== null && Number.isNaN(data.cost_price)) {
    showToast('Custo base inválido', 'error');
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

async function deleteMenuItem(itemId) {
  if (!canPerformAction('manageMenu')) {
    showToast('Seu perfil nao pode alterar o cardápio.', 'error');
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
