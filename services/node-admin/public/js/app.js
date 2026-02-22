// ClickGarçom Admin — App Router
const pages = {
    dashboard: { title: 'Dashboard', sub: 'Visão geral do seu restaurante hoje', loader: loadDashboard },
    pedidos: { title: 'Pedidos', sub: 'Fila de pedidos recebidos', loader: loadPedidos },
    cardapio: { title: 'Cardápio', sub: 'Gerencie os itens do seu menu', loader: loadCardapio },
    categorias: { title: 'Categorias', sub: 'Organize o cardápio em categorias', loader: loadCategorias },
    mesas: { title: 'Mesas & Comandas', sub: 'Gerencie as mesas e comandas do restaurante', loader: loadMesas },
    vendas: { title: 'Vendas', sub: 'Relatório completo de vendas', loader: loadVendas },
};

function navigate(pageId) {
    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + pageId);
    if (el) el.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');

    // Update topbar
    const page = pages[pageId];
    if (page) {
        document.getElementById('page-title').textContent = page.title;
        document.getElementById('page-sub').textContent = page.sub;
        page.loader();
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

// Init
document.addEventListener('DOMContentLoaded', () => {
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
            try {
                const res = await api.patch('/auth/status', { currentStatus: isOpen });
                if (res.is_open) {
                    btnExpediente.classList.add('active');
                    btnExpediente.innerHTML = '<span class="nav-icon">🟢</span> Aberto';
                    showToast('Expediente Aberto!', 'success');
                } else {
                    btnExpediente.classList.remove('active');
                    btnExpediente.innerHTML = '<span class="nav-icon">🔴</span> Fechado';
                    showToast('Expediente Fechado!', 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Load initial status (To be fetched, currently hardcoded to closed initially)
        api.get('/auth/me').then(user => {
            // Se o user object em /me retornasse tenant.isOpen, setariamos aqui.
            // Por enquanto, apenas atualizamos o texto para fechar o loading
            btnExpediente.innerHTML = '<span class="nav-icon">🔴</span> Fechado';
        }).catch(err => console.error(err));
    }

    // Load dashboard
    navigate('dashboard');
});
