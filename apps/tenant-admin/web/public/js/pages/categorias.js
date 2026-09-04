// Categorias Page

// ─── SVG ICONS ─────────────────────────────────────────────────
const CATEGORIAS_ICONS = {
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

let categoriasData = [];

function renderCategoryImageUpload(currentUrl = '') {
    const image = String(currentUrl || '').trim();
    return `<div class="catalog-image-upload">
      <input type="hidden" id="cat-image-url" value="${escapeHTML(image)}">
      <label class="catalog-image-upload__drop" for="cat-image-file">
        <input id="cat-image-file" type="file" accept="image/jpeg,image/png,image/webp" onchange="previewCategoryImage(this)">
        <span class="catalog-image-upload__icon">▧</span>
        <span><strong>Escolher imagem do computador</strong><small>JPG, PNG ou WEBP · até 5 MB</small></span>
      </label>
      <div class="catalog-image-upload__preview" id="cat-image-preview">${image ? `<img src="${escapeHTML(image)}" alt="Prévia da imagem atual">` : '<span>Nenhuma imagem selecionada</span>'}</div>
      <details class="catalog-image-upload__url"><summary>Usar link externo em vez de enviar arquivo</summary><input type="url" id="cat-image-url-manual" value="${escapeHTML(image)}" placeholder="https://exemplo.com/imagem.jpg" oninput="syncCategoryImageUrl(this.value)"></details>
    </div>`;
}

function previewCategoryImage(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        input.value = '';
        showToast('Escolha uma imagem JPG, PNG ou WEBP de até 5 MB.', 'error');
        return;
    }
    const preview = document.getElementById('cat-image-preview');
    if (preview) preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Prévia da imagem selecionada">`;
}

function syncCategoryImageUrl(url) {
    const normalized = String(url || '').trim();
    const hidden = document.getElementById('cat-image-url');
    const preview = document.getElementById('cat-image-preview');
    if (hidden) hidden.value = normalized;
    if (preview) preview.innerHTML = normalized ? `<img src="${escapeHTML(normalized)}" alt="Prévia da imagem">` : '<span>Nenhuma imagem selecionada</span>';
}

async function uploadCategoryImageIfNeeded() {
    const file = document.getElementById('cat-image-file')?.files?.[0];
    if (!file) return String(document.getElementById('cat-image-url')?.value || '').trim() || null;
    const payload = new FormData();
    payload.append('file', file);
    const uploaded = await api.upload('/media/menu-image', payload);
    const url = String(uploaded?.url || '').trim();
    if (!url) throw new Error('O envio da imagem não retornou um endereço válido.');
    syncCategoryImageUrl(url);
    return url;
}

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
          ${categories.length === 0 ? '<div class="empty-state"><div class="icon">' + CATEGORIAS_ICONS.tag + '</div><h3>Nenhuma categoria</h3><p>Crie sua primeira categoria para organizar o cardápio</p></div>' : ''}
          ${categories.map(cat => `
            <div class="form-row">
              <div style="flex:2">
                <div style="font-weight:600">${escapeHTML(cat.name)}</div>
                <div style="font-size:12px;color:var(--muted)">${escapeHTML(cat.description || 'Sem descrição')}</div>
              </div>
              <div style="flex:1;font-size:12px;color:var(--muted)">
                ${cat.imageUrl ? '<span style="display:inline-flex;align-items:center;gap:7px"><img src="' + escapeHTML(cat.imageUrl) + '" alt="" style="width:28px;height:28px;border-radius:8px;object-fit:cover;border:1px solid var(--border)">Banner configurado</span>' : 'Sem banner'}
              </div>
              <div style="flex:1">${cat.itemCount || 0} itens</div>
              <div style="flex:1">
                <span class="status-pill ${cat.active ? 'status-done' : 'status-pending'}">${cat.active ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div style="flex:1;display:flex;gap:6px">
                ${canManageMenu ? `
                  <button class="btn-sm btn-outline" onclick="openCategoryModal('${cat.id}')">${CATEGORIAS_ICONS.edit} Editar</button>
                  <button class="btn-sm btn-outline" onclick="deleteCategory('${cat.id}')">${CATEGORIAS_ICONS.trash}</button>
                ` : '<span style="font-size:11px;color:var(--muted)">Somente leitura</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon" style="color:#ef4444">${CATEGORIAS_ICONS.alert}</div><h3>Erro</h3><p>${err.message}</p></div>`;
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
        ${renderCategoryImageUpload(category?.imageUrl || '')}
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
    const saveButton = document.querySelector('.modal-footer .btn-sm.btn-primary');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando…';
    }

    try {
        const imageUrl = await uploadCategoryImageIfNeeded();
        const data = {
            name: document.getElementById('cat-name').value.trim(),
            description: document.getElementById('cat-description').value.trim(),
            image_url: imageUrl,
            display_order: parseInt(document.getElementById('cat-order').value, 10) || 0,
            active: document.getElementById('cat-active').value === 'true',
        };
        if (!data.name) {
            showToast('Nome é obrigatório', 'error');
            return;
        }
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
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = id ? 'Salvar' : 'Criar';
        }
    }
}

async function deleteCategory(id) {
    if (!canPerformAction('manageMenu')) {
        showToast('Seu perfil nao pode alterar categorias.', 'error');
        return;
    }
    const confirmed = await showConfirmDialog({
        title: 'Excluir categoria?',
        message: 'Os itens vinculados ficarão sem categoria.',
        detail: 'Os itens não serão excluídos e poderão ser reorganizados depois.',
        confirmLabel: 'Excluir categoria',
        variant: 'danger',
    });
    if (!confirmed) return;
    try {
        await api.delete(`/categories/${id}`);
        showToast('Categoria removida');
        loadCategorias();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}
