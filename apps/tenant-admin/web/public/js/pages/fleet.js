// ClickGarçom — Frota própria identificada (frontend-first).
// Troque `fleetApiEnabled` para true no runtime config quando os contratos
// DEL-FLEET-BE estiverem disponíveis. Toda chamada remota fica neste adapter.
const FLEET_MODE = Object.freeze({ CAPACITY_ONLY: 'CAPACITY_ONLY', IDENTIFIED_DRIVERS: 'IDENTIFIED_DRIVERS' });
const FLEET_API_ENABLED = window.CLICKGARCOM_RUNTIME_CONFIG?.fleetApiEnabled === true;
const FLEET_STORE_VERSION = 1;

const fleetState = {
    config: null,
    drivers: [],
    deliveries: [],
    report: null,
    tab: 'drivers',
    query: '',
    status: 'ALL',
    loading: false,
    timer: null,
};

function fleetTenantKey() {
    return `clickgarcom_fleet_preview_v${FLEET_STORE_VERSION}_${TENANT_ID || 'tenant'}`;
}

function fleetNow(offsetMinutes = 0) {
    return new Date(Date.now() + offsetMinutes * 60000).toISOString();
}

function fleetDemoStore() {
    return {
        config: { mode: FLEET_MODE.CAPACITY_ONLY, updated_at: fleetNow(-180), updated_by: 'Configuração atual', version: 1 },
        drivers: [
            { id: 'fleet-driver-rafael', name: 'Rafael Souza', cpf_masked: '***.***.*12-42', plate: 'FRT4A21', phone: '5511987654321', active: true, availability: 'AVAILABLE', active_deliveries: 0, delivery_limit: 2, access_status: 'ACTIVE', last_access_at: fleetNow(-35), created_at: fleetNow(-43200), version: 1 },
            { id: 'fleet-driver-luana', name: 'Luana Martins', cpf_masked: '***.***.*31-08', plate: 'GDX8C90', phone: '5511976543210', active: true, availability: 'ON_ROUTE', active_deliveries: 1, delivery_limit: 2, access_status: 'ACTIVE', last_access_at: fleetNow(-8), created_at: fleetNow(-20160), version: 1 },
            { id: 'fleet-driver-carlos', name: 'Carlos Lima', cpf_masked: '***.***.*84-16', plate: 'EJQ2B77', phone: '', active: false, availability: 'OFFLINE', active_deliveries: 0, delivery_limit: 1, access_status: 'REVOKED', last_access_at: null, created_at: fleetNow(-86400), version: 1 },
        ],
        assignments: [
            { id: 'assignment-demo-1', delivery_id: 'delivery-demo-1', delivery_code: '600364', driver_id: 'fleet-driver-luana', customer_name: 'Mariana', neighborhood: 'Vila Yara', status: 'IN_TRANSIT', position: 1, assigned_at: fleetNow(-24), eta_minutes: 16, version: 2 },
        ],
    };
}

function fleetReadDemoStore() {
    try {
        const stored = JSON.parse(localStorage.getItem(fleetTenantKey()) || 'null');
        if (stored?.config && Array.isArray(stored.drivers) && Array.isArray(stored.assignments)) return stored;
    } catch (_) {}
    const seed = fleetDemoStore();
    localStorage.setItem(fleetTenantKey(), JSON.stringify(seed));
    return seed;
}

function fleetWriteDemoStore(store) {
    localStorage.setItem(fleetTenantKey(), JSON.stringify(store));
    return structuredClone(store);
}

const fleetGateway = {
    async snapshot() {
        if (FLEET_API_ENABLED) {
            const [config, drivers, assignments] = await Promise.all([
                api.get('/delivery/fleet/config'),
                api.get('/delivery/drivers', { include_inactive: true }),
                api.get('/delivery/fleet/assignments', { status: 'ACTIVE' }),
            ]);
            return {
                config: config?.config || config,
                drivers: drivers?.data || drivers?.drivers || drivers || [],
                assignments: assignments?.data || assignments?.assignments || assignments || [],
            };
        }
        return structuredClone(fleetReadDemoStore());
    },
    async setMode(mode, expectedVersion) {
        if (FLEET_API_ENABLED) return api.put('/delivery/fleet/config', { mode, expected_version: expectedVersion });
        const store = fleetReadDemoStore();
        store.config = { ...store.config, mode, version: Number(store.config.version || 0) + 1, updated_at: fleetNow(), updated_by: getCurrentUser()?.name || 'Administrador' };
        fleetWriteDemoStore(store);
        return { config: store.config };
    },
    async saveDriver(id, input) {
        if (FLEET_API_ENABLED) return id ? api.patch(`/delivery/drivers/${encodeURIComponent(id)}`, input) : api.post('/delivery/drivers', input);
        const store = fleetReadDemoStore();
        const current = store.drivers.find((item) => item.id === id);
        const last4 = String(input.cpf || current?.cpf_masked || '').replace(/\D/g, '').slice(-4).padStart(2, '0');
        const next = {
            ...(current || {}), ...input,
            id: id || `fleet-driver-${crypto.randomUUID()}`,
            cpf: undefined, cpf_masked: `***.***.*${last4.slice(0, 2)}-${last4.slice(2)}`,
            plate: String(input.plate || '').toUpperCase(), active: current?.active ?? true,
            availability: current?.availability || 'AVAILABLE', active_deliveries: Number(current?.active_deliveries || 0),
            access_status: current?.access_status || 'NOT_ACTIVATED', created_at: current?.created_at || fleetNow(),
            version: Number(current?.version || 0) + 1,
        };
        store.drivers = current ? store.drivers.map((item) => item.id === id ? next : item) : [next, ...store.drivers];
        fleetWriteDemoStore(store);
        return { driver: next };
    },
    async setDriverActive(id, active, reason, expectedVersion) {
        if (FLEET_API_ENABLED) return api.command(`/delivery/drivers/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { reason, expected_version: expectedVersion });
        const store = fleetReadDemoStore();
        store.drivers = store.drivers.map((driver) => driver.id === id ? { ...driver, active, availability: active ? 'AVAILABLE' : 'OFFLINE', deactivation_reason: active ? null : reason, version: Number(driver.version || 0) + 1 } : driver);
        fleetWriteDemoStore(store);
        return { driver: store.drivers.find((driver) => driver.id === id) };
    },
    async createAccess(id) {
        if (FLEET_API_ENABLED) return api.post(`/delivery/drivers/${encodeURIComponent(id)}/access-links`, {});
        const store = fleetReadDemoStore();
        const token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
        const expiresAt = fleetNow(15);
        store.drivers = store.drivers.map((driver) => driver.id === id ? { ...driver, access_status: 'PENDING_ACTIVATION', access_expires_at: expiresAt } : driver);
        fleetWriteDemoStore(store);
        const tenantSlug = String(getCurrentUser()?.tenant_slug || getCurrentUser()?.tenant_name || 'restaurante').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurante';
        return { activation_url: `${window.location.origin}/entregador/${tenantSlug}#activate=${token}`, expires_at: expiresAt };
    },
    async revokeAccess(id) {
        if (FLEET_API_ENABLED) return api.delete(`/delivery/drivers/${encodeURIComponent(id)}/sessions`);
        const store = fleetReadDemoStore();
        store.drivers = store.drivers.map((driver) => driver.id === id ? { ...driver, access_status: 'REVOKED', last_access_at: null } : driver);
        fleetWriteDemoStore(store);
        return { revoked: true };
    },
    async reorder(driverId, assignmentIds) {
        if (FLEET_API_ENABLED) return api.put(`/delivery/drivers/${encodeURIComponent(driverId)}/queue`, { assignment_ids: assignmentIds });
        const store = fleetReadDemoStore();
        assignmentIds.forEach((id, index) => {
            const assignment = store.assignments.find((item) => item.id === id && item.driver_id === driverId);
            if (assignment) assignment.position = index + 1;
        });
        fleetWriteDemoStore(store);
        return { assignments: store.assignments };
    },
    async report(filters) {
        if (FLEET_API_ENABLED) return api.get('/deliveries/reports/drivers', filters);
        const store = fleetReadDemoStore();
        return { rows: store.drivers.filter((driver) => driver.active).map((driver, index) => ({ driver_id: driver.id, driver_name: driver.name, completed: index === 0 ? 28 : 21, average_minutes: index === 0 ? 31 : 36, incidents: index, success_rate: index === 0 ? 98 : 95 })) };
    },
};

function fleetIsIdentifiedMode() {
    return fleetState.config?.mode === FLEET_MODE.IDENTIFIED_DRIVERS;
}

async function loadFleetPage() {
    const container = document.getElementById('page-fleet');
    if (!container) return;
    if (!canAccessPage('fleet')) {
        container.innerHTML = '<div class="fleet-state"><span>🔒</span><h2>Acesso restrito</h2><p>Seu perfil não possui acesso à frota.</p></div>';
        return;
    }
    if (getCurrentUser()?.delivery_enabled !== true) {
        container.innerHTML = '<div class="fleet-state"><span>🛵</span><h2>Frota indisponível</h2><p>O módulo Delivery precisa estar ativo para configurar motoboys.</p><button class="fleet-btn fleet-btn--primary" onclick="navigate(\'delivery\')">Conhecer o Delivery</button></div>';
        return;
    }
    fleetState.loading = true;
    container.innerHTML = '<div class="fleet-loading" aria-label="Carregando frota"><i></i><i></i><i></i></div>';
    try {
        const snapshot = await fleetGateway.snapshot();
        fleetState.config = snapshot.config || { mode: FLEET_MODE.CAPACITY_ONLY, version: 1 };
        fleetState.drivers = Array.isArray(snapshot.drivers) ? snapshot.drivers : [];
        fleetState.deliveries = Array.isArray(snapshot.assignments) ? snapshot.assignments : [];
        renderFleetPage();
        refreshFleetNavigation();
        fleetState.timer = window.setInterval(() => refreshFleetData({ silent: true }), 15000);
    } catch (error) {
        container.innerHTML = `<div class="fleet-state"><span>⚠️</span><h2>Não foi possível carregar a frota</h2><p>${escapeHTML(error.message || 'Tente novamente.')}</p><button class="fleet-btn fleet-btn--primary" onclick="loadFleetPage()">Tentar novamente</button></div>`;
    } finally { fleetState.loading = false; }
}

function destroyFleetPage() {
    if (fleetState.timer) window.clearInterval(fleetState.timer);
    fleetState.timer = null;
}

async function refreshFleetData(options = {}) {
    if (fleetState.loading) return;
    fleetState.loading = true;
    try {
        const snapshot = await fleetGateway.snapshot();
        fleetState.config = snapshot.config;
        fleetState.drivers = snapshot.drivers || [];
        fleetState.deliveries = snapshot.assignments || [];
        renderFleetPage();
    } catch (error) {
        if (!options.silent) showToast(error.message || 'Não foi possível atualizar a frota.', 'error');
    } finally { fleetState.loading = false; }
}

function refreshFleetNavigation() {
    const nav = document.getElementById('nav-fleet');
    if (!nav) return;
    nav.classList.toggle('fleet-mode-off', !fleetIsIdentifiedMode());
    nav.title = fleetIsIdentifiedMode() ? 'Gerenciar frota própria' : 'Ative Motoboys cadastrados nas configurações do Delivery';
    const badge = document.getElementById('badge-fleet');
    const issues = fleetState.drivers.filter((driver) => driver.active && ['OCCURRENCE', 'BLOCKED'].includes(String(driver.availability))).length;
    if (badge) { badge.textContent = issues ? String(issues) : ''; badge.style.display = issues ? '' : 'none'; }
}

function renderFleetPage() {
    const container = document.getElementById('page-fleet');
    if (!container) return;
    if (!fleetIsIdentifiedMode()) {
        container.innerHTML = renderFleetModeIntro();
        return;
    }
    const active = fleetState.drivers.filter((driver) => driver.active);
    const available = active.filter((driver) => String(driver.availability) === 'AVAILABLE').length;
    const onRoute = active.filter((driver) => ['BUSY', 'ON_ROUTE'].includes(String(driver.availability))).length;
    const incidents = active.filter((driver) => ['OCCURRENCE', 'BLOCKED'].includes(String(driver.availability))).length;
    container.innerHTML = `<div class="fleet-shell">
        <section class="fleet-hero">
            <div><span class="fleet-eyebrow">FROTA PRÓPRIA · ATUALIZAÇÃO AO VIVO</span><h2>Quem entrega também faz parte da experiência.</h2><p>Organize acessos, capacidade e a fila de cada motoboy sem perder o ritmo da expedição.</p></div>
            <div class="fleet-hero-actions"><button class="fleet-btn fleet-btn--glass" onclick="refreshFleetData()">↻ Atualizar</button>${canPerformAction('manageFleet') ? '<button class="fleet-btn fleet-btn--light" onclick="openFleetDriverForm()">+ Cadastrar motoboy</button>' : ''}</div>
        </section>
        ${!FLEET_API_ENABLED ? '<div class="fleet-preview" role="status"><strong>Prévia funcional do frontend</strong><span>Os dados desta tela são locais. Para produção, basta ligar os endpoints no adapter de Frota.</span></div>' : ''}
        <section class="fleet-kpis" aria-label="Resumo da frota">
            ${fleetKpi('Motoboys ativos', active.length, '🛵', `${fleetState.drivers.length - active.length} inativo(s)`)}
            ${fleetKpi('Disponíveis agora', available, '●', 'Prontos para receber entrega', 'success')}
            ${fleetKpi('Em rota', onRoute, '➜', `${fleetState.deliveries.length} entrega(s) na fila`, 'route')}
            ${fleetKpi('Ocorrências', incidents, '!', incidents ? 'Precisam de ação' : 'Operação fluindo', incidents ? 'danger' : '')}
        </section>
        <nav class="fleet-tabs" aria-label="Visões da frota">
            ${fleetTab('drivers', 'Motoboys', active.length)}${fleetTab('queues', 'Filas por motoboy', fleetState.deliveries.length)}${fleetTab('reports', 'Desempenho', '')}
        </nav>
        <section id="fleet-content">${renderFleetActiveTab()}</section>
    </div>`;
}

function renderFleetModeIntro() {
    return `<div class="fleet-shell"><section class="fleet-mode-intro">
        <div class="fleet-mode-illustration" aria-hidden="true"><span>🛵</span><i></i><b>✓</b></div>
        <span class="fleet-eyebrow">CONTROLE POR MOTOBOY</span><h2>Pronto para identificar sua frota?</h2>
        <p>Hoje a operação usa somente uma quantidade total de entregadores. O modo identificado adiciona cadastro, fila individual, acesso seguro e histórico por motoboy.</p>
        <div class="fleet-mode-benefits"><span><b>01</b> Cadastro protegido</span><span><b>02</b> Fila individual</span><span><b>03</b> Código de entrega</span></div>
        ${canPerformAction('manageFleet') ? '<button class="fleet-btn fleet-btn--primary" onclick="requestFleetModeChange(\'IDENTIFIED_DRIVERS\')">Ativar motoboys cadastrados</button>' : '<small>Peça a um administrador para alterar o modo da frota.</small>'}
        <small>A mudança vale somente para novas atribuições. Entregas em andamento não são alteradas.</small>
    </section></div>`;
}

function fleetKpi(label, value, icon, detail, tone = '') {
    return `<article class="fleet-kpi ${tone ? `fleet-kpi--${tone}` : ''}"><div><span>${escapeHTML(label)}</span><strong>${Number(value || 0)}</strong><small>${escapeHTML(detail)}</small></div><i aria-hidden="true">${icon}</i></article>`;
}

function fleetTab(id, label, count) {
    return `<button class="${fleetState.tab === id ? 'is-active' : ''}" onclick="setFleetTab('${id}')" aria-current="${fleetState.tab === id ? 'page' : 'false'}">${escapeHTML(label)}${count !== '' ? `<span>${Number(count || 0)}</span>` : ''}</button>`;
}

function setFleetTab(tab) {
    fleetState.tab = tab;
    renderFleetPage();
    if (tab === 'reports') loadFleetReport();
}

function renderFleetActiveTab() {
    if (fleetState.tab === 'queues') return renderFleetQueues();
    if (fleetState.tab === 'reports') return renderFleetReports();
    return renderFleetDrivers();
}

function fleetFilteredDrivers() {
    const query = fleetState.query.trim().toLocaleLowerCase('pt-BR');
    return fleetState.drivers.filter((driver) => {
        const matchesText = !query || [driver.name, driver.plate, driver.phone].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
        const matchesStatus = fleetState.status === 'ALL' || (fleetState.status === 'ACTIVE' ? driver.active : !driver.active) || fleetState.status === driver.availability;
        return matchesText && matchesStatus;
    });
}

function renderFleetDrivers() {
    const drivers = fleetFilteredDrivers();
    return `<div class="fleet-panel">
        <header class="fleet-panel-head"><div><h3>Central de motoboys</h3><p>CPF nunca é exibido por inteiro e não participa da busca.</p></div><div class="fleet-filters"><label><span>Buscar</span><input value="${escapeHTML(fleetState.query)}" placeholder="Nome, placa ou telefone" oninput="filterFleetDrivers(this.value)"></label><label><span>Situação</span><select onchange="setFleetStatusFilter(this.value)"><option value="ALL">Todos</option><option value="ACTIVE" ${fleetState.status === 'ACTIVE' ? 'selected' : ''}>Ativos</option><option value="INACTIVE" ${fleetState.status === 'INACTIVE' ? 'selected' : ''}>Inativos</option><option value="AVAILABLE" ${fleetState.status === 'AVAILABLE' ? 'selected' : ''}>Disponíveis</option><option value="ON_ROUTE" ${fleetState.status === 'ON_ROUTE' ? 'selected' : ''}>Em rota</option></select></label></div></header>
        <div class="fleet-driver-grid">${drivers.length ? drivers.map(renderFleetDriverCard).join('') : '<div class="fleet-empty"><span>⌕</span><strong>Nenhum motoboy encontrado</strong><small>Revise os filtros ou cadastre uma nova pessoa.</small></div>'}</div>
    </div>`;
}

function fleetAvailability(driver) {
    if (!driver.active) return { label: 'Inativo', tone: 'muted' };
    const map = { AVAILABLE: ['Disponível', 'success'], BUSY: ['Ocupado', 'route'], ON_ROUTE: ['Em rota', 'route'], OCCURRENCE: ['Ocorrência', 'danger'], BLOCKED: ['Bloqueado', 'danger'], OFFLINE: ['Fora do turno', 'muted'] };
    const value = map[String(driver.availability)] || ['Disponível', 'success'];
    return { label: value[0], tone: value[1] };
}

function renderFleetDriverCard(driver) {
    const availability = fleetAvailability(driver);
    const initials = String(driver.name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const load = Number(driver.active_deliveries || 0);
    const limit = Math.max(1, Number(driver.delivery_limit || 1));
    const access = { ACTIVE: 'Acesso ativo', PENDING_ACTIVATION: 'Ativação pendente', REVOKED: 'Acesso revogado', NOT_ACTIVATED: 'Sem acesso' }[driver.access_status] || 'Sem acesso';
    return `<article class="fleet-driver-card ${driver.active ? '' : 'is-inactive'}">
        <div class="fleet-driver-top"><span class="fleet-avatar">${escapeHTML(initials)}</span><div><h4>${escapeHTML(driver.name)}</h4><span class="fleet-status fleet-status--${availability.tone}">${escapeHTML(availability.label)}</span></div><button class="fleet-more" aria-label="Editar ${escapeHTML(driver.name)}" onclick="openFleetDriverForm('${escapeHTML(driver.id)}')">•••</button></div>
        <dl><div><dt>Placa</dt><dd>${escapeHTML(fleetPlateMask(driver.plate))}</dd></div><div><dt>CPF</dt><dd>${escapeHTML(driver.cpf_masked || '***.***.***-**')}</dd></div><div><dt>Capacidade</dt><dd>${load}/${limit} entregas</dd></div><div><dt>Acesso</dt><dd>${escapeHTML(access)}</dd></div></dl>
        <div class="fleet-capacity"><i style="--fleet-load:${Math.min(100, load / limit * 100)}%"></i></div>
        <footer><button onclick="openFleetDriverQueue('${escapeHTML(driver.id)}')">Ver fila</button>${canPerformAction('manageFleet') ? `<button onclick="openFleetAccess('${escapeHTML(driver.id)}')">${driver.access_status === 'ACTIVE' ? 'Gerenciar acesso' : 'Gerar acesso'}</button>` : ''}</footer>
    </article>`;
}

function filterFleetDrivers(value) { fleetState.query = value; document.getElementById('fleet-content').innerHTML = renderFleetDrivers(); }
function setFleetStatusFilter(value) { fleetState.status = value; document.getElementById('fleet-content').innerHTML = renderFleetDrivers(); }

function renderFleetQueues() {
    const activeDrivers = fleetState.drivers.filter((driver) => driver.active);
    return `<div class="fleet-panel"><header class="fleet-panel-head"><div><h3>Filas por motoboy</h3><p>A ordem define a próxima parada. Use os botões para reordenar também pelo teclado.</p></div><span class="fleet-realtime"><i></i> Atualização automática</span></header><div class="fleet-queue-grid">${activeDrivers.map((driver) => renderFleetQueue(driver)).join('')}</div></div>`;
}

function renderFleetQueue(driver) {
    const assignments = fleetState.deliveries.filter((item) => item.driver_id === driver.id).sort((a, b) => Number(a.position) - Number(b.position));
    const availability = fleetAvailability(driver);
    return `<article class="fleet-queue"><header><div><strong>${escapeHTML(driver.name)}</strong><small>${escapeHTML(fleetPlateMask(driver.plate))}</small></div><span class="fleet-status fleet-status--${availability.tone}">${escapeHTML(availability.label)}</span></header><div>${assignments.length ? assignments.map((item, index) => renderFleetQueueItem(item, index, assignments.length)).join('') : '<div class="fleet-queue-empty">Livre para receber uma entrega</div>'}</div></article>`;
}

function renderFleetQueueItem(item, index, total) {
    return `<div class="fleet-queue-item"><span>${index + 1}</span><div><strong>#${escapeHTML(item.delivery_code || String(item.delivery_id).slice(0, 6))} · ${escapeHTML(item.customer_name || 'Cliente')}</strong><small>${escapeHTML(item.neighborhood || 'Destino')} · ${Number(item.eta_minutes || 0)} min</small></div><div class="fleet-order-controls"><button aria-label="Mover entrega para cima" ${index === 0 ? 'disabled' : ''} onclick="moveFleetAssignment('${escapeHTML(item.driver_id)}','${escapeHTML(item.id)}',-1)">↑</button><button aria-label="Mover entrega para baixo" ${index === total - 1 ? 'disabled' : ''} onclick="moveFleetAssignment('${escapeHTML(item.driver_id)}','${escapeHTML(item.id)}',1)">↓</button></div></div>`;
}

async function moveFleetAssignment(driverId, assignmentId, direction) {
    const queue = fleetState.deliveries.filter((item) => item.driver_id === driverId).sort((a, b) => Number(a.position) - Number(b.position));
    const current = queue.findIndex((item) => item.id === assignmentId);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= queue.length) return;
    [queue[current], queue[target]] = [queue[target], queue[current]];
    await fleetGateway.reorder(driverId, queue.map((item) => item.id));
    await refreshFleetData({ silent: true });
    showToast('Ordem da fila atualizada.', 'success');
}

function openFleetDriverQueue(driverId) { fleetState.tab = 'queues'; renderFleetPage(); document.querySelector('.fleet-queue')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function renderFleetReports() {
    return `<div class="fleet-panel"><header class="fleet-panel-head"><div><h3>Desempenho da frota</h3><p>Indicadores operacionais sem expor CPF ou códigos de entrega.</p></div><div class="fleet-report-filters"><input id="fleet-report-from" type="date" value="${fleetDate(-30)}"><input id="fleet-report-to" type="date" value="${fleetDate()}"><button class="fleet-btn fleet-btn--primary" onclick="loadFleetReport()">Atualizar</button></div></header><div id="fleet-report-result">${fleetState.report ? renderFleetReportRows(fleetState.report) : '<div class="fleet-report-loading">Carregando desempenho…</div>'}</div></div>`;
}

function fleetDate(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }

async function loadFleetReport() {
    const result = document.getElementById('fleet-report-result');
    if (result) result.innerHTML = '<div class="fleet-report-loading">Atualizando indicadores…</div>';
    try {
        fleetState.report = await fleetGateway.report({ from: document.getElementById('fleet-report-from')?.value || fleetDate(-30), to: document.getElementById('fleet-report-to')?.value || fleetDate() });
        if (result) result.innerHTML = renderFleetReportRows(fleetState.report);
    } catch (error) { if (result) result.innerHTML = `<div class="fleet-empty"><strong>Relatório indisponível</strong><small>${escapeHTML(error.message || '')}</small></div>`; }
}

function renderFleetReportRows(report) {
    const rows = report?.rows || [];
    return `<div class="fleet-report-table" role="table"><div class="fleet-report-row fleet-report-row--head" role="row"><span>Motoboy</span><span>Entregas</span><span>Tempo médio</span><span>Sucesso</span><span>Ocorrências</span></div>${rows.map((row) => `<div class="fleet-report-row" role="row"><strong>${escapeHTML(row.driver_name)}</strong><span>${Number(row.completed || 0)}</span><span>${Number(row.average_minutes || 0)} min</span><span>${Number(row.success_rate || 0)}%</span><span>${Number(row.incidents || 0)}</span></div>`).join('')}</div>`;
}

function fleetDigits(value) { return String(value || '').replace(/\D/g, ''); }
function fleetCpfValid(value) {
    const cpf = fleetDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = (length) => { let sum = 0; for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index); const result = (sum * 10) % 11; return result === 10 ? 0 : result; };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
function fleetPlateValid(value) { return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()); }
function fleetPlateMask(value) { const plate = String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); return plate.length === 7 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate || 'Sem placa'; }
function fleetCpfInput(input) { const digits = fleetDigits(input.value).slice(0, 11); input.value = digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
function fleetPhoneInput(input) { const digits = fleetDigits(input.value).slice(0, 13); input.value = digits.replace(/^(55)(\d{2})(\d{5})(\d{0,4})$/, '+$1 ($2) $3-$4'); }

function openFleetDriverForm(id = '') {
    const driver = fleetState.drivers.find((item) => item.id === id) || {};
    openModal(`<div class="modal-header"><div><h3>${id ? 'Editar motoboy' : 'Cadastrar motoboy'}</h3><div class="modal-header-subtitle">Dados operacionais protegidos por tenant.</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><div class="fleet-form-note"><span>🔒</span><p>O CPF será criptografado pelo backend. Depois do cadastro, somente os últimos dígitos ficam visíveis.</p></div><div class="delivery-form-grid"><div class="form-group"><label for="fleet-driver-name">Nome completo *</label><input id="fleet-driver-name" maxlength="120" autocomplete="name" value="${escapeHTML(driver.name || '')}"></div><div class="form-group"><label for="fleet-driver-cpf">CPF *</label><input id="fleet-driver-cpf" inputmode="numeric" autocomplete="off" ${id ? 'disabled' : ''} placeholder="000.000.000-00" value="${id ? escapeHTML(driver.cpf_masked || '') : ''}" oninput="fleetCpfInput(this)"><small class="delivery-helper">${id ? 'Para alterar o CPF, será necessária uma ação protegida do backend.' : 'Usado apenas para identificação interna.'}</small></div><div class="form-group"><label for="fleet-driver-plate">Placa da moto *</label><input id="fleet-driver-plate" maxlength="8" autocapitalize="characters" value="${escapeHTML(fleetPlateMask(driver.plate || ''))}" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')" placeholder="ABC-1D23"></div><div class="form-group"><label for="fleet-driver-phone">Telefone</label><input id="fleet-driver-phone" inputmode="tel" autocomplete="tel" value="${escapeHTML(driver.phone || '')}" oninput="fleetPhoneInput(this)" placeholder="+55 (11) 99999-9999"></div><div class="form-group"><label for="fleet-driver-limit">Limite simultâneo *</label><input id="fleet-driver-limit" type="number" min="1" max="10" value="${Number(driver.delivery_limit || 1)}"><small class="delivery-helper">Quantas entregas podem compor a fila do motoboy.</small></div></div><div id="fleet-driver-error" class="fleet-form-error" aria-live="polite"></div></div><div class="modal-footer">${id && canPerformAction('manageFleet') ? `<button class="delivery-btn ${driver.active ? 'delivery-btn--danger' : 'delivery-btn--neutral'}" onclick="${driver.active ? `openFleetDeactivation('${escapeHTML(id)}')` : `toggleFleetDriver('${escapeHTML(id)}',true)`}">${driver.active ? 'Inativar' : 'Reativar'}</button>` : ''}<span class="fleet-modal-spacer"></span><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--primary" onclick="saveFleetDriver('${escapeHTML(id)}')">Salvar motoboy</button></div>`, { size: 'lg' });
}

async function saveFleetDriver(id) {
    const name = document.getElementById('fleet-driver-name')?.value.trim();
    const cpf = document.getElementById('fleet-driver-cpf')?.value;
    const plate = document.getElementById('fleet-driver-plate')?.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const phone = fleetDigits(document.getElementById('fleet-driver-phone')?.value);
    const deliveryLimit = Number(document.getElementById('fleet-driver-limit')?.value || 0);
    const error = document.getElementById('fleet-driver-error');
    const fail = (message) => { if (error) error.textContent = message; };
    if (!name || name.length < 3) return fail('Informe o nome completo.');
    if (!id && !fleetCpfValid(cpf)) return fail('Informe um CPF válido.');
    if (!fleetPlateValid(plate)) return fail('Informe uma placa válida, antiga ou Mercosul.');
    if (phone && (phone.length < 12 || phone.length > 13)) return fail('Informe o telefone com DDD.');
    if (!Number.isInteger(deliveryLimit) || deliveryLimit < 1 || deliveryLimit > 10) return fail('O limite deve ficar entre 1 e 10 entregas.');
    try {
        await fleetGateway.saveDriver(id, { name, ...(!id ? { cpf: fleetDigits(cpf) } : {}), plate, ...(phone ? { phone } : {}), delivery_limit: deliveryLimit });
        closeModal(); await refreshFleetData({ silent: true }); showToast(id ? 'Cadastro atualizado.' : 'Motoboy cadastrado.', 'success');
    } catch (requestError) { fail(requestError.message || 'Não foi possível salvar. Os dados preenchidos foram preservados.'); }
}

function openFleetDeactivation(id) {
    const driver = fleetState.drivers.find((item) => item.id === id);
    if (!driver) return;
    openModal(`<div class="modal-header"><div><h3>Inativar ${escapeHTML(driver.name)}?</h3><div class="modal-header-subtitle">O motoboy deixará de receber novas atribuições.</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body delivery-form"><div class="delivery-alert" style="margin:0 0 15px"><span>!</span><div><strong>${Number(driver.active_deliveries || 0)} entrega(s) em andamento</strong><span>Entregas atuais continuam vinculadas até reatribuição ou conclusão.</span></div></div><div class="form-group"><label for="fleet-deactivation-reason">Motivo da inativação *</label><textarea id="fleet-deactivation-reason" maxlength="400" placeholder="Ex.: férias, desligamento ou veículo em manutenção"></textarea></div><div id="fleet-deactivation-error" class="fleet-form-error"></div></div><div class="modal-footer"><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Cancelar</button><button class="delivery-btn delivery-btn--danger" onclick="submitFleetDeactivation('${escapeHTML(id)}')">Confirmar inativação</button></div>`);
}

async function submitFleetDeactivation(id) {
    const reason = document.getElementById('fleet-deactivation-reason')?.value.trim();
    if (!reason) { const error = document.getElementById('fleet-deactivation-error'); if (error) error.textContent = 'Informe o motivo para manter a auditoria.'; return; }
    await toggleFleetDriver(id, false, reason);
}

async function toggleFleetDriver(id, active, providedReason = '') {
    const driver = fleetState.drivers.find((item) => item.id === id);
    if (!driver) return;
    const reason = active ? 'Reativação administrativa' : providedReason;
    if (!reason) return;
    const confirmed = await showConfirmDialog({ title: active ? 'Reativar motoboy?' : 'Inativar motoboy?', message: active ? `${driver.name} voltará a ficar elegível para novas entregas.` : `${driver.name} não receberá novas atribuições.`, detail: driver.active_deliveries ? 'As entregas em andamento continuam vinculadas e precisam ser reatribuídas manualmente.' : reason, confirmLabel: active ? 'Reativar' : 'Inativar', variant: active ? 'default' : 'warning' });
    if (!confirmed) return;
    await fleetGateway.setDriverActive(id, active, reason, driver.version);
    closeModal(); await refreshFleetData({ silent: true }); showToast(active ? 'Motoboy reativado.' : 'Motoboy inativado.', 'success');
}

async function openFleetAccess(id) {
    const driver = fleetState.drivers.find((item) => item.id === id);
    if (!driver) return;
    const active = driver.access_status === 'ACTIVE';
    openModal(`<div class="modal-header"><div><h3>Acesso de ${escapeHTML(driver.name)}</h3><div class="modal-header-subtitle">Sessões pessoais, revogáveis e vinculadas ao tenant.</div></div><button class="modal-close" onclick="closeModal()" aria-label="Fechar">✕</button></div><div class="modal-body"><div class="fleet-access-status"><span class="fleet-status fleet-status--${active ? 'success' : 'muted'}">${active ? 'Acesso ativo' : 'Acesso não ativado'}</span><p>${driver.last_access_at ? `Último acesso em ${escapeHTML(new Date(driver.last_access_at).toLocaleString('pt-BR'))}.` : 'Ainda não há primeiro acesso registrado.'}</p></div><div id="fleet-access-result" aria-live="polite"></div></div><div class="modal-footer">${active ? '<button class="delivery-btn delivery-btn--danger" onclick="revokeFleetAccess(\'' + escapeHTML(id) + '\')">Revogar sessões</button>' : ''}<span class="fleet-modal-spacer"></span><button class="delivery-btn delivery-btn--neutral" onclick="closeModal()">Fechar</button><button class="delivery-btn delivery-btn--primary" onclick="generateFleetAccess('${escapeHTML(id)}')">Gerar novo acesso</button></div>`);
}

async function generateFleetAccess(id) {
    const result = document.getElementById('fleet-access-result');
    if (result) result.innerHTML = '<div class="fleet-report-loading">Gerando link de uso único…</div>';
    try {
        const access = await fleetGateway.createAccess(id);
        const link = String(access.activation_url || '');
        const qrMarkup = access.qr_code_data_url
            ? `<img class="fleet-qr-image" src="${escapeHTML(access.qr_code_data_url)}" alt="QR Code de ativação">`
            : '<div class="fleet-qr-placeholder" aria-label="Espaço reservado ao QR Code do backend"><span>QR</span><small>gerado na integração</small></div>';
        if (result) result.innerHTML = `<div class="fleet-access-card">${qrMarkup}<div><strong>Link pronto para compartilhar</strong><p>Válido até ${escapeHTML(new Date(access.expires_at).toLocaleString('pt-BR'))}. Ele funciona uma única vez.</p><input id="fleet-one-time-link" readonly value="${escapeHTML(link)}"><div class="fleet-access-actions"><button class="fleet-btn fleet-btn--primary" onclick="copyFleetAccessLink()">Copiar link</button><a class="fleet-btn fleet-btn--neutral" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Abrir prévia</a></div></div></div><div class="fleet-privacy-note">O token permanece na tela somente enquanto esta janela estiver aberta.</div>`;
    } catch (error) { if (result) result.innerHTML = `<div class="fleet-form-error">${escapeHTML(error.message || 'Não foi possível gerar o acesso.')}</div>`; }
}

async function copyFleetAccessLink() {
    const input = document.getElementById('fleet-one-time-link');
    if (!input) return;
    await navigator.clipboard.writeText(input.value).catch(() => { input.select(); document.execCommand('copy'); });
    showToast('Link de acesso copiado.', 'success');
}

async function revokeFleetAccess(id) {
    const confirmed = await showConfirmDialog({ title: 'Revogar acesso?', message: 'Todas as sessões abertas deste motoboy serão encerradas.', detail: 'Será necessário gerar um novo link para acessar novamente.', confirmLabel: 'Revogar acesso', variant: 'warning' });
    if (!confirmed) return;
    await fleetGateway.revokeAccess(id); closeModal(); await refreshFleetData({ silent: true }); showToast('Acesso revogado.', 'success');
}

async function requestFleetModeChange(mode) {
    const current = fleetState.config?.mode || FLEET_MODE.CAPACITY_ONLY;
    if (current === mode) return;
    const enabling = mode === FLEET_MODE.IDENTIFIED_DRIVERS;
    const confirmed = await showConfirmDialog({ title: enabling ? 'Ativar motoboys cadastrados?' : 'Voltar para capacidade simples?', message: enabling ? 'Novas entregas próprias poderão ser atribuídas individualmente.' : 'Novas entregas usarão somente a capacidade numérica.', detail: 'Entregas já atribuídas ou em rota não serão modificadas.', confirmLabel: enabling ? 'Ativar modo' : 'Alterar modo', variant: 'warning' });
    if (!confirmed) return false;
    const response = await fleetGateway.setMode(mode, fleetState.config?.version);
    fleetState.config = response?.config || response;
    refreshFleetNavigation();
    if (document.getElementById('page-fleet')?.classList.contains('active')) renderFleetPage();
    showToast(enabling ? 'Modo com motoboys cadastrados ativado.' : 'Capacidade simples ativada.', 'success');
    return true;
}

window.loadFleetPage = loadFleetPage;
window.destroyFleetPage = destroyFleetPage;
window.refreshFleetNavigation = refreshFleetNavigation;
window.requestFleetModeChange = requestFleetModeChange;
window.getFleetFrontendConfig = () => fleetState.config || fleetReadDemoStore().config;
window.deliveryUsesIdentifiedFleet = () => (fleetState.config || fleetReadDemoStore().config)?.mode === FLEET_MODE.IDENTIFIED_DRIVERS;
window.getFleetEligibleDrivers = async () => {
    const snapshot = await fleetGateway.snapshot();
    fleetState.config = snapshot.config;
    fleetState.drivers = snapshot.drivers || [];
    fleetState.deliveries = snapshot.assignments || [];
    return { drivers: fleetState.drivers.filter((driver) => driver.active && String(driver.availability) !== 'OFFLINE') };
};
window.fleetFrontendUsesApi = () => FLEET_API_ENABLED;
window.assignFleetDeliveryPreview = async (delivery, driverId, reason = '') => {
    const store = fleetReadDemoStore();
    const previousDriverId = delivery.assigned_driver_id;
    store.assignments = store.assignments.filter((assignment) => assignment.delivery_id !== delivery.id);
    store.assignments.push({
        id: `assignment-${delivery.id}`,
        delivery_id: delivery.id,
        delivery_code: delivery.display_code,
        driver_id: driverId,
        customer_name: delivery.customer_name,
        neighborhood: String(delivery.formatted_address || '').split(',').slice(-3, -2)[0]?.trim() || 'Destino confirmado',
        status: 'ASSIGNED',
        position: store.assignments.filter((assignment) => assignment.driver_id === driverId).length + 1,
        assigned_at: fleetNow(),
        eta_minutes: Math.max(1, Math.round(Number(delivery.eta_seconds || 0) / 60)),
        reason: reason || undefined,
        version: 1,
    });
    store.drivers = store.drivers.map((driver) => {
        let activeDeliveries = Number(driver.active_deliveries || 0);
        if (driver.id === previousDriverId && previousDriverId !== driverId) activeDeliveries = Math.max(0, activeDeliveries - 1);
        if (driver.id === driverId && previousDriverId !== driverId) activeDeliveries += 1;
        return { ...driver, active_deliveries: activeDeliveries, availability: activeDeliveries ? 'ON_ROUTE' : driver.availability };
    });
    fleetWriteDemoStore(store);
    return { ...delivery, assigned_driver_id: driverId, status: 'ASSIGNED', version: Number(delivery.version || 0) + 1 };
};
