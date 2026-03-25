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

function setExpedienteButtonState(isOpen) {
    window.isExpedienteAberto = isOpen;
    const btnExpediente = document.getElementById('btn-expediente');
    if (!btnExpediente) return;

    if (isOpen) {
        btnExpediente.classList.add('active');
        btnExpediente.innerHTML = '<span class="nav-icon">🟢</span> Aberto';
    } else {
        btnExpediente.classList.remove('active');
        btnExpediente.innerHTML = '<span class="nav-icon">🔴</span> Fechado';
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
        setExpedienteButtonState(!!res.is_open);
        
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
    openModal(`
        <div class="modal-header" style="border-bottom:none; padding-bottom: 0; z-index: 10; position: absolute; right: 0; background: transparent;">
            <button class="modal-close" style="color: white; background: rgba(0,0,0,0.2); border-radius: 50%;" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding: 0; overflow: hidden; position: relative;">
            <div style="background: linear-gradient(135deg, var(--teal), var(--accent-blue)); height: 140px; width: calc(100% + 48px); margin: -24px -24px 0 -24px; position: relative; overflow: hidden;">
                <div style="position: absolute; width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 50%; top: -50px; right: -50px;"></div>
                <div style="position: absolute; width: 100px; height: 100px; background: rgba(255,255,255,0.1); border-radius: 50%; bottom: -20px; left: 20px;"></div>
            </div>
            
            <div style="position: relative; margin-top: -50px; text-align: center; display: flex; flex-direction: column; align-items: center; padding-bottom: 24px;">
                <div style="width: 90px; height: 90px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; color: var(--teal); border: 5px solid var(--card-bg); box-shadow: 0 4px 14px rgba(0,0,0,0.12); margin-bottom: 14px; position: relative;">
                    ${initials}
                </div>
                <h2 style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px 0;">${user.tenant_name || 'Restaurante'}</h2>
                <div style="font-size: 14px; font-weight: 600; color: var(--text-light); display: inline-flex; align-items: center; gap: 6px; background: rgba(26,188,156,0.1); border-radius: 20px; padding: 4px 12px;">
                    <span style="color: var(--teal);">👤</span> ${user.name}
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 14px; padding-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; transition: all 0.2s;">
                    <div style="font-size: 22px; color: var(--teal); background: rgba(26,188,156,0.1); width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">📄</div>
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--text-light); margin-bottom: 4px; letter-spacing: 0.5px;">CNPJ / CPF do Restaurante</div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text);">${user.tenant_document || '<span style="color: var(--text-light); font-weight: 400; font-style: italic;">Não informado</span>'}</div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px;">
                    <div style="font-size: 22px; color: var(--accent-orange); background: rgba(243,156,18,0.1); width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">📍</div>
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--text-light); margin-bottom: 4px; letter-spacing: 0.5px;">Endereço Principal</div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text);">${user.tenant_address || '<span style="color: var(--text-light); font-weight: 400; font-style: italic;">Não informado</span>'}</div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px;">
                    <div style="font-size: 22px; color: var(--accent-purple); background: rgba(155,89,182,0.1); width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">💳</div>
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--text-light); margin-bottom: 4px; letter-spacing: 0.5px;">Plano de Assinatura</div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px;">
                            ${user.billing_plan === 'pre_paid' ? 'Pré-pago (Recarga)' : 'Pós-pago (Fatura)'}
                            <span class="status-pill status-done" style="font-size: 11px;">Ativo</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
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

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
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
            setExpedienteButtonState(!!user.isOpen);
            applyNavigationPermissions();
        }).catch(err => console.error(err));
    }

    // Load dashboard
    navigate(getDefaultPageId(), { silent: true });
});
