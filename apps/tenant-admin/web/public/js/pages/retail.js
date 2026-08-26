// ClickGarçom RETAIL — frontend-first screens and API boundary.
// Preview mode is explicit (`?retail-preview=market|pharmacy`) so restaurant
// tenants never receive demo data by accident.

const RETAIL_PREVIEW_QUERY = 'retail-preview';
const RETAIL_PREVIEW_STORAGE = 'clickgarcom_retail_preview_v1';
const RETAIL_STATUSES = Object.freeze({
    NEW: 'NEW',
    PICKING: 'PICKING',
    PACKING: 'PACKING',
    READY: 'READY',
});

const RETAIL_STATUS_META = Object.freeze({
    NEW: { label: 'Novos', tone: 'coral', action: 'Iniciar separação', next: 'PICKING' },
    PICKING: { label: 'Em separação', tone: 'amber', action: 'Enviar para conferência', next: 'PACKING' },
    PACKING: { label: 'Conferência', tone: 'blue', action: 'Marcar como pronto', next: 'READY' },
    READY: { label: 'Prontos', tone: 'green', action: 'Liberar pedido', next: 'COMPLETED' },
});

const RETAIL_SEED = Object.freeze({
    products: [
        { id: 'ret-prod-1', name: 'Arroz Tipo 1', category: 'Alimentos básicos', brand: 'Boa Mesa', sku: 'ALI-001', barcode: '7891000001011', packageLabel: 'Pacote 5 kg', price: 27.90, costPrice: 22.40, onHand: 36, reserved: 4, lowStockThreshold: 8, active: true, emoji: '🍚', accent: '#f3dfb6', featured: true },
        { id: 'ret-prod-2', name: 'Leite Integral', category: 'Frios e laticínios', brand: 'Fazenda Clara', sku: 'LAT-014', barcode: '7891000001028', packageLabel: 'Caixa 1 L', price: 5.79, costPrice: 4.31, onHand: 18, reserved: 6, lowStockThreshold: 10, active: true, emoji: '🥛', accent: '#dbeafe', featured: true },
        { id: 'ret-prod-3', name: 'Detergente Neutro', category: 'Limpeza', brand: 'Brilho', sku: 'LIM-021', barcode: '7891000001035', packageLabel: 'Frasco 500 ml', price: 2.89, costPrice: 1.72, onHand: 42, reserved: 2, lowStockThreshold: 10, active: true, emoji: '🧴', accent: '#ccfbf1', featured: false },
        { id: 'ret-prod-4', name: 'Café Torrado e Moído', category: 'Alimentos básicos', brand: 'Serra Alta', sku: 'ALI-033', barcode: '7891000001042', packageLabel: 'Pacote 500 g', price: 18.90, costPrice: 14.60, onHand: 9, reserved: 3, lowStockThreshold: 8, active: true, emoji: '☕', accent: '#fde7d8', featured: true },
        { id: 'ret-prod-5', name: 'Shampoo Nutritivo', category: 'Higiene e beleza', brand: 'Vitta', sku: 'HIG-008', barcode: '7891000001059', packageLabel: 'Frasco 350 ml', price: 22.50, costPrice: 16.90, onHand: 5, reserved: 1, lowStockThreshold: 6, active: true, emoji: '🧼', accent: '#ede9fe', featured: false },
        { id: 'ret-prod-6', name: 'Água Mineral com Gás', category: 'Bebidas', brand: 'Cristalina', sku: 'BEB-006', barcode: '7891000001066', packageLabel: 'Garrafa 500 ml', price: 2.48, oldPrice: 2.76, costPrice: 1.35, onHand: 60, reserved: 8, lowStockThreshold: 12, active: true, emoji: '💧', accent: '#cffafe', featured: true },
        { id: 'ret-prod-7', name: 'Biscoito de Polvilho', category: 'Ofertas do dia', brand: 'Casa Leve', sku: 'OFE-003', barcode: '7891000001073', packageLabel: 'Pacote 100 g', price: 6.92, oldPrice: 8.31, costPrice: 4.20, onHand: 27, reserved: 3, lowStockThreshold: 6, active: true, emoji: '🥨', accent: '#fee2e2', featured: true },
        { id: 'ret-prod-8', name: 'Sabonete Líquido', category: 'Higiene e beleza', brand: 'Vitta', sku: 'HIG-019', barcode: '7891000001080', packageLabel: 'Frasco 250 ml', price: 12.90, costPrice: 8.75, onHand: 0, reserved: 0, lowStockThreshold: 5, active: false, emoji: '🫧', accent: '#fce7f3', featured: false },
    ],
    orders: [
        { id: 'ret-order-4812', code: '4812', status: 'NEW', customer: 'Mariana Silva', mode: 'DELIVERY', createdAt: '10:24', total: 86.72, address: 'Av. dos Autonomistas, 1200 · Centro', items: [{ productId: 'ret-prod-1', quantity: 1 }, { productId: 'ret-prod-2', quantity: 3 }, { productId: 'ret-prod-6', quantity: 4 }], note: 'Entregar na portaria B.', payment: 'Pago no cartão' },
        { id: 'ret-order-4809', code: '4809', status: 'NEW', customer: 'Carlos Mendes', mode: 'TAKEOUT', createdAt: '10:17', total: 47.18, address: 'Retirada no estabelecimento', items: [{ productId: 'ret-prod-3', quantity: 2 }, { productId: 'ret-prod-4', quantity: 1 }, { productId: 'ret-prod-7', quantity: 2 }], note: '', payment: 'PIX confirmado' },
        { id: 'ret-order-4807', code: '4807', status: 'PICKING', customer: 'Ana Beatriz', mode: 'DELIVERY', createdAt: '10:08', total: 64.27, address: 'Rua das Flores, 88 · Bela Vista', items: [{ productId: 'ret-prod-2', quantity: 2, picked: true }, { productId: 'ret-prod-5', quantity: 1, picked: false }, { productId: 'ret-prod-6', quantity: 3, picked: true }], note: 'Sem sacola plástica.', payment: 'PIX confirmado' },
        { id: 'ret-order-4803', code: '4803', status: 'PACKING', customer: 'João Pedro', mode: 'DELIVERY', createdAt: '09:54', total: 112.36, address: 'Rua Antônio Agú, 540 · Centro', items: [{ productId: 'ret-prod-1', quantity: 2, picked: true }, { productId: 'ret-prod-4', quantity: 2, picked: true }, { productId: 'ret-prod-3', quantity: 2, picked: true }], note: 'Separar produtos de limpeza dos alimentos.', payment: 'Pago no cartão' },
        { id: 'ret-order-4798', code: '4798', status: 'READY', customer: 'Renata Oliveira', mode: 'TAKEOUT', createdAt: '09:41', total: 39.22, address: 'Retirada no estabelecimento', items: [{ productId: 'ret-prod-7', quantity: 3, picked: true }, { productId: 'ret-prod-6', quantity: 4, picked: true }], note: '', payment: 'PIX confirmado' },
    ],
    history: [
        { id: 'ret-order-4786', code: '4786', status: 'COMPLETED', customer: 'Paula Nascimento', mode: 'DELIVERY', createdAt: 'Ontem, 18:32', completedAt: 'Ontem, 19:21', total: 94.61, address: 'Rua das Acácias, 219 · Centro', items: [{ productId: 'ret-prod-1', quantity: 2 }, { productId: 'ret-prod-3', quantity: 3 }, { productId: 'ret-prod-6', quantity: 5 }], note: '', payment: 'Pago no cartão' },
        { id: 'ret-order-4774', code: '4774', status: 'COMPLETED', customer: 'Lucas Almeida', mode: 'TAKEOUT', createdAt: 'Ontem, 16:11', completedAt: 'Ontem, 16:47', total: 51.55, address: 'Retirada no estabelecimento', items: [{ productId: 'ret-prod-4', quantity: 2 }, { productId: 'ret-prod-7', quantity: 3 }, { productId: 'ret-prod-2', quantity: 2 }], note: '', payment: 'PIX confirmado' },
        { id: 'ret-order-4759', code: '4759', status: 'COMPLETED', customer: 'Beatriz Costa', mode: 'DELIVERY', createdAt: '22 de ago., 14:08', completedAt: '22 de ago., 15:03', total: 74.38, address: 'Av. Maria Campos, 402 · Centro', items: [{ productId: 'ret-prod-5', quantity: 2 }, { productId: 'ret-prod-2', quantity: 3 }, { productId: 'ret-prod-6', quantity: 4 }], note: '', payment: 'PIX confirmado' },
    ],
    categories: [
        { id: 'ret-cat-1', name: 'Ofertas do dia', icon: '🏷️', active: true },
        { id: 'ret-cat-2', name: 'Alimentos básicos', icon: '🧺', active: true },
        { id: 'ret-cat-3', name: 'Frios e laticínios', icon: '🥛', active: true },
        { id: 'ret-cat-4', name: 'Bebidas', icon: '🥤', active: true },
        { id: 'ret-cat-5', name: 'Limpeza', icon: '🧼', active: true },
        { id: 'ret-cat-6', name: 'Higiene e beleza', icon: '✨', active: true },
    ],
    lots: [
        { id: 'ret-lot-1', productId: 'ret-prod-2', code: 'LT-2408A', expiresAt: '2026-09-12', quantity: 12 },
        { id: 'ret-lot-2', productId: 'ret-prod-5', code: 'VIT-8821', expiresAt: '2026-11-30', quantity: 5 },
        { id: 'ret-lot-3', productId: 'ret-prod-4', code: 'CAF-0819', expiresAt: '2027-02-18', quantity: 9 },
    ],
    movements: [
        { id: 'mov-1', productId: 'ret-prod-2', type: 'SALE', quantity: -3, at: 'Hoje, 10:24', actor: 'Pedido #4812' },
        { id: 'mov-2', productId: 'ret-prod-5', type: 'MANUAL_ADJUSTMENT', quantity: -1, at: 'Hoje, 09:32', actor: 'Amanda · Gerente' },
        { id: 'mov-3', productId: 'ret-prod-6', type: 'PURCHASE_ENTRY', quantity: 48, at: 'Ontem, 17:08', actor: 'Entrada NF 2948' },
        { id: 'mov-4', productId: 'ret-prod-1', type: 'PURCHASE_ENTRY', quantity: 20, at: 'Ontem, 15:44', actor: 'Entrada NF 2946' },
    ],
});

const retailUiState = {
    productSearch: '',
    productCategory: 'ALL',
    inventoryFilter: 'ALL',
    pickingSearch: '',
};
let retailPreviewResetDone = false;
const retailPendingTransitions = new Set();

function canManageRetailCatalog() {
    return typeof canPerformAction === 'function' && canPerformAction('manageRetailCatalog');
}

function retailClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getRetailPreviewType() {
    const value = new URLSearchParams(window.location.search).get(RETAIL_PREVIEW_QUERY);
    if (!value) return '';
    if (['pharmacy', 'farmacia'].includes(value.toLowerCase())) return 'PHARMACY';
    return 'MARKET';
}

function getRetailEstablishmentType() {
    const previewType = getRetailPreviewType();
    if (previewType) return previewType;
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return String(user?.establishment_type || user?.establishmentType || '').trim().toUpperCase();
}

function isRetailProfile() {
    if (isRetailPreview()) return true;
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (typeof user?.retail_enabled === 'boolean') return user.retail_enabled;
    const type = getRetailEstablishmentType();
    return ['MARKET', 'PHARMACY'].includes(type);
}

function isRetailPreview() {
    return !!getRetailPreviewType();
}

function loadRetailPreviewData() {
    if (!retailPreviewResetDone && new URLSearchParams(window.location.search).get('retail-reset') === '1') {
        localStorage.removeItem(RETAIL_PREVIEW_STORAGE);
        retailPreviewResetDone = true;
    }
    try {
        const stored = JSON.parse(localStorage.getItem(RETAIL_PREVIEW_STORAGE) || 'null');
        if (stored?.products && stored?.orders && stored?.movements && stored?.history && stored?.categories && stored?.lots) return stored;
    } catch (_) {
        // Reset invalid preview state below.
    }
    const seeded = retailClone(RETAIL_SEED);
    localStorage.setItem(RETAIL_PREVIEW_STORAGE, JSON.stringify(seeded));
    return seeded;
}

function saveRetailPreviewData(data) {
    localStorage.setItem(RETAIL_PREVIEW_STORAGE, JSON.stringify(data));
}

const retailApi = {
    async getWorkspace() {
        if (isRetailPreview()) return loadRetailPreviewData();
        return api.get('/retail/workspace');
    },
    async saveProduct(product) {
        if (!isRetailPreview()) {
            const payload = {
                name: product.name,
                description: product.description || undefined,
                price: product.price,
                cost_price: product.costPrice,
                category_id: product.categoryId || undefined,
                image_url: product.imageUrl || undefined,
                sku: product.sku || undefined,
                barcode: product.barcode || undefined,
                brand: product.brand || undefined,
                package_label: product.packageLabel || undefined,
                stock_quantity: product.onHand,
                low_stock_threshold: product.lowStockThreshold,
                available: product.active !== false,
            };
            return product.id
                ? api.patch(`/retail/catalog/products/${encodeURIComponent(product.id)}`, payload)
                : api.post('/retail/catalog/products', payload);
        }
        const data = loadRetailPreviewData();
        const index = data.products.findIndex((item) => item.id === product.id);
        if (index >= 0) data.products[index] = { ...data.products[index], ...product };
        else data.products.unshift({ ...product, id: `ret-prod-${Date.now()}`, reserved: 0 });
        saveRetailPreviewData(data);
        return product;
    },
    async saveCategory(category) {
        if (!isRetailPreview()) return api.post('/retail/catalog/categories', {
            name: category.name,
            description: category.description || undefined,
            image_url: category.imageUrl || undefined,
        });
        const data = loadRetailPreviewData();
        const normalized = category.name.toLocaleLowerCase('pt-BR');
        if (data.categories.some((item) => item.name.toLocaleLowerCase('pt-BR') === normalized)) throw new Error('Já existe uma categoria com esse nome.');
        data.categories.push({ ...category, id: `ret-cat-${Date.now()}`, active: true });
        saveRetailPreviewData(data);
        return category;
    },
    async adjustInventory(productId, delta, reason) {
        if (!isRetailPreview()) return api.command('/inventory/adjustments', { product_id: productId, quantity: delta, reason });
        const data = loadRetailPreviewData();
        const product = data.products.find((item) => item.id === productId);
        if (!product) throw new Error('Produto não encontrado.');
        if (product.onHand + delta < product.reserved) throw new Error('O saldo físico não pode ficar abaixo do reservado.');
        product.onHand += delta;
        data.movements.unshift({ id: `mov-${Date.now()}`, productId, type: 'MANUAL_ADJUSTMENT', quantity: delta, at: 'Agora', actor: reason || 'Ajuste manual' });
        saveRetailPreviewData(data);
        return product;
    },
    async saveLot(lot) {
        if (!isRetailPreview()) return api.post('/inventory/lots', lot);
        const data = loadRetailPreviewData();
        const product = data.products.find((item) => item.id === lot.productId);
        if (!product) throw new Error('Produto não encontrado.');
        data.lots.unshift({ ...lot, id: `ret-lot-${Date.now()}` });
        product.onHand += lot.quantity;
        data.movements.unshift({ id: `mov-${Date.now()}`, productId: lot.productId, type: 'PURCHASE_ENTRY', quantity: lot.quantity, at: 'Agora', actor: `Lote ${lot.code}` });
        saveRetailPreviewData(data);
        return lot;
    },
    async moveFulfillment(orderId, nextStatus, expectedVersion) {
        if (!isRetailPreview()) return api.command(`/retail/fulfillments/${encodeURIComponent(orderId)}/transition`, { status: nextStatus, expected_version: expectedVersion });
        const data = loadRetailPreviewData();
        const order = data.orders.find((item) => item.id === orderId);
        if (!order) throw new Error('Pedido não encontrado.');
        const currentVersion = Number(order.version || 1);
        if (Number(expectedVersion || 1) !== currentVersion) throw new Error('Esta compra foi atualizada em outra tela. Recarregue a etapa.');
        if (nextStatus === 'COMPLETED') {
            data.orders = data.orders.filter((item) => item.id !== orderId);
            data.history.unshift({ ...order, status: 'COMPLETED', completedAt: 'Agora', version: currentVersion + 1 });
        } else {
            order.status = nextStatus;
            order.version = currentVersion + 1;
        }
        saveRetailPreviewData(data);
        return order;
    },
};

function retailMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function retailEscape(value) {
    return typeof escapeHTML === 'function' ? escapeHTML(value) : String(value || '');
}

function retailProductById(data, id) {
    return data.products.find((product) => product.id === id) || { name: 'Produto removido', emoji: '□', sku: '-' };
}

function retailAvailable(product) {
    return Math.max(0, Number(product.onHand || 0) - Number(product.reserved || 0));
}

function retailStockHealth(product) {
    const available = retailAvailable(product);
    if (available <= 0) return { key: 'OUT', label: 'Sem estoque', tone: 'danger' };
    if (available <= Number(product.lowStockThreshold || 0)) return { key: 'LOW', label: 'Estoque baixo', tone: 'warning' };
    return { key: 'OK', label: 'Saudável', tone: 'success' };
}

function retailPageShell(content) {
    const type = getRetailEstablishmentType();
    const databaseMode = !isRetailPreview();
    const previewLabel = isRetailPreview()
        ? `<span class="retail-preview-pill"><i></i>Protótipo navegável · ${type === 'PHARMACY' ? 'Farmácia' : 'Mercado'}</span>`
        : '<span class="retail-live-pill"><i></i>Atualização ao vivo</span>';
    const integrationLabel = databaseMode ? `<span class="retail-readonly-pill">Dados reais · ${canManageRetailCatalog() ? 'editáveis' : 'consulta'}</span>` : '';
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const slug = String(user?.tenant_slug || user?.tenantSlug || user?.slug || '').trim();
    const storeHref = isRetailPreview() ? `/loja/${type === 'PHARMACY' ? 'farmacia-modelo' : 'mercado-modelo'}?preview=${type === 'PHARMACY' ? 'pharmacy' : 'market'}` : (slug ? `/loja/${encodeURIComponent(slug)}` : '#');
    return `<div class="retail-page"><div class="retail-page-meta">${previewLabel}${integrationLabel}<a class="retail-store-link" href="${storeHref}" target="_blank" rel="noopener">Abrir loja do cliente ↗</a></div>${content}</div>`;
}

async function loadRetailOverview() {
    const root = document.getElementById('page-retailOverview');
    if (!root) return;
    root.innerHTML = retailPageShell('<div class="retail-loading">Preparando a visão da loja…</div>');
    try {
        const data = await retailApi.getWorkspace();
        const activeOrders = data.orders.length;
        const waiting = data.orders.filter((order) => order.status === 'NEW').length;
        const lowStock = data.products.filter((product) => retailStockHealth(product).key !== 'OK').length;
        const revenue = data.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const featured = data.products.filter((product) => product.featured).slice(0, 4);
        root.innerHTML = retailPageShell(`
            <section class="retail-hero-admin">
                <div><span class="retail-eyebrow">OPERAÇÃO RETAIL</span><h2>Da prateleira até a entrega, sem perder o controle.</h2><p>Acompanhe compras pagas, disponibilidade e separação em uma visão construída para produtos.</p></div>
                <div class="retail-hero-admin__actions"><button class="retail-button retail-button--light" onclick="navigate('retailProducts')">${isRetailPreview() ? 'Cadastrar produto' : 'Ver produtos'}</button><button class="retail-button retail-button--accent" onclick="navigate('retailPicking')">Abrir separação</button></div>
            </section>
            <section class="retail-kpis">
                ${renderRetailKpi('Compras em andamento', activeOrders, `${waiting} aguardando início`, '▣', 'teal')}
                ${renderRetailKpi('Valor na operação', retailMoney(revenue), 'Compras pagas abertas', '↗', 'blue')}
                ${renderRetailKpi('Produtos publicados', data.products.filter((item) => item.active).length, `${data.products.length} cadastrados`, '□', 'violet')}
                ${renderRetailKpi('Atenção no estoque', lowStock, lowStock ? 'Revisar disponibilidade' : 'Tudo saudável', '!', lowStock ? 'coral' : 'green')}
            </section>
            <section class="retail-overview-grid">
                <article class="retail-panel retail-panel--orders"><div class="retail-panel-head"><div><span>Ritmo da operação</span><h3>Pedidos por etapa</h3></div><button onclick="navigate('retailPicking')">Ver central</button></div><div class="retail-stage-summary">${Object.keys(RETAIL_STATUS_META).map((status) => renderRetailStageSummary(data, status)).join('')}</div></article>
                <article class="retail-panel"><div class="retail-panel-head"><div><span>Disponibilidade</span><h3>Estoque que pede atenção</h3></div><button onclick="navigate('retailInventory')">Ver estoque</button></div><div class="retail-watch-list">${data.products.filter((product) => retailStockHealth(product).key !== 'OK').slice(0, 4).map(renderRetailWatchItem).join('') || '<p class="retail-empty-inline">Nenhum produto exige atenção.</p>'}</div></article>
            </section>
            <section class="retail-panel retail-featured"><div class="retail-panel-head"><div><span>Vitrine digital</span><h3>Produtos em destaque</h3></div><button onclick="navigate('retailProducts')">Gerenciar vitrine</button></div><div class="retail-featured-grid">${featured.map(renderRetailFeaturedProduct).join('')}</div></section>
        `);
        updateRetailBadges(data);
    } catch (error) {
        renderRetailIntegrationError(root, error);
    }
}

function renderRetailKpi(label, value, detail, icon, tone) {
    return `<article class="retail-kpi retail-kpi--${tone}"><span class="retail-kpi__icon">${icon}</span><small>${retailEscape(label)}</small><strong>${retailEscape(value)}</strong><p>${retailEscape(detail)}</p></article>`;
}

function renderRetailStageSummary(data, status) {
    const meta = RETAIL_STATUS_META[status];
    const count = data.orders.filter((order) => order.status === status).length;
    return `<div class="retail-stage-summary__item"><i class="is-${meta.tone}"></i><span>${meta.label}</span><strong>${count}</strong></div>`;
}

function renderRetailWatchItem(product) {
    const health = retailStockHealth(product);
    return `<div class="retail-watch-item"><span class="retail-product-mini" style="--product-accent:${product.accent}">${product.emoji}</span><div><strong>${retailEscape(product.name)}</strong><small>${retailEscape(product.sku)} · ${retailEscape(product.packageLabel)}</small></div><span class="retail-stock-pill is-${health.tone}">${retailAvailable(product)} disp.</span></div>`;
}

function renderRetailFeaturedProduct(product) {
    return `<article class="retail-featured-product"><div class="retail-featured-product__visual" style="--product-accent:${product.accent}"><span>${product.emoji}</span>${product.oldPrice ? '<em>Oferta</em>' : ''}</div><div><small>${retailEscape(product.brand)}</small><strong>${retailEscape(product.name)}</strong><p>${retailEscape(product.packageLabel)}</p><b>${retailMoney(product.price)}</b></div></article>`;
}

async function loadRetailProductsPage() {
    const root = document.getElementById('page-retailProducts');
    if (!root) return;
    root.innerHTML = retailPageShell('<div class="retail-loading">Carregando produtos…</div>');
    try {
        const data = await retailApi.getWorkspace();
        renderRetailProducts(root, data);
        updateRetailBadges(data);
    } catch (error) {
        renderRetailIntegrationError(root, error);
    }
}

function renderRetailProducts(root, data) {
    const categories = Array.from(new Set(data.products.map((product) => product.category))).sort();
    const query = retailUiState.productSearch.toLowerCase();
    const filtered = data.products.filter((product) => {
        const matchesCategory = retailUiState.productCategory === 'ALL' || product.category === retailUiState.productCategory;
        const haystack = `${product.name} ${product.brand} ${product.sku} ${product.barcode}`.toLowerCase();
        return matchesCategory && (!query || haystack.includes(query));
    });
    root.innerHTML = retailPageShell(`
        <section class="retail-toolbar-card">
            <div class="retail-toolbar-copy"><span class="retail-eyebrow">CATÁLOGO</span><h2>${data.products.length} produtos cadastrados</h2><p>Preço, apresentação e estoque sempre visíveis antes de publicar.</p></div>
            <div class="retail-toolbar-actions">${canManageRetailCatalog() ? '<button class="retail-button retail-button--ghost" onclick="openRetailCategoriesModal()">Organizar categorias</button><button class="retail-button retail-button--primary" onclick="openRetailProductModal()">+ Novo produto</button>' : '<span class="retail-readonly-copy">Consulta disponível para este perfil.</span>'}</div>
        </section>
        <section class="retail-filterbar">
            <label class="retail-search"><span>⌕</span><input id="retail-product-search" value="${retailEscape(retailUiState.productSearch)}" placeholder="Buscar nome, marca, SKU ou código" oninput="filterRetailProducts(this.value)"></label>
            <select onchange="filterRetailProductCategory(this.value)" aria-label="Filtrar categoria"><option value="ALL">Todas as categorias</option>${categories.map((category) => `<option value="${retailEscape(category)}" ${retailUiState.productCategory === category ? 'selected' : ''}>${retailEscape(category)}</option>`).join('')}</select>
            <span class="retail-results-count">${filtered.length} resultado${filtered.length === 1 ? '' : 's'}</span>
        </section>
        <section class="retail-products-grid">${filtered.map(renderRetailAdminProduct).join('') || '<div class="retail-empty-state"><span>⌕</span><h3>Nenhum produto encontrado</h3><p>Ajuste os filtros ou cadastre um novo produto.</p></div>'}</section>
    `);
}

async function openRetailCategoriesModal() {
    if (!canManageRetailCatalog()) return showToast('Seu perfil não pode alterar categorias.', 'error');
    const data = await retailApi.getWorkspace();
    openModal(`<div class="modal-header"><div><h3>Categorias da loja</h3><p class="modal-header-subtitle">Atalhos simples para o cliente encontrar os produtos.</p></div><button class="modal-close" onclick="closeModal()">✕</button></div><form onsubmit="saveRetailCategory(event)"><div class="modal-body"><div class="retail-category-manager">${data.categories.map((category) => `<div><span>${retailEscape(category.icon)}</span><strong>${retailEscape(category.name)}</strong><small>${data.products.filter((product) => product.category === category.name).length} produto(s)</small></div>`).join('')}</div><div class="retail-form-grid"><label class="retail-field">Ícone<input name="icon" maxlength="4" value="🛍️" aria-label="Ícone da categoria"></label><label class="retail-field">Nova categoria *<input name="name" required maxlength="60" placeholder="Ex.: Hortifruti"></label><label class="retail-field retail-field--wide">Imagem da categoria<input name="imageUrl" type="url" placeholder="https://..."></label></div><div id="retail-category-form-error" class="retail-form-error" hidden></div></div><div class="modal-footer"><button type="button" class="btn-sm btn-outline" onclick="closeModal()">Fechar</button><button type="submit" class="btn-sm btn-primary">Adicionar categoria</button></div></form>`);
}

async function saveRetailCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
        await retailApi.saveCategory({ name: form.name.value.trim(), icon: form.icon.value.trim() || '🛍️', imageUrl: form.imageUrl.value.trim() });
        closeModal();
        showToast('Categoria adicionada.', 'success');
        await loadRetailProductsPage();
    } catch (error) {
        const target = document.getElementById('retail-category-form-error');
        if (target) { target.hidden = false; target.textContent = error.message; }
    }
}

function renderRetailAdminProduct(product) {
    const health = retailStockHealth(product);
    return `<article class="retail-admin-product ${product.active ? '' : 'is-inactive'}">
        <div class="retail-admin-product__visual" style="--product-accent:${product.accent}">${product.imageUrl ? `<img src="${retailEscape(product.imageUrl)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${product.emoji}</span>` : `<span>${product.emoji}</span>`}<em>${product.active ? 'Publicado' : 'Pausado'}</em></div>
        <div class="retail-admin-product__body"><div class="retail-admin-product__category">${retailEscape(product.category)}</div><h3>${retailEscape(product.name)}</h3><p>${retailEscape(product.brand)} · ${retailEscape(product.packageLabel)}</p><div class="retail-admin-product__codes"><span>SKU ${retailEscape(product.sku || '—')}</span><span>EAN ${retailEscape(product.barcode || '—')}</span></div></div>
        <div class="retail-admin-product__footer"><div><small>Preço</small><strong>${retailMoney(product.price)}</strong></div><div><small>Disponível</small><strong>${retailAvailable(product)}</strong></div><span class="retail-stock-pill is-${health.tone}">${health.label}</span>${canManageRetailCatalog() ? `<button type="button" onclick="openRetailProductModal('${retailEscape(product.id)}')">Editar</button>` : '<span class="retail-inline-status">Somente consulta</span>'}</div>
    </article>`;
}

async function filterRetailProducts(value) {
    retailUiState.productSearch = String(value || '');
    const data = await retailApi.getWorkspace();
    renderRetailProducts(document.getElementById('page-retailProducts'), data);
    const input = document.getElementById('retail-product-search');
    if (input) { input.focus(); input.setSelectionRange(value.length, value.length); }
}

async function filterRetailProductCategory(value) {
    retailUiState.productCategory = value;
    const data = await retailApi.getWorkspace();
    renderRetailProducts(document.getElementById('page-retailProducts'), data);
}

async function openRetailProductModal(productId = '') {
    if (!canManageRetailCatalog()) return showToast('Seu perfil não pode cadastrar produtos.', 'error');
    const data = await retailApi.getWorkspace();
    const product = data.products.find((item) => item.id === productId) || {};
    const pharmacy = getRetailEstablishmentType() === 'PHARMACY';
    const categoryOptions = data.categories.map((category) => `<option value="${retailEscape(category.id)}" ${(product.categoryId === category.id || (!product.categoryId && product.category === category.name)) ? 'selected' : ''}>${retailEscape(category.name)}</option>`).join('');
    openModal(`<div class="modal-header"><div><h3>${productId ? 'Editar produto' : 'Novo produto'}</h3><p class="modal-header-subtitle">Informações comerciais, imagem e disponibilidade na loja.</p></div><button class="modal-close" onclick="closeModal()">✕</button></div><form onsubmit="saveRetailProduct(event, '${retailEscape(productId)}')"><div class="modal-body retail-product-form"><div class="retail-form-grid"><label class="retail-field retail-field--wide">Nome do produto *<input name="name" required maxlength="120" value="${retailEscape(product.name || '')}" placeholder="Ex.: Café torrado e moído"></label><label class="retail-field retail-field--wide">Categoria *<select name="categoryId" required><option value="">Selecione uma categoria</option>${categoryOptions}</select></label><label class="retail-field retail-field--wide">Imagem do produto<input name="imageUrl" type="url" value="${retailEscape(product.imageUrl || '')}" placeholder="https://..."><small>Use uma imagem HTTPS quadrada ou em formato de catálogo.</small></label><label class="retail-field retail-field--wide">Descrição<input name="description" maxlength="1000" value="${retailEscape(product.description || '')}" placeholder="Descrição curta para a loja"></label><label class="retail-field">Marca<input name="brand" value="${retailEscape(product.brand || '')}" placeholder="Marca"></label><label class="retail-field">SKU<input name="sku" value="${retailEscape(product.sku || '')}" placeholder="ALI-001"></label><label class="retail-field">Código de barras<input name="barcode" inputmode="numeric" value="${retailEscape(product.barcode || '')}" placeholder="789..."></label><label class="retail-field">Apresentação<input name="packageLabel" value="${retailEscape(product.packageLabel || '')}" placeholder="Pacote 500 g"></label><label class="retail-field">Preço de venda *<input name="price" required type="number" min="0.01" step="0.01" value="${retailEscape(product.price || '')}"></label><label class="retail-field">Preço de custo<input name="costPrice" type="number" min="0" step="0.01" value="${retailEscape(product.costPrice || '')}"></label><label class="retail-field">Estoque físico *<input name="onHand" required type="number" min="0" step="1" value="${retailEscape(product.onHand ?? 0)}"></label><label class="retail-field">Alerta de estoque<input name="lowStockThreshold" type="number" min="0" step="1" value="${retailEscape(product.lowStockThreshold ?? 5)}"></label>${pharmacy ? '<div class="retail-form-note retail-field--wide"><strong>Farmácia comercial</strong><span>O MVP aceita somente produtos sem fluxo de receita. Dados farmacêuticos serão integrados pelo backend na próxima etapa.</span></div>' : ''}</div><label class="retail-switch"><input name="active" type="checkbox" ${product.active !== false ? 'checked' : ''}><span></span><div><strong>Produto publicado</strong><small>Disponível para busca e compra quando houver estoque.</small></div></label><div id="retail-product-form-error" class="retail-form-error" hidden></div></div><div class="modal-footer"><button type="button" class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn-sm btn-primary">Salvar produto</button></div></form>`);
}

async function saveRetailProduct(event, productId) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Salvando…';
    try {
        const payload = {
            id: productId || undefined,
            name: form.name.value.trim(), categoryId: form.categoryId.value, description: form.description.value.trim(), imageUrl: form.imageUrl.value.trim(), brand: form.brand.value.trim(),
            sku: form.sku.value.trim(), barcode: form.barcode.value.trim(), packageLabel: form.packageLabel.value.trim(),
            price: Number(form.price.value), costPrice: Number(form.costPrice.value || 0), onHand: Number(form.onHand.value),
            lowStockThreshold: Number(form.lowStockThreshold.value || 0), active: form.active.checked,
            featured: false,
        };
        if (!productId) {
            payload.emoji = '🛍️';
            payload.accent = '#dcfce7';
        }
        await retailApi.saveProduct(payload);
        closeModal();
        showToast('Produto salvo.', 'success');
        await loadRetailProductsPage();
    } catch (error) {
        const target = document.getElementById('retail-product-form-error');
        if (target) { target.hidden = false; target.textContent = error.message; }
        button.disabled = false;
        button.textContent = 'Salvar produto';
    }
}

async function loadRetailInventoryPage() {
    const root = document.getElementById('page-retailInventory');
    if (!root) return;
    root.innerHTML = retailPageShell('<div class="retail-loading">Conferindo saldos…</div>');
    try {
        const data = await retailApi.getWorkspace();
        renderRetailInventory(root, data);
        updateRetailBadges(data);
    } catch (error) {
        renderRetailIntegrationError(root, error);
    }
}

function renderRetailInventory(root, data) {
    const inventoryValue = data.products.reduce((sum, product) => sum + Number(product.costPrice || 0) * Number(product.onHand || 0), 0);
    const reserved = data.products.reduce((sum, product) => sum + Number(product.reserved || 0), 0);
    const low = data.products.filter((product) => retailStockHealth(product).key !== 'OK').length;
    const products = data.products.filter((product) => retailUiState.inventoryFilter === 'ALL' || retailStockHealth(product).key === retailUiState.inventoryFilter);
    root.innerHTML = retailPageShell(`
        <section class="retail-inventory-summary"><div><span class="retail-eyebrow">ESTOQUE EM TEMPO REAL</span><h2>Saldo claro antes de vender.</h2><p>O disponível considera o que está reservado em checkouts e pedidos abertos.</p></div>${isRetailPreview() ? '<button class="retail-button retail-button--primary" onclick="openRetailInventoryEntry()">Registrar entrada</button>' : '<span class="retail-readonly-copy">Movimentações entram com a trilha transacional.</span>'}</section>
        <section class="retail-kpis retail-kpis--compact">${renderRetailKpi('Valor em estoque', retailMoney(inventoryValue), 'Pelo custo cadastrado', 'R$', 'teal')}${renderRetailKpi('Unidades reservadas', reserved, 'Protegidas para checkout', '◷', 'blue')}${renderRetailKpi('Produtos em atenção', low, 'Baixo ou indisponível', '!', low ? 'coral' : 'green')}${renderRetailKpi('Movimentos recentes', data.movements.length, 'Trilha do protótipo', '↕', 'violet')}</section>
        <section class="retail-inventory-layout"><article class="retail-panel retail-inventory-table-card"><div class="retail-panel-head retail-panel-head--wrap"><div><span>Disponibilidade</span><h3>Saldo por produto</h3></div><div class="retail-segmented"><button class="${retailUiState.inventoryFilter === 'ALL' ? 'is-active' : ''}" onclick="filterRetailInventory('ALL')">Todos</button><button class="${retailUiState.inventoryFilter === 'LOW' ? 'is-active' : ''}" onclick="filterRetailInventory('LOW')">Baixo</button><button class="${retailUiState.inventoryFilter === 'OUT' ? 'is-active' : ''}" onclick="filterRetailInventory('OUT')">Sem estoque</button></div></div><div class="retail-table-wrap"><table class="retail-table"><thead><tr><th>Produto</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Situação</th><th></th></tr></thead><tbody>${products.map(renderRetailInventoryRow).join('')}</tbody></table></div></article><article class="retail-panel retail-movements"><div class="retail-panel-head"><div><span>Auditoria</span><h3>Últimos movimentos</h3></div></div><div class="retail-movement-list">${data.movements.slice(0, 8).map((movement) => renderRetailMovement(data, movement)).join('')}</div></article></section>
        <section class="retail-panel retail-lots-panel"><div class="retail-panel-head retail-panel-head--wrap"><div><span>CONTROLE OPCIONAL</span><h3>Lotes e validade</h3><p>Use apenas nos produtos que precisam de rastreabilidade por lote.</p></div><button class="retail-button retail-button--ghost" onclick="openRetailLotModal()">+ Registrar lote</button></div><div class="retail-lot-grid">${data.lots.map((lot) => renderRetailLot(data, lot)).join('') || '<div class="retail-empty-state"><span>▦</span><h3>Nenhum lote cadastrado</h3></div>'}</div></section>
    `);
}

function renderRetailLot(data, lot) {
    const product = retailProductById(data, lot.productId);
    const expiresAt = new Date(`${lot.expiresAt}T12:00:00`);
    const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
    const tone = days <= 30 ? 'danger' : (days <= 90 ? 'warning' : 'success');
    return `<article class="retail-lot-card"><span class="retail-product-mini" style="--product-accent:${product.accent}">${product.emoji}</span><div><small>${retailEscape(lot.code)}</small><strong>${retailEscape(product.name)}</strong><p>${lot.quantity} un. · vence em ${expiresAt.toLocaleDateString('pt-BR')}</p></div><span class="retail-stock-pill is-${tone}">${days < 0 ? 'Vencido' : `${days} dias`}</span></article>`;
}

async function openRetailLotModal() {
    const data = await retailApi.getWorkspace();
    openModal(`<div class="modal-header"><div><h3>Registrar lote</h3><p class="modal-header-subtitle">A entrada atualiza o estoque físico e a trilha de movimentos.</p></div><button class="modal-close" onclick="closeModal()">✕</button></div><form onsubmit="saveRetailLot(event)"><div class="modal-body retail-form-grid"><label class="retail-field retail-field--wide">Produto *<select name="productId" required>${data.products.map((product) => `<option value="${retailEscape(product.id)}">${retailEscape(product.name)} · ${retailEscape(product.packageLabel)}</option>`).join('')}</select></label><label class="retail-field">Código do lote *<input name="code" required maxlength="40" placeholder="Ex.: LT-2408A"></label><label class="retail-field">Validade *<input name="expiresAt" required type="date"></label><label class="retail-field retail-field--wide">Quantidade de entrada *<input name="quantity" required type="number" min="1" step="1" placeholder="0"></label><div id="retail-lot-form-error" class="retail-form-error retail-field--wide" hidden></div></div><div class="modal-footer"><button type="button" class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn-sm btn-primary">Registrar entrada</button></div></form>`);
}

async function saveRetailLot(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
        await retailApi.saveLot({ productId: form.productId.value, code: form.code.value.trim(), expiresAt: form.expiresAt.value, quantity: Number(form.quantity.value) });
        closeModal();
        showToast('Lote e entrada registrados no protótipo.', 'success');
        await loadRetailInventoryPage();
    } catch (error) {
        const target = document.getElementById('retail-lot-form-error');
        if (target) { target.hidden = false; target.textContent = error.message; }
    }
}

function renderRetailInventoryRow(product) {
    const health = retailStockHealth(product);
    return `<tr><td><div class="retail-table-product"><span style="--product-accent:${product.accent}">${product.emoji}</span><div><strong>${retailEscape(product.name)}</strong><small>${retailEscape(product.sku)} · ${retailEscape(product.packageLabel)}</small></div></div></td><td><strong>${product.onHand}</strong></td><td>${product.reserved}</td><td><strong>${retailAvailable(product)}</strong></td><td><span class="retail-stock-pill is-${health.tone}">${health.label}</span></td><td>${isRetailPreview() ? `<button class="retail-table-action" onclick="openRetailStockAdjustment('${retailEscape(product.id)}')">Ajustar</button>` : '<span class="retail-inline-status">Consulta</span>'}</td></tr>`;
}

function renderRetailMovement(data, movement) {
    const product = retailProductById(data, movement.productId);
    const positive = Number(movement.quantity) > 0;
    return `<div class="retail-movement"><span class="retail-movement__icon ${positive ? 'is-positive' : 'is-negative'}">${positive ? '↗' : '↘'}</span><div><strong>${retailEscape(product.name)}</strong><small>${retailEscape(movement.actor)} · ${retailEscape(movement.at)}</small></div><b class="${positive ? 'is-positive' : 'is-negative'}">${positive ? '+' : ''}${movement.quantity}</b></div>`;
}

async function filterRetailInventory(value) {
    retailUiState.inventoryFilter = value;
    const data = await retailApi.getWorkspace();
    renderRetailInventory(document.getElementById('page-retailInventory'), data);
}

async function openRetailStockAdjustment(productId) {
    const data = await retailApi.getWorkspace();
    const product = retailProductById(data, productId);
    openModal(`<div class="modal-header"><div><h3>Ajustar estoque</h3><p class="modal-header-subtitle">${retailEscape(product.name)} · ${retailEscape(product.sku)}</p></div><button class="modal-close" onclick="closeModal()">✕</button></div><form onsubmit="saveRetailStockAdjustment(event, '${retailEscape(productId)}')"><div class="modal-body"><div class="retail-stock-current"><div><small>Físico</small><strong>${product.onHand}</strong></div><div><small>Reservado</small><strong>${product.reserved}</strong></div><div><small>Disponível</small><strong>${retailAvailable(product)}</strong></div></div><label class="retail-field">Quantidade do ajuste<input name="delta" required type="number" step="1" placeholder="Ex.: 10 ou -2"></label><label class="retail-field">Motivo *<textarea name="reason" required rows="3" placeholder="Descreva a entrada, perda ou correção"></textarea></label><p class="retail-form-help">Use valor positivo para entrada e negativo para saída. Reservas não podem ser removidas manualmente.</p><div id="retail-stock-form-error" class="retail-form-error" hidden></div></div><div class="modal-footer"><button type="button" class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button type="submit" class="btn-sm btn-primary">Confirmar ajuste</button></div></form>`);
}

function openRetailInventoryEntry() {
    navigate('retailInventory');
    showToast('Escolha um produto e use “Ajustar” para simular a entrada no frontend.', 'info');
}

async function saveRetailStockAdjustment(event, productId) {
    event.preventDefault();
    const form = event.currentTarget;
    const delta = Number(form.delta.value);
    try {
        if (!Number.isInteger(delta) || delta === 0) throw new Error('Informe uma quantidade inteira diferente de zero.');
        await retailApi.adjustInventory(productId, delta, form.reason.value.trim());
        closeModal();
        showToast('Estoque atualizado no protótipo.', 'success');
        await loadRetailInventoryPage();
    } catch (error) {
        const target = document.getElementById('retail-stock-form-error');
        if (target) { target.hidden = false; target.textContent = error.message; }
    }
}

async function loadRetailPickingPage() {
    const root = document.getElementById('page-retailPicking');
    if (!root) return;
    root.innerHTML = retailPageShell('<div class="retail-loading">Organizando a fila…</div>');
    try {
        const data = await retailApi.getWorkspace();
        renderRetailPicking(root, data);
        updateRetailBadges(data);
    } catch (error) {
        renderRetailIntegrationError(root, error);
    }
}

function renderRetailPicking(root, data) {
    const query = retailUiState.pickingSearch.toLowerCase();
    root.innerHTML = retailPageShell(`
        <section class="retail-picking-head"><div><span class="retail-eyebrow">SOMENTE COMPRAS PAGAS</span><h2>Central de Separação</h2><p>Produtos, conferência e expedição em etapas que deixam a operação legível.</p></div><label class="retail-search retail-search--compact"><span>⌕</span><input value="${retailEscape(retailUiState.pickingSearch)}" placeholder="Pedido ou cliente" oninput="filterRetailPicking(this.value)"></label></section>
        <div class="retail-picking-live"><span><i></i>${isRetailPreview() ? 'Protótipo local — ações ficam salvas neste navegador' : 'Atualização ao vivo'}</span><strong>${data.orders.length} compra${data.orders.length === 1 ? '' : 's'} em operação</strong></div>
        <section class="retail-board">${Object.keys(RETAIL_STATUS_META).map((status) => renderRetailColumn(data, status, query)).join('')}</section>
    `);
}

function renderRetailColumn(data, status, query) {
    const meta = RETAIL_STATUS_META[status];
    const orders = data.orders.filter((order) => order.status === status && (!query || `${order.code} ${order.customer}`.toLowerCase().includes(query)));
    return `<article class="retail-board-column is-${meta.tone}"><header><i></i><div><strong>${meta.label}</strong><small>${retailStageHint(status)}</small></div><b>${orders.length}</b></header><div class="retail-board-column__body">${orders.map((order) => renderRetailOrderCard(data, order)).join('') || `<div class="retail-column-empty"><span>✓</span><p>Nenhuma compra nesta etapa.</p></div>`}</div></article>`;
}

function retailStageHint(status) {
    return { NEW: 'Pagamento confirmado', PICKING: 'Coleta dos produtos', PACKING: 'Conferir e embalar', READY: 'Retirada ou expedição' }[status];
}

function renderRetailOrderCard(data, order) {
    const meta = RETAIL_STATUS_META[order.status];
    const itemCount = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const products = order.items.slice(0, order.status === 'NEW' ? 3 : 8);
    const progress = order.status === 'PICKING' ? order.items.filter((item) => item.picked).length : 0;
    const action = order.status === 'READY'
        ? `<button class="retail-button retail-button--stage" onclick="navigate('delivery')">Abrir entrega</button>`
        : `<button class="retail-button retail-button--stage" onclick="advanceRetailOrder(this, '${retailEscape(order.id)}', '${meta.next}', ${Number(order.version || 1)})">${meta.action}</button>`;
    return `<article class="retail-order-card"><div class="retail-order-card__top"><div><small>COMPRA</small><h3>#${retailEscape(order.code)}</h3></div><span class="retail-mode-pill">${order.mode === 'DELIVERY' ? '🚚 Entrega' : '◉ Retirada'}</span></div><div class="retail-order-customer"><span>${retailEscape(order.customer).slice(0, 1)}</span><div><small>CLIENTE</small><strong>${retailEscape(order.customer)}</strong></div><time>${retailEscape(order.createdAt)}</time></div>${order.status === 'PICKING' ? `<div class="retail-progress"><span><i style="width:${Math.round((progress / Math.max(1, order.items.length)) * 100)}%"></i></span><small>${progress}/${order.items.length} itens separados</small></div>` : ''}<div class="retail-order-items">${products.map((item) => renderRetailOrderItem(data, item, order.status)).join('')}${order.items.length > products.length ? `<button onclick="openRetailOrderDetails('${retailEscape(order.id)}')">+ ${order.items.length - products.length} produtos</button>` : ''}</div>${order.note ? `<div class="retail-order-note"><b>Observação</b><span>${retailEscape(order.note)}</span></div>` : ''}<div class="retail-order-card__summary"><span>${itemCount} un. · ${retailEscape(order.payment)}</span><strong>${retailMoney(order.total)}</strong></div><div class="retail-order-card__actions"><button class="retail-button retail-button--ghost" onclick="openRetailOrderDetails('${retailEscape(order.id)}')">Ver detalhes</button>${action}</div></article>`;
}

function renderRetailOrderItem(data, item, status) {
    const product = retailProductById(data, item.productId);
    return `<div class="retail-order-item ${item.picked ? 'is-picked' : ''}">${status === 'PICKING' ? `<span class="retail-check">${item.picked ? '✓' : ''}</span>` : ''}<span class="retail-order-item__visual" style="--product-accent:${product.accent}">${product.emoji}</span><div><strong>${item.quantity}× ${retailEscape(product.name)}</strong><small>${retailEscape(product.packageLabel)}</small></div></div>`;
}

async function filterRetailPicking(value) {
    retailUiState.pickingSearch = String(value || '');
    const data = await retailApi.getWorkspace();
    renderRetailPicking(document.getElementById('page-retailPicking'), data);
    const input = document.querySelector('#page-retailPicking .retail-search input');
    if (input) { input.focus(); input.setSelectionRange(value.length, value.length); }
}

async function advanceRetailOrder(button, orderId, nextStatus, expectedVersion) {
    if (retailPendingTransitions.has(orderId)) return;
    retailPendingTransitions.add(orderId);
    const originalLabel = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = 'Atualizando…'; }
    try {
        await retailApi.moveFulfillment(orderId, nextStatus, expectedVersion);
        showToast(nextStatus === 'COMPLETED' ? 'Pedido liberado e removido da fila.' : 'Pedido avançou para a próxima etapa.', 'success');
        await loadRetailPickingPage();
    } catch (error) {
        showToast(error.message, 'error');
        if (button) { button.disabled = false; button.textContent = originalLabel; }
    } finally {
        retailPendingTransitions.delete(orderId);
    }
}

async function openRetailOrderDetails(orderId) {
    const data = await retailApi.getWorkspace();
    const order = [...data.orders, ...(data.history || [])].find((item) => item.id === orderId);
    if (!order) return;
    openModal(`<div class="modal-header"><div><h3>Compra #${retailEscape(order.code)}</h3><p class="modal-header-subtitle">${retailEscape(order.customer)} · ${retailEscape(order.payment)}</p></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body retail-order-detail"><div class="retail-order-detail__destination"><small>${order.mode === 'DELIVERY' ? 'ENTREGAR EM' : 'MODALIDADE'}</small><strong>${retailEscape(order.address)}</strong></div><div class="retail-order-detail__list">${order.items.map((item) => renderRetailOrderItem(data, item, order.status)).join('')}</div>${order.note ? `<div class="retail-order-note"><b>Observação do cliente</b><span>${retailEscape(order.note)}</span></div>` : ''}<div class="retail-order-detail__total"><span>Total confirmado</span><strong>${retailMoney(order.total)}</strong></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Fechar</button></div>`);
}

async function loadRetailOrdersPage() {
    const root = document.getElementById('page-retailOrders');
    if (!root) return;
    root.innerHTML = retailPageShell('<div class="retail-loading">Montando o histórico de compras…</div>');
    try {
        const data = await retailApi.getWorkspace();
        const rows = [...data.orders, ...(data.history || [])];
        const paidTotal = rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
        root.innerHTML = retailPageShell(`
            <section class="retail-toolbar-card"><div class="retail-toolbar-copy"><span class="retail-eyebrow">JORNADA COMPLETA</span><h2>Compras online</h2><p>Da confirmação do pagamento ao histórico, sem misturar com pedidos da cozinha.</p></div><button class="retail-button retail-button--primary" onclick="navigate('retailPicking')">Abrir separação</button></section>
            <section class="retail-kpis retail-kpis--compact">${renderRetailKpi('Em operação', data.orders.length, 'Compras pagas abertas', '▣', 'teal')}${renderRetailKpi('Concluídas', data.history.length, 'Histórico disponível', '✓', 'green')}${renderRetailKpi('Valor da amostra', retailMoney(paidTotal), 'Dados do protótipo', 'R$', 'blue')}${renderRetailKpi('Entrega própria', rows.filter((order) => order.mode === 'DELIVERY').length, 'Demais são retiradas', '↗', 'violet')}</section>
            <section class="retail-panel retail-orders-history"><div class="retail-panel-head"><div><span>COMPRAS CONFIRMADAS</span><h3>Atuais e concluídas</h3></div><div class="retail-segmented"><button class="is-active">Todas</button><button>Em andamento</button><button>Concluídas</button></div></div><div class="retail-table-wrap"><table class="retail-table"><thead><tr><th>Compra</th><th>Cliente</th><th>Modalidade</th><th>Etapa</th><th>Itens</th><th>Total</th><th></th></tr></thead><tbody>${rows.map((order) => renderRetailOrderHistoryRow(order)).join('')}</tbody></table></div></section>
        `);
        updateRetailBadges(data);
    } catch (error) {
        renderRetailIntegrationError(root, error);
    }
}

function renderRetailOrderHistoryRow(order) {
    const statusLabel = order.status === 'COMPLETED' ? 'Concluída' : RETAIL_STATUS_META[order.status]?.label || order.status;
    const tone = order.status === 'COMPLETED' ? 'success' : (order.status === 'NEW' ? 'warning' : 'info');
    const units = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `<tr><td><strong>#${retailEscape(order.code)}</strong><small class="retail-table-sub">${retailEscape(order.createdAt)}</small></td><td><strong>${retailEscape(order.customer)}</strong><small class="retail-table-sub">${retailEscape(order.payment)}</small></td><td>${order.mode === 'DELIVERY' ? '🚚 Entrega' : '◎ Retirada'}</td><td><span class="retail-stock-pill is-${tone}">${retailEscape(statusLabel)}</span>${order.completedAt ? `<small class="retail-table-sub">${retailEscape(order.completedAt)}</small>` : ''}</td><td>${units} un.</td><td><strong>${retailMoney(order.total)}</strong></td><td><button class="retail-table-action" onclick="openRetailOrderDetails('${retailEscape(order.id)}')">Detalhes</button></td></tr>`;
}

function updateRetailBadges(data) {
    const stock = document.getElementById('badge-retail-stock');
    const picking = document.getElementById('badge-retail-picking');
    const low = data.products.filter((product) => retailStockHealth(product).key !== 'OK').length;
    const fresh = data.orders.filter((order) => order.status === 'NEW').length;
    if (stock) { stock.textContent = low || ''; stock.style.display = low ? '' : 'none'; }
    if (picking) { picking.textContent = fresh || ''; picking.style.display = fresh ? '' : 'none'; }
}

function renderRetailIntegrationError(root, error) {
    root.innerHTML = retailPageShell(`<div class="retail-integration-state"><span>◇</span><h2>Frontend RETAIL pronto para integração</h2><p>${retailEscape(error?.message || 'A API RETAIL ainda não está disponível.')}</p><a href="${window.location.pathname}?retail-preview=market&retail-reset=1">Abrir com dados de demonstração</a></div>`);
}

function destroyRetailPickingPage() {
    // Reserved for the realtime subscription introduced with the backend.
}

window.isRetailProfile = isRetailProfile;
window.loadRetailOverview = loadRetailOverview;
window.loadRetailProductsPage = loadRetailProductsPage;
window.loadRetailInventoryPage = loadRetailInventoryPage;
window.loadRetailPickingPage = loadRetailPickingPage;
window.loadRetailOrdersPage = loadRetailOrdersPage;
window.destroyRetailPickingPage = destroyRetailPickingPage;
window.filterRetailProducts = filterRetailProducts;
window.filterRetailProductCategory = filterRetailProductCategory;
window.openRetailCategoriesModal = openRetailCategoriesModal;
window.saveRetailCategory = saveRetailCategory;
window.openRetailProductModal = openRetailProductModal;
window.saveRetailProduct = saveRetailProduct;
window.filterRetailInventory = filterRetailInventory;
window.openRetailStockAdjustment = openRetailStockAdjustment;
window.openRetailInventoryEntry = openRetailInventoryEntry;
window.saveRetailStockAdjustment = saveRetailStockAdjustment;
window.openRetailLotModal = openRetailLotModal;
window.saveRetailLot = saveRetailLot;
window.filterRetailPicking = filterRetailPicking;
window.advanceRetailOrder = advanceRetailOrder;
window.openRetailOrderDetails = openRetailOrderDetails;
