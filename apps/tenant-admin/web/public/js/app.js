// ClickGarçom Admin — App Router
const pages = {
    dashboard: { title: 'Painel de atendimento', sub: 'Operação presencial, mesas e comandas', loader: loadDashboard },
    wallet: { title: 'Carteira & Assinatura', sub: 'Faturamento e recarga de créditos TaaS', loader: loadWallet },
    extratoMensagens: {
        title: 'Extrato de Mensagens',
        sub: 'Cada linha representa uma mensagem contabilizada no consumo do WhatsApp',
        loader: loadExtratoMensagens,
    },
    appointments: { title: 'Painel de agendamentos', sub: 'Agenda, equipe, confirmações e serviços', loader: loadAppointmentsPage },
    retailOverview: { title: 'Painel de produtos', sub: 'Vendas, pedidos e estoque em um único lugar', loader: () => runOptionalPageLoader('loadRetailOverview', 'retailOverview') },
    retailProducts: { title: 'Produtos', sub: 'Catálogo, preços e disponibilidade para venda', loader: () => runOptionalPageLoader('loadRetailProductsPage', 'retailProducts') },
    retailInventory: { title: 'Estoque', sub: 'Saldo físico, reservas e movimentações', loader: () => runOptionalPageLoader('loadRetailInventoryPage', 'retailInventory') },
    retailPicking: { title: 'Central de Separação', sub: 'Separe, confira e libere compras pagas', loader: () => runOptionalPageLoader('loadRetailPickingPage', 'retailPicking') },
    retailOrders: { title: 'Compras online', sub: 'Acompanhe compras atuais e histórico de conclusão', loader: () => runOptionalPageLoader('loadRetailOrdersPage', 'retailOrders') },
    pedidos: { title: 'Pedidos', sub: 'Fila de pedidos recebidos', loader: loadPedidos },
    delivery: { title: 'Painel de Delivery', sub: 'Aceite, preparo, despacho e acompanhamento', loader: loadDeliveryPage },
    fleet: { title: 'Frota própria', sub: 'Motoboys, acessos, capacidade e desempenho', loader: () => runOptionalPageLoader('loadFleetPage', 'fleet') },
    foodOverview: { title: 'Painel de comidas', sub: 'Cardápio, categorias e disponibilidade para venda', loader: loadFoodOverview },
    cardapio: { title: 'Cardápio', sub: 'Gerencie os itens do seu menu', loader: loadCardapio },
    categorias: { title: 'Categorias', sub: 'Organize o cardápio em categorias', loader: loadCategorias },
    comandas: { title: 'Comandas', sub: 'Abra e acompanhe as comandas do restaurante', loader: loadComandas },
    mesas: { title: 'Mesas', sub: 'Gerencie disponibilidade, reservas e ocupação do salão', loader: loadMesas },
    pagamentos: { title: 'Pagamentos & Conciliação', sub: 'Acompanhe pagamentos, divergências e baixas operacionais', loader: loadPagamentos },
    compras: { title: 'Compras & Fornecedores', sub: 'Lançamento de notas e histórico de compras', loader: loadComprasPage },
    vendas: { title: 'Vendas', sub: 'Relatório completo de vendas', loader: loadVendas },
    meuRestaurante: { title: 'Meu Restaurante', sub: 'Gerencie os dados cadastrais do seu estabelecimento', loader: loadMeuRestaurante },
    equipe: { title: 'Equipe & Acessos', sub: 'Gerencie usuários internos, papéis e credenciais de acesso', loader: loadEquipePage },
    configuracoes: { title: 'Configurações de Mensagens', sub: 'Personalize as mensagens do bot', loader: loadConfiguracoesPage },
};
const appRuntimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const APP_BASE_PATH = String(appRuntimeConfig.appBasePath || '').trim().replace(/\/+$/, '');
const APP_LOGIN_PAGE_PATH = String(appRuntimeConfig.loginPagePath || '/login.html').trim() || '/login.html';

function buildAppPath(pathname) {
    const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
    if (!APP_BASE_PATH) return normalized;
    if (normalized === '/') return `${APP_BASE_PATH}/`;
    return `${APP_BASE_PATH}${normalized}`;
}

function runOptionalPageLoader(loaderName, pageId) {
    const loader = window[loaderName];
    if (typeof loader === 'function') return loader();

    // Never allow a missing optional asset to interrupt the entire Admin
    // application. This protects the Dashboard while a new web version is
    // propagating and gives an actionable recovery state for the requested page.
    const container = document.getElementById(`page-${pageId}`);
    if (container) {
        container.innerHTML = `<section class="module-unavailable-page"><div class="module-unavailable-page__icon">↻</div><span class="module-unavailable-page__eyebrow">ATUALIZAÇÃO DO PAINEL</span><h2>Esta tela está sendo atualizada.</h2><p>Recarregue a página em alguns segundos. As demais áreas do painel continuam disponíveis.</p><button class="btn-sm btn-primary" type="button" onclick="window.location.reload()">Recarregar página</button></section>`;
    }
}

function getDefaultPageId() {
    const user = getCurrentUser() || {};
    const attendanceEnabled = user.attendance_enabled !== false;
    const retailEnabled = typeof window.isRetailProfile === 'function' && window.isRetailProfile();
    const foodStoreEnabled = typeof window.isFoodStoreModuleEnabledForNavigation === 'function' && window.isFoodStoreModuleEnabledForNavigation(user);
    const deliveryEnabled = user.delivery_enabled === true;
    const appointmentsEnabled = typeof window.isAppointmentsModuleEnabledForNavigation === 'function' && window.isAppointmentsModuleEnabledForNavigation(user);

    // A tenant focused on products must open in the store operation, not in a
    // restaurant dashboard that is unavailable to it. The same principle makes
    // a Delivery-only account land directly on its dispatch queue.
    if (!attendanceEnabled && retailEnabled && canAccessPage('retailOverview')) {
        return 'retailOverview';
    }
    if (!attendanceEnabled && foodStoreEnabled && canAccessPage('foodOverview')) {
        return 'foodOverview';
    }
    if (!attendanceEnabled && deliveryEnabled && canAccessPage('delivery')) {
        return 'delivery';
    }
    if (!attendanceEnabled && appointmentsEnabled && canAccessPage('appointments')) {
        return 'appointments';
    }
    return Object.keys(pages).find((pageId) => canAccessPage(pageId)) || 'dashboard';
}

function applyNavigationPermissions() {
    document.querySelectorAll('.nav-item[data-page]').forEach((navItem) => {
        const pageId = navItem.dataset.page;
        navItem.style.display = canAccessPage(pageId) ? '' : 'none';
    });

    document.querySelectorAll('.nav-item[data-route-group]').forEach((navItem) => {
        const routeGroup = navItem.dataset.routeGroup;
        const pageId = navItem.dataset.page;
        // A link can belong both to a role group and to a module. It must pass
        // both checks; otherwise an eligible ADMIN could see Delivery merely
        // because its route group exists while the module is disabled.
        navItem.style.display = canAccessRouteGroup(routeGroup) && (!pageId || canAccessPage(pageId)) ? '' : 'none';
    });

    const btnExpediente = document.getElementById('btn-expediente');
    if (btnExpediente) {
        btnExpediente.style.display = canPerformAction('toggleTenantStatus') ? '' : 'none';
    }

    configureKdsNavigation();
    configureBusinessProfileNavigation();
    collapseEmptyNavigationSections();
    refreshModuleStatusIndicators();
}

function configureBusinessProfileNavigation() {
    const user = getCurrentUser() || {};
    const retail = typeof window.isRetailProfile === 'function' && window.isRetailProfile() && user.retail_enabled === true;
    const attendance = user.attendance_enabled !== false;
    const foodStore = typeof window.isFoodStoreModuleEnabledForNavigation === 'function' && window.isFoodStoreModuleEnabledForNavigation(user);
    const standaloneRetail = retail && !attendance;
    document.body.classList.toggle('is-retail-profile', standaloneRetail);
    document.querySelectorAll('[data-business-profile]').forEach((item) => {
        const target = item.dataset.businessProfile;
        const profileMatches = target === 'retail' ? retail : target === 'food-store' ? foodStore : attendance;
        const pageId = item.dataset.page;
        // Profile labels define the visual context, but access is always driven
        // by the enabled module. Without this second check, a market profile
        // could re-show Retail links after the module had been disabled.
        const pageAllowed = !pageId || canAccessPage(pageId);
        item.style.display = profileMatches && pageAllowed ? '' : 'none';
    });

    const establishmentLabel = document.getElementById('nav-establishment-label');
    if (establishmentLabel) establishmentLabel.textContent = standaloneRetail ? 'Meu estabelecimento' : 'Meu Restaurante';
    const logoIcon = document.querySelector('.logo-icon');
    if (logoIcon) logoIcon.textContent = standaloneRetail ? '▦' : '🍽';
}

function getModuleStatusModel() {
    const user = getCurrentUser() || {};
    return {
        tenantName: String(user.tenant_name || 'esta conta').trim(),
        attendanceEnabled: user.attendance_enabled !== false,
        foodStoreEnabled: typeof window.isFoodStoreModuleEnabledForNavigation === 'function' && window.isFoodStoreModuleEnabledForNavigation(user),
        deliveryEnabled: user.delivery_enabled === true,
        retailEnabled: user.retail_enabled === true,
        appointmentsEnabled: typeof window.isAppointmentsModuleEnabledForNavigation === 'function' && window.isAppointmentsModuleEnabledForNavigation(user),
    };
}

function renderModuleStatusSidebar() {
    const status = getModuleStatusModel();
    const activeModules = [
        ['⚡', 'Atendimento presencial', status.attendanceEnabled],
        ['◷', 'Agenda & Serviços', status.appointmentsEnabled],
        ['🍔', 'Venda de comidas', status.foodStoreEnabled],
        ['▦', 'Venda de produtos', status.retailEnabled],
        ['🚚', 'Delivery', status.deliveryEnabled],
    ].filter(([, , enabled]) => enabled);
    if (!activeModules.length) return '';
    return `<div class="module-status-panel"><div class="module-status-panel__title">Módulos ativos</div>${activeModules.map(([icon, label]) => `<div class="module-status-item module-status-item--on"><span><i aria-hidden="true">${icon}</i>${label}</span><strong>Ativo</strong></div>`).join('')}</div>`;
}

function renderModuleStatusDashboard() {
    // A conta deve enxergar somente o que contratou. O Super Admin controla
    // ativações; avisos de módulos indisponíveis não fazem parte da operação
    // diária do tenant.
    return '';
}

function refreshModuleStatusIndicators() {
    const sidebar = document.getElementById('sidebar-module-status');
    if (sidebar) {
        const content = renderModuleStatusSidebar();
        sidebar.innerHTML = content;
        sidebar.hidden = !content;
    }
    const dashboard = document.getElementById('dashboard-module-status');
    if (dashboard) {
        const content = renderModuleStatusDashboard();
        dashboard.innerHTML = content;
        dashboard.hidden = !content;
    }
}

function collapseEmptyNavigationSections() {
    document.querySelectorAll('.nav-section').forEach((section) => {
        const visibleItems = Array.from(section.querySelectorAll('.nav-item'))
            .filter((item) => item.style.display !== 'none');
        section.style.display = visibleItems.length > 0 ? '' : 'none';
    });
}

function configureKdsNavigation() {
    const kdsLink = document.getElementById('nav-kds-link');
    const kdsIcon = document.getElementById('nav-kds-icon');
    const kdsLabel = document.getElementById('nav-kds-label');
    const atendimentoLink = document.querySelector('.nav-item[data-route-group="floor_operations"]');
    if (!kdsLink || !kdsIcon || !kdsLabel) return;

    const role = getCurrentUserRole();

    const attendanceEnabled = getCurrentUser()?.attendance_enabled !== false;
    if (!attendanceEnabled || !['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR'].includes(role)) {
        kdsLink.style.display = 'none';
        if (atendimentoLink) {
            atendimentoLink.style.display = 'none';
        }
        return;
    }

    if (role === 'BAR') {
        kdsLink.style.display = '';
        kdsLink.href = buildAppPath('/kds.html?panel=bar');
        if (atendimentoLink) {
            atendimentoLink.href = buildAppPath('/kds.html?panel=salao');
        }
        kdsIcon.textContent = '🍹';
        kdsLabel.textContent = 'KDS (Bar)';
        return;
    }

    if (role === 'KITCHEN') {
        kdsLink.style.display = '';
        kdsLink.href = buildAppPath('/kds.html?panel=kitchen');
        if (atendimentoLink) {
            atendimentoLink.href = buildAppPath('/kds.html?panel=salao');
        }
        kdsIcon.textContent = '🍳';
        kdsLabel.textContent = 'KDS (Cozinha)';
        return;
    }

    kdsLink.style.display = '';
    kdsLink.href = buildAppPath('/kds.html');
    if (atendimentoLink) {
        atendimentoLink.href = buildAppPath('/kds.html?panel=salao');
    }
    kdsIcon.textContent = '🍳';
    kdsLabel.textContent = 'KDS (Operação)';
}

function navigate(pageId, options = {}) {
    const consultationRequested = pageId === 'consultaComanda';
    const requestedPageId = consultationRequested ? 'comandas' : (pages[pageId] ? pageId : getDefaultPageId());
    let authorizedPageId = requestedPageId;

    if (!canAccessPage(authorizedPageId)) {
        authorizedPageId = getDefaultPageId();
        if (!options.silent) {
            showToast('Seu perfil nao possui acesso a esta tela.', 'error');
        }
    }

    const page = pages[authorizedPageId];
    if (!page) return;

    if (authorizedPageId !== 'delivery' && typeof window.destroyDeliveryPage === 'function') {
        window.destroyDeliveryPage();
    }
    if (authorizedPageId !== 'fleet' && typeof window.destroyFleetPage === 'function') {
        window.destroyFleetPage();
    }
    if (authorizedPageId !== 'retailPicking' && typeof window.destroyRetailPickingPage === 'function') {
        window.destroyRetailPickingPage();
    }

    if (typeof window.stopConsultaScanner === 'function') {
        window.stopConsultaScanner().catch(() => {});
    }

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + authorizedPageId);
    if (el) el.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page?.nav || authorizedPageId}"]`);
    if (navItem) navItem.classList.add('active');

    // Update topbar
    document.getElementById('page-title').textContent = page.title;
    document.getElementById('page-sub').textContent = page.sub;
    const attendancePages = ['comandas', 'mesas'];
    if (attendancePages.includes(authorizedPageId) && getCurrentUser()?.attendance_enabled === false) {
        const tenantName = String(getCurrentUser()?.tenant_name || 'esta conta').trim();
        const subject = encodeURIComponent(`Ativar Atendimento - ${tenantName}`);
        if (el) {
            el.innerHTML = `<section class="module-unavailable-page module-unavailable-page--attendance">
                <div class="module-unavailable-page__icon">⚡</div>
                <span class="module-unavailable-page__eyebrow">OPERAÇÃO PRESENCIAL</span>
                <h2>Atendimento não está disponível para esta conta.</h2>
                <p>Ative o módulo para usar mesas, comandas, chamados de garçom e o KDS Salão em uma experiência mais ágil.</p>
                <div class="module-unavailable-page__features"><span>🪑 Mesas</span><span>🔖 Comandas</span><span>⚡ KDS Salão</span></div>
                <a href="mailto:suporte@clickgarcom.com.br?subject=${subject}">Fale com a gente para ativar</a>
            </section>`;
        }
        return;
    }
    page.loader();

    if (consultationRequested) {
        window.setTimeout(() => window.openComandaConsultation?.(options.code), 0);
    }
}

function openChangePasswordModal() {
    openModal(`
        <div class="modal-header">
            <h3>Trocar senha</h3>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div style="margin-bottom:16px; padding:14px 16px; border-radius:12px; background:rgba(26,188,156,0.08); border:1px solid rgba(26,188,156,0.18); color:var(--text-primary, #1f2937);">
                Atualize sua senha de acesso sem depender do suporte. A senha nova precisa ter pelo menos 6 caracteres.
            </div>
            <div class="form-group">
                <label for="change-password-current">Senha atual</label>
                <input id="change-password-current" type="password" autocomplete="current-password" />
            </div>
            <div class="form-row-2">
                <div class="form-group">
                    <label for="change-password-next">Nova senha</label>
                    <input id="change-password-next" type="password" autocomplete="new-password" />
                </div>
                <div class="form-group">
                    <label for="change-password-confirm">Confirmar nova senha</label>
                    <input id="change-password-confirm" type="password" autocomplete="new-password" />
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn-sm btn-primary" id="btn-change-password-save" onclick="submitOwnPasswordChange()">Salvar nova senha</button>
        </div>
    `);
}

async function submitOwnPasswordChange() {
    const currentPassword = document.getElementById('change-password-current')?.value || '';
    const newPassword = document.getElementById('change-password-next')?.value || '';
    const confirmPassword = document.getElementById('change-password-confirm')?.value || '';
    const btnSave = document.getElementById('btn-change-password-save');

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Preencha todos os campos da senha.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('A confirmacao da senha nao confere.', 'error');
        return;
    }

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    }

    try {
        await api.patch('/auth/password', {
            currentPassword,
            newPassword,
        });
        closeModal();
        showToast('Senha atualizada com sucesso.', 'success');
    } catch (err) {
        showToast(err.message || 'Erro ao trocar a senha.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Salvar nova senha';
        }
    }
}

// Modal helpers
let modalPreviousFocus = null;

function openModal(html, options) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    modalPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.className = 'modal';
    if (options && options.size === 'lg') {
        modal.classList.add('modal--lg');
    }
    modal.innerHTML = html;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', modal.querySelector('h3')?.textContent?.trim() || 'Janela de operação');
    modal.setAttribute('tabindex', '-1');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    const initialFocus = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (initialFocus || modal).focus({ preventScroll: true });
}

function closeModal() {
    if (typeof window.stopConsultaScanner === 'function') {
        window.stopConsultaScanner().catch(() => {});
    }
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    // Remove dados sensíveis e tokens de uso único assim que a janela fecha.
    // A próxima abertura sempre reconstrói o conteúdo do modal.
    const modal = document.getElementById('modal-content');
    if (modal) modal.replaceChildren();
    const previousFocus = modalPreviousFocus;
    modalPreviousFocus = null;
    if (previousFocus && document.contains(previousFocus) && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
}

// Standard action dialogs. They use a dedicated overlay so confirmations can
// be displayed over an operation modal without discarding the form beneath it.
let appDialogState = null;
let appDialogPreviousFocus = null;
let appDialogUnderlyingAriaHidden = null;

function appDialogEscape(value) {
    return escapeHTML(String(value ?? ''));
}

function appDialogIcon(variant) {
    if (variant === 'danger') return '!';
    if (variant === 'warning') return '!';
    if (variant === 'success') return '✓';
    return 'i';
}

function openAppDialog(html, options = {}) {
    const modal = document.getElementById('app-dialog-content');
    const overlay = document.getElementById('app-dialog-overlay');
    if (!modal || !overlay) return false;

    if (appDialogState) {
        const previous = appDialogState;
        appDialogState = null;
        previous.resolve(previous.cancelValue);
    }

    appDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const operationModal = document.getElementById('modal-content');
    if (document.getElementById('modal-overlay')?.classList.contains('active') && operationModal) {
        appDialogUnderlyingAriaHidden = operationModal.getAttribute('aria-hidden');
        operationModal.setAttribute('aria-hidden', 'true');
    } else {
        appDialogUnderlyingAriaHidden = null;
    }
    modal.innerHTML = html;
    modal.setAttribute('role', options.role || 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', options.title || modal.querySelector('h3')?.textContent?.trim() || 'Confirmação');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    return true;
}

function closeAppDialog() {
    const overlay = document.getElementById('app-dialog-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    const pending = appDialogState;
    appDialogState = null;
    if (pending) pending.resolve(pending.cancelValue);

    const operationModal = document.getElementById('modal-content');
    if (operationModal) {
        if (appDialogUnderlyingAriaHidden === null) operationModal.removeAttribute('aria-hidden');
        else operationModal.setAttribute('aria-hidden', appDialogUnderlyingAriaHidden);
    }
    appDialogUnderlyingAriaHidden = null;

    const previousFocus = appDialogPreviousFocus;
    appDialogPreviousFocus = null;
    if (previousFocus && document.contains(previousFocus) && previousFocus.getClientRects().length) {
        previousFocus.focus({ preventScroll: true });
    }
}

function finishAppDialog(value) {
    const pending = appDialogState;
    appDialogState = null;
    closeAppDialog();
    if (pending) pending.resolve(value);
}

function appDialogMarkup(options, fieldHtml = '') {
    const variant = ['danger', 'warning', 'success'].includes(options.variant) ? options.variant : 'info';
    const iconClass = variant === 'info' || variant === 'success' ? '' : ` app-dialog__icon--${variant}`;
    const confirmClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';
    const cancelButton = options.cancelLabel
        ? `<button type="button" class="btn-sm btn-outline" id="app-dialog-cancel">${appDialogEscape(options.cancelLabel)}</button>`
        : '';
    return `
        <div class="modal-header">
            <div>
                <h3>${appDialogEscape(options.title || 'Confirmação')}</h3>
                ${options.subtitle ? `<div class="modal-header-subtitle">${appDialogEscape(options.subtitle)}</div>` : ''}
            </div>
            <button type="button" class="modal-close" id="app-dialog-close" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body app-dialog__body">
            <div class="app-dialog__icon${iconClass}" aria-hidden="true">${appDialogIcon(variant)}</div>
            <div class="app-dialog__content">
                <p class="app-dialog__message">${appDialogEscape(options.message || '')}</p>
                ${options.detail ? `<p class="app-dialog__detail">${appDialogEscape(options.detail)}</p>` : ''}
            </div>
            ${fieldHtml}
        </div>
        <div class="modal-footer">
            ${cancelButton}
            <button type="button" class="btn-sm ${confirmClass}" id="app-dialog-confirm">${appDialogEscape(options.confirmLabel || 'Confirmar')}</button>
        </div>`;
}

function showConfirmDialog(options = {}) {
    return new Promise((resolve) => {
        const normalized = {
            title: 'Confirmar ação',
            message: 'Deseja continuar?',
            confirmLabel: 'Confirmar',
            cancelLabel: 'Cancelar',
            ...options,
        };
        if (!openAppDialog(appDialogMarkup(normalized), normalized)) {
            resolve(false);
            return;
        }
        appDialogState = { resolve, cancelValue: false };
        document.getElementById('app-dialog-confirm')?.addEventListener('click', () => finishAppDialog(true));
        document.getElementById('app-dialog-cancel')?.addEventListener('click', () => finishAppDialog(false));
        document.getElementById('app-dialog-close')?.addEventListener('click', closeAppDialog);
        document.getElementById('app-dialog-cancel')?.focus({ preventScroll: true });
    });
}

function showPromptDialog(options = {}) {
    return new Promise((resolve) => {
        const normalized = {
            title: 'Informação necessária',
            message: 'Preencha o campo para continuar.',
            inputLabel: 'Informação',
            confirmLabel: 'Continuar',
            cancelLabel: 'Cancelar',
            multiline: true,
            maxLength: 500,
            ...options,
        };
        const fieldControl = normalized.multiline
            ? `<textarea id="app-dialog-input" maxlength="${Number(normalized.maxLength) || 500}" placeholder="${appDialogEscape(normalized.placeholder || '')}">${appDialogEscape(normalized.defaultValue || '')}</textarea>`
            : `<input id="app-dialog-input" type="${appDialogEscape(normalized.inputType || 'text')}" maxlength="${Number(normalized.maxLength) || 500}" placeholder="${appDialogEscape(normalized.placeholder || '')}" value="${appDialogEscape(normalized.defaultValue || '')}">`;
        const fieldHtml = `<div class="app-dialog__field"><label for="app-dialog-input">${appDialogEscape(normalized.inputLabel)}</label>${fieldControl}</div>`;
        if (!openAppDialog(appDialogMarkup(normalized, fieldHtml), normalized)) {
            resolve(null);
            return;
        }
        appDialogState = { resolve, cancelValue: null };
        const input = document.getElementById('app-dialog-input');
        const submit = () => {
            const value = String(input?.value || '').trim();
            if (normalized.required && !value) {
                input?.focus();
                showToast(normalized.requiredMessage || 'Preencha o campo para continuar.', 'error');
                return;
            }
            finishAppDialog(value);
        };
        document.getElementById('app-dialog-confirm')?.addEventListener('click', submit);
        document.getElementById('app-dialog-cancel')?.addEventListener('click', () => finishAppDialog(null));
        document.getElementById('app-dialog-close')?.addEventListener('click', closeAppDialog);
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (!normalized.multiline || event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
            }
        });
        input?.focus({ preventScroll: true });
    });
}

function showMessageDialog(options = {}) {
    return new Promise((resolve) => {
        const normalized = {
            title: 'Aviso',
            confirmLabel: 'Entendi',
            cancelLabel: '',
            ...options,
        };
        if (!openAppDialog(appDialogMarkup(normalized), normalized)) {
            resolve();
            return;
        }
        appDialogState = { resolve, cancelValue: undefined };
        document.getElementById('app-dialog-confirm')?.addEventListener('click', () => finishAppDialog());
        document.getElementById('app-dialog-close')?.addEventListener('click', closeAppDialog);
        document.getElementById('app-dialog-confirm')?.focus({ preventScroll: true });
    });
}

function showCopyDialog(options = {}) {
    return new Promise((resolve) => {
        const normalized = {
            title: 'Copiar conteúdo',
            message: 'Selecione e copie o conteúdo abaixo.',
            confirmLabel: 'Copiar',
            cancelLabel: 'Fechar',
            ...options,
        };
        const fieldHtml = `<div class="app-dialog__field"><label for="app-dialog-copy">${appDialogEscape(normalized.inputLabel || 'Conteúdo')}</label><input class="app-dialog__copy-input" id="app-dialog-copy" readonly value="${appDialogEscape(normalized.value || '')}"></div>`;
        if (!openAppDialog(appDialogMarkup(normalized, fieldHtml), normalized)) {
            resolve(false);
            return;
        }
        appDialogState = { resolve, cancelValue: false };
        const input = document.getElementById('app-dialog-copy');
        document.getElementById('app-dialog-confirm')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(String(normalized.value || ''));
                showToast(normalized.successMessage || 'Conteúdo copiado.', 'success');
                finishAppDialog(true);
            } catch (_) {
                input?.focus();
                input?.select();
                showToast('Use Ctrl+C ou ⌘C para copiar o conteúdo selecionado.', 'error');
            }
        });
        document.getElementById('app-dialog-cancel')?.addEventListener('click', () => finishAppDialog(false));
        document.getElementById('app-dialog-close')?.addEventListener('click', closeAppDialog);
        input?.focus({ preventScroll: true });
        input?.select();
    });
}

window.showConfirmDialog = showConfirmDialog;
window.showPromptDialog = showPromptDialog;
window.showMessageDialog = showMessageDialog;
window.showCopyDialog = showCopyDialog;
window.closeAppDialog = closeAppDialog;

function logout() {
    localStorage.removeItem('clickgarcom_auth');
    sessionStorage.removeItem('clickgarcom_auth');
    window.location.href = APP_LOGIN_PAGE_PATH;
}

// Expediente timer interval
let _expedienteTimerInterval = null;

function formatElapsedTime(isoDate) {
    if (!isoDate) return '';
    const diff = Date.now() - new Date(isoDate).getTime();
    if (diff < 0) return '';
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hours > 0) return `${hours}h${remainMins > 0 ? String(remainMins).padStart(2, '0') + 'min' : ''}`;
    return `${mins}min`;
}

function setExpedienteButtonState(isOpen, openedAt, openedBy) {
    window.isExpedienteAberto = isOpen;
    window.expedienteOpenedAt = openedAt || null;
    window.expedienteOpenedBy = openedBy || null;

    // Clear previous timer
    if (_expedienteTimerInterval) {
        clearInterval(_expedienteTimerInterval);
        _expedienteTimerInterval = null;
    }

    const btnExpediente = document.getElementById('btn-expediente');
    if (!btnExpediente) return;

    function render() {
        if (window.isExpedienteAberto) {
            const elapsed = formatElapsedTime(window.expedienteOpenedAt);
            const byText = window.expedienteOpenedBy ? `por ${window.expedienteOpenedBy}` : '';
            const detail = (elapsed || byText)
                ? `<span style="font-size:10px;color:var(--muted);display:block;margin-top:2px;line-height:1.2;">${elapsed ? '⏱ ' + elapsed : ''}${elapsed && byText ? ' · ' : ''}${byText}</span>`
                : '';
            btnExpediente.classList.add('active');
            btnExpediente.innerHTML = `<span class="nav-icon">🟢</span><div>Aberto${detail}</div>`;
        } else {
            btnExpediente.classList.remove('active');
            btnExpediente.innerHTML = '<span class="nav-icon">🔴</span> Fechado';
        }
    }

    render();

    if (isOpen && openedAt) {
        _expedienteTimerInterval = setInterval(render, 30000);
    }
}

window.setExpedienteButtonState = setExpedienteButtonState;

window.confirmAndToggleExpediente = function() {
    if (!canPerformAction('toggleTenantStatus')) {
        showToast('Seu perfil não pode alterar o expediente.', 'error');
        return;
    }

    const nextState = !window.isExpedienteAberto;
    const title = nextState ? 'Abrir Expediente?' : 'Fechar Expediente?';
    const message = nextState 
        ? 'Tem certeza que deseja abrir o expediente?<br><br>A partir dessa ativação, será permitido o recebimento de pedidos, alocação de mesas e solicitações de serviços.'
        : 'Tem certeza que deseja fechar o restaurante?<br><br>Novos pedidos e alocações de mesas serão bloqueados. Clientes com comandas abertas ainda poderão finalizá-las.';

    openModal(`
        <div class="modal-header">
            <h3>${title}</h3>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size: 15px; color: var(--text); line-height: 1.5; margin-bottom: 10px;">
                ${message}
            </p>
            ${nextState ? `
                <label for="expediente-service-mode" style="display:block; font-size:13px; font-weight:700; margin-top:16px; margin-bottom:7px;">Modo de atendimento desta abertura</label>
                <select id="expediente-service-mode" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:9px;">
                    <option value="COM_MESA" ${getCurrentUser()?.service_mode !== 'SEM_MESA' ? 'selected' : ''}>Com mesa obrigatória</option>
                    <option value="SEM_MESA" ${getCurrentUser()?.service_mode === 'SEM_MESA' ? 'selected' : ''}>Pedido sem mesa</option>
                </select>
            ` : ''}
        </div>
        <div class="modal-footer">
            <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn-sm ${nextState ? 'btn-primary' : 'btn-danger'}" id="btn-confirm-expediente" onclick="executeToggleExpediente(${nextState})">
                ${nextState ? 'Sim, Abrir Expediente' : 'Sim, Fechar Expediente'}
            </button>
        </div>
    `);
};

window.executeToggleExpediente = async function(nextState) {
    const btn = document.getElementById('btn-confirm-expediente');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    }

    try {
        const payload = { is_open: nextState };
        if (nextState) payload.service_mode = document.getElementById('expediente-service-mode')?.value || 'COM_MESA';
        const res = await api.patch('/auth/status', payload);
        setAuthSessionUser({ service_mode: res.service_mode || payload.service_mode || 'COM_MESA' });
        setExpedienteButtonState(!!res.is_open, res.opened_at, res.opened_by);
        
        if (typeof window.updateDashboardExpediente === 'function') {
            window.updateDashboardExpediente();
        }
        if (typeof window.updateConfiguracoesExpediente === 'function') {
            window.updateConfiguracoesExpediente();
        }

        showToast(res.is_open ? 'Expediente Aberto!' : 'Expediente Fechado!', res.is_open ? 'success' : 'error');
        closeModal();
    } catch (err) {
        showToast(err.message || 'Falha ao alterar expediente', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = nextState ? 'Sim, Abrir Expediente' : 'Sim, Fechar Expediente';
        }
    }
};

window.openRestaurantProfileModal = function(user, initials) {
    const drawer = document.getElementById('profile-drawer-content');
    const overlay = document.getElementById('profile-drawer-overlay');
    if (!drawer || !overlay) return;

    const normalizedRole = typeof normalizeTenantUserRole === 'function'
        ? normalizeTenantUserRole(user.role)
        : String(user.role || '').trim().toUpperCase();
    const showBillingInfo = !['WAITER', 'KITCHEN', 'BAR', 'CASHIER'].includes(normalizedRole);
    const planLabel = user.billing_plan === 'pre_paid' ? 'Pré-pago' : 'Pós-pago';
    const planDesc = user.billing_plan === 'pre_paid' ? 'Recarga de créditos' : 'Faturamento mensal';
    const roleLabel = {
        ADMIN: 'Administrador',
        MANAGER: 'Gerente',
        WAITER: 'Garçom',
        KITCHEN: 'Cozinha',
        BAR: 'Bar',
        CASHIER: 'Caixa',
    }[normalizedRole] || user.role;

    drawer.innerHTML = `
        <!-- Cover -->
        <div style="background: linear-gradient(135deg, var(--teal), var(--accent-blue)); min-height: 160px; position: relative; overflow: hidden; flex-shrink: 0;">
            <div style="position: absolute; width: 200px; height: 200px; background: rgba(255,255,255,0.08); border-radius: 50%; top: -60px; right: -40px;"></div>
            <div style="position: absolute; width: 120px; height: 120px; background: rgba(255,255,255,0.06); border-radius: 50%; bottom: -30px; left: 30px;"></div>
            <button onclick="closeProfileDrawer()" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(255,255,255,0.15); color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: background 0.2s;">✕</button>
        </div>

        <!-- Avatar + Name -->
        <div style="margin-top: -48px; padding: 0 28px 20px; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; z-index: 1;">
            <div style="width: 96px; height: 96px; background: linear-gradient(135deg, var(--teal), var(--accent-purple)); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 800; color: white; border: 5px solid var(--card-bg); box-shadow: 0 6px 20px rgba(0,0,0,0.15);">
                ${initials}
            </div>
            <h2 style="font-size: 22px; font-weight: 800; color: var(--dark); margin: 16px 0 6px;">${user.tenant_name || 'Restaurante'}</h2>
            <div style="font-size: 13px; font-weight: 600; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; background: var(--bg); border-radius: 20px; padding: 5px 14px; border: 1px solid var(--border);">
                👤 ${user.name}
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 6px;">${user.email}</div>
        </div>

        <!-- Info Cards -->
        <div style="padding: 0 20px 28px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; transition: transform 0.15s; cursor: default;" onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform='translateX(0)'">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(26,188,156,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📄</div>
                <div style="min-width: 0;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px;">CPF / CNPJ</div>
                    <div style="font-size: 15px; font-weight: 700; color: var(--dark); margin-top: 2px;">${user.tenant_document || '<span style="color:var(--muted);font-weight:400;font-style:italic;">Não informado</span>'}</div>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; transition: transform 0.15s; cursor: default;" onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform='translateX(0)'">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(249,115,22,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📍</div>
                <div style="min-width: 0;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px;">Endereço</div>
                    <div style="font-size: 15px; font-weight: 700; color: var(--dark); margin-top: 2px;">${user.tenant_address || '<span style="color:var(--muted);font-weight:400;font-style:italic;">Não informado</span>'}</div>
                </div>
            </div>

            ${showBillingInfo ? `
            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; transition: transform 0.15s; cursor: default;" onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform='translateX(0)'">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(139,92,246,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">💳</div>
                <div style="min-width: 0;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px;">Plano</div>
                    <div style="font-size: 15px; font-weight: 700; color: var(--dark); margin-top: 2px; display: flex; align-items: center; gap: 8px;">
                        ${planLabel}
                        <span class="status-pill status-done" style="font-size: 10px;">Ativo</span>
                    </div>
                    <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">${planDesc}</div>
                </div>
            </div>
            ` : ''}

            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; transition: transform 0.15s; cursor: default;" onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform='translateX(0)'">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(59,130,246,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">🔑</div>
                <div style="min-width: 0;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px;">Perfil de Acesso</div>
                    <div style="font-size: 15px; font-weight: 700; color: var(--dark); margin-top: 2px;">${roleLabel}</div>
                </div>
            </div>
        </div>
    `;

    overlay.classList.remove('active');
    // Force browser to paint the initial (off-screen) state before animating in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    });
};

window.closeProfileDrawer = function() {
    const overlay = document.getElementById('profile-drawer-overlay');
    if (overlay) overlay.classList.remove('active');
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    applyNavigationPermissions();

    // Nav click handlers
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Close modal on overlay click
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('app-dialog-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAppDialog();
    });

    // Close profile drawer on overlay click
    document.getElementById('profile-drawer-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProfileDrawer();
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('app-dialog-overlay')?.classList.contains('active')) {
                closeAppDialog();
                return;
            }
            closeModal();
            closeProfileDrawer();
        }
    });

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }

    const btnPassword = document.getElementById('btn-password');
    if (btnPassword) {
        btnPassword.addEventListener('click', openChangePasswordModal);
    }

    // Inject User Data
    try {
        const session = JSON.parse(localStorage.getItem('clickgarcom_auth') || sessionStorage.getItem('clickgarcom_auth') || '{}');
        if (session && session.user) {
            const logoText = document.querySelector('.logo-text');
            if (logoText) logoText.textContent = session.user.tenant_name || 'Restaurante';

            const initials = session.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const avatar = document.querySelector('.avatar');
            if (avatar) {
                avatar.textContent = initials;
                avatar.style.cursor = 'pointer';
                avatar.title = 'Ver Perfil';
                avatar.addEventListener('click', () => openRestaurantProfileModal(session.user, initials));
            }
        }
    } catch (e) { console.error('Error injecting user data:', e); }

    // Load Expediente Event Listener
    const btnExpediente = document.getElementById('btn-expediente');
    if (btnExpediente) {
        btnExpediente.addEventListener('click', () => {
            if (window.confirmAndToggleExpediente) {
                window.confirmAndToggleExpediente();
            }
        });

        // Load initial status from API /auth/me
        api.get('/auth/me').then(user => {
            setAuthSessionUser(user);
            setExpedienteButtonState(!!user.isOpen, user.opened_at, user.opened_by);
            applyNavigationPermissions();
            refreshModuleStatusIndicators();
        }).catch(err => console.error(err));
    }

    // Load dashboard
    navigate(getDefaultPageId(), { silent: true });
});
