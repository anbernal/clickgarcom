// ClickGarçom — Delivery control tower (admin web only)
const DELIVERY_STATUS = Object.freeze({
    PENDING_RESTAURANT_ACCEPTANCE: { label: 'Aguardando aceite', icon: '⏳', color: '#a75b0a', bg: '#fff4dd' },
    ACCEPTED: { label: 'Aceita', icon: '✓', color: '#1b6d5c', bg: '#e7f8f3' },
    PREPARING: { label: 'Em preparo', icon: '◷', color: '#2459a6', bg: '#eaf2ff' },
    READY_FOR_DISPATCH: { label: 'Pronta', icon: '●', color: '#7445ad', bg: '#f2eaff' },
    ASSIGNED: { label: 'Atribuída', icon: '↗', color: '#126979', bg: '#e5f7fa' },
    PICKED_UP: { label: 'Coletada', icon: '↗', color: '#126979', bg: '#e5f7fa' },
    IN_TRANSIT: { label: 'Em rota', icon: '➜', color: '#126979', bg: '#e5f7fa' },
    ARRIVED: { label: 'Chegou', icon: '⌖', color: '#17623d', bg: '#e8f7ee' },
    DELIVERED: { label: 'Entregue', icon: '✓', color: '#17623d', bg: '#e8f7ee' },
    REJECTED: { label: 'Rejeitada', icon: '×', color: '#9a332a', bg: '#fff0ee' },
    CANCELED: { label: 'Cancelada', icon: '×', color: '#9a332a', bg: '#fff0ee' },
    DELIVERY_FAILED: { label: 'Falha na entrega', icon: '!', color: '#9a332a', bg: '#fff0ee' },
    RETURNING: { label: 'Em retorno', icon: '↩', color: '#9a332a', bg: '#fff0ee' },
    RETURNED: { label: 'Retornada', icon: '↩', color: '#69536c', bg: '#f5edf5' },
});

const DELIVERY_COLUMNS = Object.freeze([
    { id: 'acceptance', label: 'Aceite', icon: '◴', statuses: ['PENDING_RESTAURANT_ACCEPTANCE'] },
    { id: 'preparing', label: 'Preparando', icon: '♨', statuses: ['ACCEPTED', 'PREPARING'] },
    { id: 'ready', label: 'Prontas', icon: '✓', statuses: ['READY_FOR_DISPATCH'] },
    { id: 'route', label: 'Em rota', icon: '➜', statuses: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'] },
    { id: 'exceptions', label: 'Exceções', icon: '!', statuses: ['DELIVERY_FAILED', 'RETURNING', 'RETURNED'] },
]);
const DELIVERY_ACTIVE_QUERY = 'PENDING_RESTAURANT_ACCEPTANCE,ACCEPTED,PREPARING,READY_FOR_DISPATCH,ASSIGNED,PICKED_UP,IN_TRANSIT,ARRIVED,DELIVERY_FAILED,RETURNING';

const DELIVERY_REJECTION_REASONS = Object.freeze({
    OUT_OF_AREA: 'Endereço fora da área', ITEMS_UNAVAILABLE: 'Itens indisponíveis', PAYMENT_FAILED: 'Pagamento não confirmado',
    RESTAURANT_CLOSED: 'Restaurante fechado', CUSTOMER_REQUESTED: 'Solicitação do cliente', DUPLICATE_ORDER: 'Pedido duplicado', OTHER: 'Outro motivo',
});
const DELIVERY_CANCELLATION_REASONS = Object.freeze({
    CUSTOMER_REQUESTED: 'Solicitação do cliente', RESTAURANT_REQUESTED: 'Decisão do restaurante', PAYMENT_FAILED: 'Falha no pagamento',
    DUPLICATE_ORDER: 'Pedido duplicado', OPERATIONAL_BLOCK: 'Bloqueio operacional', OTHER: 'Outro motivo',
});
const DELIVERY_OVERRIDE_REASONS = Object.freeze({
    CUSTOMER_COULD_NOT_PROVIDE_PIN: 'Cliente não conseguiu informar o código', PIN_DELIVERY_FAILURE: 'Falha no envio do código',
    CUSTOMER_IDENTITY_CONFIRMED: 'Identidade confirmada por outro meio', OPERATIONAL_EXCEPTION: 'Exceção operacional', OTHER: 'Outro motivo',
});
const DELIVERY_RETURN_REASONS = Object.freeze({
    CUSTOMER_ABSENT: 'Cliente ausente', WRONG_ADDRESS: 'Endereço incorreto', CUSTOMER_REFUSED: 'Cliente recusou o pedido',
    ACCIDENT_OR_ISSUE: 'Acidente ou imprevisto', DAMAGED_ORDER: 'Pedido danificado', VEHICLE_ISSUE: 'Problema com o veículo', OTHER: 'Outro motivo',
});

const deliveryState = {
    deliveries: [], summary: null, settings: null, capacity: null, drivers: [], page: 1, total: 0, hasMore: false,
    loading: false, partialError: '', offline: false, pollTimer: null, requestSequence: 0, busy: new Set(), networkListenersBound: false,
    filters: { status: DELIVERY_ACTIVE_QUERY, driverId: '', code: '', date: '' },
};

function deliveryReadFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    deliveryState.filters.status = params.get('delivery_status') || DELIVERY_ACTIVE_QUERY;
    deliveryState.filters.driverId = params.get('delivery_driver') || '';
    deliveryState.filters.code = params.get('delivery_code') || '';
    deliveryState.filters.date = params.get('delivery_date') || '';
}

function deliveryPersistFilters() {
    const url = new URL(window.location.href);
    const fields = { delivery_status: deliveryState.filters.status, delivery_driver: deliveryState.filters.driverId, delivery_code: deliveryState.filters.code, delivery_date: deliveryState.filters.date };
    Object.entries(fields).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    window.history.replaceState({}, '', url);
}

async function loadDeliveryPage() {
    const container = document.getElementById('page-delivery');
    if (!container) return;
    if (!canAccessPage('delivery')) {
        container.innerHTML = deliveryStateView('🔒', 'Acesso restrito', 'Seu perfil não possui acesso à operação de entregas.');
        return;
    }
    if (getCurrentUser()?.delivery_enabled !== true) {
        destroyDeliveryPage();
        const badge = document.getElementById('badge-delivery');
        if (badge) {
            badge.textContent = '';
            badge.style.display = 'none';
        }
        container.innerHTML = renderDeliveryUnavailablePage();
        return;
    }
    destroyDeliveryPage();
    deliveryReadFiltersFromUrl();
    renderDeliveryLoading();
    const sequence = ++deliveryState.requestSequence;
    deliveryState.loading = true;
    const [listResult, summaryResult, settingsResult, capacityResult, driversResult] = await Promise.allSettled([
        deliveryFetchList(),
        api.get('/deliveries/operations/summary'),
        canPerformAction('manageDeliverySettings') ? api.get('/delivery/settings') : Promise.resolve(null),
        canPerformAction('manageDeliverySettings') ? api.get('/delivery/capacity') : Promise.resolve(null),
        canPerformAction('manageDeliveries')
            ? (window.getFleetEligibleDrivers ? window.getFleetEligibleDrivers() : api.get('/deliveries/drivers/eligible'))
            : Promise.resolve({ drivers: [] }),
    ]);
    if (sequence !== deliveryState.requestSequence) return;
    deliveryState.loading = false;
    if (listResult.status === 'rejected') {
        container.innerHTML = deliveryStateView('⚠️', 'Não foi possível carregar as entregas', listResult.reason?.message || 'Confira sua conexão e tente novamente.', 'Tentar novamente', 'loadDeliveryPage()');
        return;
    }
    if (summaryResult.status === 'fulfilled') deliveryState.summary = summaryResult.value;
    else deliveryState.partialError = 'O resumo está temporariamente indisponível; a fila continua atualizada.';
    if (settingsResult.status === 'fulfilled') deliveryState.settings = settingsResult.value;
    if (capacityResult.status === 'fulfilled') deliveryState.capacity = capacityResult.value;
    if (driversResult.status === 'fulfilled') deliveryState.drivers = deliveryNormalizeDrivers(driversResult.value);
    deliveryState.offline = false;
    renderDeliveryPage();
    startDeliveryPolling();
}

function renderDeliveryUnavailablePage() {
    const tenantName = String(getCurrentUser()?.tenant_name || 'seu restaurante').trim();
    const subject = encodeURIComponent(`Ativar Delivery - ${tenantName}`);
    return `<div class="delivery-shell delivery-unavailable-shell">
        <section class="delivery-unavailable" aria-labelledby="delivery-unavailable-title">
            <div class="delivery-unavailable-orbit delivery-unavailable-orbit--one" aria-hidden="true"></div>
            <div class="delivery-unavailable-orbit delivery-unavailable-orbit--two" aria-hidden="true"></div>
            <div class="delivery-unavailable-icon" aria-hidden="true">🛵</div>
            <div class="delivery-eyebrow"><span class="delivery-live-dot"></span> Módulo adicional</div>
            <h2 id="delivery-unavailable-title">Delivery não está disponível para esta conta</h2>
            <p>Leve seus pedidos até a porta do cliente com checkout, acompanhamento em tempo real e operação centralizada. Ative o módulo para começar a configurar.</p>
            <div class="delivery-unavailable-actions">
                <a class="delivery-btn delivery-btn--light" href="mailto:suporte@clickgarcom.com.br?subject=${subject}">Fale com a gente</a>
                <button class="delivery-btn delivery-btn--ghost" type="button" onclick="navigate('dashboard')">Voltar ao dashboard</button>
            </div>
            <div class="delivery-unavailable-foot">Nossa equipe ajuda a ativar o módulo e orientar os primeiros passos para ${escapeHTML(tenantName)}.</div>
        </section>
        <section class="delivery-unavailable-benefits" aria-label="Recursos do Delivery">
            <div><span aria-hidden="true">🔗</span><div><strong>Pedidos em um só lugar</strong><p>Receba e acompanhe a operação sem alternar de tela.</p></div></div>
            <div><span aria-hidden="true">📍</span><div><strong>Rastreamento para o cliente</strong><p>Compartilhe uma experiência de acompanhamento segura.</p></div></div>
            <div><span aria-hidden="true">✓</span><div><strong>Controle até a entrega</strong><p>Organize preparo, saída e confirmação com código.</p></div></div>
        </section>
    </div>`;
}

async function deliveryFetchList(page = deliveryState.page) {
    const params = { page, limit: 60 };
    if (deliveryState.filters.status) params.status = deliveryState.filters.status;
    if (deliveryState.filters.driverId) params.driver_id = deliveryState.filters.driverId;
    if (deliveryState.filters.code) params.code = deliveryState.filters.code.trim();
    const payload = await api.get('/deliveries', params);
    deliveryState.deliveries = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
    deliveryState.page = Number(payload?.page || page);
    deliveryState.total = Number(payload?.total ?? deliveryState.deliveries.length);
    deliveryState.hasMore = !!payload?.has_more;
    return payload;
}

function deliveryNormalizeDrivers(payload) {
    const drivers = Array.isArray(payload?.drivers) ? payload.drivers : (Array.isArray(payload) ? payload : []);
    return drivers.filter((driver) => driver.id && String(driver.availability || 'AVAILABLE').toUpperCase() !== 'OFFLINE');
}

function renderDeliveryLoading() {
    const container = document.getElementById('page-delivery');
    container.innerHTML = `<div class="delivery-shell" aria-busy="true"><div class="delivery-skeleton-grid">${Array.from({ length: 5 }, () => '<div class="delivery-skeleton-column"></div>').join('')}</div></div>`;
}

function renderDeliveryPage() {
    const container = document.getElementById('page-delivery');
    if (!container) return;
    const settings = deliveryState.settings?.settings;
    const settingsStatus = deliverySettingsStatus(settings);
    const visibleDeliveries = deliveryFilteredByDate();
    const counts = deliveryState.summary?.counts || {};
    const pending = Number(counts.PENDING_RESTAURANT_ACCEPTANCE || 0);
    const ready = Number(counts.READY_FOR_DISPATCH || 0);
    const route = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].reduce((sum, status) => sum + Number(counts[status] || 0), 0);
    const exceptions = ['DELIVERY_FAILED', 'RETURNING'].reduce((sum, status) => sum + Number(counts[status] || 0), 0);
    const badge = document.getElementById('badge-delivery');
    if (badge) { badge.textContent = pending ? String(pending) : ''; badge.style.display = pending ? '' : 'none'; }

    container.innerHTML = `
        <div class="delivery-shell">
            <section class="delivery-hero" aria-labelledby="delivery-hero-title">
                <div class="delivery-hero-copy">
                    <div class="delivery-eyebrow"><span class="delivery-live-dot"></span> Central de despacho</div>
                    <h2 id="delivery-hero-title">Da cozinha até a porta, sem perder o pulso.</h2>
                    <p>Priorize aceites, conecte entregadores e acompanhe cada etapa em uma única visão operacional.</p>
                </div>
                ${settings ? `<div class="delivery-hero-status"><div class="delivery-config-status delivery-config-status--${settingsStatus.tone}" role="status"><span class="delivery-config-status-dot" aria-hidden="true"></span><div><strong>${escapeHTML(settingsStatus.label)}</strong><span>${escapeHTML(settingsStatus.detail)}</span></div></div></div>` : ''}
                <div class="delivery-hero-actions">
                    <button class="delivery-btn delivery-btn--ghost" type="button" onclick="refreshDeliveryPage(true)">↻ Atualizar</button>
                    <button class="delivery-btn delivery-btn--ghost" type="button" onclick="openDeliveryExceptions()">! Exceções</button>
                    ${canPerformAction('manageDeliverySettings') ? '<button class="delivery-btn delivery-btn--ghost" type="button" onclick="openDeliveryReport()">▤ Relatório</button>' : ''}
                    ${canPerformAction('manageDeliverySettings') ? '<button class="delivery-btn delivery-btn--ghost" type="button" onclick="openDeliveryCustomerManager()">👤 Clientes e endereços</button>' : ''}
                    ${canPerformAction('manageDeliverySettings') ? '<button class="delivery-btn delivery-btn--light" type="button" onclick="openDeliverySettings()">⚙ Configurar operação</button>' : ''}
                </div>
            </section>
            ${settings && !settings.enabled ? `
                <div class="delivery-disabled-banner" role="status"><span style="font-size:22px">◐</span><div><strong>Delivery em modo de configuração</strong><span>As entregas existentes continuam visíveis, mas o aceite automático está pausado.</span></div>${canPerformAction('manageDeliverySettings') ? '<button class="delivery-btn delivery-btn--neutral" onclick="openDeliverySettings()">Ativar módulo</button>' : ''}</div>
            ` : ''}
            ${deliveryState.partialError ? `<div class="delivery-alert" role="status"><span>⚠</span><div><strong>Visão parcial</strong><span>${escapeHTML(deliveryState.partialError)}</span></div></div>` : ''}
            ${deliveryState.offline ? '<div class="delivery-alert delivery-alert--offline" role="alert"><span>⌁</span><div><strong>Sem conexão com a operação</strong><span>Os dados exibidos podem estar desatualizados. A atualização será retomada quando a conexão voltar.</span></div><button class="delivery-btn delivery-btn--neutral" onclick="refreshDeliveryPage(true)">Tentar novamente</button></div>' : ''}
            ${exceptions ? `<div class="delivery-alert" role="status"><span>!</span><div><strong>${exceptions} exceção${exceptions === 1 ? '' : 'ões'} aberta${exceptions === 1 ? '' : 's'}</strong><span>Revise falhas e retornos antes de iniciar novos ciclos.</span></div><button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryExceptions()">Abrir centro</button></div>` : ''}
            <section class="delivery-kpis" aria-label="Resumo da operação">
                ${deliveryKpi('Aceites pendentes', pending, '◴', pending ? 'Pedem decisão do restaurante' : 'Fila sob controle')}
                ${deliveryKpi('Prontas para sair', ready, '✓', ready ? 'Atribua um entregador' : 'Nada aguardando coleta')}
                ${deliveryKpi('Em deslocamento', route, '➜', 'Atribuídas, coletadas ou em rota')}
                ${deliveryKpi('Exceções abertas', exceptions, '!', exceptions ? 'Precisam de atenção' : 'Sem ocorrências ativas')}
            </section>
            ${renderDeliveryToolbar()}
            <section class="delivery-board-wrap" aria-label="Quadro de entregas">
                ${visibleDeliveries.length ? renderDeliveryBoard(visibleDeliveries) : deliveryStateView('🛵', 'Nenhuma entrega nesta visão', deliveryEmptyMessage(), 'Limpar filtros', 'clearDeliveryFilters()')}
            </section>
            ${deliveryState.total > 60 || deliveryState.page > 1 ? renderDeliveryPagination() : ''}
        </div>`;
}

function deliverySettingsStatus(settings) {
    if (!settings) return { tone: 'neutral', label: 'Configuração indisponível', detail: 'Não foi possível consultar as regras do tenant.' };
    const lat = Number(settings.origin?.lat);
    const lng = Number(settings.origin?.lng);
    const radius = Number(settings.service_area?.radius_km);
    const hasOrigin = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && radius > 0;
    const address = settings.origin_address || {};
    const hasAddress = [address.street, address.address_number, address.neighborhood, address.city, address.state, address.postal_code].every((value) => String(value || '').trim());
    if (!hasOrigin || !hasAddress || address.confirmed !== true) return { tone: 'warning', label: 'Configuração incompleta', detail: 'Confirme a localização, o endereço e o número do restaurante.' };
    if (!settings.enabled) return { tone: 'neutral', label: 'Configurado e inativo', detail: 'Pronto para ativar nos próximos pedidos.' };
    return { tone: 'success', label: 'Delivery configurado e ativo', detail: 'As regras estão valendo para novos pedidos.' };
}

function deliveryKpi(label, value, icon, foot) {
    return `<article class="delivery-kpi"><div class="delivery-kpi-head"><span>${escapeHTML(label)}</span><span class="delivery-kpi-icon" aria-hidden="true">${icon}</span></div><strong class="delivery-kpi-value">${Number(value || 0)}</strong><div class="delivery-kpi-foot">${escapeHTML(foot)}</div></article>`;
}

function renderDeliveryToolbar() {
    const groupedOptions = [
        [DELIVERY_ACTIVE_QUERY, 'Operação ativa'],
        ['PENDING_RESTAURANT_ACCEPTANCE', 'Aguardando aceite'],
        ['ACCEPTED,PREPARING', 'Aceitas / em preparo'],
        ['READY_FOR_DISPATCH', 'Prontas para despacho'],
        ['ASSIGNED,PICKED_UP,IN_TRANSIT,ARRIVED', 'Atribuídas / em rota'],
        ['DELIVERY_FAILED,RETURNING,RETURNED', 'Exceções / retornos'],
        ['DELIVERED', 'Concluídas'], ['REJECTED,CANCELED', 'Rejeitadas / canceladas'],
    ];
    return `<div class="delivery-toolbar" role="search">
        <div class="delivery-field"><label for="delivery-search">Código da entrega</label><input id="delivery-search" value="${escapeHTML(deliveryState.filters.code)}" placeholder="Ex.: 482193" inputmode="numeric" onkeydown="if(event.key==='Enter') applyDeliveryFilters()"></div>
        <div class="delivery-field"><label for="delivery-status-filter">Etapa</label><select id="delivery-status-filter">${groupedOptions.map(([value, label]) => `<option value="${value}" ${deliveryState.filters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="delivery-field"><label for="delivery-driver-filter">Entregador</label><select id="delivery-driver-filter"><option value="">Todos</option>${deliveryState.drivers.map((driver) => `<option value="${escapeHTML(driver.id)}" ${deliveryState.filters.driverId === driver.id ? 'selected' : ''}>${escapeHTML(driver.name || driver.email || 'Entregador')}</option>`).join('')}</select></div>
        <div class="delivery-field"><label for="delivery-date-filter">Data de entrada</label><input id="delivery-date-filter" type="date" value="${escapeHTML(deliveryState.filters.date)}"></div>
        <div class="delivery-toolbar-actions"><button class="delivery-btn delivery-btn--primary" onclick="applyDeliveryFilters()">Aplicar</button><button class="delivery-btn delivery-btn--neutral" onclick="clearDeliveryFilters()" aria-label="Limpar filtros">Limpar</button></div>
    </div>`;
}

function deliveryFilteredByDate() {
    if (!deliveryState.filters.date) return deliveryState.deliveries;
    return deliveryState.deliveries.filter((item) => String(item.created_at || '').slice(0, 10) === deliveryState.filters.date);
}

function renderDeliveryBoard(deliveries) {
    const terminalStatuses = ['DELIVERED', 'REJECTED', 'CANCELED', 'RETURNED'];
    const columns = deliveries.some((item) => terminalStatuses.includes(item.status))
        ? [...DELIVERY_COLUMNS, { id: 'closed', label: 'Encerradas', icon: '◎', statuses: terminalStatuses }]
        : DELIVERY_COLUMNS;
    return `<div class="delivery-board">${columns.map((column) => {
        const cards = deliveries.filter((item) => column.statuses.includes(item.status)).sort(deliveryUrgencySort);
        return `<section class="delivery-column" aria-labelledby="delivery-col-${column.id}"><header class="delivery-column-head"><div class="delivery-column-title" id="delivery-col-${column.id}"><span aria-hidden="true">${column.icon}</span>${column.label}</div><span class="delivery-column-count">${cards.length}</span></header><div class="delivery-column-body">${cards.length ? cards.map(renderDeliveryCard).join('') : '<div class="delivery-empty-column">Nenhuma entrega<br>nesta etapa</div>'}</div></section>`;
    }).join('')}</div>`;
}

function deliveryUrgencySort(a, b) {
    const weight = { DELIVERY_FAILED: 100, RETURNING: 90, PENDING_RESTAURANT_ACCEPTANCE: 80, READY_FOR_DISPATCH: 70, ARRIVED: 60 };
    return (weight[b.status] || 0) - (weight[a.status] || 0) || new Date(a.created_at) - new Date(b.created_at);
}

function renderDeliveryCard(item) {
    const status = DELIVERY_STATUS[item.status] || { label: item.status, icon: '•', color: '#465651', bg: '#eef3f1' };
    const own = deliveryIsOwn(item);
    const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(item.created_at).getTime()) / 60000));
    const urgent = item.status === 'DELIVERY_FAILED' || item.status === 'RETURNING' || (item.status === 'PENDING_RESTAURANT_ACCEPTANCE' && ageMinutes >= 10);
    const driver = deliveryDriverName(item.assigned_driver_id);
    const staleMinutes = Math.max(0, Math.round((Date.now() - new Date(item.updated_at).getTime()) / 60000));
    return `<button type="button" class="delivery-card ${urgent ? 'delivery-card--urgent' : ''}" onclick="openDeliveryDetail('${escapeHTML(item.id)}')" aria-label="Abrir entrega ${escapeHTML(item.display_code)}: ${escapeHTML(status.label)}">
        <div class="delivery-card-top"><span class="delivery-code">#${escapeHTML(item.display_code)}</span><span class="delivery-status" style="--status-color:${status.color};--status-bg:${status.bg}">${status.icon} ${escapeHTML(status.label)}</span></div>
        <div class="delivery-card-customer">${escapeHTML(deliveryMaskName(item.customer_name))}</div>
        <div class="delivery-card-location"><span aria-hidden="true">⌖</span><span>${escapeHTML(deliverySafeArea(item.formatted_address))}</span></div>
        <div class="delivery-card-meta"><div class="delivery-meta-chip"><span>Tempo</span><strong>${deliveryRelativeAge(item.created_at)}</strong></div><div class="delivery-meta-chip"><span>Modalidade</span><strong>${own ? 'Entrega própria' : 'Entrega iFood'}</strong></div>${!own || window.deliveryUsesIdentifiedFleet?.() ? `<div class="delivery-meta-chip" style="grid-column:1/-1"><span>Motoboy</span><strong>${escapeHTML(driver)}</strong></div>` : ''}</div>
        <div class="delivery-card-footer"><span class="delivery-signal ${staleMinutes > 5 ? 'delivery-signal--stale' : ''}">${staleMinutes <= 1 ? 'agora' : `há ${staleMinutes} min`}</span><span class="delivery-card-action">Ver detalhes →</span></div>
    </button>`;
}

function deliveryIsOwn(item) {
    const mode = String(item?.fulfillment_mode || item?.default_fulfillment_mode || item?.default_fulfillment_mode_snapshot || item?.fulfillment?.mode || item?.delivery_mode || '').trim().toUpperCase();
    return mode === 'OWN' || mode === 'PROPRIA' || mode === 'PRÓPRIA';
}

function deliveryMaskName(name) {
    const words = String(name || 'Cliente não informado').trim().split(/\s+/);
    return words.length < 2 ? words[0] : `${words[0]} ${words.slice(1).map((word) => `${word.charAt(0)}.`).join(' ')}`;
}

function deliverySafeArea(address) {
    const parts = String(address || '').split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) return parts.slice(-3, -1).join(' · ');
    return address ? 'Destino confirmado' : 'Endereço pendente';
}

function deliveryRelativeAge(value) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function deliveryEta(seconds) {
    if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return 'calculando';
    const min = Math.max(1, Math.round(Number(seconds) / 60));
    return `${Math.max(1, min - 3)}–${min + 3} min`;
}

function deliveryDriverName(id) {
    if (!id) return 'Não atribuído';
    const driver = deliveryState.drivers.find((item) => item.id === id);
    return driver?.name || `Entregador ${String(id).slice(0, 6)}`;
}

function applyDeliveryFilters() {
    deliveryState.filters.code = document.getElementById('delivery-search')?.value.trim() || '';
    deliveryState.filters.status = document.getElementById('delivery-status-filter')?.value || '';
    deliveryState.filters.driverId = document.getElementById('delivery-driver-filter')?.value || '';
    deliveryState.filters.date = document.getElementById('delivery-date-filter')?.value || '';
    deliveryState.page = 1;
    deliveryPersistFilters();
    refreshDeliveryPage();
}

function clearDeliveryFilters() {
    deliveryState.filters = { status: DELIVERY_ACTIVE_QUERY, driverId: '', code: '', date: '' };
    deliveryState.page = 1;
    deliveryPersistFilters();
    refreshDeliveryPage();
}

async function refreshDeliveryPage(showFeedback = false) {
    if (deliveryState.loading) return;
    deliveryState.loading = true;
    try {
        const [list, summary] = await Promise.all([deliveryFetchList(), api.get('/deliveries/operations/summary').catch(() => null)]);
        if (summary) deliveryState.summary = summary;
        deliveryState.offline = false;
        renderDeliveryPage();
        if (showFeedback && list) showToast('Operação atualizada.', 'success');
    } catch (error) {
        deliveryState.offline = true;
        if (document.getElementById('page-delivery')?.classList.contains('active')) renderDeliveryPage();
        showToast(error.message || 'Falha ao atualizar entregas.', 'error');
    } finally { deliveryState.loading = false; }
}

function deliveryEmptyMessage() {
    if (deliveryState.filters.code || deliveryState.filters.status || deliveryState.filters.driverId) return 'Nenhum resultado corresponde aos filtros. Limpe-os para voltar à operação completa.';
    return 'Quando um pedido Delivery for criado, ele aparecerá aqui para aceite e despacho.';
}

function deliveryStateView(icon, title, message, buttonLabel, action) {
    return `<div class="delivery-state"><div class="delivery-state-icon" aria-hidden="true">${icon}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(message)}</p>${buttonLabel ? `<button class="delivery-btn delivery-btn--neutral" onclick="${action}">${escapeHTML(buttonLabel)}</button>` : ''}</div>`;
}

function renderDeliveryPagination() {
    const pages = Math.max(1, Math.ceil(deliveryState.total / 60));
    return `<nav class="delivery-pagination" aria-label="Paginação de entregas"><button class="delivery-btn delivery-btn--neutral" ${deliveryState.page <= 1 ? 'disabled' : ''} onclick="goToDeliveryPage(${deliveryState.page - 1})">← Anterior</button><span>Página ${deliveryState.page} de ${pages} · ${deliveryState.total} entregas</span><button class="delivery-btn delivery-btn--neutral" ${!deliveryState.hasMore ? 'disabled' : ''} onclick="goToDeliveryPage(${deliveryState.page + 1})">Próxima →</button></nav>`;
}

async function goToDeliveryPage(page) {
    deliveryState.page = Math.max(1, page);
    await refreshDeliveryPage();
    document.querySelector('.delivery-board-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openDeliveryDetail(id) {
    const selected = deliveryState.deliveries.find((item) => item.id === id);
    if (!selected) return;
    openModal(`<div class="modal-header"><div><h3>Carregando entrega...</h3></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body"><div class="loading"><div class="spinner"></div> Atualizando dados...</div></div>`, { size: 'lg' });
    try {
        const result = await api.get(`/deliveries/${encodeURIComponent(id)}/timeline`);
        const current = result?.delivery || selected;
        const index = deliveryState.deliveries.findIndex((item) => item.id === id);
        if (index >= 0) deliveryState.deliveries[index] = { ...deliveryState.deliveries[index], ...current };
        renderDeliveryDetail(current, Array.isArray(result?.events) ? result.events : [], result?.fulfillment || null, Array.isArray(result?.attempts) ? result.attempts : []);
    } catch (error) {
        closeModal(); showToast(error.message || 'Não foi possível abrir a entrega.', 'error');
    }
}

function renderDeliveryDetail(item, events = [], fulfillment = null, attempts = []) {
    const status = DELIVERY_STATUS[item.status] || { label: item.status, icon: '•', color: '#465651', bg: '#eef3f1' };
    const own = deliveryIsOwn(item);
    const canDispatch = canPerformAction('manageDeliveries');
    const canOverride = canPerformAction('overrideDelivery') && ['IN_TRANSIT', 'ARRIVED', 'DELIVERY_FAILED'].includes(item.status);
    const modal = document.getElementById('modal-content');
    modal.innerHTML = `<div class="modal-header"><div class="delivery-detail-head"><div><div class="delivery-detail-code">#${escapeHTML(item.display_code)}</div><div class="modal-header-subtitle">Atualizada ${deliveryRelativeAge(item.updated_at)} atrás · versão ${Number(item.version || 1)}</div></div><span class="delivery-status" style="--status-color:${status.color};--status-bg:${status.bg}">${status.icon} ${escapeHTML(status.label)}</span></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div>
        <div class="modal-body">${renderDeliveryExceptionBanner(item)}<div class="delivery-detail-grid"><div>
            <section class="delivery-panel"><h4>Destino e atendimento</h4><div class="delivery-info-grid"><div class="delivery-info"><span>Cliente</span><strong>${escapeHTML(item.customer_name || 'Não informado')}</strong></div><div class="delivery-info"><span>Taxa</span><strong>${formatCurrency(item.delivery_fee || 0)}</strong></div><div class="delivery-info"><span>Modalidade</span><strong>${own ? 'Entrega própria' : 'Entrega iFood'}</strong></div><div class="delivery-info" style="grid-column:1/-1"><span>Endereço autorizado</span><strong>${escapeHTML(item.formatted_address || 'Endereço não informado')}</strong></div>${!own || window.deliveryUsesIdentifiedFleet?.() ? `<div class="delivery-info"><span>Motoboy</span><strong>${escapeHTML(deliveryDriverName(item.assigned_driver_id))}</strong></div>` : ''}<div class="delivery-info"><span>Previsão</span><strong>${deliveryEta(item.eta_seconds)}</strong></div></div></section>
            <section class="delivery-panel" style="margin-top:12px"><h4>Jornada da entrega</h4>${renderDeliveryTimeline(item, events)}</section>
            ${renderDeliveryFulfillment(fulfillment, attempts)}
        </div><aside><section class="delivery-panel"><h4>Localização do destino</h4><div class="delivery-map-preview"><div class="delivery-map-pin"><span>⌂</span></div></div>${item.destination_lat != null && item.destination_lng != null ? `<a class="delivery-btn delivery-btn--neutral" style="display:flex;align-items:center;justify-content:center;margin-top:10px;text-decoration:none" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(item.destination_lat)}&mlon=${encodeURIComponent(item.destination_lng)}#map=16/${encodeURIComponent(item.destination_lat)}/${encodeURIComponent(item.destination_lng)}">Abrir no mapa ↗</a>` : '<p class="delivery-helper">Coordenadas ainda não disponíveis.</p>'}</section></aside></div>
        <div class="delivery-detail-actions">${renderDeliveryActions(item, canDispatch, canOverride)}</div></div>`;
}

function renderDeliveryFulfillment(fulfillment, attempts = []) {
    if (!fulfillment) return '';
    const external = fulfillment.mode === 'EXTERNAL';
    const trackingUrl = external && /^https?:\/\//i.test(String(fulfillment.tracking_url || '')) ? String(fulfillment.tracking_url) : '';
    const attemptRows = attempts.length ? attempts.map((attempt) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #edf1ef"><span>Tentativa ${Number(attempt.attempt_number)} · ${escapeHTML(attempt.status)}</span><span class="delivery-helper">${attempt.error_code ? escapeHTML(attempt.error_code) : attempt.finished_at ? 'finalizada' : 'agendada'}</span></div>`).join('') : '<p class="delivery-helper">Nenhuma tentativa registrada.</p>';
     return `<section class="delivery-panel" style="margin-top:12px"><h4>${external ? 'Entrega iFood' : 'Entrega própria'}</h4><div class="delivery-info-grid"><div class="delivery-info"><span>Status logístico</span><strong>${escapeHTML(fulfillment.status || '—')}</strong></div><div class="delivery-info"><span>Ciclo</span><strong>${external ? `${Number(fulfillment.cycle_number || 0)} · ${attempts.length}/5 tentativas` : 'Não aplicável'}</strong></div><div class="delivery-info"><span>Cotação</span><strong>${fulfillment.quoted_cost == null ? '—' : formatCurrency(fulfillment.quoted_cost)}</strong></div><div class="delivery-info"><span>Custo efetivo</span><strong>${fulfillment.actual_cost == null ? '—' : formatCurrency(fulfillment.actual_cost)}</strong></div>${trackingUrl ? `<div class="delivery-info" style="grid-column:1/-1"><span>Tracking do operador</span><a href="${escapeHTML(trackingUrl)}" target="_blank" rel="noopener noreferrer">Abrir link externo ↗</a></div>` : ''}</div>${external ? `<div style="margin-top:12px"><strong>Histórico de tentativas</strong>${attemptRows}</div>` : ''}</section>`;
}

function renderDeliveryTimeline(item, events = []) {
    if (events.length) {
        return `<div class="delivery-timeline">${events.map((event) => {
            const status = DELIVERY_STATUS[event.current_status] || DELIVERY_STATUS[item.status] || { label: 'Atualização', icon: '•' };
            const actor = event.actor?.name ? ` · ${event.actor.name}` : '';
            const operation = event.without_driver === true || event.operation_mode === 'WITHOUT_DRIVER' ? ' · sem motoboy' : '';
            const reason = event.reason ? ` — ${event.reason}` : (event.reason_code ? ` — ${deliveryReasonLabel(event.reason_code)}` : '');
            return `<div class="delivery-timeline-item delivery-timeline-item--done"><span class="delivery-timeline-dot"></span><div class="delivery-timeline-copy"><strong>${escapeHTML(status.icon)} ${escapeHTML(status.label)}${escapeHTML(actor)}${escapeHTML(operation)}${escapeHTML(reason)}</strong><time>${deliveryDateTime(event.occurred_at)}</time></div></div>`;
        }).join('')}</div>`;
    }
    const milestones = [
        ['Pedido recebido', item.created_at, true],
        ['Aceito pelo restaurante', item.accepted_at, ['ACCEPTED','PREPARING','READY_FOR_DISPATCH','ASSIGNED','PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED'].includes(item.status)],
        ['Pronto para despacho', item.ready_for_dispatch_at, ['READY_FOR_DISPATCH','ASSIGNED','PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED'].includes(item.status)],
        ['Coletado', item.picked_up_at, ['PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED'].includes(item.status)],
        ['Em rota', item.in_transit_at, ['IN_TRANSIT','ARRIVED','DELIVERED'].includes(item.status)],
        ['Chegou ao destino', item.arrived_at, ['ARRIVED','DELIVERED'].includes(item.status)],
        ['Entrega confirmada', item.delivered_at, item.status === 'DELIVERED'],
    ];
    return `<div class="delivery-timeline">${milestones.map(([label, timestamp, done]) => `<div class="delivery-timeline-item ${done ? 'delivery-timeline-item--done' : ''}"><span class="delivery-timeline-dot"></span><div class="delivery-timeline-copy"><strong>${escapeHTML(label)}</strong><time>${timestamp ? deliveryDateTime(timestamp) : (done ? 'Etapa registrada' : 'Pendente')}</time></div></div>`).join('')}</div>`;
}

function renderDeliveryExceptionBanner(item) {
    if (item.status === 'DELIVERY_FAILED') return '<div class="delivery-alert" role="status"><span>!</span><div><strong>Ocorrência aberta</strong><span>Escolha uma nova tentativa, o retorno ao restaurante ou o cancelamento. Toda decisão ficará na timeline.</span></div></div>';
    if (item.status === 'RETURNING') return '<div class="delivery-alert" role="status"><span>↩</span><div><strong>Pedido retornando ao restaurante</strong><span>Confirme a devolução somente quando o pedido estiver fisicamente de volta à operação.</span></div></div>';
    return '';
}

function deliveryReasonLabel(reasonCode) {
    return DELIVERY_RETURN_REASONS[reasonCode]
        || DELIVERY_REJECTION_REASONS[reasonCode]
        || DELIVERY_CANCELLATION_REASONS[reasonCode]
        || DELIVERY_OVERRIDE_REASONS[reasonCode]
        || reasonCode;
}

function renderDeliveryActions(item, canDispatch, canOverride) {
    if (!canDispatch) return '';
    const actions = [];
    const own = deliveryIsOwn(item);
    if (item.status === 'PENDING_RESTAURANT_ACCEPTANCE') {
        actions.push(`<button class="delivery-btn delivery-btn--primary" onclick="runDeliveryAccept('${item.id}')">✓ Aceitar entrega</button>`);
        actions.push(`<button class="delivery-btn delivery-btn--danger" onclick="openDeliveryReasonModal('reject','${item.id}')">Recusar</button>`);
    }
    const identifiedOwnFleet = own && window.deliveryUsesIdentifiedFleet?.();
    const hasAssignedDriver = Boolean(item.assigned_driver_id || item.assigned_driver_profile_id);
    if ((!own || identifiedOwnFleet) && ['READY_FOR_DISPATCH','ASSIGNED','DELIVERY_FAILED'].includes(item.status)) {
        const assignLabel = item.status === 'DELIVERY_FAILED' ? '↻ Nova tentativa' : (item.assigned_driver_id ? '↻ Reatribuir' : '↗ Atribuir entregador');
        actions.push(`<button class="delivery-btn delivery-btn--primary" onclick="openDeliveryAssign('${item.id}')">${assignLabel}</button>`);
    }
    if (own && item.status === 'READY_FOR_DISPATCH' && (!identifiedOwnFleet || !hasAssignedDriver)) {
        const actionLabel = identifiedOwnFleet && !hasAssignedDriver ? '🏪 Continuar sem motoboy' : '↗ Marcar como saiu';
        const action = identifiedOwnFleet && !hasAssignedDriver ? `openDeliveryNoDriverStart('${item.id}',${Number(item.version || 1)})` : `runDeliveryOwnOperation('${item.id}','start',${Number(item.version || 1)})`;
        actions.push(`<button class="delivery-btn delivery-btn--primary" onclick="${action}">${actionLabel}</button>`);
    }
    if (own && ['IN_TRANSIT','ARRIVED'].includes(item.status)) actions.push(`<button class="delivery-btn delivery-btn--primary" onclick="openDeliveryPinCompletion('${item.id}',${Number(item.version || 1)})">✓ Finalizar entrega</button>`);
    if (['IN_TRANSIT','ARRIVED','DELIVERY_FAILED'].includes(item.status)) actions.push(`<button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryReturn('${item.id}',false)">↩ Iniciar retorno</button>`);
    if (item.status === 'RETURNING') actions.push(`<button class="delivery-btn delivery-btn--primary" onclick="openDeliveryReturn('${item.id}',true)">✓ Confirmar devolução</button>`);
    if (canOverride && item.status === 'DELIVERY_FAILED' && !own) {
        actions.push(`<button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryFallback('${item.id}','restart-cycle')">↻ Reiniciar ciclo externo</button>`);
        actions.push(`<button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryFallback('${item.id}','convert-to-own')">🚲 Converter para própria</button>`);
    }
    if (!deliveryIsOwn(item) && !['DELIVERED','REJECTED','CANCELED','RETURNED'].includes(item.status)) {
        actions.push(`<button class="delivery-btn delivery-btn--neutral" onclick="issueDeliveryTracking('${item.id}')">🔗 Link do cliente</button>`);
    }
    if (['PENDING_RESTAURANT_ACCEPTANCE','ACCEPTED','PREPARING','READY_FOR_DISPATCH','ASSIGNED','DELIVERY_FAILED'].includes(item.status)) {
        actions.push(`<button class="delivery-btn delivery-btn--danger" onclick="openDeliveryReasonModal('cancel','${item.id}')">Cancelar</button>`);
    }
    if (canOverride) actions.push(`<button class="delivery-btn delivery-btn--danger" onclick="openDeliveryOverride('${item.id}')">Conclusão assistida</button>`);
    return actions.join('');
}

async function runDeliveryOwnOperation(id, operation, version, withoutDriver = false) {
    const label = operation === 'start' ? 'saída' : 'atualização';
    const successMessage = withoutDriver
        ? 'Saída registrada sem atribuir motoboy. A confirmação por código continua obrigatória.'
        : `Entrega própria marcada como ${label}.`;
    await runDeliveryCommand(id, `own/${operation}`, { expected_version: version, ...(withoutDriver ? { without_driver: true } : {}) }, successMessage);
}

function openDeliveryNoDriverStart(id, version) {
    const item = deliveryState.deliveries.find((delivery) => delivery.id === id);
    if (!item) return;
    openModal(`<div class="modal-header"><div><h3>Continuar sem motoboy?</h3><div class="modal-header-subtitle">Entrega #${escapeHTML(item.display_code || id)} · operação própria</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0"><span>🏪</span><div><strong>O restaurante assumirá esta saída</strong><span>Use quando a equipe fará a entrega ou quando o cliente veio retirar no local. Nenhum motoboy será atribuído e a confirmação por código continua obrigatória.</span></div></div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" onclick="runDeliveryOwnOperation('${id}','start',${Number(version)},true)">Continuar sem motoboy</button></div>`);
}

function openDeliveryPinCompletion(id, version) {
    const item = deliveryState.deliveries.find((row) => row.id === id);
    openModal(`<div class="modal-header"><div><h3>Finalizar entrega</h3><div class="modal-header-subtitle">Entrega #${escapeHTML(item?.display_code || id)} · confirmação protegida</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0 0 16px"><span>🔐</span><div><strong>Peça o código ao cliente</strong><span>Finalize somente depois que o pedido estiver nas mãos do cliente.</span></div></div><div class="form-group"><label for="delivery-completion-pin">Código de entrega</label><input class="delivery-pin-input" id="delivery-completion-pin" maxlength="6" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="A3F9" oninput="this.value=this.value.toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,6)" onkeydown="if(event.key==='Enter'){event.preventDefault();submitDeliveryPinCompletion('${id}',${Number(version)})}"><small class="delivery-helper">Use os 4 caracteres enviados ao cliente. Entregas antigas podem usar 6 números.</small></div><div id="delivery-completion-error" class="delivery-form-error" hidden></div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" onclick="submitDeliveryPinCompletion('${id}',${Number(version)})">Confirmar entrega</button></div>`);
    window.setTimeout(() => document.getElementById('delivery-completion-pin')?.focus(), 0);
}

async function submitDeliveryPinCompletion(id, version) {
    const pin = String(document.getElementById('delivery-completion-pin')?.value || '').trim().toUpperCase();
    const error = document.getElementById('delivery-completion-error');
    if (!/^(?:[0-9A-F]{4}|\d{6})$/.test(pin)) {
        if (error) { error.hidden = false; error.textContent = 'Informe o código de 4 caracteres enviado ao cliente.'; }
        return;
    }
    await runDeliveryCommand(id, 'own/complete', { expected_version: Number(version), pin }, 'Entrega finalizada com o código do cliente.');
}

function openDeliveryFallback(id, operation) {
    const converting = operation === 'convert-to-own';
    openModal(`<div class="modal-header"><div><h3>${converting ? 'Converter para entrega própria' : 'Reiniciar ciclo externo'}</h3><div class="modal-header-subtitle">Decisão restrita e registrada na auditoria.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0 0 16px"><span>!</span><div><strong>${converting ? 'O preço cobrado do cliente não será alterado.' : 'Um novo ciclo começa com as tentativas configuradas.'}</strong><span>${converting ? 'A operação precisa ter capacidade própria disponível.' : 'A contratação permanece no mesmo operador.'}</span></div></div><div class="form-group"><label for="delivery-fallback-reason">Motivo</label><textarea id="delivery-fallback-reason" maxlength="500" placeholder="Informe o contexto operacional"></textarea></div><label class="delivery-switch"><input id="delivery-fallback-confirm" type="checkbox"><span class="delivery-switch-track"></span><span class="delivery-switch-label">Confirmo a decisão para esta entrega</span></label></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" onclick="submitDeliveryFallback('${id}','${operation}')">Confirmar</button></div>`);
}

async function submitDeliveryFallback(id, operation) {
    const reason = document.getElementById('delivery-fallback-reason')?.value.trim();
    if (!reason || !document.getElementById('delivery-fallback-confirm')?.checked) return showToast('Informe o motivo e confirme a decisão.', 'error');
    await runDeliveryCommand(id, operation, { reason }, operation === 'convert-to-own' ? 'Entrega convertida para própria.' : 'Novo ciclo externo iniciado.', '/delivery/fulfillments');
}

function deliveryDateTime(value) {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function runDeliveryAccept(id) {
    await runDeliveryCommand(id, 'accept', {}, 'Entrega aceita. A cozinha já pode avançar.');
}

function openDeliveryReasonModal(type, id) {
    const rejecting = type === 'reject';
    const reasons = rejecting ? DELIVERY_REJECTION_REASONS : DELIVERY_CANCELLATION_REASONS;
    openModal(`<div class="modal-header"><div><h3>${rejecting ? 'Recusar entrega' : 'Cancelar entrega'}</h3><div class="modal-header-subtitle">Essa decisão ficará registrada na operação.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="form-group"><label for="delivery-reason-code">Motivo</label><select id="delivery-reason-code"><option value="">Selecione um motivo</option>${Object.entries(reasons).map(([value, label]) => `<option value="${value}">${escapeHTML(label)}</option>`).join('')}</select></div><div class="form-group"><label for="delivery-reason-notes">Observação (opcional)</label><textarea id="delivery-reason-notes" maxlength="500" placeholder="Contexto útil para a equipe"></textarea></div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Voltar</button><button class="delivery-btn delivery-btn--danger" onclick="submitDeliveryReason('${type}','${id}')">Confirmar ${rejecting ? 'recusa' : 'cancelamento'}</button></div>`);
}

async function submitDeliveryReason(type, id) {
    const reasonCode = document.getElementById('delivery-reason-code')?.value;
    if (!reasonCode) return showToast('Selecione um motivo para continuar.', 'error');
    const reason = document.getElementById('delivery-reason-notes')?.value.trim() || undefined;
    await runDeliveryCommand(id, type, { reason_code: reasonCode, ...(reason ? { reason } : {}) }, type === 'reject' ? 'Entrega recusada.' : 'Entrega cancelada.');
}

function openDeliveryAssign(id) {
    const item = deliveryState.deliveries.find((delivery) => delivery.id === id);
    if (!item) return;
    if (!deliveryState.drivers.length) {
        openModal(`<div class="modal-header"><h3>Atribuir entregador</h3><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">${deliveryStateView('🛵','Nenhum entregador disponível','Cadastre um usuário com perfil Entregador em Equipe & Acessos.')}</div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Fechar</button></div>`);
        return;
    }
    const retry = item.status === 'DELIVERY_FAILED';
    const requiresReason = retry || !!item.assigned_driver_id;
    const title = retry ? 'Planejar nova tentativa' : (item.assigned_driver_id ? 'Reatribuir entrega' : 'Escolher entregador');
    const reasonLabel = retry ? 'Plano / motivo da nova tentativa' : 'Motivo da reatribuição';
    openModal(`<div class="modal-header"><div><h3>${title}</h3><div class="modal-header-subtitle">Entrega #${escapeHTML(item.display_code)}${retry ? ' · a ocorrência continuará registrada' : ''}</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="form-group"><label for="delivery-driver-choice">Motoboy elegível</label><select id="delivery-driver-choice"><option value="">Selecione</option>${deliveryState.drivers.map((driver) => { const load = Number(driver.active_deliveries || 0); const limit = Math.max(1, Number(driver.delivery_limit || 1)); const full = load >= limit; return `<option value="${escapeHTML(driver.id)}" ${driver.id === item.assigned_driver_id ? 'selected' : ''} ${full && driver.id !== item.assigned_driver_id ? 'disabled' : ''}>${escapeHTML(driver.name || 'Motoboy')} · ${load}/${limit} entrega(s)${full ? ' · limite atingido' : ''}</option>`; }).join('')}</select><div class="delivery-helper">A carga atual e o limite são conferidos novamente pelo backend antes de atribuir.</div></div>${requiresReason ? `<div class="form-group"><label for="delivery-assign-reason">${reasonLabel}</label><textarea id="delivery-assign-reason" maxlength="500" placeholder="Obrigatório para manter o contexto operacional"></textarea></div>` : ''}</div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" onclick="submitDeliveryAssign('${id}',${Number(item.version || 1)},${requiresReason ? 'true' : 'false'})">${retry ? 'Iniciar nova tentativa' : 'Confirmar atribuição'}</button></div>`);
}

async function submitDeliveryAssign(id, version, isReassign) {
    const item = deliveryState.deliveries.find((delivery) => delivery.id === id);
    const driverId = document.getElementById('delivery-driver-choice')?.value;
    const reason = document.getElementById('delivery-assign-reason')?.value.trim();
    if (!driverId) return showToast('Escolha um entregador.', 'error');
    if (isReassign && !reason) return showToast('Informe o motivo da reatribuição.', 'error');
    if (item && deliveryIsOwn(item) && window.deliveryUsesIdentifiedFleet?.() && window.fleetFrontendUsesApi?.() === false && window.assignFleetDeliveryPreview) {
        const updated = await window.assignFleetDeliveryPreview(item, driverId, reason);
        deliveryState.deliveries = deliveryState.deliveries.map((delivery) => delivery.id === id ? updated : delivery);
        closeModal(); renderDeliveryPage(); showToast('Motoboy atribuído na prévia.', 'success');
        return;
    }
    await runDeliveryCommand(id, 'assign', { driver_id: driverId, expected_version: version, ...(reason ? { reason } : {}) }, 'Entregador atribuído.');
}

function openDeliveryReturn(id, complete = false) {
    const item = deliveryState.deliveries.find((delivery) => delivery.id === id);
    if (!item) return;
    if (complete) {
        openModal(`<div class="modal-header"><div><h3>Confirmar devolução</h3><div class="modal-header-subtitle">Entrega #${escapeHTML(item.display_code)} · encerramento auditado</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0"><span>↩</span><div><strong>Esta ação encerra a entrega como retornada</strong><span>Ela não será contabilizada como entregue ao cliente.</span></div></div><div class="form-group"><label for="delivery-return-notes">Observação de recebimento (opcional)</label><textarea id="delivery-return-notes" maxlength="500" placeholder="Ex.: pedido recebido pela gerente de turno"></textarea></div><label class="delivery-switch"><input id="delivery-return-confirm" type="checkbox"><span class="delivery-switch-track"></span><span class="delivery-switch-label">Confirmo que o pedido voltou ao restaurante</span></label></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Voltar</button><button class="delivery-btn delivery-btn--primary" onclick="submitDeliveryReturn('${id}',${Number(item.version || 1)},true)">Confirmar devolução</button></div>`);
        return;
    }
    openModal(`<div class="modal-header"><div><h3>Iniciar retorno</h3><div class="modal-header-subtitle">Entrega #${escapeHTML(item.display_code)} · o cliente continuará vendo o status atualizado</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="form-group"><label for="delivery-return-reason">Motivo do retorno</label><select id="delivery-return-reason"><option value="">Selecione um motivo</option>${Object.entries(DELIVERY_RETURN_REASONS).map(([value, label]) => `<option value="${value}">${escapeHTML(label)}</option>`).join('')}</select></div><div class="form-group"><label for="delivery-return-notes">Orientação / observação (opcional)</label><textarea id="delivery-return-notes" maxlength="500" placeholder="Contexto para o entregador e para a operação"></textarea></div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Voltar</button><button class="delivery-btn delivery-btn--danger" onclick="submitDeliveryReturn('${id}',${Number(item.version || 1)},false)">Iniciar retorno</button></div>`);
}

async function submitDeliveryReturn(id, version, complete) {
    const notes = document.getElementById('delivery-return-notes')?.value.trim();
    if (complete) {
        if (!document.getElementById('delivery-return-confirm')?.checked) return showToast('Confirme que o pedido voltou ao restaurante.', 'error');
        await runDeliveryCommand(id, 'complete-return', { expected_version: version, ...(notes ? { notes } : {}) }, 'Devolução confirmada. Entrega encerrada como retornada.');
        return;
    }
    const reasonCode = document.getElementById('delivery-return-reason')?.value;
    if (!reasonCode) return showToast('Selecione o motivo do retorno.', 'error');
    await runDeliveryCommand(id, 'start-return', { expected_version: version, reason_code: reasonCode, ...(notes ? { notes } : {}) }, 'Retorno iniciado e cliente atualizado.');
}

async function issueDeliveryTracking(id) {
    if (deliveryState.busy.has(id)) return;
    deliveryState.busy.add(id);
    try {
        const result = await api.command(`/deliveries/${encodeURIComponent(id)}/tracking-link`, { ttl_hours: 24 });
        const url = result?.tracking_url || '';
        try { await navigator.clipboard.writeText(url); showToast('Link seguro copiado. Ele expira em 24 horas.', 'success'); }
        catch (_) {
            await showCopyDialog({
                title: 'Copiar link de acompanhamento',
                message: 'O navegador não permitiu a cópia automática.',
                detail: 'O link é seguro e expira em 24 horas.',
                inputLabel: 'Link de acompanhamento',
                value: url,
                successMessage: 'Link seguro copiado.',
            });
        }
    } catch (error) { showToast(error.message || 'Não foi possível gerar o link.', 'error'); }
    finally { deliveryState.busy.delete(id); }
}

function openDeliveryOverride(id) {
    openModal(`<div class="modal-header"><div><h3>Conclusão assistida</h3><div class="modal-header-subtitle">Use somente quando a confirmação normal por código não for possível.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0 0 16px"><span>!</span><div><strong>Ação sensível e auditada</strong><span>Ao confirmar, a entrega será concluída sem solicitar ou exibir o código do cliente neste painel.</span></div></div><div class="form-group"><label for="delivery-override-reason">Motivo da exceção</label><select id="delivery-override-reason"><option value="">Selecione</option>${Object.entries(DELIVERY_OVERRIDE_REASONS).map(([value,label]) => `<option value="${value}">${escapeHTML(label)}</option>`).join('')}</select></div><div class="form-group"><label for="delivery-override-notes">Evidência / relato operacional</label><textarea id="delivery-override-notes" maxlength="1000" placeholder="Descreva como a identidade e o recebimento foram confirmados"></textarea></div><label class="delivery-switch"><input id="delivery-override-confirm" type="checkbox"><span class="delivery-switch-track"></span><span class="delivery-switch-label">Confirmo que validei o recebimento com o cliente</span></label></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Voltar</button><button class="delivery-btn delivery-btn--danger" onclick="submitDeliveryOverride('${id}')">Concluir com auditoria</button></div>`);
}

async function submitDeliveryOverride(id) {
    const reasonCode = document.getElementById('delivery-override-reason')?.value;
    const notes = document.getElementById('delivery-override-notes')?.value.trim();
    const confirmed = document.getElementById('delivery-override-confirm')?.checked;
    if (!reasonCode || !notes || !confirmed) return showToast('Preencha o motivo, o relato e confirme a validação.', 'error');
    await runDeliveryCommand(id, 'override-delivery', { reason_code: reasonCode, notes }, 'Entrega concluída com auditoria.');
}

async function runDeliveryCommand(id, command, body, successMessage, basePath = '/deliveries') {
    if (deliveryState.busy.has(id)) return;
    deliveryState.busy.add(id);
    const buttons = document.querySelectorAll('#modal-content button');
    buttons.forEach((button) => { button.disabled = true; });
    try {
        await api.command(`${basePath}/${encodeURIComponent(id)}/${command}`, body);
        closeModal(); showToast(successMessage, 'success'); await refreshDeliveryPage();
    } catch (error) {
        if (/alterada|conflito|conflict/i.test(error.message || '')) await refreshDeliveryPage();
        showToast(error.message || 'A ação não pôde ser concluída.', 'error');
        buttons.forEach((button) => { button.disabled = false; });
    } finally { deliveryState.busy.delete(id); }
}

function openDeliverySettings() {
    const settings = deliveryState.settings?.settings;
    if (!settings) return showToast('Configurações ainda não disponíveis.', 'error');
    openModal(renderDeliverySettingsModal(settings, deliveryState.capacity), { size: 'lg' });
    // A habilitação do módulo é uma decisão comercial do Super Admin. O tenant
    // Admin continua podendo ajustar a operação, mas nunca liga/desliga o módulo.
    document.getElementById('delivery-setting-enabled')?.closest('.delivery-switch')?.remove();
    const capacityInput = document.getElementById('delivery-setting-capacity');
    if (capacityInput && !document.getElementById('delivery-setting-preparation-minutes')) {
        capacityInput.closest('.form-group')?.insertAdjacentHTML('afterend', `<div class="form-group"><label for="delivery-setting-preparation-minutes">Previsão automática de preparo (minutos) <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-preparation-minutes" type="number" min="5" max="240" value="${Number(settings.auto_accept?.preparation_minutes || 30)}" required aria-required="true"><small class="delivery-helper">Usada quando o aceite automático mover o pedido para “Em preparo”.</small></div>`);
    }
    const section = document.querySelector('#delivery-settings-form .delivery-form-section');
    const fleetConfig = window.getFleetFrontendConfig?.() || { mode: 'CAPACITY_ONLY' };
    if (section) section.insertAdjacentHTML('beforeend', `<div class="delivery-fleet-mode"><div><strong>Organização da frota própria</strong><span>Escolha como as entregas próprias serão distribuídas. A alteração vale apenas para novas atribuições.</span></div><div class="delivery-fleet-options" role="radiogroup" aria-label="Modo da frota"><label><input type="radio" name="delivery-fleet-mode" value="CAPACITY_ONLY" ${fleetConfig.mode !== 'IDENTIFIED_DRIVERS' ? 'checked' : ''}><span><b>Capacidade simples</b><small>Controle somente pela quantidade disponível.</small></span></label><label><input type="radio" name="delivery-fleet-mode" value="IDENTIFIED_DRIVERS" ${fleetConfig.mode === 'IDENTIFIED_DRIVERS' ? 'checked' : ''}><span><b>Motoboys cadastrados</b><small>Cadastro, acesso seguro, fila e histórico individual.</small></span></label></div><div class="delivery-fleet-prerequisites"><span>✓ Delivery ativo</span><span>✓ Permissão de administrador</span><span>○ Cadastre ao menos um motoboy antes de atribuir</span></div><small>Modo atual desde ${fleetConfig.updated_at ? escapeHTML(new Date(fleetConfig.updated_at).toLocaleString('pt-BR')) : 'a configuração inicial'}.</small></div>`);
    window.requestAnimationFrame(toggleDeliveryFeeFields);
}

function renderDeliverySettingsModal(settings, capacity = null) {
    const auto = settings.auto_accept || {};
    const windows = Array.isArray(auto.windows) ? auto.windows : [];
    const fees = settings.fees || { mode: 'NONE', fixed_fee: 0, bands: [] };
    const ownCapacity = settings.own_capacity || {};
    const external = settings.external || {};
    const providerOrder = Array.isArray(external.provider_order) && external.provider_order.length ? external.provider_order : ['IFOOD'];
    const capacityView = capacity?.data || capacity || {};
    const declaredCapacity = Number(capacityView.declared_capacity ?? ownCapacity.available_couriers ?? 0);
    const reservedCapacity = Number(capacityView.reserved || 0);
    const capacityBelowReservations = declaredCapacity < reservedCapacity;
    const settingsVersion = deliveryState.settings?.settings_version || deliveryState.settings?.updated_at || null;
    const settingsStatus = deliverySettingsStatus(settings);
    const originAddress = settings.origin_address || {};
    return `<div class="modal-header"><div><div class="delivery-settings-title"><h3>Configuração da operação Delivery</h3><span class="delivery-config-status delivery-config-status--${settingsStatus.tone}"><span class="delivery-config-status-dot" aria-hidden="true"></span>${escapeHTML(settingsStatus.label)}</span></div><div class="modal-header-subtitle">${escapeHTML(settingsStatus.detail)}${settingsVersion ? ` · Última alteração: ${escapeHTML(new Date(settingsVersion).toLocaleString('pt-BR'))}` : ''}</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form" id="delivery-settings-form">
        <div class="delivery-required-note" role="note"><strong>Campos obrigatórios</strong><span>Preencha os campos marcados com <b>*</b>. A localização do restaurante é usada para calcular a área de atendimento.</span></div>
         <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Módulo e capacidade</h4><p>Fora da agenda ou da capacidade, o pedido aguarda aceite manual.</p></div><label class="delivery-switch"><input id="delivery-setting-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Delivery ativo</span></label></div><div class="delivery-form-grid"><div class="form-group"><label for="delivery-setting-whatsapp-order-enabled">Disponível no WhatsApp</label><label class="delivery-switch"><input id="delivery-setting-whatsapp-order-enabled" type="checkbox" ${settings.whatsapp_order_enabled === true ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Adicionar “Fazer pedido para entrega” ao menu</span></label><small class="delivery-helper">Quando ativo, mantém as opções presenciais e adiciona a nova opção no primeiro menu.</small></div><div class="form-group"><label for="delivery-setting-whatsapp-order-mode">Modo de atendimento no WhatsApp <span class="delivery-required" aria-hidden="true">*</span></label><select id="delivery-setting-whatsapp-order-mode" required aria-required="true"><option value="HYBRID" ${(settings.whatsapp_order_mode || 'HYBRID') === 'HYBRID' ? 'selected' : ''}>Presencial e entrega</option><option value="DELIVERY_ONLY" ${settings.whatsapp_order_mode === 'DELIVERY_ONLY' ? 'selected' : ''}>Entrega como opção principal</option></select></div><div class="form-group"><label for="delivery-setting-timezone">Fuso horário <span class="delivery-required" aria-hidden="true">*</span></label><select id="delivery-setting-timezone" required aria-required="true"><option value="America/Sao_Paulo" ${settings.timezone === 'America/Sao_Paulo' ? 'selected' : ''}>Brasília (São Paulo)</option><option value="America/Manaus" ${settings.timezone === 'America/Manaus' ? 'selected' : ''}>Manaus</option><option value="America/Belem" ${settings.timezone === 'America/Belem' ? 'selected' : ''}>Belém</option><option value="America/Fortaleza" ${settings.timezone === 'America/Fortaleza' ? 'selected' : ''}>Fortaleza</option></select></div><div class="form-group"><label for="delivery-setting-capacity">Máximo de entregas ativas <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-capacity" type="number" min="1" max="500" value="${Number(auto.max_active_deliveries || 8)}" required aria-required="true"></div><div class="form-group"><label for="delivery-setting-mode">Modalidade padrão <span class="delivery-required" aria-hidden="true">*</span></label><select id="delivery-setting-mode" required aria-required="true"><option value="OWN" ${settings.default_fulfillment_mode === 'OWN' ? 'selected' : ''}>Entrega própria</option><option value="EXTERNAL" ${settings.default_fulfillment_mode === 'EXTERNAL' ? 'selected' : ''}>Entrega iFood</option></select></div><div class="form-group"><label for="delivery-setting-own-capacity">Entregadores próprios disponíveis <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-own-capacity" type="number" min="0" max="500" value="${Number(ownCapacity.available_couriers || 0)}" required aria-required="true"><small class="delivery-helper">Somente quantidade; não há cadastro individual no V2.</small></div></div><div class="delivery-form-section-head" style="margin:4px 0 0"><label class="delivery-switch"><input id="delivery-setting-auto" type="checkbox" ${auto.enabled ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Aceite automático</span></label><label class="delivery-switch"><input id="delivery-setting-payment" type="checkbox" ${auto.require_confirmed_payment ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Exigir pagamento confirmado</span></label></div></section>
        <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Operador externo</h4><p>O primeiro operador disponível nesta fase é o iFood. As credenciais são configuradas separadamente.</p></div><button class="delivery-btn delivery-btn--neutral" type="button" onclick="openDeliveryProviderSettings()">Gerenciar credenciais</button></div><div class="delivery-form-grid"><div class="form-group"><label for="delivery-setting-provider-order">Ordem dos operadores <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-provider-order" value="${escapeHTML(providerOrder.join(', '))}" placeholder="IFOOD" required aria-required="true"><small class="delivery-helper">Informe os códigos separados por vírgula.</small></div><div class="form-group"><label for="delivery-setting-max-attempts">Tentativas por ciclo <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-max-attempts" type="number" min="1" max="5" value="${Number(external.max_attempts || 5)}" required aria-required="true"></div><div class="form-group"><label for="delivery-setting-attempt-window">Janela do ciclo (minutos) <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-attempt-window" type="number" min="1" max="60" value="${Number(external.attempt_window_minutes || 15)}" required aria-required="true"></div></div></section>
        <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Agenda de aceite automático</h4><p>Janelas podem atravessar a meia-noite. Dias sem janela sempre pedem aceite manual.</p></div><button class="delivery-btn delivery-btn--neutral" type="button" onclick="addDeliveryWindow()">+ Janela</button></div><div id="delivery-windows">${windows.map((windowItem) => renderDeliveryWindow(windowItem)).join('')}</div></section>
        <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Disponibilidade própria</h4><p>A reserva é automática durante o checkout e liberada ao entregar, cancelar ou expirar.</p></div><button class="delivery-btn delivery-btn--neutral" type="button" onclick="openDeliveryCapacityReservations()">Ver reservas</button></div>${capacityBelowReservations ? '<div class="delivery-alert" role="alert" style="margin:0 0 12px"><span>!</span><div><strong>Capacidade abaixo das reservas atuais</strong><span>Novos checkouts próprios ficarão bloqueados até liberar reservas ou aumentar a capacidade.</span></div></div>' : ''}<div class="delivery-kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0"><div class="delivery-kpi"><span>Declarada</span><strong>${declaredCapacity}</strong></div><div class="delivery-kpi"><span>Reservada</span><strong>${reservedCapacity}</strong></div><div class="delivery-kpi"><span>Disponível</span><strong>${Number(capacityView.available ?? Math.max(0, declaredCapacity - reservedCapacity))}</strong></div></div></section>
        <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Origem e área de atendimento</h4><p>As coordenadas calculam a distância, mas o endereço confirmado garante que o ponto é realmente o restaurante.</p></div><div class="delivery-origin-actions"><button class="delivery-btn delivery-btn--neutral" type="button" onclick="useDeliveryCurrentLocation()">⌖ Usar minha localização</button><button class="delivery-btn delivery-btn--neutral" type="button" onclick="reverseGeocodeDeliveryOrigin()">⌕ Buscar endereço</button></div></div><div class="delivery-form-grid delivery-form-grid--3"><div class="form-group"><label for="delivery-setting-lat">Latitude <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-lat" type="number" step="0.000001" min="-90" max="90" value="${settings.origin?.lat ?? ''}" placeholder="-23.550520" required aria-required="true" onchange="scheduleDeliveryOriginReverseGeocode()"></div><div class="form-group"><label for="delivery-setting-lng">Longitude <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-lng" type="number" step="0.000001" min="-180" max="180" value="${settings.origin?.lng ?? ''}" placeholder="-46.633308" required aria-required="true" onchange="scheduleDeliveryOriginReverseGeocode()"></div><div class="form-group"><label for="delivery-setting-radius">Raio (km) <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-radius" type="number" min="0.1" max="500" step="0.1" value="${Number(settings.service_area?.radius_km || 8)}" required aria-required="true"></div></div><div class="delivery-origin-address-grid"><div class="form-group"><label for="delivery-setting-origin-postal">CEP <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-postal" inputmode="numeric" maxlength="9" value="${escapeHTML(originAddress.postal_code || '')}" placeholder="01311-000" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group delivery-origin-street"><label for="delivery-setting-origin-street">Rua / avenida <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-street" maxlength="255" value="${escapeHTML(originAddress.street || '')}" placeholder="Rua Augusta" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group"><label for="delivery-setting-origin-number">Número <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-number" maxlength="30" value="${escapeHTML(originAddress.address_number || '')}" placeholder="120" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group"><label for="delivery-setting-origin-complement">Complemento</label><input id="delivery-setting-origin-complement" maxlength="255" value="${escapeHTML(originAddress.address_complement || '')}" placeholder="Loja, sala…" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group"><label for="delivery-setting-origin-neighborhood">Bairro <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-neighborhood" maxlength="255" value="${escapeHTML(originAddress.neighborhood || '')}" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group"><label for="delivery-setting-origin-city">Cidade <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-city" maxlength="255" value="${escapeHTML(originAddress.city || '')}" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div><div class="form-group"><label for="delivery-setting-origin-state">UF <span class="delivery-required" aria-hidden="true">*</span></label><input id="delivery-setting-origin-state" maxlength="2" value="${escapeHTML(originAddress.state || '')}" placeholder="SP" required aria-required="true" oninput="markDeliveryOriginAddressChanged()"></div></div><div class="delivery-location-status" id="delivery-location-status" role="status">${Number.isFinite(Number(settings.origin?.lat)) && Number.isFinite(Number(settings.origin?.lng)) ? (originAddress.street ? 'Endereço carregado. Confira especialmente o número do restaurante.' : 'Coordenadas preenchidas. Busque o endereço e confirme o número.') : 'Informe as coordenadas ou use o botão para obter a localização atual.'}</div><div class="delivery-origin-confirm"><label class="delivery-switch"><input id="delivery-origin-address-confirmed" type="checkbox" ${originAddress.confirmed ? 'checked' : ''} onchange="updateDeliveryOriginConfirmation()" required><span class="delivery-switch-track"></span><span class="delivery-switch-label">Confirmo que o endereço e o número correspondem ao restaurante <span class="delivery-required" aria-hidden="true">*</span></span></label><small id="delivery-origin-address-meta" class="delivery-helper">${originAddress.geocode_quality ? `Origem localizada por ${escapeHTML(originAddress.geocode_provider || 'provedor')} (${escapeHTML(originAddress.geocode_quality)}).` : 'Busque o endereço pelas coordenadas e revise os dados antes de confirmar.'}</small></div></section>
        <section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Taxa de entrega</h4><p>Configure taxa grátis, fixa, por quilômetro, faixas ou modelo híbrido.</p></div></div><div class="delivery-form-grid"><div class="form-group"><label for="delivery-setting-fee-mode">Modelo</label><select id="delivery-setting-fee-mode" onchange="toggleDeliveryFeeFields()"><option value="NONE" ${fees.mode === 'NONE' ? 'selected' : ''}>Sem taxa</option><option value="FIXED" ${fees.mode === 'FIXED' ? 'selected' : ''}>Taxa fixa</option><option value="DISTANCE_BANDS" ${fees.mode === 'DISTANCE_BANDS' ? 'selected' : ''}>Faixas de distância</option><option value="PER_KM" ${fees.mode === 'PER_KM' ? 'selected' : ''}>Por quilômetro</option><option value="HYBRID" ${fees.mode === 'HYBRID' ? 'selected' : ''}>Híbrida (km + faixas)</option></select></div><div class="form-group" id="delivery-fixed-fee-wrap"><label for="delivery-setting-fixed-fee">Taxa base (R$)</label><input id="delivery-setting-fixed-fee" type="number" min="0" max="10000" step="0.01" value="${Number(fees.fixed_fee || 0)}"></div><div class="form-group" id="delivery-advanced-fee-wrap"><label for="delivery-setting-included-km">Km incluídos</label><input id="delivery-setting-included-km" type="number" min="0" max="500" step="0.1" value="${Number(fees.included_km || 0)}"></div><div class="form-group" id="delivery-per-km-wrap"><label for="delivery-setting-price-per-km">Preço por km (R$)</label><input id="delivery-setting-price-per-km" type="number" min="0" max="10000" step="0.01" value="${Number(fees.price_per_km || 0)}"></div><div class="form-group" id="delivery-minimum-fee-wrap"><label for="delivery-setting-minimum-fee">Taxa mínima (R$)</label><input id="delivery-setting-minimum-fee" type="number" min="0" max="10000" step="0.01" value="${Number(fees.minimum_fee || 0)}"></div><div class="form-group" id="delivery-rounding-wrap"><label for="delivery-setting-rounding">Arredondamento</label><select id="delivery-setting-rounding"><option value="NONE" ${fees.rounding_mode === 'NONE' ? 'selected' : ''}>Exato</option><option value="CEIL_0_5_KM" ${fees.rounding_mode === 'CEIL_0_5_KM' ? 'selected' : ''}>A cada 0,5 km</option><option value="CEIL_1_KM" ${fees.rounding_mode === 'CEIL_1_KM' ? 'selected' : ''}>A cada 1 km</option></select></div></div><div id="delivery-fee-bands">${(fees.bands || []).map(renderDeliveryBand).join('')}</div><button id="delivery-add-band" class="delivery-btn delivery-btn--neutral" type="button" onclick="addDeliveryBand()">+ Faixa</button><div style="display:flex;gap:8px;align-items:end;margin-top:14px"><div class="form-group" style="margin:0;flex:1"><label for="delivery-quote-distance">Simular distância (km)</label><input id="delivery-quote-distance" type="number" min="0" step="0.1" placeholder="4.5"></div><button class="delivery-btn delivery-btn--neutral" type="button" onclick="testDeliveryQuote()">Testar taxa</button></div><div id="delivery-quote-result" class="delivery-helper" aria-live="polite"></div></section>
    </div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" id="delivery-save-settings" onclick="saveDeliverySettings()">Salvar configuração</button></div>`;
}

function renderDeliveryWindow(item = { days: [], start: '18:00', end: '23:00' }) {
    const days = [['MON','Seg'],['TUE','Ter'],['WED','Qua'],['THU','Qui'],['FRI','Sex'],['SAT','Sáb'],['SUN','Dom']];
    return `<div class="delivery-window"><div class="delivery-days">${days.map(([value,label]) => `<label class="delivery-day"><input type="checkbox" value="${value}" ${(item.days || []).includes(value) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><div class="form-group" style="margin:0"><label>Início</label><input class="delivery-window-start" type="time" value="${escapeHTML(item.start || '18:00')}"></div><div class="form-group" style="margin:0"><label>Fim</label><input class="delivery-window-end" type="time" value="${escapeHTML(item.end || '23:00')}"></div><button type="button" class="delivery-remove" onclick="this.closest('.delivery-window').remove()" aria-label="Remover janela">×</button></div>`;
}

function renderDeliveryBand(item = { up_to_km: '', fee: '' }) {
    return `<div class="delivery-band"><div class="form-group" style="margin:0"><label>Até (km)</label><input class="delivery-band-km" type="number" min="0.01" max="500" step="0.1" value="${item.up_to_km ?? ''}"></div><div class="form-group" style="margin:0"><label>Taxa (R$)</label><input class="delivery-band-fee" type="number" min="0" max="10000" step="0.01" value="${item.fee ?? ''}"></div><button type="button" class="delivery-remove" onclick="this.closest('.delivery-band').remove()" aria-label="Remover faixa">×</button></div>`;
}

function addDeliveryWindow() { document.getElementById('delivery-windows')?.insertAdjacentHTML('beforeend', renderDeliveryWindow()); }
function addDeliveryBand() { document.getElementById('delivery-fee-bands')?.insertAdjacentHTML('beforeend', renderDeliveryBand()); }

function toggleDeliveryFeeFields() {
    const mode = document.getElementById('delivery-setting-fee-mode')?.value;
    const fixed = document.getElementById('delivery-fixed-fee-wrap');
    const bands = document.getElementById('delivery-fee-bands');
    const add = document.getElementById('delivery-add-band');
    const advanced = ['PER_KM', 'HYBRID'].includes(mode);
    if (fixed) fixed.style.display = ['FIXED', 'PER_KM', 'HYBRID'].includes(mode) ? '' : 'none';
    ['delivery-advanced-fee-wrap', 'delivery-per-km-wrap', 'delivery-minimum-fee-wrap', 'delivery-rounding-wrap'].forEach((id) => { const field = document.getElementById(id); if (field) field.style.display = advanced ? '' : 'none'; });
    if (bands) bands.style.display = ['DISTANCE_BANDS', 'HYBRID'].includes(mode) ? '' : 'none';
    if (add) add.style.display = ['DISTANCE_BANDS', 'HYBRID'].includes(mode) ? '' : 'none';
}

function useDeliveryCurrentLocation() {
    const button = document.querySelector('#delivery-settings-form button[onclick="useDeliveryCurrentLocation()"]');
    const status = document.getElementById('delivery-location-status');
    if (!navigator.geolocation) {
        if (status) status.textContent = 'Este navegador não oferece localização automática. Informe latitude e longitude manualmente.';
        return showToast('Localização automática indisponível neste navegador.', 'error');
    }
    if (button) {
        button.disabled = true;
        button.dataset.previousLabel = button.textContent;
        button.textContent = '⌖ Obtendo localização…';
    }
    if (status) status.textContent = 'Aguardando a permissão de localização do navegador…';
    navigator.geolocation.getCurrentPosition((position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const latInput = document.getElementById('delivery-setting-lat');
        const lngInput = document.getElementById('delivery-setting-lng');
        if (latInput) latInput.value = String(latitude);
        if (lngInput) lngInput.value = String(longitude);
        if (status) status.textContent = `Localização preenchida: ${latitude}, ${longitude}. Buscando endereço…`;
        reverseGeocodeDeliveryOrigin().then(() => showToast('Localização e endereço preenchidos. Revise o número antes de salvar.', 'success')).catch(() => {});
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.previousLabel || '⌖ Usar minha localização';
        }
    }, (error) => {
        const message = error?.code === 1
            ? 'Permissão de localização negada. Informe as coordenadas manualmente.'
            : 'Não foi possível obter a localização atual. Tente novamente ou informe as coordenadas manualmente.';
        if (status) status.textContent = message;
        showToast(message, 'error');
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.previousLabel || '⌖ Usar minha localização';
        }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
}

function markDeliveryOriginAddressChanged() {
    const checkbox = document.getElementById('delivery-origin-address-confirmed');
    if (checkbox) checkbox.checked = false;
    const status = document.getElementById('delivery-location-status');
    if (status) status.textContent = 'Endereço alterado. Revise os dados e confirme o endereço antes de salvar.';
}

function updateDeliveryOriginConfirmation() {
    const status = document.getElementById('delivery-location-status');
    const confirmed = document.getElementById('delivery-origin-address-confirmed')?.checked;
    if (status && confirmed) status.textContent = 'Endereço confirmado para o restaurante. Você ainda pode corrigir os dados se necessário.';
}

function scheduleDeliveryOriginReverseGeocode() {
    const lat = Number(document.getElementById('delivery-setting-lat')?.value);
    const lng = Number(document.getElementById('delivery-setting-lng')?.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) reverseGeocodeDeliveryOrigin();
}

async function reverseGeocodeDeliveryOrigin() {
    const lat = Number(document.getElementById('delivery-setting-lat')?.value);
    const lng = Number(document.getElementById('delivery-setting-lng')?.value);
    const status = document.getElementById('delivery-location-status');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const message = 'Informe latitude e longitude válidas para buscar o endereço.';
        if (status) status.textContent = message;
        showToast(message, 'error');
        throw new Error(message);
    }
    if (status) status.textContent = 'Consultando endereço pelas coordenadas…';
    try {
        const result = await api.post('/delivery/addresses/reverse-geocode', { latitude: lat, longitude: lng });
        const fields = {
            postal: result?.postal_code, street: result?.street, number: result?.address_number,
            neighborhood: result?.neighborhood, city: result?.city, state: result?.state,
        };
        Object.entries(fields).forEach(([name, value]) => {
            const input = document.getElementById(`delivery-setting-origin-${name}`);
            // Não mantenha um dado de uma busca anterior (especialmente número)
            // quando o novo ponto não possui aquele detalhe no provedor.
            if (input) input.value = value ? String(value) : '';
        });
        const confirmed = document.getElementById('delivery-origin-address-confirmed');
        if (confirmed) confirmed.checked = false;
        const meta = document.getElementById('delivery-origin-address-meta');
        if (meta) {
            const attribution = result?.geocode_provider === 'OSM_NOMINATIM' ? ' Dados de endereço © OpenStreetMap contributors.' : '';
            meta.textContent = `Endereço encontrado por ${result?.geocode_provider || 'provedor'}${result?.geocode_quality ? ` (${result.geocode_quality})` : ''}. Revise principalmente o número e confirme.${attribution}`;
        }
        if (status) {
            const numberHint = result?.address_number ? ' Revise e confirme.' : ' O provedor não encontrou o número; informe-o manualmente e confirme.';
            status.textContent = result?.formatted_address ? `Endereço encontrado: ${result.formatted_address}.${numberHint}` : `Endereço encontrado.${numberHint}`;
        }
        return result;
    } catch (error) {
        if (status) status.textContent = error.message || 'Não foi possível buscar o endereço. Preencha os campos manualmente.';
        showToast(error.message || 'Não foi possível buscar o endereço pelas coordenadas.', 'error');
        throw error;
    }
}

function collectDeliveryWindows() {
    return Array.from(document.querySelectorAll('#delivery-windows .delivery-window')).map((row) => ({
        days: Array.from(row.querySelectorAll('.delivery-day input:checked')).map((input) => input.value),
        start: row.querySelector('.delivery-window-start')?.value,
        end: row.querySelector('.delivery-window-end')?.value,
    }));
}

function collectDeliveryBands() {
    return Array.from(document.querySelectorAll('#delivery-fee-bands .delivery-band')).map((row) => ({
        up_to_km: Number(row.querySelector('.delivery-band-km')?.value), fee: Number(row.querySelector('.delivery-band-fee')?.value),
    }));
}

function validateDeliverySettings(payload) {
    if (!Number.isFinite(payload.origin_lat) || !Number.isFinite(payload.origin_lng)) return 'Informe e confirme latitude e longitude do restaurante.';
    const originAddress = payload.origin_address || {};
    if (![originAddress.postal_code, originAddress.street, originAddress.address_number, originAddress.neighborhood, originAddress.city, originAddress.state].every((value) => String(value || '').trim())) return 'Informe o endereço completo do restaurante, incluindo o número.';
    if (originAddress.confirmed !== true) return 'Revise e confirme o endereço e o número do restaurante.';
    if (!Number.isFinite(payload.service_radius_km) || payload.service_radius_km <= 0) return 'Informe um raio de atendimento válido.';
    if (!['OWN', 'EXTERNAL'].includes(payload.default_fulfillment_mode)) return 'Selecione a modalidade padrão do Delivery.';
    if (!Number.isInteger(payload.own_available_couriers) || payload.own_available_couriers < 0 || payload.own_available_couriers > 500) return 'Informe uma quantidade válida de entregadores próprios.';
    if (!payload.external_provider_order.length || payload.external_provider_order.some((provider) => provider !== 'IFOOD')) return 'O operador externo disponível nesta fase é IFOOD.';
    if (!Number.isInteger(payload.external_max_attempts) || payload.external_max_attempts < 1 || payload.external_max_attempts > 5) return 'As tentativas do operador devem ficar entre 1 e 5.';
    if (!Number.isInteger(payload.external_attempt_window_minutes) || payload.external_attempt_window_minutes < 1 || payload.external_attempt_window_minutes > 60) return 'A janela do operador deve ficar entre 1 e 60 minutos.';
    if (!Number.isInteger(payload.auto_accept.preparation_minutes) || payload.auto_accept.preparation_minutes < 5 || payload.auto_accept.preparation_minutes > 240) return 'A previsão automática de preparo deve ficar entre 5 e 240 minutos.';
    for (const windowItem of payload.auto_accept.windows) {
        if (!windowItem.days.length || !windowItem.start || !windowItem.end || windowItem.start === windowItem.end) return 'Cada janela precisa ter ao menos um dia e horários diferentes.';
    }
    if (['DISTANCE_BANDS', 'HYBRID'].includes(payload.fees.mode)) {
        if (!payload.fees.bands.length) return 'Adicione ao menos uma faixa de distância.';
        if (payload.fees.bands.some((band, index, all) => !Number.isFinite(band.up_to_km) || !Number.isFinite(band.fee) || (index > 0 && band.up_to_km <= all[index - 1].up_to_km))) return 'As faixas devem ter distâncias crescentes e valores válidos.';
    }
    if (!['NONE', 'FIXED', 'DISTANCE_BANDS', 'PER_KM', 'HYBRID'].includes(payload.fees.mode)) return 'Modelo de taxa inválido.';
    if (![payload.fees.fixed_fee, payload.fees.included_km, payload.fees.price_per_km, payload.fees.minimum_fee].every((value) => Number.isFinite(value) && value >= 0)) return 'Valores de taxa devem ser números não negativos.';
    if (!['NONE', 'CEIL_0_5_KM', 'CEIL_1_KM'].includes(payload.fees.rounding_mode)) return 'Arredondamento inválido.';
    return '';
}

async function saveDeliverySettings() {
    const requiredFieldIds = [
        'delivery-setting-timezone', 'delivery-setting-capacity', 'delivery-setting-mode',
        'delivery-setting-own-capacity', 'delivery-setting-provider-order',
        'delivery-setting-max-attempts', 'delivery-setting-attempt-window',
        'delivery-setting-lat', 'delivery-setting-lng', 'delivery-setting-radius',
    ];
    const requiresOriginAddress = true;
    if (requiresOriginAddress) requiredFieldIds.push(
        'delivery-setting-origin-postal', 'delivery-setting-origin-street', 'delivery-setting-origin-number',
        'delivery-setting-origin-neighborhood', 'delivery-setting-origin-city', 'delivery-setting-origin-state',
    );
    const missingRequiredField = requiredFieldIds.find((id) => !String(document.getElementById(id)?.value || '').trim());
    if (missingRequiredField) return showToast('Preencha todos os campos obrigatórios antes de salvar.', 'error');
    const latRaw = document.getElementById('delivery-setting-lat')?.value;
    const lngRaw = document.getElementById('delivery-setting-lng')?.value;
    const originAddress = {
        postal_code: document.getElementById('delivery-setting-origin-postal')?.value.trim(),
        street: document.getElementById('delivery-setting-origin-street')?.value.trim(),
        address_number: document.getElementById('delivery-setting-origin-number')?.value.trim(),
        address_complement: document.getElementById('delivery-setting-origin-complement')?.value.trim() || undefined,
        neighborhood: document.getElementById('delivery-setting-origin-neighborhood')?.value.trim(),
        city: document.getElementById('delivery-setting-origin-city')?.value.trim(),
        state: document.getElementById('delivery-setting-origin-state')?.value.trim().toUpperCase(),
        confirmed: !!document.getElementById('delivery-origin-address-confirmed')?.checked,
    };
    const mode = document.getElementById('delivery-setting-fee-mode')?.value || 'NONE';
    const payload = {
        whatsapp_order_enabled: !!document.getElementById('delivery-setting-whatsapp-order-enabled')?.checked,
        whatsapp_order_mode: document.getElementById('delivery-setting-whatsapp-order-mode')?.value || 'HYBRID',
        timezone: document.getElementById('delivery-setting-timezone')?.value || 'America/Sao_Paulo',
        default_fulfillment_mode: document.getElementById('delivery-setting-mode')?.value || 'OWN',
        own_available_couriers: Number(document.getElementById('delivery-setting-own-capacity')?.value || 0),
        external_provider_order: String(document.getElementById('delivery-setting-provider-order')?.value || 'IFOOD').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean),
        external_max_attempts: Number(document.getElementById('delivery-setting-max-attempts')?.value || 5),
        external_attempt_window_minutes: Number(document.getElementById('delivery-setting-attempt-window')?.value || 15),
        auto_accept: { enabled: !!document.getElementById('delivery-setting-auto')?.checked, require_confirmed_payment: !!document.getElementById('delivery-setting-payment')?.checked, max_active_deliveries: Number(document.getElementById('delivery-setting-capacity')?.value), preparation_minutes: Number(document.getElementById('delivery-setting-preparation-minutes')?.value || 30), windows: collectDeliveryWindows() },
        origin_lat: latRaw === '' ? undefined : Number(latRaw), origin_lng: lngRaw === '' ? undefined : Number(lngRaw),
        origin_address: originAddress,
        service_radius_km: Number(document.getElementById('delivery-setting-radius')?.value),
        fees: { mode, fixed_fee: Number(document.getElementById('delivery-setting-fixed-fee')?.value || 0), bands: ['DISTANCE_BANDS', 'HYBRID'].includes(mode) ? collectDeliveryBands() : [], included_km: Number(document.getElementById('delivery-setting-included-km')?.value || 0), price_per_km: Number(document.getElementById('delivery-setting-price-per-km')?.value || 0), minimum_fee: Number(document.getElementById('delivery-setting-minimum-fee')?.value || 0), rounding_mode: document.getElementById('delivery-setting-rounding')?.value || 'NONE' },
    };
    const reserved = Number((deliveryState.capacity?.data || deliveryState.capacity || {}).reserved || 0);
    const requestedFleetMode = document.querySelector('input[name="delivery-fleet-mode"]:checked')?.value || 'CAPACITY_ONLY';
    const currentFleetMode = window.getFleetFrontendConfig?.()?.mode || 'CAPACITY_ONLY';
    if (payload.own_available_couriers < reserved) {
        const confirmed = await showConfirmDialog({
            title: 'Capacidade abaixo das reservas atuais',
            message: `A nova capacidade (${payload.own_available_couriers}) é menor que as reservas em andamento (${reserved}).`,
            detail: 'A disponibilidade ficará zerada até que reservas suficientes sejam liberadas.',
            confirmLabel: 'Salvar mesmo assim',
            variant: 'warning',
        });
        if (!confirmed) return;
    }
    const validation = validateDeliverySettings(payload);
    if (validation) return showToast(validation, 'error');
    const button = document.getElementById('delivery-save-settings');
    if (button) { button.disabled = true; button.textContent = 'Salvando…'; }
    try {
        deliveryState.settings = await api.put('/delivery/settings', payload);
        if (requestedFleetMode !== currentFleetMode && window.requestFleetModeChange) {
            const changed = await window.requestFleetModeChange(requestedFleetMode);
            if (!changed) {
                if (button) { button.disabled = false; button.textContent = 'Salvar configuração'; }
                return;
            }
        }
        deliveryState.capacity = await api.get('/delivery/capacity').catch(() => deliveryState.capacity);
        closeModal(); renderDeliveryPage(); showToast('Configuração de Delivery salva.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível salvar a configuração.', 'error'); if (button) { button.disabled = false; button.textContent = 'Salvar configuração'; } }
}

async function testDeliveryQuote() {
    const km = Number(document.getElementById('delivery-quote-distance')?.value);
    const result = document.getElementById('delivery-quote-result');
    if (!Number.isFinite(km) || km < 0) return showToast('Informe uma distância válida.', 'error');
    if (result) result.textContent = 'Calculando com as regras atualmente salvas…';
    try {
        const quote = await api.get('/deliveries/quote', { distance_meters: Math.round(km * 1000) });
        if (result) result.innerHTML = `<strong style="color:var(--teal-dark)">${formatCurrency(quote.delivery_fee || 0)}</strong> para ${km.toLocaleString('pt-BR')} km · regra ${escapeHTML(quote.fee_rule?.mode || 'configurada')}`;
    } catch (error) { if (result) result.textContent = error.message || 'Simulação indisponível.'; }
}

async function openDeliveryProviderSettings() {
    if (!canPerformAction('manageDeliverySettings')) return showToast('Seu perfil não pode editar credenciais.', 'error');
    openModal('<div class="modal-header"><div><h3>Operador externo</h3><div class="modal-header-subtitle">Carregando configuração segura…</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="loading"><div class="spinner"></div> Consultando status sem retornar segredos…</div></div>', { size: 'lg' });
    try {
        const payload = await api.get('/delivery/providers');
        const providers = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
        const provider = providers.find((item) => String(item.provider).toUpperCase() === 'IFOOD') || { provider: 'IFOOD', environment: 'SANDBOX', enabled: false, priority: 1, connection_status: 'NOT_TESTED', credential_configured: false };
        const modal = document.getElementById('modal-content');
        if (!modal) return;
        modal.innerHTML = `<div class="modal-header"><div><h3>Configuração do iFood</h3><div id="delivery-provider-status" class="modal-header-subtitle">Status: <strong>${escapeHTML(provider.connection_status || 'NOT_TESTED')}</strong> · credencial ${provider.credential_configured ? 'configurada' : 'não configurada'}</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><section class="delivery-form-section"><div class="delivery-form-grid"><div class="form-group"><label for="delivery-provider-environment">Ambiente</label><select id="delivery-provider-environment"><option value="SANDBOX" ${provider.environment === 'SANDBOX' ? 'selected' : ''}>Sandbox</option><option value="PRODUCTION" ${provider.environment === 'PRODUCTION' ? 'selected' : ''}>Produção</option></select></div><div class="form-group"><label for="delivery-provider-merchant">ID do restaurante no operador</label><input id="delivery-provider-merchant" maxlength="255" value="${escapeHTML(provider.external_merchant_id || '')}"></div><div class="form-group"><label for="delivery-provider-priority">Prioridade</label><input id="delivery-provider-priority" type="number" min="1" max="50" value="${Number(provider.priority || 1)}"></div></div><label class="delivery-switch"><input id="delivery-provider-enabled" type="checkbox" ${provider.enabled ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Operador habilitado</span></label></section><section class="delivery-form-section"><div class="delivery-form-section-head"><div><h4>Credenciais write-only</h4><p>Os campos ficam vazios após salvar. O Admin nunca recebe o segredo de volta.</p></div></div><div class="form-group"><label for="delivery-provider-client-id">Client ID</label><input id="delivery-provider-client-id" autocomplete="off"></div><div class="form-group"><label for="delivery-provider-client-secret">Client Secret</label><input id="delivery-provider-client-secret" type="password" autocomplete="new-password"></div><div class="form-group"><label for="delivery-provider-access-token">Access Token</label><input id="delivery-provider-access-token" type="password" autocomplete="new-password"></div></section></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--neutral" onclick="testDeliveryProviderConnection()">Testar conexão fake</button><button class="delivery-btn delivery-btn--primary" onclick="saveDeliveryProviderSettings()">Salvar operador</button></div>`;
    } catch (error) {
        closeModal();
        showToast(error.message || 'Não foi possível carregar o operador.', 'error');
    }
}

async function testDeliveryProviderConnection() {
    const button = document.querySelector('#modal-content .delivery-btn--neutral:nth-last-child(2)');
    if (button) { button.disabled = true; button.textContent = 'Testando…'; }
    try {
        const result = await api.post('/delivery/providers/IFOOD/test-connection', {});
        const status = document.getElementById('delivery-provider-status');
        if (status) status.innerHTML = `Status: <strong>${escapeHTML(result?.connection_status || (result?.ok ? 'CONNECTED' : 'NOT_CONFIGURED'))}</strong> · ${result?.ok ? 'adapter fake validado' : escapeHTML(result?.error_code || 'credencial não configurada')}`;
        showToast(result?.ok ? 'Conexão fake validada; nenhuma chamada externa foi feita.' : 'Conexão não configurada. Salve as credenciais write-only antes de testar.', result?.ok ? 'success' : 'error');
    } catch (error) { showToast(error.message || 'Não foi possível testar o operador.', 'error'); }
    finally { if (button) { button.disabled = false; button.textContent = 'Testar conexão fake'; } }
}

async function saveDeliveryProviderSettings() {
    const environment = document.getElementById('delivery-provider-environment')?.value || 'SANDBOX';
    const merchantId = document.getElementById('delivery-provider-merchant')?.value.trim() || undefined;
    const priority = Number(document.getElementById('delivery-provider-priority')?.value || 1);
    const enabled = !!document.getElementById('delivery-provider-enabled')?.checked;
    const clientId = document.getElementById('delivery-provider-client-id')?.value || '';
    const clientSecret = document.getElementById('delivery-provider-client-secret')?.value || '';
    const accessToken = document.getElementById('delivery-provider-access-token')?.value || '';
    if (!Number.isInteger(priority) || priority < 1 || priority > 50) return showToast('Prioridade inválida.', 'error');
    const button = document.querySelector('#modal-content .delivery-btn--primary');
    if (button) { button.disabled = true; button.textContent = 'Salvando…'; }
    try {
        await api.put('/delivery/providers/IFOOD', { enabled, environment, priority, ...(merchantId ? { external_merchant_id: merchantId } : {}) });
        if (clientId || clientSecret || accessToken) {
            if (!clientId || !clientSecret || !accessToken) throw new Error('Preencha as três credenciais ou deixe todas vazias para manter a credencial existente.');
            await api.post('/delivery/providers/IFOOD/credentials', { credentials: { client_id: clientId, client_secret: clientSecret, access_token: accessToken } });
        }
        ['delivery-provider-client-id', 'delivery-provider-client-secret', 'delivery-provider-access-token'].forEach((id) => { const field = document.getElementById(id); if (field) field.value = ''; });
        closeModal();
        showToast('Configuração do operador salva sem expor credenciais.', 'success');
    } catch (error) {
        showToast(error.message || 'Não foi possível salvar o operador.', 'error');
        if (button) { button.disabled = false; button.textContent = 'Salvar operador'; }
    }
}

const deliveryCustomerManagerState = { customer: null, addresses: [], editing: null };

function openDeliveryCustomerManager() {
    deliveryCustomerManagerState.customer = null;
    deliveryCustomerManagerState.addresses = [];
    deliveryCustomerManagerState.editing = null;
    openModal(`<div class="modal-header"><div><h3>Clientes e endereços</h3><div class="modal-header-subtitle">Busque pelo telefone dentro deste tenant.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="form-group"><label for="delivery-customer-phone">Telefone com DDI</label><div style="display:flex;gap:8px"><input id="delivery-customer-phone" inputmode="tel" placeholder="5511999999999"><button class="delivery-btn delivery-btn--primary" onclick="resolveDeliveryCustomer()">Buscar</button></div></div><div id="delivery-customer-result" class="delivery-helper" aria-live="polite">Nenhum cliente selecionado.</div></div>`, { size: 'lg' });
}

async function resolveDeliveryCustomer() {
    const phone = document.getElementById('delivery-customer-phone')?.value.trim();
    if (!phone) return showToast('Informe o telefone do cliente.', 'error');
    const result = document.getElementById('delivery-customer-result');
    if (result) result.textContent = 'Buscando cliente…';
    try {
        deliveryCustomerManagerState.customer = await api.post('/delivery/customers/resolve', { phone });
        const customer = deliveryCustomerManagerState.customer?.data || deliveryCustomerManagerState.customer;
        deliveryCustomerManagerState.customer = customer;
        deliveryCustomerManagerState.addresses = await loadDeliveryCustomerAddresses(customer.id);
        renderDeliveryCustomerManager();
    } catch (error) {
        if (result) result.textContent = error.message || 'Não foi possível buscar o cliente.';
    }
}

async function loadDeliveryCustomerAddresses(customerId) {
    const payload = await api.get(`/delivery/customers/${encodeURIComponent(customerId)}/addresses`);
    return Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
}

function renderDeliveryCustomerManager() {
    const customer = deliveryCustomerManagerState.customer;
    const addresses = deliveryCustomerManagerState.addresses;
    const modal = document.getElementById('modal-content');
    if (!modal || !customer) return;
    modal.innerHTML = `<div class="modal-header"><div><h3>Cliente ${escapeHTML(customer.phone_masked || 'encontrado')}</h3><div class="modal-header-subtitle">Até cinco endereços ativos · histórico do pedido não é alterado.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div class="delivery-form-section"><div class="delivery-form-section-head"><h4>Endereços salvos (${addresses.length}/5)</h4><button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryAddressForm()" ${addresses.length >= 5 ? 'disabled' : ''}>+ Novo endereço</button></div><div class="delivery-address-list">${addresses.length ? addresses.map(renderDeliveryCustomerAddress).join('') : '<p class="delivery-helper">Nenhum endereço confirmado.</p>'}</div></div><div id="delivery-address-editor"></div></div>`;
}

function renderDeliveryCustomerAddress(address) {
    return `<article class="delivery-panel" style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:12px"><div><strong>${escapeHTML(address.label || 'Endereço')}</strong>${address.is_default ? ' <span class="delivery-status">Padrão</span>' : ''}<div class="delivery-helper">${escapeHTML(address.formatted_address || `${address.street}, ${address.address_number} · ${address.city}/${address.state}`)}</div></div><div style="display:flex;gap:6px;align-items:start"><button class="delivery-btn delivery-btn--neutral" onclick="openDeliveryAddressForm('${escapeHTML(address.id)}')">Editar</button><button class="delivery-btn delivery-btn--neutral" onclick="removeDeliveryCustomerAddress('${escapeHTML(address.id)}')">Excluir</button></div></div></article>`;
}

function openDeliveryAddressForm(addressId = '') {
    const address = deliveryCustomerManagerState.addresses.find((item) => item.id === addressId) || {};
    deliveryCustomerManagerState.editing = addressId || null;
    const editor = document.getElementById('delivery-address-editor');
    if (!editor) return;
    editor.innerHTML = `<section class="delivery-form-section" style="margin-top:14px"><div class="delivery-form-section-head"><h4>${addressId ? 'Editar endereço' : 'Novo endereço'}</h4><button class="delivery-btn delivery-btn--neutral" onclick="document.getElementById('delivery-address-editor').innerHTML=''">Fechar</button></div><div class="delivery-form-grid"><div class="form-group"><label for="delivery-address-label">Rótulo</label><input id="delivery-address-label" value="${escapeHTML(address.label || '')}" maxlength="80"></div><div class="form-group"><label for="delivery-address-postal">CEP</label><div style="display:flex;gap:8px"><input id="delivery-address-postal" value="${escapeHTML(address.postal_code || '')}" maxlength="9" inputmode="numeric"><button class="delivery-btn delivery-btn--neutral" type="button" onclick="lookupDeliveryAddressPostalCode()">Buscar CEP</button></div><small id="delivery-address-lookup-status" class="delivery-helper">Confirme os dados retornados antes de salvar.</small></div><div class="form-group"><label for="delivery-address-street">Rua</label><input id="delivery-address-street" value="${escapeHTML(address.street || '')}"></div><div class="form-group"><label for="delivery-address-number">Número</label><input id="delivery-address-number" value="${escapeHTML(address.address_number || '')}"></div><div class="form-group"><label for="delivery-address-complement">Complemento</label><input id="delivery-address-complement" value="${escapeHTML(address.address_complement || '')}"></div><div class="form-group"><label for="delivery-address-neighborhood">Bairro</label><input id="delivery-address-neighborhood" value="${escapeHTML(address.neighborhood || '')}"></div><div class="form-group"><label for="delivery-address-city">Cidade</label><input id="delivery-address-city" value="${escapeHTML(address.city || '')}"></div><div class="form-group"><label for="delivery-address-state">UF</label><input id="delivery-address-state" maxlength="2" value="${escapeHTML(address.state || '')}"></div></div><label class="delivery-switch"><input id="delivery-address-default" type="checkbox" ${address.is_default ? 'checked' : ''}><span class="delivery-switch-track"></span><span class="delivery-switch-label">Definir como endereço padrão</span></label><button class="delivery-btn delivery-btn--primary" onclick="saveDeliveryCustomerAddress()">Confirmar endereço</button></section>`;
}

async function lookupDeliveryAddressPostalCode() {
    const postalCode = document.getElementById('delivery-address-postal')?.value.trim();
    const status = document.getElementById('delivery-address-lookup-status');
    if (!postalCode) return showToast('Informe o CEP.', 'error');
    if (status) status.textContent = 'Consultando CEP…';
    try {
        const result = await api.post('/delivery/addresses/postal-code-lookup', { postal_code: postalCode });
        if (result?.status === 'NOT_FOUND') {
            if (status) status.textContent = 'CEP não localizado. Preencha o endereço manualmente.';
            return;
        }
        [['street', 'street'], ['neighborhood', 'neighborhood'], ['city', 'city'], ['state', 'state']].forEach(([field, key]) => {
            const input = document.getElementById(`delivery-address-${field}`);
            if (input && result?.[key]) input.value = result[key];
        });
        if (status) status.textContent = `CEP localizado por ${result?.provider || 'provedor'}; confirme os dados.`;
    } catch (error) {
        if (status) status.textContent = 'Não foi possível consultar o CEP. Preencha manualmente.';
    }
}

async function saveDeliveryCustomerAddress() {
    const customer = deliveryCustomerManagerState.customer;
    if (!customer) return;
    const body = { label: document.getElementById('delivery-address-label')?.value.trim(), postal_code: document.getElementById('delivery-address-postal')?.value.trim(), street: document.getElementById('delivery-address-street')?.value.trim(), address_number: document.getElementById('delivery-address-number')?.value.trim(), address_complement: document.getElementById('delivery-address-complement')?.value.trim() || undefined, neighborhood: document.getElementById('delivery-address-neighborhood')?.value.trim(), city: document.getElementById('delivery-address-city')?.value.trim(), state: document.getElementById('delivery-address-state')?.value.trim().toUpperCase(), confirmed: true, is_default: !!document.getElementById('delivery-address-default')?.checked };
    if (Object.values(body).some((value) => value === '')) return showToast('Preencha os campos obrigatórios do endereço.', 'error');
    try {
        try {
            const geocode = await api.post('/delivery/addresses/geocode', body);
            Object.assign(body, geocode || {});
        } catch (_) {
            // Manual address remains valid when the map provider is unavailable.
        }
        if (deliveryCustomerManagerState.editing) await api.put(`/delivery/customers/${encodeURIComponent(customer.id)}/addresses/${encodeURIComponent(deliveryCustomerManagerState.editing)}`, body);
        else await api.post(`/delivery/customers/${encodeURIComponent(customer.id)}/addresses`, body);
        deliveryCustomerManagerState.addresses = await loadDeliveryCustomerAddresses(customer.id);
        deliveryCustomerManagerState.editing = null;
        renderDeliveryCustomerManager();
        showToast('Endereço salvo.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível salvar o endereço.', 'error'); }
}

async function removeDeliveryCustomerAddress(addressId) {
    const customer = deliveryCustomerManagerState.customer;
    if (!customer) return;
    const confirmed = await showConfirmDialog({
        title: 'Excluir endereço?',
        message: 'O endereço deixará de aparecer entre as opções salvas do cliente.',
        detail: 'O endereço registrado nos pedidos anteriores não será alterado.',
        confirmLabel: 'Excluir endereço',
        variant: 'danger',
    });
    if (!confirmed) return;
    try {
        await api.delete(`/delivery/customers/${encodeURIComponent(customer.id)}/addresses/${encodeURIComponent(addressId)}`);
        deliveryCustomerManagerState.addresses = await loadDeliveryCustomerAddresses(customer.id);
        renderDeliveryCustomerManager();
        showToast('Endereço excluído.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível excluir o endereço.', 'error'); }
}

function deliveryReportDate(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

function openDeliveryReport() {
     openModal(`<div class="modal-header"><div><h3>Relatório operacional</h3><div class="modal-header-subtitle">Resumo financeiro e de desempenho do tenant. Período máximo de 90 dias.</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><div class="delivery-form-grid"><div class="form-group"><label for="delivery-report-from">De</label><input id="delivery-report-from" type="date" value="${deliveryReportDate(-30)}"></div><div class="form-group"><label for="delivery-report-to">Até</label><input id="delivery-report-to" type="date" value="${deliveryReportDate()}"></div><div class="form-group"><label for="delivery-report-mode">Modalidade</label><select id="delivery-report-mode"><option value="">Todas</option><option value="OWN">Própria</option><option value="EXTERNAL">iFood</option></select></div><div class="form-group"><label for="delivery-report-provider">Operador</label><select id="delivery-report-provider"><option value="">Todos</option><option value="IFOOD">iFood</option><option value="FAKE">Fake</option></select></div><div class="form-group"><label for="delivery-report-status">Status</label><select id="delivery-report-status"><option value="">Todos</option><option value="DELIVERED">Entregue</option><option value="DELIVERY_FAILED">Falha</option><option value="RETURNING,RETURNED">Retorno</option><option value="CANCELED">Cancelada</option></select></div></div><div id="delivery-report-result" class="delivery-helper" aria-live="polite">Selecione os filtros e carregue o relatório.</div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Fechar</button><button class="delivery-btn delivery-btn--neutral" onclick="downloadDeliveryReportCsv()">Baixar CSV</button><button class="delivery-btn delivery-btn--primary" onclick="loadDeliveryReport()">Carregar relatório</button></div>`, { size: 'lg' });
}

function deliveryReportParams() {
    const from = document.getElementById('delivery-report-from')?.value;
    const to = document.getElementById('delivery-report-to')?.value;
    return {
        date_from: from ? `${from}T00:00:00.000Z` : undefined,
        date_to: to ? `${to}T23:59:59.999Z` : undefined,
        mode: document.getElementById('delivery-report-mode')?.value || undefined,
        provider: document.getElementById('delivery-report-provider')?.value || undefined,
        status: document.getElementById('delivery-report-status')?.value || undefined,
    };
}

async function downloadDeliveryReportCsv() {
    const from = document.getElementById('delivery-report-from')?.value;
    const to = document.getElementById('delivery-report-to')?.value;
    if (!from || !to || from >= to) return showToast('Informe um intervalo válido.', 'error');
    try {
        const file = await api.download('/deliveries/reports/summary.csv', deliveryReportParams());
        const url = window.URL.createObjectURL(file.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.filename || `relatorio-delivery-${from}-${to}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        showToast('CSV gerado sem dados de telefone ou endereço.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível exportar o relatório.', 'error'); }
}

async function openDeliveryExceptions() {
    openModal(`<div class="modal-header"><div><h3>Centro de exceções</h3><div class="modal-header-subtitle">Entregas que precisam de decisão do restaurante.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div id="delivery-exceptions-result" class="delivery-helper">Carregando ocorrências…</div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Fechar</button><button class="delivery-btn delivery-btn--primary" onclick="openDeliveryExceptions()">Atualizar</button></div>`, { size: 'lg' });
    try {
        const payload = await api.get('/deliveries', { status: 'DELIVERY_FAILED,RETURNING,RETURNED', page: 1, limit: 60 });
        const items = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
        const result = document.getElementById('delivery-exceptions-result');
        if (result) result.innerHTML = items.length ? items.map((item) => {
            const acknowledged = isDeliveryExceptionAcknowledged(item.id);
            return `<article class="delivery-panel" style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>#${escapeHTML(item.display_code || '')}</strong><div class="delivery-helper">${escapeHTML(DELIVERY_STATUS[item.status]?.label || item.status)} · atualizado ${escapeHTML(new Date(item.updated_at).toLocaleString('pt-BR'))}</div>${acknowledged ? '<span class="delivery-helper">Reconhecida neste navegador</span>' : ''}</div><div style="display:flex;gap:8px"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal();openDeliveryDetail('${escapeHTML(item.id)}')">Abrir</button>${acknowledged ? '' : `<button class="delivery-btn delivery-btn--neutral" onclick="ackDeliveryException('${escapeHTML(item.id)}')">Reconhecer</button>`}</div></div></article>`;
        }).join('') : '<p class="delivery-helper">Nenhuma exceção aberta.</p>';
    } catch (error) {
        const result = document.getElementById('delivery-exceptions-result');
        if (result) result.textContent = error.message || 'Não foi possível carregar as exceções.';
    }
}

function deliveryExceptionAckStorageKey() { return 'clickgarcom_delivery_exception_ack_v1'; }

function isDeliveryExceptionAcknowledged(id) {
    try {
        const values = JSON.parse(localStorage.getItem(deliveryExceptionAckStorageKey()) || '{}');
        return Boolean(values && values[String(id)]);
    } catch (_) { return false; }
}

function ackDeliveryException(id) {
    try {
        const values = JSON.parse(localStorage.getItem(deliveryExceptionAckStorageKey()) || '{}');
        values[String(id)] = new Date().toISOString();
        localStorage.setItem(deliveryExceptionAckStorageKey(), JSON.stringify(values));
    } catch (_) { /* storage indisponível não bloqueia a operação */ }
    openDeliveryExceptions();
}

async function openDeliveryCapacityReservations() {
    openModal(`<div class="modal-header"><div><h3>Reservas de capacidade própria</h3><div class="modal-header-subtitle">Somente reservas do tenant atual; checkout e telefone não são exibidos.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body delivery-form"><div id="delivery-capacity-reservations-result" class="delivery-helper">Carregando reservas…</div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Fechar</button></div>`, { size: 'lg' });
    try {
        const payload = await api.get('/delivery/capacity/reservations');
        const data = payload?.data || payload || {};
        const reservations = Array.isArray(data.reservations) ? data.reservations : [];
        const result = document.getElementById('delivery-capacity-reservations-result');
        if (result) result.innerHTML = reservations.length ? reservations.map((row) => `<article class="delivery-panel" style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:12px"><div><strong>${escapeHTML(row.status)}</strong><div class="delivery-helper">${row.delivery_id ? `Entrega ${escapeHTML(row.delivery_id)}` : 'Checkout aguardando confirmação'}</div></div><div class="delivery-helper">${row.expires_at ? `expira ${escapeHTML(new Date(row.expires_at).toLocaleString('pt-BR'))}` : 'sem expiração'}</div></div></article>`).join('') : '<p class="delivery-helper">Nenhuma reserva ativa.</p>';
    } catch (error) {
        const result = document.getElementById('delivery-capacity-reservations-result');
        if (result) result.textContent = error.message || 'Não foi possível carregar reservas.';
    }
}

async function loadDeliveryReport() {
    const from = document.getElementById('delivery-report-from')?.value;
    const to = document.getElementById('delivery-report-to')?.value;
    const result = document.getElementById('delivery-report-result');
    if (!from || !to || from >= to) return showToast('Informe um intervalo válido.', 'error');
    if (result) result.innerHTML = 'Carregando…';
    try {
        const payload = await api.get('/deliveries/reports/summary', deliveryReportParams());
        const report = payload?.data || payload;
        const kpis = report?.kpis || {};
        const financial = report?.financial || {};
        const statuses = Array.isArray(report?.by_status) ? report.by_status : [];
        if (result) result.innerHTML = `<div class="delivery-kpis" style="margin-top:12px">${deliveryKpi('Entregas', kpis.total, '◌', `${kpis.delivered || 0} concluídas`)}${deliveryKpi('Falhas/retornos', kpis.failed_or_returned, '!', `${kpis.canceled || 0} canceladas`)}${deliveryKpi('Overrides', kpis.override, '↻', 'Intervenções manuais')}${deliveryKpi('Sem ETA', kpis.without_eta, '◷', 'Acompanhar operação')}</div>${Number(kpis.total || 0) > 500 ? '<div class="delivery-alert" role="status"><span>!</span><div><strong>Volume alto no período</strong><span>Use filtros menores para exportar e revisar a operação com segurança.</span></div></div>' : ''}<section class="delivery-panel" style="margin-top:14px"><h4>Financeiro (BRL)</h4><div class="delivery-address-list"><div style="display:flex;justify-content:space-between;padding:8px 0"><span>Frete cobrado do cliente</span><strong>R$ ${Number(financial.customer_delivery_fee || 0).toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:8px 0"><span>Custo cotado</span><strong>R$ ${Number(financial.quoted_cost || 0).toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:8px 0"><span>Custo efetivo</span><strong>R$ ${Number(financial.actual_cost || 0).toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:8px 0"><span>Ajuste do restaurante</span><strong>R$ ${Number(financial.restaurant_adjustment || 0).toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;padding:8px 0"><span>Variação do operador</span><strong>R$ ${Number(financial.provider_variance || 0).toFixed(2)}</strong></div></div></section><section class="delivery-panel" style="margin-top:14px"><h4>Distribuição por status</h4><div class="delivery-address-list">${statuses.length ? statuses.map((row) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef"><span>${escapeHTML(row.status)}</span><strong>${Number(row.count || 0)}</strong></div>`).join('') : '<p class="delivery-helper">Nenhuma entrega no período.</p>'}</div></section><p class="delivery-helper" style="margin-top:12px">Tempo médio de aceite: ${kpis.avg_acceptance_seconds == null ? '—' : `${Math.round(kpis.avg_acceptance_seconds / 60)} min`} · tempo total: ${kpis.avg_total_seconds == null ? '—' : `${Math.round(kpis.avg_total_seconds / 60)} min`}</p>`;
    } catch (error) {
        if (result) result.innerHTML = `<span class="delivery-alert">${escapeHTML(error.message || 'Não foi possível carregar o relatório.')}</span>`;
    }
}

function startDeliveryPolling() {
    destroyDeliveryPage();
    if (!deliveryState.networkListenersBound) {
        window.addEventListener('online', handleDeliveryOnline);
        window.addEventListener('offline', handleDeliveryOffline);
        deliveryState.networkListenersBound = true;
    }
    deliveryState.pollTimer = window.setInterval(() => {
        if (!document.hidden && document.getElementById('page-delivery')?.classList.contains('active')) refreshDeliveryPage();
    }, 15000);
}

function handleDeliveryOnline() {
    deliveryState.offline = false;
    refreshDeliveryPage(true);
}

function handleDeliveryOffline() {
    deliveryState.offline = true;
    if (document.getElementById('page-delivery')?.classList.contains('active')) renderDeliveryPage();
}

function destroyDeliveryPage() {
    if (deliveryState.pollTimer) window.clearInterval(deliveryState.pollTimer);
    deliveryState.pollTimer = null;
    if (deliveryState.networkListenersBound) {
        window.removeEventListener('online', handleDeliveryOnline);
        window.removeEventListener('offline', handleDeliveryOffline);
        deliveryState.networkListenersBound = false;
    }
    deliveryState.requestSequence += 1;
}

window.loadDeliveryPage = loadDeliveryPage;
window.destroyDeliveryPage = destroyDeliveryPage;
window.openDeliveryDetail = openDeliveryDetail;
window.refreshDeliveryPage = refreshDeliveryPage;
window.applyDeliveryFilters = applyDeliveryFilters;
window.clearDeliveryFilters = clearDeliveryFilters;
window.goToDeliveryPage = goToDeliveryPage;
window.runDeliveryAccept = runDeliveryAccept;
window.openDeliveryReasonModal = openDeliveryReasonModal;
window.submitDeliveryReason = submitDeliveryReason;
window.openDeliveryAssign = openDeliveryAssign;
window.submitDeliveryAssign = submitDeliveryAssign;
window.openDeliveryReturn = openDeliveryReturn;
window.submitDeliveryReturn = submitDeliveryReturn;
window.issueDeliveryTracking = issueDeliveryTracking;
window.openDeliveryOverride = openDeliveryOverride;
window.submitDeliveryOverride = submitDeliveryOverride;
window.openDeliverySettings = openDeliverySettings;
window.addDeliveryWindow = addDeliveryWindow;
window.addDeliveryBand = addDeliveryBand;
window.toggleDeliveryFeeFields = toggleDeliveryFeeFields;
window.saveDeliverySettings = saveDeliverySettings;
window.testDeliveryQuote = testDeliveryQuote;
window.openDeliveryProviderSettings = openDeliveryProviderSettings;
window.saveDeliveryProviderSettings = saveDeliveryProviderSettings;
window.testDeliveryProviderConnection = testDeliveryProviderConnection;
window.openDeliveryCustomerManager = openDeliveryCustomerManager;
window.resolveDeliveryCustomer = resolveDeliveryCustomer;
window.openDeliveryAddressForm = openDeliveryAddressForm;
window.lookupDeliveryAddressPostalCode = lookupDeliveryAddressPostalCode;
window.saveDeliveryCustomerAddress = saveDeliveryCustomerAddress;
window.removeDeliveryCustomerAddress = removeDeliveryCustomerAddress;
window.openDeliveryReport = openDeliveryReport;
window.loadDeliveryReport = loadDeliveryReport;
window.downloadDeliveryReportCsv = downloadDeliveryReportCsv;
window.openDeliveryExceptions = openDeliveryExceptions;
window.openDeliveryCapacityReservations = openDeliveryCapacityReservations;
window.openDeliveryFallback = openDeliveryFallback;
window.submitDeliveryFallback = submitDeliveryFallback;
