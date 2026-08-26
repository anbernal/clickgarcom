const storeRuntime = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const STORE_API_BASE = String(storeRuntime.apiBaseUrl || '/admin/api').replace(/\/$/, '');
const STORE_ICONS = Object.freeze({
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    location: '<svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 8h14l1 13H4zM9 8a3 3 0 0 1 6 0"/></svg>',
});

const STORE_DEMO = Object.freeze({
    tenant: { name: 'Mercado Modelo', type: 'MARKET', initials: 'MM', open: true, description: 'Produtos para sua rotina, separados com cuidado e entregues com acompanhamento.' },
    categories: [
        { id: 'offers', name: 'Ofertas do dia', emoji: '🏷️', accent: '#fee2e2' },
        { id: 'basics', name: 'Alimentos básicos', emoji: '🧺', accent: '#fef3c7' },
        { id: 'cleaning', name: 'Limpeza', emoji: '🧴', accent: '#ccfbf1' },
        { id: 'meat', name: 'Carnes e aves', emoji: '🥩', accent: '#ffe4e6' },
        { id: 'dairy', name: 'Frios e laticínios', emoji: '🧀', accent: '#fef9c3' },
        { id: 'drinks', name: 'Bebidas', emoji: '💧', accent: '#cffafe' },
        { id: 'care', name: 'Higiene e beleza', emoji: '🫧', accent: '#fce7f3' },
    ],
    products: [
        { id: 'p1', name: 'Biscoito de Polvilho Tradicional', brand: 'Casa Leve', categoryId: 'offers', package: 'Pacote 100 g', price: 6.92, oldPrice: 8.31, badge: 'A partir da 3ª un.', stock: 27, emoji: '🥨', accent: '#fee2e2', repeat: true },
        { id: 'p2', name: 'Água Mineral com Gás', brand: 'Cristalina', categoryId: 'drinks', package: 'Garrafa 500 ml', price: 2.48, oldPrice: 2.76, badge: '-10%', stock: 60, emoji: '💧', accent: '#cffafe', repeat: true },
        { id: 'p3', name: 'Arroz Tipo 1', brand: 'Boa Mesa', categoryId: 'basics', package: 'Pacote 5 kg', price: 27.90, stock: 36, emoji: '🍚', accent: '#f3dfb6', repeat: true },
        { id: 'p4', name: 'Leite Integral', brand: 'Fazenda Clara', categoryId: 'dairy', package: 'Caixa 1 L', price: 5.79, stock: 18, emoji: '🥛', accent: '#dbeafe', repeat: true },
        { id: 'p5', name: 'Detergente Neutro', brand: 'Brilho', categoryId: 'cleaning', package: 'Frasco 500 ml', price: 2.89, stock: 42, emoji: '🧴', accent: '#ccfbf1' },
        { id: 'p6', name: 'Café Torrado e Moído', brand: 'Serra Alta', categoryId: 'basics', package: 'Pacote 500 g', price: 18.90, oldPrice: 21.90, badge: 'Oferta', stock: 9, emoji: '☕', accent: '#fde7d8' },
        { id: 'p7', name: 'Shampoo Nutritivo', brand: 'Vitta', categoryId: 'care', package: 'Frasco 350 ml', price: 22.50, stock: 5, emoji: '🧼', accent: '#ede9fe' },
        { id: 'p8', name: 'Sabonete Líquido', brand: 'Vitta', categoryId: 'care', package: 'Frasco 250 ml', price: 12.90, stock: 0, emoji: '🫧', accent: '#fce7f3' },
        { id: 'p9', name: 'Batata Lavada', brand: 'Hortifruti', categoryId: 'offers', package: 'Pacote 1 kg', price: 7.49, oldPrice: 9.30, badge: '-19%', stock: 16, emoji: '🥔', accent: '#fef3c7' },
        { id: 'p10', name: 'Leite Condensado', brand: 'Doce Campo', categoryId: 'offers', package: 'Caixa 395 g', price: 6.39, oldPrice: 7.99, badge: '-20%', stock: 21, emoji: '🥫', accent: '#fef9c3' },
        { id: 'p11', name: 'Filé de Frango', brand: 'Granja Real', categoryId: 'meat', package: 'Bandeja 1 kg', price: 19.90, stock: 12, emoji: '🍗', accent: '#ffe4e6' },
        { id: 'p12', name: 'Queijo Muçarela Fatiado', brand: 'Fazenda Clara', categoryId: 'dairy', package: 'Pacote 200 g', price: 13.75, stock: 14, emoji: '🧀', accent: '#fef9c3' },
    ],
});

const storeState = {
    data: null,
    profile: null,
    loginChallengeId: '',
    cart: {},
    query: '',
    category: 'all',
    sort: 'relevance',
};

function storeSlug() {
    const match = window.location.pathname.match(/\/loja\/([^/]+)/i);
    return match?.[1] || 'loja';
}

function storePreviewType() {
    return String(new URLSearchParams(window.location.search).get('preview') || '').toLowerCase();
}

function storeCartKey() {
    return `clickgarcom_store_cart_${storeSlug()}`;
}

function storeClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function pharmacyDemo() {
    const data = storeClone(STORE_DEMO);
    data.tenant = { name: 'Farmácia Modelo', type: 'PHARMACY', initials: 'FM', open: true, description: 'Cuidado, higiene e bem-estar com compra simples e entrega acompanhada.' };
    data.categories = [
        { id: 'offers', name: 'Ofertas', emoji: '🏷️', accent: '#fee2e2' },
        { id: 'care', name: 'Higiene pessoal', emoji: '🫧', accent: '#fce7f3' },
        { id: 'beauty', name: 'Beleza', emoji: '✨', accent: '#ede9fe' },
        { id: 'baby', name: 'Mamãe e bebê', emoji: '🧸', accent: '#fef3c7' },
        { id: 'wellness', name: 'Bem-estar', emoji: '🌿', accent: '#dcfce7' },
    ];
    data.products = [
        { id: 'f1', name: 'Shampoo Nutritivo', brand: 'Vitta', categoryId: 'care', package: 'Frasco 350 ml', price: 22.50, oldPrice: 25.90, badge: '-13%', stock: 18, emoji: '🧼', accent: '#ede9fe', repeat: true },
        { id: 'f2', name: 'Sabonete Líquido Suave', brand: 'Vitta', categoryId: 'care', package: 'Frasco 250 ml', price: 12.90, stock: 23, emoji: '🫧', accent: '#fce7f3', repeat: true },
        { id: 'f3', name: 'Protetor Solar FPS 50', brand: 'Solaris', categoryId: 'wellness', package: 'Bisnaga 120 ml', price: 49.90, oldPrice: 59.90, badge: 'Oferta', stock: 12, emoji: '☀️', accent: '#fef3c7', repeat: true },
        { id: 'f4', name: 'Fraldas Conforto M', brand: 'Bebê Feliz', categoryId: 'baby', package: 'Pacote 32 un.', price: 47.80, stock: 9, emoji: '🧸', accent: '#dbeafe' },
        { id: 'f5', name: 'Creme Hidratante', brand: 'Essenza', categoryId: 'beauty', package: 'Pote 200 ml', price: 31.40, stock: 16, emoji: '✨', accent: '#ede9fe' },
        { id: 'f6', name: 'Escova Dental Macia', brand: 'Sorriso+', categoryId: 'care', package: '1 unidade', price: 8.75, stock: 34, emoji: '🪥', accent: '#ccfbf1' },
        { id: 'f7', name: 'Algodão Hidrófilo', brand: 'Cuidado', categoryId: 'wellness', package: 'Pacote 100 g', price: 7.20, stock: 20, emoji: '☁️', accent: '#f1f5f9' },
        { id: 'f8', name: 'Kit Cuidados Diários', brand: 'Essenza', categoryId: 'offers', package: '3 produtos', price: 54.90, oldPrice: 69.90, badge: '-21%', stock: 7, emoji: '🎁', accent: '#fee2e2' },
    ];
    return data;
}

async function fetchStoreData() {
    const preview = storePreviewType();
    if (preview) return preview === 'pharmacy' ? pharmacyDemo() : storeClone(STORE_DEMO);
    const response = await fetch(`${STORE_API_BASE}/public/stores/${encodeURIComponent(storeSlug())}/catalog`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (response.status === 401) { const error = new Error('Entre com o número vinculado ao WhatsApp para abrir sua loja.'); error.code = 'AUTH'; throw error; }
    if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.message || 'A loja ainda não está disponível.'); }
    return response.json();
}

async function storeFetch(path, options = {}) {
    const response = await fetch(`${STORE_API_BASE}/public/stores/${encodeURIComponent(storeSlug())}${path}`, {
        credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || 'Não foi possível concluir agora.');
    return payload;
}

function storeEscape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function storeMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function loadStoreCart() {
    try { storeState.cart = JSON.parse(localStorage.getItem(storeCartKey()) || '{}') || {}; } catch (_) { storeState.cart = {}; }
}

function saveStoreCart() {
    localStorage.setItem(storeCartKey(), JSON.stringify(storeState.cart));
    renderStoreCartCounters();
}

function cartQuantity() {
    return Object.values(storeState.cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
}

function cartTotal() {
    return Object.entries(storeState.cart).reduce((sum, [id, quantity]) => {
        const product = storeState.data?.products.find((item) => item.id === id);
        return sum + Number(product?.price || 0) * Number(quantity || 0);
    }, 0);
}

function productQuantity(id) {
    return Number(storeState.cart[id] || 0);
}

function renderStore() {
    const data = storeState.data;
    document.title = `${data.tenant.name} — Loja digital`;
    document.getElementById('store-name').textContent = data.tenant.name;
    document.getElementById('store-logo').textContent = data.tenant.initials || data.tenant.name.slice(0, 2).toUpperCase();
    document.getElementById('store-status').textContent = data.tenant.open ? 'Aberto · entrega hoje' : 'Fechado no momento';
    document.getElementById('store-open-dot').classList.toggle('is-closed', !data.tenant.open);
    if (data.tenant.type === 'PHARMACY') {
        document.getElementById('store-hero-title').textContent = 'Cuidado e bem-estar perto de você.';
        document.getElementById('store-hero-copy').textContent = data.tenant.description;
    }
    renderStoreCategories();
    renderStoreProductRails();
    renderStoreCatalog();
    renderStoreCartCounters();
}

function renderStoreCategories() {
    const root = document.getElementById('store-categories');
    const all = { id: 'all', name: 'Todos os produtos', emoji: '🛍️', accent: '#dcfce7' };
    root.innerHTML = [all, ...storeState.data.categories].map((category) => `<button type="button" class="store-category ${storeState.category === category.id ? 'is-active' : ''}" onclick="selectStoreCategory('${storeEscape(category.id)}')"><span style="--category-accent:${category.accent}"><b>${category.emoji}</b></span><strong>${storeEscape(category.name)}</strong></button>`).join('');
}

function renderStoreProductRails() {
    const repeats = storeState.data.products.filter((product) => product.repeat && product.stock > 0).slice(0, 6);
    const offers = storeState.data.products.filter((product) => product.oldPrice && product.stock > 0).slice(0, 8);
    document.getElementById('store-repeat-products').innerHTML = repeats.map((product) => renderStoreProductCard(product, true)).join('');
    document.getElementById('store-offer-products').innerHTML = offers.map((product) => renderStoreProductCard(product, true)).join('');
}

function filteredStoreProducts() {
    const query = storeState.query.toLowerCase();
    let products = storeState.data.products.filter((product) => {
        const categoryMatch = storeState.category === 'all' || product.categoryId === storeState.category;
        const searchMatch = !query || `${product.name} ${product.brand} ${product.package}`.toLowerCase().includes(query);
        return categoryMatch && searchMatch;
    });
    if (storeState.sort === 'price-asc') products.sort((a, b) => a.price - b.price);
    if (storeState.sort === 'price-desc') products.sort((a, b) => b.price - a.price);
    if (storeState.sort === 'name') products.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return products;
}

function renderStoreCatalog() {
    const products = filteredStoreProducts();
    const category = storeState.data.categories.find((item) => item.id === storeState.category);
    document.getElementById('store-catalog-title').textContent = storeState.query ? 'Resultado da busca' : (category?.name || 'Todos os produtos');
    document.getElementById('store-catalog-eyebrow').textContent = storeState.query ? `BUSCA POR “${storeState.query}”` : 'CATÁLOGO COMPLETO';
    document.getElementById('store-results-count').textContent = `${products.length} produto${products.length === 1 ? '' : 's'}`;
    document.getElementById('store-product-grid').innerHTML = products.length ? products.map((product) => renderStoreProductCard(product, false)).join('') : '<div class="store-empty"><span>⌕</span><h3>Nenhum produto encontrado</h3><p>Tente outra busca ou selecione uma categoria.</p><button onclick="clearStoreSearch();selectStoreCategory(\'all\')">Ver todos os produtos</button></div>';
}

function renderStoreProductCard(product, rail) {
    const quantity = productQuantity(product.id);
    const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
    const visual = product.imageUrl ? `<img src="${storeEscape(product.imageUrl)}" alt="" loading="lazy">` : `<span>${product.emoji}</span>`;
    return `<article class="store-product-card ${rail ? 'store-product-card--rail' : ''} ${product.stock <= 0 ? 'is-unavailable' : ''}"><button class="store-product-card__main" type="button" onclick="openStoreProduct('${storeEscape(product.id)}')"><div class="store-product-card__visual" style="--product-accent:${product.accent}">${visual}${discount ? `<em>-${discount}%</em>` : ''}${product.stock <= 0 ? '<b>Indisponível</b>' : ''}</div><div class="store-product-card__copy"><small>${storeEscape(product.brand)}</small>${product.oldPrice ? `<del>${storeMoney(product.oldPrice)}</del>` : '<i>&nbsp;</i>'}<strong>${storeMoney(product.price)}</strong>${product.badge ? `<mark>${storeEscape(product.badge)}</mark>` : ''}<h3>${storeEscape(product.name)}</h3><p>${storeEscape(product.package)}</p></div></button><div class="store-product-card__action">${quantity ? `<div class="store-stepper"><button aria-label="Remover uma unidade de ${storeEscape(product.name)}" onclick="changeStoreQuantity('${storeEscape(product.id)}', -1)">−</button><b>${quantity}</b><button aria-label="Adicionar uma unidade de ${storeEscape(product.id)}" onclick="changeStoreQuantity('${storeEscape(product.id)}', 1)">+</button></div>` : `<button class="store-add-button" type="button" aria-label="Adicionar ${storeEscape(product.name)}" onclick="changeStoreQuantity('${storeEscape(product.id)}', 1)" ${product.stock <= 0 ? 'disabled' : ''}>+</button>`}</div></article>`;
}

function selectStoreCategory(categoryId) {
    storeState.category = categoryId;
    storeState.query = '';
    document.getElementById('store-search-input').value = '';
    renderStoreCategories();
    renderStoreCatalog();
    document.querySelector('.store-product-section--catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectStoreSection(section) {
    if (section === 'offers') storeState.category = 'offers';
    else storeState.category = 'all';
    renderStoreCategories();
    renderStoreCatalog();
    document.querySelector('.store-product-section--catalog').scrollIntoView({ behavior: 'smooth' });
}

function filterStoreProducts(value) {
    storeState.query = String(value || '').trim();
    storeState.category = 'all';
    document.getElementById('store-search-clear').hidden = !storeState.query;
    renderStoreCategories();
    renderStoreCatalog();
}

function clearStoreSearch() {
    storeState.query = '';
    document.getElementById('store-search-input').value = '';
    document.getElementById('store-search-clear').hidden = true;
    renderStoreCatalog();
}

function sortStoreProducts(value) {
    storeState.sort = value;
    renderStoreCatalog();
}

function changeStoreQuantity(productId, delta) {
    const product = storeState.data.products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) return;
    const next = Math.max(0, Math.min(product.stock, productQuantity(productId) + delta));
    if (next) storeState.cart[productId] = next;
    else delete storeState.cart[productId];
    saveStoreCart();
    renderStoreProductRails();
    renderStoreCatalog();
    if (delta > 0) showStoreToast(`${product.name} foi para a sacola.`);
}

function renderStoreCartCounters() {
    const quantity = cartQuantity();
    document.getElementById('store-cart-count').textContent = quantity;
    document.getElementById('store-floating-count').textContent = `${quantity} ${quantity === 1 ? 'item' : 'itens'}`;
    document.getElementById('store-floating-total').textContent = storeMoney(cartTotal());
    document.getElementById('store-floating-cart').hidden = quantity === 0;
}

function openStoreLayer(html, className = '') {
    const layer = document.getElementById('store-layer');
    const sheet = document.getElementById('store-sheet');
    sheet.className = `store-sheet ${className}`;
    sheet.innerHTML = html;
    layer.hidden = false;
    document.body.classList.add('store-no-scroll');
}

function closeStoreLayer() {
    document.getElementById('store-layer').hidden = true;
    document.getElementById('store-sheet').innerHTML = '';
    document.body.classList.remove('store-no-scroll');
}

function storeSheetHead(title, subtitle) {
    return `<div class="store-sheet__handle"></div><div class="store-sheet__head"><div><h2>${storeEscape(title)}</h2><p>${storeEscape(subtitle)}</p></div><button type="button" aria-label="Fechar" onclick="closeStoreLayer()">${STORE_ICONS.close}</button></div>`;
}

function openStoreProduct(productId) {
    const product = storeState.data.products.find((item) => item.id === productId);
    if (!product) return;
    const quantity = productQuantity(productId);
    openStoreLayer(`${storeSheetHead(product.name, `${product.brand} · ${product.package}`)}<div class="store-product-detail"><div class="store-product-detail__visual" style="--product-accent:${product.accent}"><span>${product.emoji}</span></div><div class="store-product-detail__copy"><small>${storeEscape(product.brand)}</small><h3>${storeEscape(product.name)}</h3><p>${storeEscape(product.package)}. Produto unitário com preço confirmado antes do pagamento.</p><strong>${storeMoney(product.price)}</strong></div></div><div class="store-detail-action">${product.stock > 0 ? `<div class="store-stepper store-stepper--large"><button onclick="changeStoreDetailQuantity('${storeEscape(product.id)}', -1)">−</button><b id="store-detail-quantity">${quantity}</b><button onclick="changeStoreDetailQuantity('${storeEscape(product.id)}', 1)">+</button></div><button class="store-primary-button" onclick="closeStoreLayer();openStoreCart()">${quantity ? 'Ver sacola' : 'Adicionar à sacola'}</button>` : '<button class="store-primary-button" disabled>Produto indisponível</button>'}</div>`, 'store-sheet--product');
}

function changeStoreDetailQuantity(productId, delta) {
    changeStoreQuantity(productId, delta);
    const target = document.getElementById('store-detail-quantity');
    if (target) target.textContent = productQuantity(productId);
}

function openStoreCart() {
    const entries = Object.entries(storeState.cart).filter(([, quantity]) => quantity > 0);
    openStoreLayer(`${storeSheetHead('Sua sacola', entries.length ? 'Revise quantidades antes de continuar' : 'Escolha produtos para iniciar sua compra')}${entries.length ? `<div class="store-cart-list">${entries.map(([id, quantity]) => renderStoreCartItem(id, quantity)).join('')}</div><div class="store-cart-summary"><span>Subtotal</span><strong>${storeMoney(cartTotal())}</strong><small>Frete calculado após escolher o endereço</small></div><button class="store-primary-button" onclick="openStoreCheckoutAddress()">Continuar para entrega</button><button class="store-secondary-button" onclick="closeStoreLayer()">Adicionar mais produtos</button>` : '<div class="store-sheet-empty"><span>🛍️</span><h3>Sua sacola está vazia</h3><p>Explore as categorias e toque em “+” para adicionar.</p><button class="store-primary-button" onclick="closeStoreLayer()">Ver produtos</button></div>'}`);
}

function renderStoreCartItem(id, quantity) {
    const product = storeState.data.products.find((item) => item.id === id);
    if (!product) return '';
    return `<div class="store-cart-item"><span class="store-cart-item__visual" style="--product-accent:${product.accent}">${product.emoji}</span><div><strong>${storeEscape(product.name)}</strong><small>${storeEscape(product.package)}</small><b>${storeMoney(product.price * quantity)}</b></div><div class="store-stepper"><button onclick="changeStoreQuantity('${storeEscape(id)}',-1);openStoreCart()">−</button><b>${quantity}</b><button onclick="changeStoreQuantity('${storeEscape(id)}',1);openStoreCart()">+</button></div></div>`;
}

async function openStoreCheckoutAddress() {
    if (storePreviewType()) {
        return openStoreLayer(`${storeSheetHead('Entrega ou retirada', 'Escolha como deseja receber sua compra')}<div class="store-checkout-progress"><i class="is-active"></i><i></i><i></i></div><div class="store-checkout-options"><button class="store-option-card is-selected"><span>${STORE_ICONS.location}</span><div><strong>Casa</strong><p>Rua José Leandro Machado, 13 · Vila Yolanda</p><small>Entrega estimada em 35–50 min</small></div><b>✓</b></button><button class="store-option-card"><span>◎</span><div><strong>Retirar na loja</strong><p>Sem taxa de entrega</p><small>Pronto em aproximadamente 25 min</small></div></button></div><button class="store-link-button" onclick="openStoreAccount()">Usar outro endereço</button><div class="store-checkout-total"><span><small>Produtos</small><b>${storeMoney(cartTotal())}</b></span><span><small>Entrega</small><b>${storeMoney(8)}</b></span><span class="is-total"><small>Total</small><b>${storeMoney(cartTotal() + 8)}</b></span></div><button class="store-primary-button" onclick="openStoreCheckoutPayment()">Continuar para pagamento</button>`, 'store-sheet--checkout');
    }
    try {
        if (!storePreviewType()) storeState.profile = await storeFetch('/session');
        const addresses = storeState.profile?.addresses || [];
        if (!addresses.length) return openStoreAddressForm();
        openStoreLayer(`${storeSheetHead('Onde você quer receber?', 'O frete será confirmado antes do pagamento')}<div class="store-checkout-progress"><i class="is-active"></i><i></i><i></i></div><div class="store-checkout-options">${addresses.map((address, index) => `<label class="store-option-card ${index === 0 ? 'is-selected' : ''}"><span>${STORE_ICONS.location}</span><div><strong>${storeEscape(address.label || 'Endereço')}</strong><p>${storeEscape(address.formatted_address || `${address.street}, ${address.address_number}`)}</p><small>Entrega acompanhada em tempo real</small></div><input type="radio" name="store_delivery_address" value="${storeEscape(address.id)}" ${index === 0 ? 'checked' : ''}></label>`).join('')}</div><button class="store-link-button" onclick="openStoreAddressForm()">+ Cadastrar outro endereço</button><div class="store-checkout-total"><span><small>Produtos</small><b>${storeMoney(cartTotal())}</b></span><span><small>Entrega</small><b>Calculada agora</b></span><span class="is-total"><small>Total</small><b>Confirmar</b></span></div><button class="store-primary-button" onclick="openStoreCheckoutPayment(this)">Continuar para pagamento</button>`, 'store-sheet--checkout');
    } catch (error) { showStoreToast(error.message); }
}

async function openStoreCheckoutPayment(button) {
    if (storePreviewType()) {
        return openStoreLayer(`${storeSheetHead('Pagamento', 'Escolha uma forma segura para concluir')}<div class="store-checkout-progress"><i class="is-done"></i><i class="is-active"></i><i></i></div><div class="store-checkout-options"><button class="store-payment-option is-selected"><span>PIX</span><div><strong>PIX</strong><small>Confirmação rápida</small></div><b>✓</b></button><button class="store-payment-option"><span>••••</span><div><strong>Cartão de crédito</strong><small>Pagamento online</small></div></button></div><div class="store-checkout-review"><div><small>Receber em</small><strong>Rua José Leandro Machado, 13</strong></div><div><small>Total da compra</small><strong>${storeMoney(cartTotal() + 8)}</strong></div></div><button class="store-primary-button" onclick="finishStorePreviewCheckout()">Confirmar compra</button><p class="store-secure-copy">🔒 Nenhum pedido entra em separação antes da confirmação do pagamento.</p>`, 'store-sheet--checkout');
    }
    const addressId = document.querySelector('input[name="store_delivery_address"]:checked')?.value;
    if (!addressId) return showStoreToast('Escolha um endereço para continuar.');
    try {
        if (button) { button.disabled = true; button.textContent = 'Calculando entrega…'; }
        const checkout = await storeFetch('/checkout', { method: 'POST', body: JSON.stringify({ address_id: addressId, idempotency_key: crypto.randomUUID(), items: Object.entries(storeState.cart).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity })) }) });
        // checkout.html already implements PIX/card, polling and the payment
        // confirmation safeguards used by the restaurant flow.
        window.location.assign(`/checkout.html?delivery_checkout=${encodeURIComponent(checkout.checkout_capability)}`);
    } catch (error) { if (button) { button.disabled = false; button.textContent = 'Continuar para pagamento'; } showStoreToast(error.message); }
}

function openStoreAddressForm() {
    openStoreLayer(`${storeSheetHead('Novo endereço', 'Preencha os dados para calcular a área de entrega')}<form class="store-address-form" onsubmit="saveStoreAddress(event)"><label>Nome do endereço<input name="label" value="Casa" required></label><label>CEP<input name="postal_code" inputmode="numeric" maxlength="9" required onblur="lookupStorePostalCode(this.form)"></label><label>Rua<input name="street" required></label><label>Número<input name="address_number" required></label><label>Bairro<input name="neighborhood" required></label><label>Cidade<input name="city" required></label><label>UF<input name="state" maxlength="2" required></label><label>Complemento<input name="address_complement"></label><div id="store-address-error" class="store-form-error" hidden></div><button class="store-primary-button" type="submit">Salvar endereço</button></form>`, 'store-sheet--checkout');
}

async function lookupStorePostalCode(form) { try { const data = await storeFetch(`/postal-code/${encodeURIComponent(form.postal_code.value.replace(/\D/g, ''))}`); ['street', 'neighborhood', 'city', 'state'].forEach((field) => { if (data?.[field]) form[field].value = data[field]; }); } catch (_) { } }
async function saveStoreAddress(event) { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries()); try { await storeFetch('/addresses', { method: 'POST', body: JSON.stringify(data) }); storeState.profile = await storeFetch('/session'); await openStoreCheckoutAddress(); } catch (error) { const target = document.getElementById('store-address-error'); if (target) { target.hidden = false; target.textContent = error.message; } } }

function finishStorePreviewCheckout() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    storeState.cart = {};
    saveStoreCart();
    document.getElementById('store-order-count').hidden = false;
    openStoreLayer(`<div class="store-success"><span>✓</span><small>PAGAMENTO CONFIRMADO</small><h2>Compra #${code} recebida!</h2><p>Os produtos agora seguirão para a Central de Separação. Você poderá acompanhar tudo por aqui e pelo WhatsApp.</p><div><b>Próxima etapa</b><strong>Em separação</strong></div><button class="store-primary-button" onclick="closeStoreLayer();openStoreOrders()">Acompanhar compra</button><button class="store-secondary-button" onclick="closeStoreLayer()">Voltar à loja</button></div>`, 'store-sheet--success');
}

function openStoreOrders() {
    openStoreLayer(`${storeSheetHead('Suas compras', 'Acompanhe cada etapa sem atualizar a página')}<article class="store-order"><div class="store-order__head"><div><small>COMPRA #4821</small><h3>Em separação</h3></div><span>3 produtos</span></div><div class="store-order__timeline"><i class="is-done"><b>✓</b><small>Recebido</small></i><i class="is-current"><b></b><small>Separação</small></i><i><b></b><small>Pronto</small></i><i><b></b><small>Em rota</small></i><i><b></b><small>Entregue</small></i></div><div class="store-order__footer"><span>Atualizado agora</span><button>Ver detalhes</button></div></article><article class="store-order store-order--past"><div class="store-order__head"><div><small>COMPRA #4759</small><h3>Entregue</h3></div><span>5 produtos</span></div><div class="store-order__footer"><span>22 de ago. · ${storeMoney(74.38)}</span><button onclick="showStoreToast('Itens disponíveis adicionados à sacola.')">Comprar novamente</button></div></article>`, 'store-sheet--orders');
}

function openStoreAccount() {
    const customer = storeState.profile?.customer || {};
    const addresses = storeState.profile?.addresses || [];
    const initials = String(customer.name || 'Cliente').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    openStoreLayer(`${storeSheetHead('Sua conta', 'Dados usados somente neste estabelecimento')}<div class="store-account-card"><span>${storeEscape(initials)}</span><div><strong>${storeEscape(customer.name || 'Cliente')}</strong><small>${storeEscape(customer.phone_normalized || '')}</small></div></div><div class="store-account-menu"><button onclick="openStoreAddressForm()"><span>${STORE_ICONS.location}</span><div><strong>Meus endereços</strong><small>${addresses.length} endereço${addresses.length === 1 ? '' : 's'} cadastrado${addresses.length === 1 ? '' : 's'}</small></div><b>›</b></button><button onclick="closeStoreLayer();openStoreOrders()"><span>▤</span><div><strong>Histórico de compras</strong><small>Acompanhe e compre novamente</small></div><b>›</b></button></div>`, 'store-sheet--account');
}

function renderStoreAccess(message = '') {
    document.getElementById('store-app').innerHTML = `<main class="store-unavailable store-access"><span>🔐</span><h1>Entre na loja</h1><p>Use o número vinculado ao WhatsApp para ver os produtos e comprar com segurança.</p><form onsubmit="requestStoreAccess(event)"><label>Seu WhatsApp<input name="phone" inputmode="tel" placeholder="(11) 99999-9999" required></label><button class="store-primary-button" type="submit">Receber código</button></form>${message ? `<small>${storeEscape(message)}</small>` : ''}</main>`;
}

async function requestStoreAccess(event) {
    event.preventDefault(); const phone = event.currentTarget.phone.value;
    try {
        const result = await storeFetch('/session/request', { method: 'POST', body: JSON.stringify({ phone }) });
        storeState.loginChallengeId = String(result.challenge_id || '');
        if (!storeState.loginChallengeId) throw new Error('Não foi possível iniciar seu acesso. Tente novamente.');
        document.querySelector('.store-access').innerHTML = `<span>💬</span><h1>Confira seu WhatsApp</h1><p>Enviamos um código de seis dígitos para confirmar seu acesso.</p><form onsubmit="verifyStoreAccess(event)"><label>Seu nome<input name="name" required minlength="2" placeholder="Como podemos chamar você?"></label><label>Código<input name="code" inputmode="numeric" maxlength="6" required placeholder="000000"></label><button class="store-primary-button" type="submit">Entrar na loja</button></form>`;
    } catch (error) { renderStoreAccess(error.message); }
}

async function verifyStoreAccess(event) {
    event.preventDefault();
    try {
        const form = event.currentTarget;
        await storeFetch('/session/verify', { method: 'POST', body: JSON.stringify({ challenge_id: storeState.loginChallengeId, code: form.code.value, name: form.name.value }) });
        storeState.loginChallengeId = '';
        storeState.data = await fetchStoreData();
        storeState.profile = await storeFetch('/session');
        renderStore();
    } catch (error) {
        showStoreToast(error.message || 'Não foi possível confirmar o código.');
    }
}

function showStoreToast(message) {
    const toast = document.getElementById('store-toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showStoreToast.timer);
    showStoreToast.timer = window.setTimeout(() => { toast.hidden = true; }, 1800);
}

function scrollStoreTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function focusStoreSearch() { document.getElementById('store-search-input').focus(); document.querySelector('.store-search').scrollIntoView({ behavior: 'smooth', block: 'center' }); }

async function initializeStore() {
    loadStoreCart();
    try {
        const access = new URLSearchParams(window.location.search).get('access') || new URLSearchParams(window.location.hash.replace(/^#/, '')).get('whatsapp_access');
        if (access && !storePreviewType()) await storeFetch('/session/exchange', { method: 'POST', body: JSON.stringify({ capability: access }) });
        storeState.data = await fetchStoreData();
        if (!storePreviewType()) storeState.profile = await storeFetch('/session');
        renderStore();
    } catch (error) {
        if (error?.code === 'AUTH') renderStoreAccess(error.message);
        else document.getElementById('store-app').innerHTML = `<main class="store-unavailable"><span>!</span><h1>Loja indisponível</h1><p>${storeEscape(error.message)}</p></main>`;
    }
    document.getElementById('store-layer').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeStoreLayer(); });
}

window.scrollStoreTop = scrollStoreTop;
window.focusStoreSearch = focusStoreSearch;
window.filterStoreProducts = filterStoreProducts;
window.clearStoreSearch = clearStoreSearch;
window.sortStoreProducts = sortStoreProducts;
window.selectStoreCategory = selectStoreCategory;
window.selectStoreSection = selectStoreSection;
window.changeStoreQuantity = changeStoreQuantity;
window.openStoreProduct = openStoreProduct;
window.changeStoreDetailQuantity = changeStoreDetailQuantity;
window.openStoreCart = openStoreCart;
window.closeStoreLayer = closeStoreLayer;
window.openStoreCheckoutAddress = openStoreCheckoutAddress;
window.openStoreCheckoutPayment = openStoreCheckoutPayment;
window.openStoreAddressForm = openStoreAddressForm;
window.lookupStorePostalCode = lookupStorePostalCode;
window.saveStoreAddress = saveStoreAddress;
window.requestStoreAccess = requestStoreAccess;
window.verifyStoreAccess = verifyStoreAccess;
window.finishStorePreviewCheckout = finishStorePreviewCheckout;
window.openStoreOrders = openStoreOrders;
window.openStoreAccount = openStoreAccount;
window.showStoreToast = showStoreToast;

document.addEventListener('DOMContentLoaded', initializeStore);
