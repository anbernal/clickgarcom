// Super Admin - Application Logic

const state = {
    activePage: 'dashboard',
    tenants: [],
};

function resolveApiBase() {
    const custom = (localStorage.getItem('clickgarcom_super_admin_api_base') || '').trim();
    if (custom) return custom.replace(/\/+$/, '');

    if (window.location.port === '3002') {
        return `${window.location.origin}/admin/api/super-admin`;
    }

    return `${window.location.protocol}//${window.location.hostname}:3002/admin/api/super-admin`;
}

const API_BASE = resolveApiBase();

function getRequestHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const key = (localStorage.getItem('clickgarcom_super_admin_key') || '').trim();
    if (key) headers['x-super-admin-key'] = key;
    return headers;
}

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...getRequestHeaders(),
            ...(options.headers || {}),
        },
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => '');

    if (!response.ok) {
        const message = typeof body === 'string'
            ? body
            : body.message || body.error || `Erro HTTP ${response.status}`;
        throw new Error(message);
    }

    return body;
}

const api = {
    getMetrics() {
        return request('/metrics');
    },
    getTenants() {
        return request('/tenants');
    },
    createTenant(payload) {
        return request('/tenants', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    updateTenant(id, payload) {
        return request(`/tenants/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },
    setTenantActive(id, active) {
        return request(`/tenants/${id}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ active }),
        });
    },
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
}

function setTableLoading(selector, colspan, text) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:var(--text-muted)">${escapeHtml(text)}</td></tr>`;
}

function navigate(pageId) {
    const targetPage = document.getElementById(`page-${pageId}`) ? pageId : 'dashboard';
    state.activePage = targetPage;

    document.querySelectorAll('.page').forEach((el) => {
        el.style.display = 'none';
    });
    document.getElementById(`page-${targetPage}`).style.display = 'block';

    document.querySelectorAll('.nav-link[data-page]').forEach((el) => el.classList.remove('active'));
    const navLink = document.querySelector(`.nav-link[data-page="${targetPage}"]`);
    if (navLink) navLink.classList.add('active');

    if (targetPage === 'dashboard') loadDashboard();
    if (targetPage === 'tenants') loadTenants();
}

async function loadDashboard() {
    try {
        const metrics = await api.getMetrics();
        document.getElementById('dash-tenants').textContent = formatNumber(metrics.activeTenants ?? metrics.totalTenants);
        document.getElementById('dash-msg-in').textContent = formatNumber(metrics.msgIn);
        document.getElementById('dash-msg-out').textContent = formatNumber(metrics.msgOut);

        const tbody = document.querySelector('#top-tenants-table tbody');
        const topTenants = Array.isArray(metrics.topTenants) ? metrics.topTenants : [];
        if (!topTenants.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">Sem dados ainda.</td></tr>';
            return;
        }

        tbody.innerHTML = topTenants.map((t) => `
            <tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td><span class="badge ${t.status === 'ACTIVE' ? 'active' : ''}">${escapeHtml(t.status)}</span></td>
                <td style="color:var(--metric-in)">${formatNumber(t.in)}</td>
                <td style="color:var(--metric-out)">${formatNumber(t.out)}</td>
                <td><strong>${formatNumber(t.total)}</strong></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        setTableLoading('#top-tenants-table tbody', 5, `Falha ao carregar métricas: ${error.message}`);
    }
}

async function loadTenants() {
    try {
        setTableLoading('#tenants-table tbody', 5, 'Carregando restaurantes...');
        const tenants = await api.getTenants();
        state.tenants = Array.isArray(tenants) ? tenants : [];

        const tbody = document.querySelector('#tenants-table tbody');
        if (!state.tenants.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">Nenhum restaurante cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = state.tenants.map((t) => `
            <tr>
                <td style="font-family:monospace; color:var(--text-muted)">${escapeHtml(t.id)}</td>
                <td>
                    <strong>${escapeHtml(t.name)}</strong><br>
                    <small style="color:var(--text-muted)">Meta Phone-Number-ID: ${escapeHtml(t.wabaId || '-')}</small><br>
                    <small style="color:var(--text-muted)">WhatsApp: ${escapeHtml(t.whatsappNumber || '-')}</small>
                </td>
                <td>${escapeHtml(t.adminEmail || '-')}</td>
                <td>${formatNumber(t.msgs)} msgs</td>
                <td>
                    <button class="btn" style="padding:6px 12px; background:var(--border)" onclick="openTenantModal('${escapeHtml(t.id)}')">Editar</button>
                    <button class="btn" style="padding:6px 12px; background:${t.active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color:${t.active ? 'var(--danger)' : '#22c55e'}" onclick="toggleTenantActive('${escapeHtml(t.id)}', ${t.active ? 'false' : 'true'})">${t.active ? 'Pausar' : 'Ativar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        setTableLoading('#tenants-table tbody', 5, `Falha ao carregar restaurantes: ${error.message}`);
    }
}

function openTenantModal(tenantId = '') {
    const form = document.getElementById('tenant-form');
    form.reset();

    const tenant = state.tenants.find((item) => item.id === tenantId);
    const isEditing = !!tenant;

    document.getElementById('tm-id').value = isEditing ? tenant.id : '';
    document.getElementById('tm-title').textContent = isEditing ? 'Editar Restaurante' : 'Novo Restaurante';
    document.getElementById('tm-name').value = isEditing ? (tenant.name || '') : '';
    document.getElementById('tm-slug').value = isEditing ? (tenant.slug || '') : '';
    document.getElementById('tm-waba-id').value = isEditing ? (tenant.wabaId || '') : '';
    document.getElementById('tm-whatsapp-number').value = isEditing ? (tenant.whatsappNumber || '') : '';
    document.getElementById('tm-email').value = isEditing ? (tenant.adminEmail || '') : '';
    document.getElementById('tm-password').value = '';

    const passwordInput = document.getElementById('tm-password');
    passwordInput.required = !isEditing;
    passwordInput.placeholder = isEditing ? 'Preencha só se quiser trocar a senha' : '******';

    document.getElementById('tenant-modal').classList.add('active');
}

function closeTenantModal() {
    document.getElementById('tenant-modal').classList.remove('active');
}

async function saveTenant(event) {
    event.preventDefault();

    const tenantId = document.getElementById('tm-id').value.trim();
    const payload = {
        name: document.getElementById('tm-name').value.trim(),
        slug: document.getElementById('tm-slug').value.trim().toLowerCase(),
        waba_id: normalizeDigits(document.getElementById('tm-waba-id').value),
        whatsapp_number: normalizeDigits(document.getElementById('tm-whatsapp-number').value),
        admin_email: document.getElementById('tm-email').value.trim().toLowerCase(),
        admin_password: document.getElementById('tm-password').value,
    };

    if (!payload.name || !payload.slug || !payload.waba_id || !payload.whatsapp_number || !payload.admin_email) {
        alert('Preencha os campos obrigatórios.');
        return;
    }

    if (!tenantId && !payload.admin_password) {
        alert('Senha provisória é obrigatória para novo cadastro.');
        return;
    }

    if (tenantId && !payload.admin_password) delete payload.admin_password;

    try {
        if (tenantId) {
            await api.updateTenant(tenantId, payload);
        } else {
            await api.createTenant(payload);
        }

        closeTenantModal();
        await loadTenants();
        if (state.activePage === 'dashboard') {
            await loadDashboard();
        }
    } catch (error) {
        console.error(error);
        alert(`Falha ao salvar restaurante: ${error.message}`);
    }
}

async function toggleTenantActive(tenantId, active) {
    const action = active ? 'ativar' : 'pausar';
    if (!confirm(`Deseja ${action} este restaurante?`)) return;

    try {
        await api.setTenantActive(tenantId, active);
        await loadTenants();
        if (state.activePage === 'dashboard') {
            await loadDashboard();
        }
    } catch (error) {
        console.error(error);
        alert(`Falha ao atualizar status: ${error.message}`);
    }
}

function logout() {
    closeTenantModal();
    navigate('dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
    navigate('dashboard');
});
