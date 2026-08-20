// ClickGarçom — jornada pública do cardápio digital
const menuIcons = Object.freeze({
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
});

const menuState = {
    payload: null, slug: '', apiBase: '/admin/api', selectedCategory: 'all', search: '',
    cart: new Map(), profile: null, pendingAction: null, challenge: null,
    checkoutAttempt: null, checkout: null, payment: null, paymentContext: null, paymentTimer: null, orderHistoryTimer: null, orderHistoryRefreshInFlight: false,
    activeOrdersTimer: null, activeOrdersRefreshInFlight: false, toastTimer: null,
    accessCapability: '', historyOrders: [],
};

document.addEventListener('DOMContentLoaded', loadDigitalMenu);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (menuState.orderHistoryTimer) void refreshMenuOrderHistory();
    else if (menuState.activeOrdersTimer) void refreshMenuActiveOrders();
});

async function loadDigitalMenu() {
    menuState.slug = resolveMenuSlug();
    if (!menuState.slug) return renderMenuError('Cardápio não identificado', 'Abra o link fornecido pelo restaurante para acessar o menu correto.');
    const config = window.CLICKGARCOM_RUNTIME_CONFIG || {};
    menuState.apiBase = String(config.apiBaseUrl || '/admin/api').replace(/\/+$/, '');
    try {
        await exchangeWhatsAppAccessWithRetry();
        menuState.payload = await loadAuthenticatedMenuPayload();
        restoreMenuCart(menuState.slug);
        applyMenuTheme(menuState.payload.theme || {});
        document.title = `${menuState.payload.restaurant?.name || 'Restaurante'} — Cardápio`;
        renderDigitalMenu();
        void loadMenuSession();
    } catch (error) {
        if (error.status === 401) {
            renderMenuError('Link do cardápio expirado', 'Volte à conversa do WhatsApp e toque novamente em “Abrir cardápio” para gerar um acesso novo.');
        } else {
            renderMenuError('Cardápio indisponível', error.message || 'Tente novamente em instantes.');
        }
    }
}

async function loadAuthenticatedMenuPayload() {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await menuFetch(`/public/menu/${encodeURIComponent(menuState.slug)}`);
        } catch (error) {
            lastError = error;
            if (error.status !== 401 || !menuState.accessCapability || attempt >= 2) throw error;
            await waitForMenuAccessRetry(attempt);
            await exchangeWhatsAppAccessWithRetry(menuState.accessCapability);
        }
    }
    throw lastError || new Error('Não foi possível carregar o cardápio.');
}

async function exchangeWhatsAppAccessWithRetry(capabilityOverride = '') {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await exchangeWhatsAppAccess(capabilityOverride);
        } catch (error) {
            lastError = error;
            if (error.status !== 401 || attempt >= 2) throw error;
            await waitForMenuAccessRetry(attempt);
        }
    }
    throw lastError || new Error('Não foi possível autenticar o cardápio.');
}

async function exchangeWhatsAppAccess(capabilityOverride = '') {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const capability = String(capabilityOverride || params.get('whatsapp_access') || menuState.accessCapability || '').trim();
    if (!capability) return null;
    menuState.accessCapability = capability;
    const result = await menuFetch(menuCustomerPath('/session/exchange'), {
        method: 'POST',
        body: JSON.stringify({ capability }),
    });
    menuState.profile = result?.customer ? { customer: result.customer, addresses: [] } : null;
    // Remove the bearer value only after the exchange succeeds. This matters
    // in WhatsApp's in-app browser, which can perform an initial duplicate
    // navigation while the first request is still settling.
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    return result;
}

function waitForMenuAccessRetry(attempt) {
    return new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
}

async function loadMenuSession() {
    try {
        const profile = await menuFetch(menuCustomerPath('/session'));
        menuState.profile = profile?.authenticated === false ? null : profile;
    } catch (error) {
        if (error.status !== 401) console.warn('Sessão do cardápio indisponível:', error.message);
        menuState.profile = null;
    }
    refreshAccountState();
    if (menuState.profile) startMenuActiveOrdersRefresh();
    else stopMenuActiveOrdersRefresh();
    return menuState.profile;
}

function resolveMenuSlug() {
    const match = window.location.pathname.match(/\/cardapio\/([^/]+)\/?$/i);
    const candidate = match?.[1] || new URLSearchParams(window.location.search).get('tenant') || '';
    const normalized = String(candidate).trim().toLowerCase();
    return /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(normalized) ? normalized : '';
}

function menuCustomerPath(path) { return `/public/menu/${encodeURIComponent(menuState.slug)}${path}`; }

function applyMenuTheme(theme) {
    const primary = safeMenuColor(theme.primary_color, '#153f34');
    const accent = safeMenuColor(theme.accent_color, '#ef6a45');
    document.documentElement.style.setProperty('--menu-primary', primary);
    document.documentElement.style.setProperty('--menu-accent', accent);
    document.documentElement.style.setProperty('--menu-primary-rgb', hexToRgb(primary));
    document.documentElement.style.setProperty('--menu-accent-rgb', hexToRgb(accent));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
}

function renderDigitalMenu() {
    const restaurant = menuState.payload?.restaurant || {};
    const categories = menuState.payload?.categories || [];
    const initials = String(restaurant.name || 'Restaurante').split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
    const logo = safeMenuAssetUrl(restaurant.logo_url);
    document.getElementById('digital-menu-app').innerHTML = `
        <header class="menu-header"><div class="menu-shell menu-header-inner">
            <button class="menu-brand menu-brand-button" type="button" onclick="openRestaurantInfo()">
                <span class="menu-logo">${logo ? `<img src="${escapeMenuHtml(logo)}" alt="Logo de ${escapeMenuHtml(restaurant.name)}" onerror="this.parentElement.textContent='${escapeMenuHtml(initials)}'">` : escapeMenuHtml(initials)}</span>
                <span class="menu-brand-copy"><strong role="heading" aria-level="2">${escapeMenuHtml(restaurant.name || 'Restaurante')}</strong><small><span class="menu-open-dot ${restaurant.is_open ? '' : 'menu-open-dot--closed'}"></span>${restaurant.is_open ? 'Aberto para pedidos' : 'Fechado no momento'}</small></span>
            </button>
            <div class="menu-header-actions">
                <button class="menu-order-alert" id="menu-order-alert" type="button" onclick="openOrderHistory()" aria-label="Acompanhar pedidos em andamento" hidden><span>${menuIcons.bell}</span><span class="menu-order-alert-count" id="menu-order-alert-count" aria-live="polite">0</span></button>
                <button class="menu-bag-button" type="button" onclick="openMenuCart()" aria-label="Abrir sacola"><span>${menuIcons.bag}</span><span class="menu-bag-value">${formatMenuMoney(menuCartTotal())}</span><span class="menu-bag-count" id="menu-bag-count">${menuCartCount()}</span></button>
            </div>
        </div></header>
        <div class="menu-shell menu-content">
            <section class="menu-hero"><div class="menu-hero-copy"><div class="menu-eyebrow">Feito pela casa</div><h1>Escolha com calma.<br>O sabor vem daqui.</h1><p>${escapeMenuHtml(restaurant.description || 'Explore o cardápio, escolha seus favoritos e receba onde estiver.')}</p></div></section>
            <div class="menu-search-wrap"><label class="menu-search" for="menu-search-input">${menuIcons.search}<input id="menu-search-input" type="search" autocomplete="off" placeholder="Buscar prato, bebida ou ingrediente" oninput="setMenuSearch(this.value)"><button class="menu-search-clear" type="button" onclick="clearMenuSearch()" aria-label="Limpar busca" hidden>×</button></label></div>
            <nav class="menu-category-rail" aria-label="Categorias"><button class="menu-category-chip" type="button" data-category="all" aria-pressed="true" onclick="selectMenuCategory('all')">Todos</button>${categories.map((category) => `<button class="menu-category-chip" type="button" data-category="${escapeMenuHtml(category.id)}" aria-pressed="false" onclick="selectMenuCategory('${escapeMenuHtml(category.id)}')">${escapeMenuHtml(category.name)}</button>`).join('')}</nav>
            <section id="menu-results"></section>
        </div>
        <nav class="menu-bottom-nav" aria-label="Navegação do cardápio">
            <button class="menu-nav-button" type="button" aria-current="page" onclick="menuGoHome()">${menuIcons.home}Início</button>
            <button class="menu-nav-button" type="button" onclick="focusMenuSearch()">${menuIcons.search}Buscar</button>
            <button class="menu-nav-button" type="button" onclick="openMenuCart()">${menuIcons.bag}Sacola<span class="menu-nav-badge" id="menu-nav-count">${menuCartCount()}</span></button>
            <button class="menu-nav-button" id="menu-account-nav" type="button" onclick="openMenuAccount()">${menuIcons.user}<span id="menu-account-label">Entrar</span></button>
        </nav>`;
    renderMenuResults();
}

function renderMenuResults() {
    const categories = menuState.payload?.categories || [];
    const search = normalizeMenuSearch(menuState.search);
    const filtered = [];
    for (const category of categories) {
        if (menuState.selectedCategory !== 'all' && category.id !== menuState.selectedCategory) continue;
        for (const item of category.items || []) {
            if (search && !normalizeMenuSearch(`${item.name} ${item.description || ''} ${category.name}`).includes(search)) continue;
            filtered.push({ ...item, category_name: category.name });
        }
    }
    const heading = search ? `Resultados para “${menuState.search.trim()}”` : (menuState.selectedCategory === 'all' ? 'Cardápio de hoje' : categories.find((category) => category.id === menuState.selectedCategory)?.name || 'Cardápio');
    document.getElementById('menu-results').innerHTML = `<div class="menu-results-head"><div><h2>${escapeMenuHtml(heading)}</h2><p>Valores e disponibilidade informados pelo restaurante.</p></div><span class="menu-results-count">${filtered.length} ${filtered.length === 1 ? 'item' : 'itens'}</span></div>${filtered.length ? `<div class="menu-items">${filtered.map(renderMenuItem).join('')}</div>` : '<div class="menu-empty"><span>⌕</span><h2>Nenhum sabor encontrado</h2><p>Tente outro termo ou veja todas as categorias.</p></div>'}`;
}

function renderMenuItem(item) {
    const image = safeMenuAssetUrl(item.image_url);
    const imageMarkup = image ? `<img class="menu-item-image" src="${escapeMenuHtml(image)}" alt="${escapeMenuHtml(item.name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;menu-item-placeholder&quot;>✦</div>'">` : '<div class="menu-item-placeholder">✦</div>';
    const action = item.has_options ? `openMenuItem('${escapeMenuHtml(item.id)}')` : `addMenuItem('${escapeMenuHtml(item.id)}')`;
    return `<article class="menu-item"><div class="menu-item-image-wrap" role="button" tabindex="0" onclick="openMenuItem('${escapeMenuHtml(item.id)}')">${imageMarkup}<span class="menu-item-tag">${escapeMenuHtml(item.category_name)}</span></div><div class="menu-item-copy" role="button" tabindex="0" onclick="openMenuItem('${escapeMenuHtml(item.id)}')"><h3>${escapeMenuHtml(item.name)}</h3><p class="menu-item-description">${escapeMenuHtml(item.description || 'Uma escolha preparada pela casa.')}</p><div class="menu-item-bottom"><strong class="menu-item-price">${formatMenuMoney(item.price)}</strong>${item.prep_time_minutes ? `<span class="menu-item-prep">cerca de ${Number(item.prep_time_minutes)} min</span>` : ''}${item.has_options ? '<span class="menu-item-options">personalizável</span>' : ''}</div></div><div class="menu-item-action"><button class="menu-add" type="button" onclick="event.stopPropagation();${action}" aria-label="${item.has_options ? 'Ver personalização' : `Adicionar ${escapeMenuHtml(item.name)} à sacola`}">${item.has_options ? '›' : '+'}</button></div></article>`;
}

function selectMenuCategory(categoryId) {
    menuState.selectedCategory = categoryId;
    document.querySelectorAll('.menu-category-chip').forEach((button) => button.setAttribute('aria-pressed', button.dataset.category === categoryId ? 'true' : 'false'));
    renderMenuResults();
    document.getElementById('menu-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setMenuSearch(value) {
    menuState.search = String(value || '').slice(0, 100);
    const clearButton = document.querySelector('.menu-search-clear');
    if (clearButton) clearButton.hidden = !menuState.search;
    renderMenuResults();
}

function clearMenuSearch() { const input = document.getElementById('menu-search-input'); if (input) input.value = ''; setMenuSearch(''); input?.focus(); }
function focusMenuSearch() { closeMenuLayer(); document.getElementById('menu-search-input')?.focus({ preventScroll: true }); document.querySelector('.menu-search-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function menuGoHome() { menuState.selectedCategory = 'all'; clearMenuSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function findMenuItem(id) {
    for (const category of menuState.payload?.categories || []) {
        const item = (category.items || []).find((candidate) => candidate.id === id);
        if (item) return { ...item, category_name: category.name };
    }
    return null;
}

function openMenuItem(id) {
    const item = findMenuItem(id);
    if (!item) return;
    const image = safeMenuAssetUrl(item.image_url);
    const optionGroups = getMenuOptionGroups(item);
    const optionsMarkup = item.has_options ? renderMenuOptionGroups(optionGroups) : '';
    const action = item.has_options
        ? `<div class="menu-form-error" id="menu-options-error" hidden></div><button class="menu-sheet-cta" type="button" onclick="confirmMenuItemOptions('${escapeMenuHtml(item.id)}')">Adicionar à sacola</button>`
        : `<button class="menu-sheet-cta" type="button" onclick="addMenuItem('${escapeMenuHtml(item.id)}',true)">Adicionar à sacola · ${formatMenuMoney(item.price)}</button>`;
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-product-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader(item.name, item.category_name, 'menu-product-title')}${image ? `<div class="menu-product-hero"><img src="${escapeMenuHtml(image)}" alt="${escapeMenuHtml(item.name)}"></div>` : ''}<div class="menu-product-copy"><p>${escapeMenuHtml(item.description || 'Uma escolha preparada pela casa.')}</p><div class="menu-product-price">${formatMenuMoney(item.price)}</div></div>${optionsMarkup}${action}</div></div>`);
}

function addMenuItem(id, closeAfter = false) {
    const item = findMenuItem(id);
    if (!item || item.has_options) return;
    addConfiguredMenuItem(item, [], closeAfter);
}

function getMenuOptionGroups(item) {
    return Array.isArray(item?.option_groups) ? item.option_groups : [];
}

function renderMenuOptionGroups(groups) {
    return `<section class="menu-options" aria-label="Escolha os complementos">${groups.map((group, groupIndex) => {
        const maxSelect = Number(group?.max_select ?? group?.maxSelect ?? group?.options?.length ?? 1) || 1;
        const minSelect = Number(group?.min_select ?? group?.minSelect ?? (group?.required ? 1 : 0)) || 0;
        const inputType = maxSelect === 1 ? 'radio' : 'checkbox';
        const inputName = `menu_option_group_${groupIndex}`;
        return `<fieldset class="menu-option-group"><legend>${escapeMenuHtml(group.name)} <small>${minSelect > 0 ? 'Obrigatório' : 'Opcional'}${maxSelect > 1 ? ` · até ${maxSelect}` : ''}</small></legend>${group.description ? `<p>${escapeMenuHtml(group.description)}</p>` : ''}${(group.options || []).filter((option) => option.available !== false).map((option) => `<label class="menu-option-choice"><input class="menu-option-input" type="${inputType}" name="${inputName}" data-group-name="${escapeMenuHtml(group.name)}" data-option-name="${escapeMenuHtml(option.name)}" data-price-delta="${Number(option.price_delta ?? option.priceDelta ?? 0)}"><span><strong>${escapeMenuHtml(option.name)}</strong>${option.description ? `<small>${escapeMenuHtml(option.description)}</small>` : ''}</span><b>${Number(option.price_delta ?? option.priceDelta ?? 0) > 0 ? `+ ${formatMenuMoney(option.price_delta ?? option.priceDelta)}` : 'Incluso'}</b></label>`).join('')}</fieldset>`;
    }).join('')}</section>`;
}

function confirmMenuItemOptions(id) {
    const item = findMenuItem(id);
    if (!item) return;
    const selected = Array.from(document.querySelectorAll('.menu-option-input:checked')).map((input) => ({
        group_name: input.dataset.groupName || '',
        option_name: input.dataset.optionName || '',
        price_delta: Number(input.dataset.priceDelta || 0),
    }));
    for (const group of getMenuOptionGroups(item)) {
        const groupName = String(group.name || '');
        const count = selected.filter((option) => option.group_name === groupName).length;
        const minSelect = Number(group.min_select ?? group.minSelect ?? (group.required ? 1 : 0)) || 0;
        const maxSelect = Number(group.max_select ?? group.maxSelect ?? group.options?.length ?? 1) || 1;
        if (count < minSelect) return showFormError('menu-options-error', `Escolha pelo menos ${minSelect} opção(ões) em ${groupName}.`);
        if (count > maxSelect) return showFormError('menu-options-error', `Escolha no máximo ${maxSelect} opção(ões) em ${groupName}.`);
    }
    addConfiguredMenuItem(item, selected, true);
}

function addConfiguredMenuItem(item, selectedOptions = [], closeAfter = false) {
    const normalized = selectedOptions.map((option) => ({ group_name: String(option.group_name || ''), option_name: String(option.option_name || ''), price_delta: Number(option.price_delta || 0) }));
    const key = `${item.id}:${JSON.stringify(normalized.map((option) => `${option.group_name}:${option.option_name}`).sort())}`;
    const current = menuState.cart.get(key) || { item, quantity: 0, selectedOptions: normalized };
    current.quantity = Math.min(20, current.quantity + 1);
    menuState.cart.set(key, current);
    persistMenuCart(); refreshMenuCartCounters(); showMenuToast(`${item.name} entrou na sacola`);
    if (closeAfter) closeMenuLayer();
}

function changeMenuQuantity(id, delta) {
    const current = menuState.cart.get(id);
    if (!current) return;
    current.quantity = Math.max(0, Math.min(20, current.quantity + delta));
    if (!current.quantity) menuState.cart.delete(id); else menuState.cart.set(id, current);
    menuState.checkoutAttempt = null;
    persistMenuCart(); refreshMenuCartCounters(); openMenuCart();
}

function openMenuCart() {
    const rows = Array.from(menuState.cart.values());
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-cart-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Sua sacola', `${menuCartCount()} ${menuCartCount() === 1 ? 'item escolhido' : 'itens escolhidos'}`, 'menu-cart-title')}${rows.length ? `<div class="menu-cart-list">${rows.map(({ item, quantity, selectedOptions }, index) => { const key = Array.from(menuState.cart.keys())[index]; const optionsLabel = (selectedOptions || []).map((option) => option.option_name).join(', '); return `<div class="menu-cart-item"><div><strong>${escapeMenuHtml(item.name)}</strong><span>${quantity} × ${formatMenuMoney(menuCartRowUnitPrice({ item, selectedOptions }))}</span>${optionsLabel ? `<small class="menu-cart-options">${escapeMenuHtml(optionsLabel)}</small>` : ''}</div><div class="menu-quantity"><button type="button" onclick="changeMenuQuantity('${escapeMenuHtml(key)}',-1)" aria-label="Remover uma unidade">−</button><strong>${quantity}</strong><button type="button" onclick="changeMenuQuantity('${escapeMenuHtml(key)}',1)" aria-label="Adicionar uma unidade">+</button></div></div>`; }).join('')}</div><div class="menu-cart-total"><span>Subtotal</span><strong>${formatMenuMoney(menuCartTotal())}</strong></div><p class="menu-help-text">Escolha PIX ou cartão de crédito na etapa de pagamento. Nada será enviado à cozinha antes da confirmação do pagamento.</p><button class="menu-sheet-cta" type="button" onclick="startCheckoutJourney()">Continuar para entrega</button>` : '<div class="menu-empty menu-empty--sheet"><span>♧</span><h2>Sua sacola está vazia</h2><p>Toque no botão + de um item para começar.</p></div>'}</div></div>`);
}

async function startCheckoutJourney() {
    if (!menuCartCount()) return openMenuCart();
    if (!menuState.profile) { menuState.pendingAction = 'checkout'; return openMenuLogin(); }
    if (!hasMenuProfileName()) { menuState.pendingAction = 'checkout'; return openProfileEdit(); }
    if (!(menuState.profile.addresses || []).length) return openAddressForm(null, true);
    openCheckoutReview();
}

function openMenuLogin() {
    menuState.challenge = null;
    openMenuLayer(`<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-login-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Entre sem senha', 'Receba um código no seu WhatsApp', 'menu-login-title')}<form class="menu-form" onsubmit="requestMenuLogin(event)"><label>Seu nome<input name="name" autocomplete="name" maxlength="120" placeholder="Como podemos chamar você?" required></label><label>WhatsApp<input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="55 11 99999-9999" required></label><p class="menu-help-text">Usamos seu número para confirmar sua identidade, guardar endereços e mostrar seus pedidos deste restaurante.</p><div class="menu-form-error" id="menu-login-error" hidden></div><button class="menu-sheet-cta" type="submit">Enviar código pelo WhatsApp</button></form></div></div>`);
}

async function requestMenuLogin(event) {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); setButtonBusy(button, 'Enviando código…');
    try {
        const payload = await menuFetch(menuCustomerPath('/session/request'), { method: 'POST', body: JSON.stringify({ phone: form.phone.value }) });
        menuState.challenge = { ...payload, name: form.name.value.trim() };
        renderMenuCodeForm();
    } catch (error) { showFormError('menu-login-error', error.message); resetButton(button); }
}

function renderMenuCodeForm() {
    openMenuLayer(`<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-code-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Confira seu WhatsApp', `Enviamos o código para ${menuState.challenge?.phone_masked || 'seu número'}`, 'menu-code-title')}<form class="menu-form" onsubmit="verifyMenuLogin(event)"><label>Código de 6 dígitos<input class="menu-code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required></label><div class="menu-form-error" id="menu-code-error" hidden></div><button class="menu-sheet-cta" type="submit">Confirmar e entrar</button><button class="menu-text-button" type="button" onclick="openMenuLogin()">Usar outro número</button></form></div></div>`);
}

async function verifyMenuLogin(event) {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); setButtonBusy(button, 'Confirmando…');
    try {
        await menuFetch(menuCustomerPath('/session/verify'), { method: 'POST', body: JSON.stringify({ challenge_id: menuState.challenge?.challenge_id, code: form.code.value, name: menuState.challenge?.name || '' }) });
        await loadMenuSession(); showMenuToast('Tudo certo, você entrou');
        if (menuState.pendingAction === 'checkout') { menuState.pendingAction = null; return startCheckoutJourney(); }
        openMenuAccount();
    } catch (error) { showFormError('menu-code-error', error.message); resetButton(button); }
}

async function openMenuAccount() {
    if (!menuState.profile) { await loadMenuSession(); if (!menuState.profile) return openMenuLogin(); }
    const customer = menuState.profile.customer || {}; const addresses = menuState.profile.addresses || [];
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-account-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Sua conta', 'Pedidos e dados em um só lugar', 'menu-account-title')}<section class="menu-profile-card"><div class="menu-profile-avatar">${escapeMenuHtml(profileInitials(customer.name))}</div><div><strong>${escapeMenuHtml(customer.name || 'Cliente')}</strong><span>${escapeMenuHtml(customer.phone_masked || '')}</span></div><button type="button" onclick="openProfileEdit()">Editar</button></section><div class="menu-account-actions"><button type="button" onclick="openOrderHistory()"><span>↻</span><div><strong>Histórico de pedidos</strong><small>Acompanhe compras e entregas</small></div><b>›</b></button><button type="button" onclick="openAddressList()"><span>⌖</span><div><strong>Meus endereços</strong><small>${addresses.length ? `${addresses.length} ${addresses.length === 1 ? 'endereço salvo' : 'endereços salvos'}` : 'Cadastre onde deseja receber'}</small></div><b>›</b></button></div><button class="menu-text-button menu-text-button--danger" type="button" onclick="logoutMenuAccount()">Sair desta conta</button></div></div>`);
}

function openProfileEdit() {
    const name = menuState.profile?.customer?.name || '';
    const requiredForCheckout = menuState.pendingAction === 'checkout';
    openMenuLayer(`<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-profile-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader(requiredForCheckout ? 'Informe seu nome' : 'Editar perfil', requiredForCheckout ? 'Precisamos dele para concluir a entrega' : 'Mantenha seu nome atualizado', 'menu-profile-title')}<form class="menu-form" onsubmit="saveMenuProfile(event)"><label>Nome<input name="name" autocomplete="name" maxlength="120" value="${escapeMenuHtml(name)}" required></label><div class="menu-form-error" id="menu-profile-error" hidden></div><button class="menu-sheet-cta" type="submit">Salvar alterações</button></form></div></div>`);
}

async function saveMenuProfile(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); setButtonBusy(button, 'Salvando…');
    try { await menuFetch(menuCustomerPath('/session'), { method: 'PATCH', body: JSON.stringify({ name: event.currentTarget.name.value }) }); await loadMenuSession(); showMenuToast('Perfil atualizado'); if (menuState.pendingAction === 'checkout') { menuState.pendingAction = null; return startCheckoutJourney(); } openMenuAccount(); }
    catch (error) { showFormError('menu-profile-error', error.message); resetButton(button); }
}

function openAddressList() {
    const addresses = menuState.profile?.addresses || [];
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-address-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Meus endereços', 'Escolha ou cadastre até cinco locais', 'menu-address-title')}${addresses.length ? `<div class="menu-address-list">${addresses.map((address) => renderAddressCard(address)).join('')}</div>` : '<div class="menu-empty menu-empty--sheet"><span>⌖</span><h2>Nenhum endereço salvo</h2><p>Cadastre seu primeiro endereço para calcular a entrega.</p></div>'}<button class="menu-sheet-cta" type="button" onclick="openAddressForm()">Adicionar novo endereço</button></div></div>`);
}

function renderAddressCard(address, selectable = false) {
    return `<label class="menu-address-card ${address.is_default ? 'is-default' : ''}">${selectable ? `<input type="radio" name="delivery_address" value="${escapeMenuHtml(address.id)}" ${address.is_default ? 'checked' : ''}>` : `<span class="menu-address-icon">${menuIcons.location}</span>`}<span class="menu-address-copy"><strong>${escapeMenuHtml(address.label || 'Endereço')}${address.is_default ? '<em>Principal</em>' : ''}</strong><small>${escapeMenuHtml(address.formatted_address || formatAddress(address))}</small></span>${selectable ? '' : `<button type="button" onclick="event.preventDefault();openAddressForm('${escapeMenuHtml(address.id)}')">Editar</button>`}</label>`;
}

function openAddressForm(addressId = null, returnToCheckout = false) {
    const address = (menuState.profile?.addresses || []).find((item) => item.id === addressId) || {};
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-address-form-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader(addressId ? 'Editar endereço' : 'Novo endereço', 'Preencha os campos obrigatórios e confira antes de salvar', 'menu-address-form-title')}<form class="menu-form menu-address-form" onsubmit="saveMenuAddress(event, '${escapeMenuHtml(addressId || '')}', ${returnToCheckout ? 'true' : 'false'})"><div class="menu-form-grid"><label>Apelido<input name="label" maxlength="80" value="${escapeMenuHtml(address.label || 'Casa')}" required></label><label>CEP<input name="postal_code" inputmode="numeric" maxlength="9" value="${escapeMenuHtml(formatPostalCode(address.postal_code || ''))}" onblur="lookupMenuPostalCode(this.form)" placeholder="00000-000" required></label><label class="menu-field-wide">Endereço (rua ou avenida)<input name="street" maxlength="255" value="${escapeMenuHtml(address.street || '')}" required></label><label>Número<input name="address_number" maxlength="30" value="${escapeMenuHtml(address.address_number || '')}" required></label><label>Complemento<input name="address_complement" maxlength="255" value="${escapeMenuHtml(address.address_complement || '')}" placeholder="Apto, bloco..."></label><label>Bairro<input name="neighborhood" maxlength="255" value="${escapeMenuHtml(address.neighborhood || '')}" required></label><label>Cidade<input name="city" maxlength="255" value="${escapeMenuHtml(address.city || '')}" required></label><label>Estado<input name="state" maxlength="2" value="${escapeMenuHtml(address.state || '')}" placeholder="SP" required></label><label class="menu-field-wide">Referência<input name="address_reference" maxlength="500" value="${escapeMenuHtml(address.address_reference || '')}" placeholder="Próximo à praça, portão azul..."></label></div><p class="menu-help-text">Nome, CEP, endereço e número são obrigatórios para calcular a entrega corretamente.</p><div class="menu-form-error" id="menu-address-error" hidden></div><button class="menu-sheet-cta" type="submit">Salvar e usar este endereço</button>${addressId ? `<button class="menu-text-button menu-text-button--danger" type="button" onclick="removeMenuAddress('${escapeMenuHtml(addressId)}')">Excluir endereço</button>` : ''}</form></div></div>`);
}

async function lookupMenuPostalCode(form) {
    const postalCode = String(form.postal_code.value || '').replace(/\D/g, ''); if (postalCode.length !== 8) return;
    try {
        const data = await menuFetch(menuCustomerPath(`/postal-code/${postalCode}`));
        if (data.street) form.street.value = data.street; if (data.neighborhood) form.neighborhood.value = data.neighborhood; if (data.city) form.city.value = data.city; if (data.state) form.state.value = data.state;
        form.dataset.postalProvider = data.provider || ''; form.dataset.postalStatus = data.status || 'FOUND'; form.address_number.focus();
    } catch (error) { showFormError('menu-address-error', `${error.message} Você ainda pode preencher manualmente.`); }
}

async function saveMenuAddress(event, addressId, returnToCheckout) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); setButtonBusy(button, 'Confirmando no mapa…');
    const payload = Object.fromEntries(new FormData(form).entries()); payload.postal_code_provider = form.dataset.postalProvider || undefined; payload.postal_code_lookup_status = form.dataset.postalStatus || 'MANUAL';
    try {
        await menuFetch(menuCustomerPath(`/addresses${addressId ? `/${addressId}` : ''}`), { method: addressId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
        await loadMenuSession(); menuState.checkoutAttempt = null; showMenuToast('Endereço salvo');
        if (returnToCheckout || menuState.pendingAction === 'checkout') { menuState.pendingAction = null; return openCheckoutReview(); }
        openAddressList();
    } catch (error) { showFormError('menu-address-error', error.message); resetButton(button); }
}

async function removeMenuAddress(addressId) {
    if (!window.confirm('Excluir este endereço salvo?')) return;
    try { await menuFetch(menuCustomerPath(`/addresses/${addressId}`), { method: 'DELETE' }); await loadMenuSession(); showMenuToast('Endereço excluído'); openAddressList(); }
    catch (error) { showMenuToast(error.message); }
}

function openCheckoutReview() {
    const addresses = menuState.profile?.addresses || []; if (!addresses.length) return openAddressForm(null, true);
    const rows = Array.from(menuState.cart.values());
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-checkout-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Revisar entrega', 'Só falta escolher onde receber', 'menu-checkout-title')}<div class="menu-checkout-steps"><span class="is-done">1 Sacola</span><span class="is-current">2 Endereço</span><span>3 Pagamento</span></div><section class="menu-review-block"><h3>Entregar em</h3><div class="menu-address-list">${addresses.map((address) => renderAddressCard(address, true)).join('')}</div><button class="menu-text-button" type="button" onclick="openAddressForm(null,true)">+ Usar outro endereço</button></section><section class="menu-review-block"><h3>Resumo</h3>${rows.map((row) => `<div class="menu-review-row"><span>${row.quantity}× ${escapeMenuHtml(row.item.name)}${row.selectedOptions?.length ? `<small class="menu-review-options">${escapeMenuHtml(row.selectedOptions.map((option) => option.option_name).join(', '))}</small>` : ''}</span><strong>${formatMenuMoney(menuCartRowUnitPrice(row) * row.quantity)}</strong></div>`).join('')}<div class="menu-cart-total"><span>Subtotal</span><strong>${formatMenuMoney(menuCartTotal())}</strong></div><p class="menu-help-text">O próximo passo calcula o frete e mostra as opções de pagamento.</p></section><div class="menu-form-error" id="menu-checkout-error" hidden></div><button class="menu-sheet-cta" type="button" onclick="createMenuCheckout(this)">Calcular frete e continuar</button></div></div>`);
}

async function createMenuCheckout(button) {
    const addressId = document.querySelector('input[name="delivery_address"]:checked')?.value; if (!addressId) return showFormError('menu-checkout-error', 'Escolha um endereço.');
    if (!menuState.checkoutAttempt) menuState.checkoutAttempt = crypto.randomUUID(); setButtonBusy(button, 'Calculando entrega…');
    try {
        menuState.checkout = await menuFetch(menuCustomerPath('/checkout'), { method: 'POST', body: JSON.stringify({ address_id: addressId, idempotency_key: menuState.checkoutAttempt, items: Array.from(menuState.cart.values()).map(({ item, quantity, selectedOptions }) => ({ menu_item_id: item.id, quantity, selected_options: selectedOptions || [] })) }) });
        renderPixCheckout();
    } catch (error) { menuState.checkoutAttempt = null; showFormError('menu-checkout-error', error.message); resetButton(button); }
}

function renderPixCheckout() {
    const checkout = menuState.checkout;
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-pix-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Pagamento via PIX', 'Escolha como deseja pagar', 'menu-pix-title')}<div class="menu-checkout-steps"><span class="is-done">1 Sacola</span><span class="is-done">2 Endereço</span><span class="is-current">3 Pagamento</span></div><section class="menu-total-card"><div><span>Itens</span><strong>${formatMenuMoney(checkout.subtotal)}</strong></div><div><span>Entrega</span><strong>${formatMenuMoney(checkout.delivery_fee)}</strong></div><div class="menu-total-card-main"><span>Total</span><strong>${formatMenuMoney(checkout.total)}</strong></div></section><div class="menu-payment-switch" role="tablist"><button class="is-active" type="button" onclick="activateMenuPayment('pix')">PIX</button><button type="button" onclick="openMenuCardForm()">Cartão de crédito</button></div><div id="menu-pix-content"><div class="menu-pix-intro"><span>⚡</span><h3>Pagamento rápido e seguro</h3><p>O pedido será enviado ao restaurante assim que o PIX for confirmado.</p></div><div class="menu-form-error" id="menu-pix-error" hidden></div><button class="menu-sheet-cta" type="button" onclick="generateMenuPix(this)">Gerar QR Code PIX</button></div></div></div>`);
}

function activateMenuPayment(method) {
    if (method === 'pix') {
        document.querySelectorAll('.menu-payment-switch button').forEach((button) => button.classList.toggle('is-active', button.textContent.trim() === 'PIX'));
        renderPixCheckout();
    } else {
        openMenuCardForm();
    }
}

async function loadMenuPaymentContext() {
    if (menuState.paymentContext) return menuState.paymentContext;
    const checkout = menuState.checkout;
    const access = await menuFetch(`/public/tables/delivery-checkouts/${encodeURIComponent(checkout.checkout_capability)}/access`);
    const tab = await menuFetch(`/public/tables/tabs/${encodeURIComponent(access.tab_id)}?delivery_checkout_key=${encodeURIComponent(checkout.checkout_key)}`, { headers: { Authorization: `Bearer ${access.access_token}` } });
    menuState.paymentContext = { ...access, tab };
    return menuState.paymentContext;
}

async function generateMenuPix(button) {
    setButtonBusy(button, 'Gerando PIX…');
    try {
        const checkout = menuState.checkout;
        const context = await loadMenuPaymentContext();
        const access = context;
        const token = context.access_token;
        const tab = context.tab;
        const testPayment = String(tab?.mpEnvironment || '').toUpperCase() === 'TEST' || String(tab?.mpPublicKey || '').startsWith('TEST-');
        const payment = await menuFetch(`/public/tables/tabs/${encodeURIComponent(access.tab_id)}/payments/pix`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ payer_name: testPayment ? 'APRO' : (menuState.profile?.customer?.name || 'Cliente'), payer_email: testPayment ? 'test_user_br@testuser.com' : 'cliente@email.com', payer_cpf: '19119119100', delivery_checkout_key: checkout.checkout_key }) });
        menuState.payment = { ...payment, token, tabId: access.tab_id, method: 'pix' };
        if (payment.approved || String(payment.status).toLowerCase() === 'approved') return renderPaymentApproved(payment);
        renderMenuPixCode(payment); if (payment.payment_id) startMenuPaymentPolling(String(payment.payment_id));
    } catch (error) { showFormError('menu-pix-error', error.message); resetButton(button); }
}

async function openMenuCardForm() {
    try {
        const context = await loadMenuPaymentContext();
        if (!context.tab?.cardEnabled) {
            return showMenuToast(context.tab?.cardUnavailableReason || 'Pagamento com cartão indisponível para este restaurante.');
        }
        const checkout = menuState.checkout;
        document.querySelectorAll('.menu-payment-switch button').forEach((button) => button.classList.toggle('is-active', button.textContent.trim() !== 'PIX'));
        document.getElementById('menu-pix-content').innerHTML = `<div class="menu-card-intro"><span>💳</span><h3>Cartão de crédito</h3><p>Seus dados são protegidos durante todo o pagamento.</p></div><form id="menu-card-form" class="menu-form"><label>Número do cartão<div id="menu-card-number" class="menu-mp-field"></div></label><div class="menu-form-grid"><label>Validade<div id="menu-card-expiration" class="menu-mp-field"></div></label><label>CVV<div id="menu-card-security" class="menu-mp-field"></div></label></div><label>Nome do titular<input id="menu-card-name" required autocomplete="cc-name" placeholder="Nome impresso no cartão"></label><label>E-mail<input id="menu-card-email" type="email" required autocomplete="email" value="${escapeMenuHtml(menuState.profile?.customer?.email || '')}" placeholder="voce@email.com"></label><label>CPF<input id="menu-card-cpf" required inputmode="numeric" autocomplete="cc-given-name" placeholder="000.000.000-00"></label><label>Parcelas<select id="menu-card-installments"><option value="1">1x sem juros</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option><option value="5">5x</option><option value="6">6x</option></select></label><div class="menu-form-error" id="menu-card-error" hidden></div><button id="menu-card-submit" class="menu-sheet-cta" type="submit">Pagar ${formatMenuMoney(checkout.total)} com cartão</button></form>`;
        if (!window.MercadoPago) throw new Error('Pagamento com cartão indisponível neste navegador.');
        const mp = new window.MercadoPago(String(context.tab.mpPublicKey), { locale: 'pt-BR' });
        const cardNumber = mp.fields.create('cardNumber', { placeholder: 'Número do cartão' });
        const expiration = mp.fields.create('expirationDate', { placeholder: 'MM/AA' });
        const security = mp.fields.create('securityCode', { placeholder: 'CVV' });
        cardNumber.mount('menu-card-number'); expiration.mount('menu-card-expiration'); security.mount('menu-card-security');
        document.getElementById('menu-card-form').addEventListener('submit', (event) => submitMenuCardPayment(event, mp, context));
    } catch (error) { showMenuToast(error.message || 'Não foi possível abrir o pagamento com cartão.'); }
}

async function submitMenuCardPayment(event, mp, context) {
    event.preventDefault();
    const button = document.getElementById('menu-card-submit'); setButtonBusy(button, 'Processando cartão…');
    try {
        const token = await mp.fields.createCardToken({ cardholderName: document.getElementById('menu-card-name').value, identificationType: 'CPF', identificationNumber: document.getElementById('menu-card-cpf').value });
        const metadata = await resolveMenuCardPaymentMetadata(mp, token);
        const testPayment = String(context.tab?.mpEnvironment || '').toUpperCase() === 'TEST' || String(context.tab?.mpPublicKey || '').startsWith('TEST-');
        const checkout = menuState.checkout;
        const paymentPayload = { token: token.id, payment_method_id: metadata.paymentMethodId, installments: Number(document.getElementById('menu-card-installments').value || 1), payer_email: document.getElementById('menu-card-email').value, payer_cpf: document.getElementById('menu-card-cpf').value, delivery_checkout_key: checkout.checkout_key };
        if (!testPayment && metadata.issuerId) paymentPayload.issuer_id = metadata.issuerId;
        const response = await menuFetch(`/public/tables/tabs/${encodeURIComponent(context.tab_id)}/payments/card`, { method: 'POST', headers: { Authorization: `Bearer ${context.access_token}` }, body: JSON.stringify(paymentPayload) });
        menuState.payment = { ...response, token: context.access_token, tabId: context.tab_id, method: 'card' };
        if (response.approved || String(response.status || '').toLowerCase() === 'approved') return renderPaymentApproved(response);
        if (response.payment_id) { renderMenuCardPending(response); startMenuPaymentPolling(String(response.payment_id)); return; }
        throw new Error('O cartão não foi aprovado. Confira os dados e tente novamente.');
    } catch (error) { showFormError('menu-card-error', error.message || 'Não foi possível processar o cartão.'); resetButton(button); }
}

async function resolveMenuCardPaymentMetadata(mp, token) {
    const normalizeText = (value) => value === null || value === undefined ? '' : String(value).trim();
    const normalizeResults = (payload) => Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : (Array.isArray(payload?.payment_methods) ? payload.payment_methods : []));
    const normalizeIssuer = (value) => { const text = normalizeText(value); return /^\d+$/.test(text) ? text : ''; };
    let paymentMethodId = normalizeText(token?.payment_method_id || token?.paymentMethodId || token?.payment_method?.id || token?.paymentMethod?.id);
    let issuerId = normalizeIssuer(token?.issuer_id || token?.issuerId || token?.issuer?.id || token?.card?.issuer?.id);
    const bin = normalizeText(token?.first_six_digits || token?.card?.first_six_digits || token?.firstSixDigits).replace(/\D/g, '');
    if (!paymentMethodId && bin && typeof mp.getPaymentMethods === 'function') {
        try {
            const methods = normalizeResults(await mp.getPaymentMethods({ bin }));
            const selected = methods.find((method) => ['credit_card', 'debit_card'].includes(normalizeText(method?.payment_type_id).toLowerCase())) || methods[0];
            paymentMethodId = normalizeText(selected?.id);
            issuerId = issuerId || normalizeIssuer(selected?.issuer?.id);
        } catch (error) {
            console.warn('Nao foi possivel identificar a bandeira do cartao', error);
        }
    }
    if (!paymentMethodId) throw new Error('Não foi possível identificar a bandeira do cartão. Confira os dados e tente novamente.');
    if (!issuerId && bin && typeof mp.getIssuers === 'function') {
        try {
            const issuers = normalizeResults(await mp.getIssuers({ paymentMethodId, bin }));
            issuerId = normalizeIssuer(issuers[0]?.id);
        } catch (error) {
            console.warn('Nao foi possivel identificar a emissora do cartao', error);
        }
    }
    return { paymentMethodId, issuerId };
}

function renderMenuCardPending(payment) {
    document.getElementById('menu-pix-content').innerHTML = `<div class="menu-card-pending"><span>⏳</span><h3>Confirmando seu pagamento</h3><p>Estamos confirmando o pagamento. Você receberá a confirmação assim que o pedido for liberado.</p>${payment.payment_id ? `<small>Pagamento ${escapeMenuHtml(payment.payment_id)}</small>` : ''}</div>`;
}

function renderMenuPixCode(payment) {
    const qrBase64 = String(payment.qr_code_base64 || '').trim(); const qrCode = String(payment.qr_code || '').trim();
    document.getElementById('menu-pix-content').innerHTML = `<div class="menu-pix-box">${qrBase64 ? `<img src="data:image/jpeg;base64,${escapeMenuHtml(qrBase64)}" alt="QR Code PIX">` : '<div class="menu-pix-wait">Gerando imagem do QR Code…</div>'}<h3>Escaneie ou copie o código</h3><p>Abra o app do seu banco e escolha pagar com PIX.</p>${qrCode ? `<textarea id="menu-pix-copy" readonly>${escapeMenuHtml(qrCode)}</textarea><button class="menu-copy-button" type="button" onclick="copyMenuPix()">Copiar código PIX</button>` : ''}<div class="menu-payment-wait"><i></i><span>Aguardando confirmação do pagamento…</span></div></div>`;
}

async function copyMenuPix() { const value = document.getElementById('menu-pix-copy')?.value || ''; try { await navigator.clipboard.writeText(value); showMenuToast('Código PIX copiado'); } catch { document.getElementById('menu-pix-copy')?.select(); } }

function startMenuPaymentPolling(paymentId) {
    stopMenuPaymentPolling();
    menuState.paymentTimer = window.setInterval(async () => {
        try {
            const payment = menuState.payment;
            const status = await menuFetch(`/public/tables/tabs/${encodeURIComponent(payment.tabId)}/payments/${encodeURIComponent(paymentId)}/status?delivery_checkout_key=${encodeURIComponent(menuState.checkout.checkout_key)}`, { headers: { Authorization: `Bearer ${payment.token}` } });
            if (payment.method === 'pix' && (status.qr_code || status.qr_code_base64)) renderMenuPixCode({ ...menuState.payment, ...status });
            if (status.approved || String(status.status).toLowerCase() === 'approved') renderPaymentApproved(status);
            if (['rejected', 'cancelled', 'canceled'].includes(String(status.status || '').toLowerCase())) { stopMenuPaymentPolling(); showMenuToast(payment.method === 'card' ? 'O cartão não foi aprovado.' : 'O PIX não foi concluído.'); }
        } catch (_error) { }
    }, 4000);
}

function renderPaymentApproved(payment) {
    stopMenuPaymentPolling(); menuState.cart.clear(); persistMenuCart(); refreshMenuCartCounters(); menuState.checkoutAttempt = null; void loadMenuSession();
    void refreshMenuActiveOrders();
    window.setTimeout(() => { void refreshMenuActiveOrders(); }, 1800);
    const transaction = payment.mp_id || payment.payment_reference || '';
    openMenuLayer(`<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-paid-title"><div class="menu-sheet-inner menu-success"><div class="menu-success-mark">✓</div><h2 id="menu-paid-title">Pagamento confirmado!</h2><p>Seu pedido foi enviado ao restaurante. As próximas atualizações também podem chegar pelo WhatsApp.</p>${transaction ? `<small>Transação ${escapeMenuHtml(transaction)}</small>` : ''}<button class="menu-sheet-cta" type="button" onclick="openOrderHistory()">Acompanhar meu pedido</button><button class="menu-text-button" type="button" onclick="closeMenuLayer()">Voltar ao cardápio</button></div></div>`);
}

async function openOrderHistory() {
    stopMenuOrderHistoryRefresh();
    openMenuLayer(`<div class="menu-sheet menu-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="menu-orders-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader('Seus pedidos', 'Carregando histórico…', 'menu-orders-title')}<div id="menu-history-content" class="menu-history-loading">Buscando seus pedidos</div></div></div>`);
    try {
        await refreshMenuOrderHistory();
        menuState.orderHistoryTimer = window.setInterval(() => { void refreshMenuOrderHistory(); }, 10000);
    } catch (error) { showMenuToast(error.message); openMenuAccount(); }
}

async function refreshMenuOrderHistory() {
    const content = document.getElementById('menu-history-content');
    if (!content || menuState.orderHistoryRefreshInFlight) return;
    menuState.orderHistoryRefreshInFlight = true;
    try {
        const orders = await menuFetch(menuCustomerPath('/orders'));
        menuState.historyOrders = Array.isArray(orders) ? orders : [];
        renderMenuActiveOrderAlert(orders);
        const subtitle = document.querySelector('#menu-orders-title')?.parentElement?.querySelector('p');
        if (subtitle) subtitle.textContent = `${orders.length} ${orders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'} · atualizado agora`;
        content.className = '';
        content.innerHTML = orders.length
            ? `<div class="menu-history-list">${orders.map(renderHistoryOrder).join('')}</div>`
            : '<div class="menu-empty menu-empty--sheet"><span>↻</span><h2>Nenhum pedido ainda</h2><p>Quando você pedir por aqui ou pelo WhatsApp, o histórico aparecerá neste espaço.</p></div>';
    } catch (error) {
        if (!content.textContent?.trim()) content.textContent = 'Não foi possível atualizar os pedidos agora.';
        console.warn('Não foi possível atualizar o histórico de pedidos', error);
    } finally {
        menuState.orderHistoryRefreshInFlight = false;
    }
}

function renderHistoryOrder(order) {
    const status = menuOrderStatus(order); const date = new Date(order.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const canRepeat = (order.items || []).some((item) => String(item?.menu_item_id || '').trim());
    return `<article class="menu-history-card"><div class="menu-history-head"><div><small>${escapeMenuHtml(date)}</small><strong>${escapeMenuHtml(order.delivery_code ? `Pedido ${order.delivery_code}` : 'Pedido para entrega')}</strong></div><span class="status-${status.tone}">${escapeMenuHtml(status.label)}</span></div><div class="menu-history-items">${(order.items || []).map((item) => `<span>${item.quantity}× ${escapeMenuHtml(item.name)}</span>`).join('')}</div><div class="menu-history-total"><span>${order.delivery_fee ? `Inclui ${formatMenuMoney(order.delivery_fee)} de entrega` : 'Entrega'}</span><strong>${formatMenuMoney(order.total)}</strong></div>${canRepeat ? `<button class="menu-history-repeat" type="button" onclick="repeatMenuOrder('${escapeMenuHtml(order.checkout_key)}')">↻ Repetir pedido</button>` : ''}</article>`;
}

function normalizeRepeatOrderOptions(item, sourceOptions) {
    const groups = getMenuOptionGroups(item);
    const selected = Array.isArray(sourceOptions) ? sourceOptions : [];
    const normalized = [];
    let optionsChanged = false;
    for (const group of groups) {
        const groupName = String(group?.name || '').trim();
        const available = new Map((group?.options || [])
            .filter((option) => option?.available !== false)
            .map((option) => [String(option?.name || '').trim(), option]));
        const requested = selected.filter((option) => String(option?.group_name || option?.groupName || '').trim() === groupName);
        const maximum = Math.max(0, Number(group?.max_select ?? group?.maxSelect ?? group?.options?.length ?? 1) || 0);
        let chosen = 0;
        for (const source of requested) {
            const optionName = String(source?.option_name || source?.optionName || '').trim();
            const current = available.get(optionName);
            if (!current || (maximum && chosen >= maximum)) { optionsChanged = true; continue; }
            normalized.push({
                group_name: groupName,
                option_name: optionName,
                price_delta: Number(current.price_delta ?? current.priceDelta ?? 0),
            });
            chosen += 1;
        }
        const minimum = Math.max(0, Number(group?.min_select ?? group?.minSelect ?? (group?.required ? 1 : 0)) || 0);
        if (chosen < minimum) return { valid: false, selectedOptions: [], optionsChanged: true };
    }
    return { valid: true, selectedOptions: normalized, optionsChanged };
}

function repeatMenuOrder(checkoutKey) {
    const order = menuState.historyOrders.find((candidate) => String(candidate?.checkout_key || '') === String(checkoutKey || ''));
    if (!order) return showMenuToast('Não foi possível localizar esse pedido. Atualize o histórico e tente novamente.');
    const sourceItems = Array.isArray(order.items) ? order.items : [];
    if (!sourceItems.length) return showMenuToast('Esse pedido não possui itens para repetir.');
    if (menuCartCount() && !window.confirm('Substituir os itens atuais da sua sacola por este pedido?')) return;

    const repeatedCart = new Map();
    const unavailable = [];
    let adjusted = 0;
    sourceItems.forEach((source) => {
        const item = findMenuItem(String(source?.menu_item_id || ''));
        const quantity = Math.max(0, Math.min(20, Number(source?.quantity || 0)));
        if (!item || !quantity) { unavailable.push(String(source?.name || 'Item')); return; }
        const options = normalizeRepeatOrderOptions(item, source?.selected_options || source?.selectedOptions || []);
        if (!options.valid) { unavailable.push(String(source?.name || item.name)); return; }
        if (options.optionsChanged) adjusted += 1;
        const key = `${item.id}:${JSON.stringify(options.selectedOptions.map((option) => `${option.group_name}:${option.option_name}`).sort())}`;
        const current = repeatedCart.get(key) || { item, quantity: 0, selectedOptions: options.selectedOptions };
        current.quantity = Math.min(20, current.quantity + quantity);
        repeatedCart.set(key, current);
    });
    if (!repeatedCart.size) return showMenuToast('Os itens desse pedido não estão disponíveis no cardápio atual.');

    menuState.cart = repeatedCart;
    menuState.checkoutAttempt = null;
    persistMenuCart();
    refreshMenuCartCounters();
    closeMenuLayer();
    const skipped = unavailable.length ? ` ${unavailable.length} item${unavailable.length === 1 ? '' : 's'} precisa${unavailable.length === 1 ? '' : 'm'} ser escolhido novamente.` : '';
    const changed = adjusted ? ' Alguns complementos foram atualizados conforme o cardápio atual.' : '';
    showMenuToast(`Pedido adicionado à sacola.${skipped}${changed}`);
    openMenuCart();
}

function hasMenuProfileName() {
    return String(menuState.profile?.customer?.name || '').trim().replace(/\s+/g, ' ').length >= 2;
}

function menuOrderStatus(order) {
    const delivery = String(order.delivery_status || '').toUpperCase(); const payment = String(order.payment_status || '').toUpperCase();
    if (delivery === 'DELIVERED') return { label: 'Entregue', tone: 'success' };
    if (['CANCELED', 'REJECTED', 'RETURNED'].includes(delivery) || payment === 'CANCELED') return { label: 'Cancelado', tone: 'danger' };
    if (payment === 'EXPIRED') return { label: 'Pagamento expirado', tone: 'danger' };
    if (delivery === 'DELIVERY_FAILED') return { label: 'Problema na entrega', tone: 'danger' };
    if (delivery === 'RETURNING') return { label: 'Em retorno', tone: 'warning' };
    if (['IN_TRANSIT', 'ARRIVED', 'PICKED_UP'].includes(delivery)) return { label: 'A caminho', tone: 'progress' };
    if (['READY_FOR_DISPATCH', 'ASSIGNED'].includes(delivery)) return { label: 'Pronto para sair', tone: 'progress' };
    if (['ACCEPTED', 'PREPARING'].includes(delivery)) return { label: 'Em preparo', tone: 'progress' };
    if (delivery === 'PENDING_RESTAURANT_ACCEPTANCE') return { label: 'Aguardando aceite', tone: 'warning' };
    if (payment === 'PAID') return { label: 'Pagamento confirmado', tone: 'success' };
    if (payment === 'PENDING_PAYMENT') return { label: 'Pagamento pendente', tone: 'warning' };
    return { label: 'Em análise', tone: 'warning' };
}

function menuOrderIsActive(order) {
    const delivery = String(order?.delivery_status || '').toUpperCase();
    const payment = String(order?.payment_status || '').toUpperCase();
    if (['DELIVERED', 'CANCELED', 'REJECTED', 'RETURNED'].includes(delivery)) return false;
    if (['CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(payment)) return false;
    return payment === 'PAID' || ['PENDING_RESTAURANT_ACCEPTANCE', 'ACCEPTED', 'PREPARING', 'READY_FOR_DISPATCH', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERY_FAILED', 'RETURNING'].includes(delivery);
}

function renderMenuActiveOrderAlert(orders = []) {
    const button = document.getElementById('menu-order-alert');
    const badge = document.getElementById('menu-order-alert-count');
    if (!button || !badge) return;
    const count = Array.isArray(orders) ? orders.filter(menuOrderIsActive).length : 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    button.hidden = count === 0;
    button.setAttribute('aria-label', count === 1 ? 'Acompanhar 1 pedido em andamento' : `Acompanhar ${count} pedidos em andamento`);
}

async function refreshMenuActiveOrders() {
    if (!menuState.profile || menuState.activeOrdersRefreshInFlight || document.getElementById('menu-history-content')) return;
    menuState.activeOrdersRefreshInFlight = true;
    try {
        const orders = await menuFetch(menuCustomerPath('/orders'));
        renderMenuActiveOrderAlert(orders);
    } catch (error) {
        if (error.status === 401) {
            stopMenuActiveOrdersRefresh();
            renderMenuActiveOrderAlert([]);
        } else {
            console.warn('Não foi possível atualizar os pedidos em andamento', error);
        }
    } finally {
        menuState.activeOrdersRefreshInFlight = false;
    }
}

function startMenuActiveOrdersRefresh() {
    stopMenuActiveOrdersRefresh();
    void refreshMenuActiveOrders();
    menuState.activeOrdersTimer = window.setInterval(() => { void refreshMenuActiveOrders(); }, 10000);
}

function stopMenuActiveOrdersRefresh() {
    if (menuState.activeOrdersTimer) window.clearInterval(menuState.activeOrdersTimer);
    menuState.activeOrdersTimer = null;
    menuState.activeOrdersRefreshInFlight = false;
}

async function logoutMenuAccount() { await menuFetch(menuCustomerPath('/session/logout'), { method: 'POST', body: '{}' }).catch(() => undefined); menuState.profile = null; stopMenuActiveOrdersRefresh(); renderMenuActiveOrderAlert([]); refreshAccountState(); closeMenuLayer(); showMenuToast('Você saiu da conta'); }

function openRestaurantInfo() {
    const restaurant = menuState.payload?.restaurant || {};
    openMenuLayer(`<div class="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-restaurant-title"><div class="menu-sheet-inner"><div class="menu-sheet-handle"></div>${sheetHeader(restaurant.name || 'Restaurante', restaurant.is_open ? 'Aberto para pedidos' : 'Fechado no momento', 'menu-restaurant-title')}<div class="menu-product-copy menu-restaurant-copy"><p>${escapeMenuHtml(restaurant.description || 'Cardápio digital com disponibilidade e valores informados pelo restaurante.')}</p><p><strong>${Number(menuState.payload?.item_count || 0)} opções disponíveis neste momento.</strong></p></div><button class="menu-sheet-cta" type="button" onclick="closeMenuLayer()">Voltar ao cardápio</button></div></div>`);
}

function openMenuLayer(content) { stopMenuOrderHistoryRefresh(); const layer = document.getElementById('menu-layer'); layer.innerHTML = content; layer.hidden = false; document.body.style.overflow = 'hidden'; layer.onclick = (event) => { if (event.target === layer) closeMenuLayer(); }; }
function closeMenuLayer() { stopMenuOrderHistoryRefresh(); const layer = document.getElementById('menu-layer'); if (!layer) return; layer.hidden = true; layer.innerHTML = ''; document.body.style.overflow = ''; }
function sheetHeader(title, subtitle, id) { return `<div class="menu-sheet-head"><div><h2 id="${escapeMenuHtml(id)}">${escapeMenuHtml(title)}</h2><p>${escapeMenuHtml(subtitle || '')}</p></div><button class="menu-close" type="button" onclick="closeMenuLayer()" aria-label="Fechar">×</button></div>`; }

async function menuFetch(path, options = {}, credentials = true) {
    const url = /^https?:/i.test(path) ? path : new URL(`${menuState.apiBase}${path}`, window.location.origin).toString();
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers, credentials: credentials ? 'same-origin' : 'omit' });
    const raw = await response.json().catch(() => ({})); const body = raw && Object.prototype.hasOwnProperty.call(raw, 'data') ? raw.data : raw;
    if (!response.ok) { const error = new Error(String(body?.message || raw?.message || 'Não foi possível concluir.')); error.status = response.status; throw error; }
    return body;
}

function menuCartCount() { return Array.from(menuState.cart.values()).reduce((total, current) => total + current.quantity, 0); }
function menuCartRowUnitPrice(row) { return Number(row?.item?.price || 0) + (row?.selectedOptions || []).reduce((total, option) => total + Number(option.price_delta || option.priceDelta || 0), 0); }
function menuCartTotal() { return Array.from(menuState.cart.values()).reduce((total, current) => total + menuCartRowUnitPrice(current) * current.quantity, 0); }
function refreshMenuCartCounters() { const count = menuCartCount(); document.querySelectorAll('#menu-bag-count, #menu-nav-count').forEach((element) => { element.textContent = String(count); }); const value = document.querySelector('.menu-bag-value'); if (value) value.textContent = formatMenuMoney(menuCartTotal()); }
function refreshAccountState() { const label = document.getElementById('menu-account-label'); const button = document.getElementById('menu-account-nav'); if (label) label.textContent = menuState.profile ? 'Conta' : 'Entrar'; if (button) button.classList.toggle('is-signed-in', Boolean(menuState.profile)); }
function persistMenuCart() { try { sessionStorage.setItem(`clickgarcom_menu_cart_${menuState.slug || 'menu'}`, JSON.stringify(Array.from(menuState.cart.entries()).map(([key, { item, quantity, selectedOptions }]) => ({ key, id: item.id, quantity, selected_options: selectedOptions || [] })))); } catch (_error) { } }
function restoreMenuCart(slug) { try { const saved = JSON.parse(sessionStorage.getItem(`clickgarcom_menu_cart_${slug}`) || '[]'); for (const row of Array.isArray(saved) ? saved : []) { const item = findMenuItem(row.id); const quantity = Math.max(0, Math.min(20, Number(row.quantity || 0))); const selectedOptions = Array.isArray(row.selected_options) ? row.selected_options : []; if (item && quantity && (!item.has_options || selectedOptions.length)) { const key = row.key || `${item.id}:${JSON.stringify(selectedOptions.map((option) => `${option.group_name}:${option.option_name}`).sort())}`; menuState.cart.set(key, { item, quantity, selectedOptions }); } } } catch (_error) { menuState.cart.clear(); } }
function stopMenuPaymentPolling() { if (menuState.paymentTimer) window.clearInterval(menuState.paymentTimer); menuState.paymentTimer = null; }
function stopMenuOrderHistoryRefresh() { if (menuState.orderHistoryTimer) window.clearInterval(menuState.orderHistoryTimer); menuState.orderHistoryTimer = null; menuState.orderHistoryRefreshInFlight = false; }
function setButtonBusy(button, text) { if (!button) return; button.dataset.label = button.textContent; button.textContent = text; button.disabled = true; }
function resetButton(button) { if (!button) return; button.textContent = button.dataset.label || 'Tentar novamente'; button.disabled = false; }
function showFormError(id, message) { const element = document.getElementById(id); if (!element) return showMenuToast(message); element.textContent = message; element.hidden = false; }
function showMenuToast(message) { const toast = document.getElementById('menu-toast'); toast.textContent = message; toast.classList.add('menu-toast--visible'); window.clearTimeout(menuState.toastTimer); menuState.toastTimer = window.setTimeout(() => toast.classList.remove('menu-toast--visible'), 2400); }
function renderMenuError(title, message) { document.getElementById('digital-menu-app').innerHTML = `<section class="menu-loading"><div class="menu-loading-mark menu-loading-mark--error">!</div><h1>${escapeMenuHtml(title)}</h1><p>${escapeMenuHtml(message)}</p><button class="menu-sheet-cta menu-retry" onclick="window.location.reload()">Tentar novamente</button></section>`; }

function safeMenuAssetUrl(rawValue) { const value = String(rawValue || '').trim(); if (!value || value.length > 2048) return ''; try { const url = new URL(value, window.location.origin); return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === window.location.origin) ? url.href : ''; } catch (_error) { return ''; } }
function formatAddress(address) { return [address.street, address.address_number, address.neighborhood, address.city && address.state ? `${address.city}/${address.state}` : address.city].filter(Boolean).join(', '); }
function formatPostalCode(value) { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; }
function profileInitials(name) { return String(name || 'C').split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase(); }
function safeMenuColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback; }
function hexToRgb(value) { const hex = value.replace('#', ''); return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`; }
function normalizeMenuSearch(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function formatMenuMoney(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function escapeMenuHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

Object.assign(window, { selectMenuCategory, setMenuSearch, clearMenuSearch, focusMenuSearch, menuGoHome, openMenuItem, addMenuItem, confirmMenuItemOptions, changeMenuQuantity, openMenuCart, startCheckoutJourney, openMenuLogin, requestMenuLogin, verifyMenuLogin, openMenuAccount, openProfileEdit, saveMenuProfile, openAddressList, openAddressForm, lookupMenuPostalCode, saveMenuAddress, removeMenuAddress, openCheckoutReview, createMenuCheckout, generateMenuPix, openMenuCardForm, activateMenuPayment, copyMenuPix, openOrderHistory, repeatMenuOrder, logoutMenuAccount, openRestaurantInfo, closeMenuLayer });
