// ClickGarçom Admin — App Router
const pages = {
    dashboard: { title: 'Dashboard', sub: 'Visão geral do seu restaurante hoje', loader: loadDashboard },
    wallet: { title: 'Carteira & Assinatura', sub: 'Faturamento e recarga de créditos TaaS', loader: loadWallet },
    extratoMensagens: {
        title: 'Extrato de Mensagens',
        sub: 'Cada linha representa uma mensagem contabilizada no consumo do WhatsApp',
        loader: loadExtratoMensagens,
    },
    pedidos: { title: 'Pedidos', sub: 'Fila de pedidos recebidos', loader: loadPedidos },
    cardapio: { title: 'Cardápio', sub: 'Gerencie os itens do seu menu', loader: loadCardapio },
    categorias: { title: 'Categorias', sub: 'Organize o cardápio em categorias', loader: loadCategorias },
    mesas: { title: 'Mesas & Comandas', sub: 'Gerencie as mesas e comandas do restaurante', loader: loadMesas },
    pagamentos: { title: 'Pagamentos & Conciliação', sub: 'Acompanhe pagamentos, divergências e baixas operacionais', loader: loadPagamentos },
    vendas: { title: 'Vendas', sub: 'Relatório completo de vendas', loader: loadVendas },
    meuRestaurante: { title: 'Meu Restaurante', sub: 'Gerencie os dados cadastrais do seu estabelecimento', loader: loadMeuRestaurante },
    equipe: { title: 'Equipe & Acessos', sub: 'Gerencie usuários internos, papéis e credenciais de acesso', loader: loadEquipePage },
    configuracoes: { title: 'Configurações de Mensagens', sub: 'Personalize as mensagens do bot', loader: loadConfiguracoesPage },
};

function getDefaultPageId() {
    return Object.keys(pages).find((pageId) => canAccessPage(pageId)) || 'dashboard';
}

function applyNavigationPermissions() {
    document.querySelectorAll('.nav-item[data-page]').forEach((navItem) => {
        const pageId = navItem.dataset.page;
        navItem.style.display = canAccessPage(pageId) ? '' : 'none';
    });

    document.querySelectorAll('.nav-item[data-route-group]').forEach((navItem) => {
        const routeGroup = navItem.dataset.routeGroup;
        navItem.style.display = canAccessRouteGroup(routeGroup) ? '' : 'none';
    });

    const btnExpediente = document.getElementById('btn-expediente');
    if (btnExpediente) {
        btnExpediente.style.display = canPerformAction('toggleTenantStatus') ? '' : 'none';
    }
}

function navigate(pageId, options = {}) {
    const requestedPageId = pages[pageId] ? pageId : getDefaultPageId();
    let authorizedPageId = requestedPageId;

    if (!canAccessPage(authorizedPageId)) {
        authorizedPageId = getDefaultPageId();
        if (!options.silent) {
            showToast('Seu perfil nao possui acesso a esta tela.', 'error');
        }
    }

    const page = pages[authorizedPageId];
    if (!page) return;

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
    page.loader();
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
function openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

function logout() {
    localStorage.removeItem('clickgarcom_auth');
    sessionStorage.removeItem('clickgarcom_auth');
    window.location.href = '/login.html';
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
        const res = await api.patch('/auth/status', { is_open: nextState });
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

    const planLabel = user.billing_plan === 'pre_paid' ? 'Pré-pago' : 'Pós-pago';
    const planDesc = user.billing_plan === 'pre_paid' ? 'Recarga de créditos' : 'Faturamento mensal';

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

            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; transition: transform 0.15s; cursor: default;" onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform='translateX(0)'">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(59,130,246,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">🔑</div>
                <div style="min-width: 0;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px;">Perfil de Acesso</div>
                    <div style="font-size: 15px; font-weight: 700; color: var(--dark); margin-top: 2px;">${user.role === 'admin' ? 'Administrador' : user.role === 'manager' ? 'Gerente' : user.role}</div>
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

    // Close profile drawer on overlay click
    document.getElementById('profile-drawer-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProfileDrawer();
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
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
        }).catch(err => console.error(err));
    }

    // Load dashboard
    navigate(getDefaultPageId(), { silent: true });
});
