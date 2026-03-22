// Categorias Page
let categoriasData = [];

async function loadCategorias() {
    const container = document.getElementById('page-categorias');
    const canManageMenu = canPerformAction('manageMenu');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando categorias...</div>';

    try {
        const categories = await api.get('/categories');
        categoriasData = categories || [];

        container.innerHTML = `
      <div class="full-card">
        <div class="card-header">
          <div>
            <div class="card-title">Gestão de Categorias</div>
            <div class="card-subtitle">${canManageMenu ? 'Organize o cardápio em categorias' : 'Visualização em modo leitura para seu perfil atual'}</div>
          </div>
          ${canManageMenu ? '<button class="btn-sm btn-dark" onclick="openCategoryModal()">+ Nova Categoria</button>' : ''}
        </div>
        <div class="form-row" style="background:var(--bg);font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase">
          <div style="flex:2">Nome da Categoria</div>
          <div style="flex:1">WhatsApp</div>
          <div style="flex:1">Itens</div>
          <div style="flex:1">Status</div>
          <div style="flex:1">Ações</div>
        </div>
        <div id="categorias-list">
          ${categories.length === 0 ? '<div class="empty-state"><div class="icon">🏷</div><h3>Nenhuma categoria</h3><p>Crie sua primeira categoria para organizar o cardápio</p></div>' : ''}
          ${categories.map(cat => `
            <div class="form-row">
              <div style="flex:2">
                <div style="font-weight:600">${escapeHTML(cat.name)}</div>
                <div style="font-size:12px;color:var(--muted)">${escapeHTML(cat.description || 'Sem descrição')}</div>
              </div>
              <div style="flex:1;font-size:12px;color:var(--muted)">
                ${cat.imageUrl ? 'Banner configurado' : 'Sem banner'}
              </div>
              <div style="flex:1">${cat.itemCount || 0} itens</div>
              <div style="flex:1">
                <span class="status-pill ${cat.active ? 'status-done' : 'status-pending'}">${cat.active ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div style="flex:1;display:flex;gap:6px">
                ${canManageMenu ? `
                  <button class="btn-sm btn-outline" onclick="openCategoryModal('${cat.id}')">✏️ Editar</button>
                  <button class="btn-sm btn-outline" onclick="deleteCategory('${cat.id}')">🗑</button>
                ` : '<span style="font-size:11px;color:var(--muted)">Somente leitura</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${err.message}</p></div>`;
    }
}

function openCategoryModal(id = '') {
    if (!canPerformAction('manageMenu')) {
        showToast('Seu perfil nao pode alterar categorias.', 'error');
        return;
    }
    const category = id ? categoriasData.find(cat => cat.id === id) : null;
    const isEdit = !!id;
    openModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Editar Categoria' : 'Nova Categoria'}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="cat-name" value="${escapeHTML(category?.name || '')}" placeholder="Ex: Pizzas">
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="cat-description" placeholder="Descrição da categoria">${escapeHTML(category?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Imagem da Categoria</label>
        <input type="url" id="cat-image-url" value="${escapeHTML(category?.imageUrl || '')}" placeholder="https://...">
        <div style="font-size:12px;color:var(--muted);margin-top:6px">Usada como banner ilustrativo antes da lista de itens no WhatsApp.</div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Ordem de Exibição</label>
          <input type="number" id="cat-order" value="${category?.displayOrder || 0}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="cat-active">
            <option value="true" ${category?.active !== false ? 'selected' : ''}>Ativo</option>
            <option value="false" ${category?.active === false ? 'selected' : ''}>Inativo</option>
          </select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn-sm btn-primary" onclick="saveCategory('${id || ''}')">${isEdit ? 'Salvar' : 'Criar'}</button>
    </div>
  `);
}

async function saveCategory(id) {
    if (!canPerformAction('manageMenu')) {
        showToast('Seu perfil nao pode alterar categorias.', 'error');
        return;
    }
    const data = {
        name: document.getElementById('cat-name').value,
        description: document.getElementById('cat-description').value,
        image_url: document.getElementById('cat-image-url').value.trim() || null,
        display_order: parseInt(document.getElementById('cat-order').value) || 0,
        active: document.getElementById('cat-active').value === 'true',
    };

    if (!data.name) {
        showToast('Nome é obrigatório', 'error');
        return;
    }

    try {
        if (id) {
            await api.put(`/categories/${id}`, data);
            showToast('Categoria atualizada');
        } else {
            await api.post('/categories', data);
            showToast('Categoria criada');
        }
        closeModal();
        loadCategorias();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deleteCategory(id) {
    if (!canPerformAction('manageMenu')) {
        showToast('Seu perfil nao pode alterar categorias.', 'error');
        return;
    }
    if (!confirm('Tem certeza? Itens desta categoria ficarão sem categoria.')) return;
    try {
        await api.delete(`/categories/${id}`);
        showToast('Categoria removida');
        loadCategorias();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}
