// Super Admin - Application Logic

/** 
 * Navigation
 */
function navigate(pageId) {
    document.querySelectorAll('.page').forEach(el => el.style.display = 'none');
    document.getElementById(`page-${pageId}`).style.display = 'block';

    document.querySelectorAll('.nav-link[data-page]').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-link[data-page="${pageId}"]`).classList.add('active');

    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'tenants') loadTenants();
}

/**
 * API Client (Mocked for layout stage, will connect to Go-Core later)
 */
const api = {
    async getMetrics() {
        return {
            totalTenants: 12,
            msgIn: 4528,
            msgOut: 5120,
            topTenants: [
                { name: 'Pizzaria do Zé', status: 'ACTIVE', in: 1200, out: 1400, total: 2600 },
                { name: 'Burguer Tech', status: 'ACTIVE', in: 800, out: 950, total: 1750 },
            ]
        };
    },
    async getTenants() {
        return [
            { id: '123e4567', name: 'Master Burguer', email: 'admin@mb.com', webhook: 'https://api.clickg.com/webhooks/whatsapp', wabaId: '10293049581', msgs: 420 },
            { id: '987fcbd2', name: 'Pizzaria Central', email: 'dono@pizzacentral.com', webhook: 'https://api.clickg.com/webhooks/whatsapp', wabaId: '49581029302', msgs: 1205 }
        ];
    }
}

/**
 * Loaders
 */
async function loadDashboard() {
    try {
        const metrics = await api.getMetrics();
        document.getElementById('dash-tenants').textContent = metrics.totalTenants;
        document.getElementById('dash-msg-in').textContent = metrics.msgIn.toLocaleString();
        document.getElementById('dash-msg-out').textContent = metrics.msgOut.toLocaleString();

        const tbody = document.querySelector('#top-tenants-table tbody');
        tbody.innerHTML = metrics.topTenants.map(t => `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge active">${t.status}</span></td>
                <td style="color:var(--metric-in)">${t.in.toLocaleString()}</td>
                <td style="color:var(--metric-out)">${t.out.toLocaleString()}</td>
                <td><strong>${t.total.toLocaleString()}</strong></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

async function loadTenants() {
    try {
        const tenants = await api.getTenants();
        const tbody = document.querySelector('#tenants-table tbody');
        tbody.innerHTML = tenants.map(t => `
            <tr>
                <td style="font-family:monospace; color:var(--text-muted)">${t.id.split('-')[0]}</td>
                <td><strong>${t.name}</strong><br><small style="color:var(--text-muted)">ID: ${t.wabaId}</small></td>
                <td>${t.email}</td>
                <td style="font-family:monospace; font-size:12px; color:var(--primary)">${t.webhook}</td>
                <td>${t.msgs} msgs</td>
                <td>
                    <button class="btn" style="padding:6px 12px; background:var(--border)">Editar</button>
                    <button class="btn" style="padding:6px 12px; background:rgba(239, 68, 68, 0.2); color:var(--danger)">Pausar</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

/**
 * Modals
 */
function openTenantModal() {
    document.getElementById('tenant-form').reset();
    document.getElementById('tm-id').value = '';
    document.getElementById('tenant-modal').classList.add('active');
}

function closeTenantModal() {
    document.getElementById('tenant-modal').classList.remove('active');
}

async function saveTenant(e) {
    e.preventDefault();
    alert("Criação de Tenant via Super Admin será conectada à API do Go na sequência.");
    closeTenantModal();
}

/** Init */
document.addEventListener('DOMContentLoaded', () => {
    navigate('dashboard');
});
