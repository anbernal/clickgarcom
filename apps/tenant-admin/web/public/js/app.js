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
            if (avatar) avatar.textContent = initials;
        }
    } catch (e) { console.error('Error injecting user data:', e); }

    // Load Expediente Event Listener
    const btnExpediente = document.getElementById('btn-expediente');
    if (btnExpediente) {
        btnExpediente.addEventListener('click', async () => {
            const isOpen = btnExpediente.classList.contains('active');
            const nextState = !isOpen;
            try {
                const res = await api.patch('/auth/status', { is_open: nextState });
                setExpedienteButtonState(!!res.is_open);
                showToast(res.is_open ? 'Expediente Aberto!' : 'Expediente Fechado!', res.is_open ? 'success' : 'error');
            } catch (err) {
                showToast(err.message, 'error');
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
