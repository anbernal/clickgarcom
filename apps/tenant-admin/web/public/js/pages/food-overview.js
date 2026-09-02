// Painel do módulo Venda de comidas. Mantém catálogo e disponibilidade
// separados da operação presencial e da torre de Delivery.
async function loadFoodOverview() {
    const container = document.getElementById('page-foodOverview');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando painel de comidas...</div>';

    try {
        const [items, categories] = await Promise.all([
            api.get('/menu'),
            api.get('/categories'),
        ]);
        renderFoodOverview(items || [], categories || []);
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Não foi possível carregar o painel</h3><p>${escapeHTML(error.message || 'Tente novamente em instantes.')}</p><button class="btn-sm btn-primary" onclick="loadFoodOverview()">Tentar novamente</button></div>`;
    }
}

function renderFoodOverview(items, categories) {
    const container = document.getElementById('page-foodOverview');
    if (!container) return;
    const available = items.filter((item) => item.available !== false);
    const unavailable = items.filter((item) => item.available === false);
    const combos = items.filter((item) => String(item.itemType || '').toUpperCase() === 'COMBO');
    const withOptions = items.filter((item) => Array.isArray(item.optionGroups) && item.optionGroups.length > 0);
    const visibleCategories = categories.filter((item) => item.active !== false);
    const canManage = typeof canPerformAction !== 'function' || canPerformAction('manageMenu');
    const deliveryActive = getCurrentUser()?.delivery_enabled === true;

    container.innerHTML = `
      <section class="full-card animate-slide-up" style="margin-bottom:20px;overflow:hidden">
        <div style="padding:26px 28px;background:linear-gradient(120deg,#123f36,#1b896f);color:#fff;display:flex;align-items:flex-end;justify-content:space-between;gap:22px;flex-wrap:wrap">
          <div><div style="font-size:11px;font-weight:800;letter-spacing:.13em;color:#b9f2de">VENDA DE COMIDAS</div><h2 style="margin:8px 0 7px;font-size:27px;letter-spacing:-.03em">Cardápio pronto para vender</h2><p style="margin:0;color:rgba(255,255,255,.8);max-width:590px">Organize o que está disponível para o cliente. Pedidos para entrega são acompanhados no Painel de Delivery.</p></div>
          <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn-sm btn-outline" style="border-color:rgba(255,255,255,.45);color:#fff" onclick="navigate('categorias')">Categorias</button>${canManage ? '<button class="btn-sm btn-primary" onclick="navigate(\'cardapio\')">Gerenciar cardápio</button>' : ''}</div>
        </div>
      </section>
      <section class="stats-grid">
        ${foodOverviewMetric('🍽️', 'Itens disponíveis', available.length, unavailable.length ? `${unavailable.length} pausado(s)` : 'Tudo publicado')}
        ${foodOverviewMetric('🏷️', 'Categorias ativas', visibleCategories.length, `${categories.length} cadastrada(s)`)}
        ${foodOverviewMetric('✨', 'Com complementos', withOptions.length, 'Escolhas configuradas')}
        ${foodOverviewMetric('📦', 'Combos', combos.length, combos.length ? 'Prontos para vender' : 'Nenhum combo cadastrado', true)}
      </section>
      <section class="section-grid" style="margin-top:20px">
        <article class="card animate-slide-up delay-1">
          <div class="card-header"><div><div class="card-title">Ações do cardápio</div><div class="card-subtitle">Cuide do que o cliente vê antes de comprar</div></div></div>
          <div style="padding:4px 22px 22px;display:grid;gap:10px">
            <button class="btn-sm btn-outline" style="text-align:left;min-height:47px" onclick="navigate('cardapio')">🍔 Ver itens, preços e disponibilidade</button>
            <button class="btn-sm btn-outline" style="text-align:left;min-height:47px" onclick="navigate('categorias')">🏷 Organizar categorias do cardápio</button>
          </div>
        </article>
        <article class="card animate-slide-up delay-2">
          <div class="card-header"><div><div class="card-title">Publicação</div><div class="card-subtitle">Resumo da disponibilidade atual</div></div></div>
          <div style="padding:4px 22px 22px;display:grid;gap:12px">
            ${unavailable.length ? `<div class="empty-state" style="padding:14px"><div class="icon" style="font-size:24px">⏸</div><p><strong>${unavailable.length} item(ns) pausado(s)</strong><br>Revise a disponibilidade antes do próximo pedido.</p></div>` : '<div class="empty-state" style="padding:14px"><div class="icon" style="font-size:24px">✓</div><p><strong>Cardápio disponível</strong><br>Todos os itens cadastrados estão publicados.</p></div>'}
            ${deliveryActive ? '<button class="btn-sm btn-primary" onclick="navigate(\'delivery\')">Abrir Painel de Delivery</button>' : ''}
          </div>
        </article>
      </section>`;
}

function foodOverviewMetric(icon, label, value, detail, accent = false) {
    return `<div class="stat-card ${accent ? 'teal-card' : ''} animate-slide-up"><div class="stat-icon">${icon}</div><div class="stat-label">${escapeHTML(label)}</div><div class="stat-value">${Number(value || 0)}</div><div class="stat-change" style="color:${accent ? 'rgba(255,255,255,.85)' : 'var(--muted)'}">${escapeHTML(detail)}</div></div>`;
}

window.loadFoodOverview = loadFoodOverview;
