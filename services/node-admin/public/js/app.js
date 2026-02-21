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

    // Load dashboard
    navigate('dashboard');
});
