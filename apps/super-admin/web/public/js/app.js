// Super Admin - Application Logic
const runtimeConfig = window.CLICKGARCOM_SUPER_ADMIN_CONFIG || {};
const LOGIN_PAGE_PATH = String(runtimeConfig.loginPagePath || '/login').trim() || '/login';

if (!sessionStorage.getItem('super_admin_access_token')) {
    window.location.href = LOGIN_PAGE_PATH;
}

const state = {
    activePage: 'dashboard',
    tenants: [],
    operationsOverview: null,
    reliabilityOverview: null,
    reliabilityIncidents: [],
    session: null,
};
const RETAIL_PROFILE_DRAFT_KEY = 'clickgarcom_super_admin_retail_profiles_v1';
// Nome amigável exibido no Super Admin. RETAIL continua sendo o identificador técnico.
const RETAIL_DISPLAY_NAME = 'Loja de produtos';

function readRetailProfileDrafts() {
    try { return JSON.parse(localStorage.getItem(RETAIL_PROFILE_DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function getTenantEstablishmentType(tenant) {
    const serverValue = tenant?.establishmentType || tenant?.establishment_type;
    if (serverValue) return String(serverValue).toUpperCase();
    return String(readRetailProfileDrafts()[tenant?.id] || 'RESTAURANT').toUpperCase();
}

function establishmentTypeLabel(value) {
    return { RESTAURANT: 'Restaurante', MARKET: 'Mercado', PHARMACY: 'Farmácia' }[String(value || '').toUpperCase()] || 'Restaurante';
}

function resolveApiBase() {
    const custom = (localStorage.getItem('clickgarcom_super_admin_api_base') || '').trim();
    if (custom) return custom.replace(/\/+$/, '');

    if (String(runtimeConfig.apiBaseUrl || '').trim()) {
        return String(runtimeConfig.apiBaseUrl).trim().replace(/\/+$/, '');
    }

    return `${window.location.origin}/admin/api/super-admin`;
}

const API_BASE = resolveApiBase();

function getRequestHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = (sessionStorage.getItem('super_admin_access_token') || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
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
        if (response.status === 401 && path !== '/auth/login') {
            clearSession();
            window.location.href = LOGIN_PAGE_PATH;
        }
        throw new Error(message);
    }

    return body;
}

const api = {
    getSessionProfile() {
        return request('/auth/me');
    },
    logout() {
        return request('/auth/logout', {
            method: 'POST',
        });
    },
    getMetrics() {
        return request('/metrics');
    },
    getTenants() {
        return request('/tenants');
    },
    getOperationsOverview() {
        return request('/operations/overview');
    },
    getAuditLogs(limit = 20) {
        return request(`/audit-logs?limit=${encodeURIComponent(String(limit))}`);
    },
    getAccessLogs(limit = 20) {
        return request(`/access-logs?limit=${encodeURIComponent(String(limit))}`);
    },
    getReliabilityOverview() {
        return request('/reliability/overview');
    },
    getReliabilityIncidents(limit = 30) {
        return request(`/reliability/incidents?limit=${encodeURIComponent(String(limit))}`);
    },
    getReliabilityDlq() {
        return request('/reliability/dlq');
    },
    getReliabilityCorrelation(params = {}) {
        const query = new URLSearchParams();
        if (params.tenantId) query.set('tenant_id', String(params.tenantId).trim());
        if (params.messageId) query.set('message_id', String(params.messageId).trim());
        if (params.paymentId) query.set('payment_id', String(params.paymentId).trim());
        return request(`/reliability/correlations?${query.toString()}`);
    },
    retryReliabilityInbox(id) {
        return request(`/reliability/inbox/${encodeURIComponent(String(id))}/retry`, {
            method: 'POST',
        });
    },
    retryReliabilityOutbox(id) {
        return request(`/reliability/outbox/${encodeURIComponent(String(id))}/retry`, {
            method: 'POST',
        });
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
    setTenantDeliveryEnabled(id, payload) {
        return request(`/tenants/${encodeURIComponent(String(id))}/delivery`, {
            method: 'PATCH',
            body: JSON.stringify(payload || {}),
        });
    },
    setTenantAttendanceEnabled(id, enabled) {
        return request(`/tenants/${encodeURIComponent(String(id))}/attendance`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: !!enabled }),
        });
    },
    setTenantRetailEnabled(id, enabled) {
        return request(`/tenants/${encodeURIComponent(String(id))}/retail`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: !!enabled }),
        });
    },
    setTenantFoodStoreEnabled(id, enabled) {
        return request(`/tenants/${encodeURIComponent(String(id))}/food-store`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: !!enabled }),
        });
    },
    getPaymentGateway(id) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway`);
    },
    updatePaymentGateway(id, payload) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },
    createPaymentGatewayProfile(id, payload) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway/profiles`, {
            method: 'POST', body: JSON.stringify(payload),
        });
    },
    updatePaymentGatewayProfile(id, profileId, payload) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway/profiles/${encodeURIComponent(String(profileId))}`, {
            method: 'PATCH', body: JSON.stringify(payload),
        });
    },
    activatePaymentGatewayProfile(id, profileId) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway/profiles/${encodeURIComponent(String(profileId))}/activate`, {
            method: 'POST', body: JSON.stringify({}),
        });
    },
    deletePaymentGatewayProfile(id, profileId) {
        return request(`/tenants/${encodeURIComponent(String(id))}/payment-gateway/profiles/${encodeURIComponent(String(profileId))}`, {
            method: 'DELETE',
        });
    },
    setTenantActive(id, active) {
        return request(`/tenants/${id}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ active }),
        });
    },
    updateWallet(id, payload) {
        return request(`/tenants/${id}/wallet`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },
};

function clearSession() {
    sessionStorage.removeItem('super_admin_access_token');
    sessionStorage.removeItem('super_admin_operator_name');
}

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

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return `${numeric.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })}%`;
}

function formatMinutes(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return `${numeric.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })} min`;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
}

function getHealthStatusLabel(status) {
    if (status === 'CRITICAL') return 'Crítico';
    if (status === 'WARNING') return 'Atenção';
    if (status === 'PAUSED') return 'Pausado';
    return 'Saudável';
}

function getHealthBadgeClass(status) {
    if (status === 'CRITICAL') return 'critical';
    if (status === 'WARNING') return 'warning';
    if (status === 'PAUSED') return 'paused';
    return 'active';
}

function formatAuditAction(action) {
    const key = String(action || '').trim().toUpperCase();
    if (key === 'TENANT_CREATED') return 'Tenant criado';
    if (key === 'TENANT_UPDATED') return 'Tenant atualizado';
    if (key === 'TENANT_STATUS_CHANGED') return 'Status alterado';
    if (key === 'TENANT_WALLET_UPDATED') return 'Carteira alterada';
    if (key === 'TENANT_PAYMENT_GATEWAY_UPDATED') return 'Gateway de pagamento alterado';
    return key || 'Ação';
}

function formatAccessEvent(eventType) {
    const key = String(eventType || '').trim().toUpperCase();
    if (key === 'LOGIN_SUCCESS') return 'Login ok';
    if (key === 'LOGIN_FAILURE') return 'Login falhou';
    if (key === 'TOKEN_REJECTED') return 'Token rejeitado';
    if (key === 'IP_BLOCKED') return 'IP bloqueado';
    if (key === 'LOGOUT') return 'Logout';
    return key || 'Acesso';
}

function summarizeAuditDetails(details) {
    const summary = String(details?.summary || '').trim();
    if (summary) return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
    try {
        const raw = JSON.stringify(details || {});
        return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
    } catch (_error) {
        return '-';
    }
}

function summarizeAccessDetails(details) {
    const reason = String(details?.reason || '').trim();
    const expiresAt = String(details?.expires_at || '').trim();
    if (reason && expiresAt) {
        return `${reason} · expira ${formatDateTime(expiresAt)}`;
    }
    if (reason) return reason;
    if (expiresAt) return `Expira ${formatDateTime(expiresAt)}`;
    try {
        const raw = JSON.stringify(details || {});
        return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
    } catch (_error) {
        return '-';
    }
}

function formatReliabilityIncidentType(value) {
    const key = String(value || '').trim().toUpperCase();
    if (key === 'INBOX_FAILURE') return 'Inbox falhou';
    if (key === 'OUTBOX_DEAD') return 'Outbox morta';
    if (key === 'OUTBOX_STALE') return 'Outbox atrasada';
    if (key === 'PAYMENT_FAILURE') return 'Pagamento falhou';
    if (key === 'PAYMENT_STALE') return 'Pagamento parado';
    return key || 'Incidente';
}

function getReliabilitySeverityClass(value) {
    const key = String(value || '').trim().toUpperCase();
    if (key === 'CRITICAL') return 'critical';
    if (key === 'WARNING') return 'warning';
    return 'info';
}

function formatReliabilityCorrelation(correlation) {
    if (!correlation || typeof correlation !== 'object') return '-';
    const parts = [];
    if (correlation.messageId) parts.push(`msg ${correlation.messageId}`);
    if (correlation.paymentId) parts.push(`pgto ${correlation.paymentId}`);
    if (correlation.providerPaymentId) parts.push(`prov ${correlation.providerPaymentId}`);
    if (correlation.externalReference) parts.push(`ref ${correlation.externalReference}`);
    return parts.length ? parts.join(' · ') : '-';
}

function renderReliabilityDlqPeek(payload) {
    if (!payload || payload.available === false) {
        return '<div class="page-sub" style="margin-bottom:0">Não foi possível inspecionar a DLQ no RabbitMQ Management API.</div>';
    }

    const queueName = payload.queueName || '';
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!queueName || !messages.length) {
        return '<div class="page-sub" style="margin-bottom:0">Nenhuma mensagem disponível para inspeção rápida na DLQ.</div>';
    }

    return `
        <div class="card" style="margin-top:0">
            <h4 style="margin-bottom:12px">Peek da DLQ: ${escapeHtml(queueName)}</h4>
            <div class="stack-list">
                ${messages.map((item) => `
                    <div class="sub-metric">
                        <strong>${escapeHtml(item.routingKey || '-')}</strong> · ${escapeHtml(item.exchange || '-')} · ${item.redelivered ? 'redelivered' : 'first seen'}<br>
                        <span style="font-family:monospace; font-size:12px">${escapeHtml(item.payload || '-')}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderReliabilityList(title, items, formatter) {
    if (!Array.isArray(items) || !items.length) {
        return `
            <div class="card" style="margin-top:16px">
                <h4 style="margin-bottom:12px">${escapeHtml(title)}</h4>
                <div class="page-sub" style="margin-bottom:0">Sem registros correlacionados.</div>
            </div>
        `;
    }

    return `
        <div class="card" style="margin-top:16px">
            <h4 style="margin-bottom:12px">${escapeHtml(title)}</h4>
            <div class="stack-list">
                ${items.map((item) => `<div class="sub-metric">${formatter(item)}</div>`).join('')}
            </div>
        </div>
    `;
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
    if (targetPage === 'wallet') loadWallet();
    if (targetPage === 'operations') loadOperations();
    if (targetPage === 'reliability') loadReliability();
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
        setTableLoading('#tenants-table tbody', 10, 'Carregando estabelecimentos...');
        const tenants = await api.getTenants();
        state.tenants = Array.isArray(tenants) ? tenants : [];

        const tbody = document.querySelector('#tenants-table tbody');
        if (!state.tenants.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted)">Nenhum estabelecimento cadastrado.</td></tr>';
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
                <td><span class="badge ${getTenantEstablishmentType(t) === 'RESTAURANT' ? '' : 'active'}">${escapeHtml(establishmentTypeLabel(getTenantEstablishmentType(t)))}</span><br><small style="color:var(--text-muted)">${getTenantEstablishmentType(t) === 'RESTAURANT' ? 'FOOD SERVICE' : RETAIL_DISPLAY_NAME.toUpperCase()}</small></td>
                <td>${escapeHtml(t.adminEmail || '-')}</td>
                <td>${formatNumber(t.msgs)} msgs</td>
                <td><span class="badge ${t.attendanceEnabled !== false ? 'active' : 'inactive'}">${t.attendanceEnabled !== false ? 'Ativo' : 'Desativado'}</span></td>
                <td><span class="badge ${t.foodStoreEnabled ? 'active' : 'inactive'}">${t.foodStoreEnabled ? 'Ativo' : 'Desativado'}</span></td>
                <td><span class="badge ${t.retailEnabled ? 'active' : 'inactive'}">${t.retailEnabled ? 'Ativo' : 'Desativado'}</span></td>
                <td><span class="badge ${t.deliveryEnabled ? 'active' : 'inactive'}">${t.deliveryEnabled ? 'Ativo' : 'Desativado'}</span></td>
                <td>
                    <button class="btn" style="padding:6px 12px; background:var(--border)" onclick="openTenantModal('${escapeHtml(t.id)}')">Editar</button>
                    <button class="btn" style="padding:6px 12px; background:${t.attendanceEnabled !== false ? 'rgba(239,68,68,.16)' : 'rgba(59,130,246,.2)'}; color:${t.attendanceEnabled !== false ? '#fca5a5' : '#93c5fd'}" onclick="openAttendanceModuleModal('${escapeHtml(t.id)}')">${t.attendanceEnabled !== false ? 'Desativar Atendimento' : 'Ativar Atendimento'}</button>
                    <button class="btn" style="padding:6px 12px; background:${t.foodStoreEnabled ? 'rgba(239,68,68,.16)' : 'rgba(59,130,246,.2)'}; color:${t.foodStoreEnabled ? '#fca5a5' : '#93c5fd'}" onclick="openFoodStoreModuleModal('${escapeHtml(t.id)}')">${t.foodStoreEnabled ? 'Desativar Loja de comidas' : 'Ativar Loja de comidas'}</button>
                    <button class="btn" style="padding:6px 12px; background:${t.retailEnabled ? 'rgba(239,68,68,.16)' : 'rgba(59,130,246,.2)'}; color:${t.retailEnabled ? '#fca5a5' : '#93c5fd'}" onclick="openRetailModuleModal('${escapeHtml(t.id)}')">${t.retailEnabled ? `Desativar ${RETAIL_DISPLAY_NAME}` : `Ativar ${RETAIL_DISPLAY_NAME}`}</button>
                    <button class="btn" style="padding:6px 12px; background:${t.deliveryEnabled ? 'rgba(239,68,68,.16)' : 'rgba(59,130,246,.2)'}; color:${t.deliveryEnabled ? '#fca5a5' : '#93c5fd'}" onclick="openDeliveryModuleModal('${escapeHtml(t.id)}')">${t.deliveryEnabled ? 'Desativar Delivery' : 'Ativar Delivery'}</button>
                    <button class="btn" style="padding:6px 12px; background:rgba(59, 130, 246, 0.2); color:#93c5fd" onclick="openPaymentGatewayModal('${escapeHtml(t.id)}')">Pagamento</button>
                    <button class="btn" style="padding:6px 12px; background:${t.active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color:${t.active ? 'var(--danger)' : '#22c55e'}" onclick="toggleTenantActive('${escapeHtml(t.id)}', ${t.active ? 'false' : 'true'})">${t.active ? 'Pausar' : 'Ativar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        setTableLoading('#tenants-table tbody', 10, `Falha ao carregar estabelecimentos: ${error.message}`);
    }
}

async function loadWallet() {
    try {
        setTableLoading('#wallet-table tbody', 5, 'Carregando carteiras...');
        const tenants = await api.getTenants();
        state.tenants = Array.isArray(tenants) ? tenants : [];

        const tbody = document.querySelector('#wallet-table tbody');
        if (!state.tenants.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">Nenhum restaurante cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = state.tenants.map((t) => `
            <tr>
                <td>
                    <strong>${escapeHtml(t.name)}</strong><br>
                    <small style="font-family:monospace; color:var(--text-muted)">${escapeHtml(t.id)}</small>
                </td>
                <td>
                    <span class="badge ${t.billingPlan === 'pre_paid' ? 'active' : ''}" style="${t.billingPlan === 'post_paid' ? 'background:rgba(59, 130, 246, 0.2);color:#3b82f6;' : ''}">
                        ${t.billingPlan === 'pre_paid' ? 'Pré-Pago' : 'Pós-Pago'}
                    </span>
                </td>
                <td>
                    <strong style="font-size:16px; color:${t.walletBalance < 0 ? 'var(--danger)' : 'var(--text)'}">
                        R$ ${formatNumber(t.walletBalance)}
                    </strong>
                </td>
                <td><span class="badge ${t.active ? 'active' : ''}">${t.active ? 'Ativo' : 'Pausado'}</span></td>
                <td>
                    <button class="btn" style="padding:6px 12px; background:var(--border)" onclick="openWalletModal('${escapeHtml(t.id)}')">Gerenciar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        setTableLoading('#wallet-table tbody', 5, `Falha ao carregar carteiras: ${error.message}`);
    }
}

function renderOperationsChecklist(onboarding) {
    const completion = Number(onboarding?.completionPercent || 0);
    const missing = Array.isArray(onboarding?.missingRequiredLabels) ? onboarding.missingRequiredLabels : [];
    return `
        <div class="cell-stack">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                <strong>${escapeHtml(String(completion))}%</strong>
                <span class="muted-xs">${escapeHtml(String(onboarding?.completedRequired || 0))}/${escapeHtml(String(onboarding?.requiredTotal || 0))} itens</span>
            </div>
            <div class="progress-track"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, completion))}%"></div></div>
            <div class="stack-list">
                ${missing.length
                    ? missing.map((label) => `<span class="badge inactive">${escapeHtml(label)}</span>`).join('')
                    : '<span class="badge active">Checklist concluído</span>'}
            </div>
        </div>
    `;
}

function renderOperationsRisks(riskFlags) {
    const flags = Array.isArray(riskFlags) ? riskFlags : [];
    if (!flags.length) {
        return '<span class="badge active">Sem alertas</span>';
    }

    return `
        <div class="cell-stack">
            <div class="stack-list">
                ${flags.map((flag) => `
                    <span class="badge ${flag.severity === 'CRITICAL' ? 'critical' : 'warning'}">${escapeHtml(flag.title)}</span>
                `).join('')}
            </div>
            <div class="muted-xs">
                ${flags.slice(0, 2).map((flag) => escapeHtml(flag.description || '')).join(' ')}
            </div>
        </div>
    `;
}

function renderOperationsSignals(tenant) {
    const operations = tenant?.operations || {};
    const signalTags = [
        `Webhook 24h: ${formatNumber(operations.inboxEvents24h)}`,
        `Inbox pend.: ${formatNumber(operations.pendingInbox)}`,
        `Inbox erro: ${formatNumber(operations.failedInbox24h)}`,
        `Pedidos 7d: ${formatNumber(operations.orders7d)}`,
        `Fila atrasada: ${formatNumber(operations.delayedQueueOrders)}`,
        `Aceite médio: ${formatMinutes(operations.avgAcceptanceMinutes7d)}`,
        `Cancelamento: ${formatPercent(operations.cancelRate7d)}`,
        `Outbox pend.: ${formatNumber(operations.pendingOutbox)}`,
        `Outbox falha: ${formatNumber(operations.failedOutbox)}`,
        `Pagamentos pend.: ${formatNumber(operations.pendingPayments)}`,
        `Conversão pgto: ${formatPercent(operations.paymentConversionRate7d)}`,
    ];

    if (operations.daysOfBalance !== null && operations.daysOfBalance !== undefined && Number.isFinite(Number(operations.daysOfBalance))) {
        signalTags.push(`Saldo: ${Number(operations.daysOfBalance).toFixed(1)} dias`);
    }

    return `
        <div class="cell-stack">
            <div class="stack-list">
                ${signalTags.map((item) => `<span class="sub-metric">${escapeHtml(item)}</span>`).join('')}
            </div>
            <div class="muted-xs">
                Últ. pedido: ${escapeHtml(formatDateTime(operations.lastOrderCreatedAt))} · Últ. inbox: ${escapeHtml(formatDateTime(operations.lastInboxReceivedAt))} · Últ. erro inbox: ${escapeHtml(formatDateTime(operations.lastInboxFailedAt))} · Últ. outbox: ${escapeHtml(formatDateTime(operations.lastOutboxSentAt))} · Últ. pagamento: ${escapeHtml(formatDateTime(operations.lastPaymentCreatedAt || operations.lastPaymentAttemptAt))}
            </div>
        </div>
    `;
}

async function loadOperations() {
    try {
        setTableLoading('#operations-table tbody', 5, 'Carregando visão operacional...');
        setTableLoading('#operations-audit-table tbody', 5, 'Carregando trilha de ações...');
        setTableLoading('#operations-access-table tbody', 5, 'Carregando logs de acesso...');
        const [overview, auditPayload, accessPayload] = await Promise.all([
            api.getOperationsOverview(),
            api.getAuditLogs(20),
            api.getAccessLogs(20),
        ]);
        state.operationsOverview = overview;

        const summary = overview?.summary || {};
        document.getElementById('ops-critical').textContent = formatNumber(summary.criticalTenants || 0);
        document.getElementById('ops-warning').textContent = formatNumber(summary.warningTenants || 0);
        document.getElementById('ops-onboarding').textContent = formatNumber(summary.onboardingPendingTenants || 0);
        document.getElementById('ops-balance').textContent = formatNumber(summary.lowBalanceTenants || 0);
        document.getElementById('ops-queue').textContent = formatNumber(summary.webhookQueueTenants || 0);
        document.getElementById('ops-webhook').textContent = formatNumber(summary.webhookSilentTenants || 0);
        document.getElementById('ops-webhook-failure').textContent = formatNumber(summary.webhookFailureTenants || 0);
        document.getElementById('ops-delay').textContent = formatNumber(summary.delayedQueueTenants || 0);
        document.getElementById('ops-cancel').textContent = formatNumber(summary.highCancellationTenants || 0);
        document.getElementById('ops-conversion').textContent = formatNumber(summary.lowPaymentConversionTenants || 0);
        document.getElementById('ops-generated-at').textContent = formatDateTime(overview?.generatedAt);
        document.getElementById('ops-audit-status').textContent = auditPayload?.available === false
            ? 'Auditoria aguardando migration'
            : `Últimas ${formatNumber((auditPayload?.logs || []).length)} ações`;
        document.getElementById('ops-access-status').textContent = accessPayload?.available === false
            ? 'Log de acesso aguardando migration'
            : `Últimos ${formatNumber((accessPayload?.logs || []).length)} eventos de autenticação`;

        const tenants = Array.isArray(overview?.tenants) ? overview.tenants : [];
        const tbody = document.querySelector('#operations-table tbody');
        if (!tenants.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">Nenhum tenant encontrado.</td></tr>';
        } else {
            tbody.innerHTML = tenants.map((tenant) => `
                <tr>
                    <td>
                        <div class="cell-stack">
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <strong>${escapeHtml(tenant.name)}</strong>
                                <span class="badge ${tenant.active ? 'active' : 'paused'}">${tenant.active ? 'Ativo' : 'Pausado'}</span>
                                <span class="badge info">${escapeHtml(tenant.billingPlan === 'pre_paid' ? 'Pré-pago' : 'Pós-pago')}</span>
                            </div>
                            <div class="muted-xs">
                                ${escapeHtml(tenant.adminEmail || 'Sem admin principal')} · ${escapeHtml(tenant.whatsappNumber || 'Sem WhatsApp')} · Criado em ${escapeHtml(formatDateTime(tenant.createdAt))}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="cell-stack">
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span class="badge ${getHealthBadgeClass(tenant.healthStatus)}">${escapeHtml(getHealthStatusLabel(tenant.healthStatus))}</span>
                                <strong>${escapeHtml(String(tenant.healthScore || 0))}/100</strong>
                            </div>
                            <div class="progress-track"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, Number(tenant.healthScore || 0)))}%"></div></div>
                        </div>
                    </td>
                    <td>${renderOperationsChecklist(tenant.onboarding)}</td>
                    <td>${renderOperationsRisks(tenant.riskFlags)}</td>
                    <td>
                        <div class="cell-stack">
                            <div><strong>${escapeHtml(formatCurrency(tenant.walletBalance))}</strong></div>
                            <div class="muted-xs">Preço msg: ${escapeHtml(formatCurrency(tenant.messagePrice))}</div>
                            ${renderOperationsSignals(tenant)}
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        const auditLogs = Array.isArray(auditPayload?.logs) ? auditPayload.logs : [];
        const auditTbody = document.querySelector('#operations-audit-table tbody');
        if (!auditLogs.length) {
            auditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">${escapeHtml(auditPayload?.available === false ? 'Tabela de auditoria ainda não existe no banco local.' : 'Nenhuma ação registrada ainda.')}</td></tr>`;
        } else {
            auditTbody.innerHTML = auditLogs.map((log) => `
                <tr>
                    <td>${escapeHtml(formatDateTime(log.createdAt))}</td>
                    <td>
                        <div class="cell-stack">
                            <strong>${escapeHtml(log.operatorName || 'Operador não identificado')}</strong>
                            <div class="muted-xs">${escapeHtml(log.sourceIp || '-')} · sessão ${escapeHtml(log.operatorKeyFingerprint || '-')}</div>
                        </div>
                    </td>
                    <td><span class="badge info">${escapeHtml(formatAuditAction(log.action))}</span></td>
                    <td>${escapeHtml(log.tenantName || log.tenantId || '-')}</td>
                    <td>${escapeHtml(summarizeAuditDetails(log.details))}</td>
                </tr>
            `).join('');
        }

        const accessLogs = Array.isArray(accessPayload?.logs) ? accessPayload.logs : [];
        const accessTbody = document.querySelector('#operations-access-table tbody');
        if (!accessLogs.length) {
            accessTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">${escapeHtml(accessPayload?.available === false ? 'Tabela de acesso ainda não existe no banco local.' : 'Nenhum evento de autenticação registrado ainda.')}</td></tr>`;
            return;
        }

        accessTbody.innerHTML = accessLogs.map((log) => `
            <tr>
                <td>${escapeHtml(formatDateTime(log.createdAt))}</td>
                <td><span class="badge ${log.success ? 'active' : 'critical'}">${escapeHtml(formatAccessEvent(log.eventType))}</span></td>
                <td>${escapeHtml(log.operatorName || 'Operador não identificado')}</td>
                <td>
                    <div class="cell-stack">
                        <strong>${escapeHtml(log.authMethod || '-')}</strong>
                        <div class="muted-xs">${escapeHtml(log.sourceIp || '-')}</div>
                    </div>
                </td>
                <td>${escapeHtml(summarizeAccessDetails(log.details))}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        setTableLoading('#operations-table tbody', 5, `Falha ao carregar visão operacional: ${error.message}`);
        setTableLoading('#operations-audit-table tbody', 5, `Falha ao carregar auditoria: ${error.message}`);
        setTableLoading('#operations-access-table tbody', 5, `Falha ao carregar acessos: ${error.message}`);
    }
}

async function loadReliability() {
    try {
        setTableLoading('#reliability-tenants-table tbody', 2, 'Carregando tenants impactados...');
        setTableLoading('#reliability-incidents-table tbody', 6, 'Carregando incidentes...');
        setTableLoading('#reliability-dlq-table tbody', 5, 'Carregando filas...');
        document.getElementById('reliability-dlq-peek').innerHTML = '';

        const [overview, incidentsPayload, dlqPayload] = await Promise.all([
            api.getReliabilityOverview(),
            api.getReliabilityIncidents(30),
            api.getReliabilityDlq(),
        ]);

        state.reliabilityOverview = overview;
        state.reliabilityIncidents = Array.isArray(incidentsPayload?.incidents) ? incidentsPayload.incidents : [];

        const summary = overview?.summary || {};
        document.getElementById('rel-incidents-24h').textContent = formatNumber(summary.incidents24h || 0);
        document.getElementById('rel-dead-outbox').textContent = formatNumber(summary.deadOutbox || 0);
        document.getElementById('rel-retryable-outbox').textContent = formatNumber(summary.retryableOutbox || 0);
        document.getElementById('rel-failed-inbox').textContent = formatNumber(summary.failedInbox || 0);
        document.getElementById('rel-payment-failures').textContent = formatNumber((summary.paymentFailures || 0) + (summary.stalePayments || 0));
        document.getElementById('rel-impacted-tenants').textContent = formatNumber(summary.impactedTenants || 0);
        document.getElementById('rel-dlq-messages').textContent = formatNumber(dlqPayload?.summary?.dlqMessages || 0);
        document.getElementById('rel-no-consumer').textContent = formatNumber(dlqPayload?.summary?.queuesWithoutConsumers || 0);
        document.getElementById('rel-generated-at').textContent = formatDateTime(overview?.generatedAt);
        document.getElementById('rel-dlq-status').textContent = dlqPayload?.available === false
            ? 'RabbitMQ Management API indisponível'
            : `${formatNumber((dlqPayload?.queues || []).length)} fila(s) monitoradas`;

        const tenantsTbody = document.querySelector('#reliability-tenants-table tbody');
        const topTenants = Array.isArray(overview?.topTenants) ? overview.topTenants : [];
        if (!topTenants.length) {
            tenantsTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--text-muted)">Nenhum tenant impactado no momento.</td></tr>';
        } else {
            tenantsTbody.innerHTML = topTenants.map((item) => `
                <tr>
                    <td><strong>${escapeHtml(item.tenantName || item.tenantId || '-')}</strong><br><small style="color:var(--text-muted)">${escapeHtml(item.tenantId || '-')}</small></td>
                    <td><span class="badge critical">${formatNumber(item.incidentCount || 0)} incidente(s)</span></td>
                </tr>
            `).join('');
        }

        const dlqTbody = document.querySelector('#reliability-dlq-table tbody');
        const queues = Array.isArray(dlqPayload?.queues) ? dlqPayload.queues : [];
        if (!queues.length) {
            dlqTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">${escapeHtml(dlqPayload?.available === false ? 'Sem conexão com o RabbitMQ Management API.' : 'Nenhuma fila encontrada.')}</td></tr>`;
        } else {
            dlqTbody.innerHTML = queues.map((queue) => `
                <tr>
                    <td>
                        <strong>${escapeHtml(queue.name || '-')}</strong>
                        ${queue.dlq ? '<span class="badge critical" style="margin-left:8px">DLQ</span>' : ''}
                    </td>
                    <td>${escapeHtml(queue.state || '-')} · ${escapeHtml(queue.type || '-')}</td>
                    <td>${formatNumber(queue.messages || 0)}<br><small style="color:var(--text-muted)">ready ${formatNumber(queue.messagesReady || 0)} · unacked ${formatNumber(queue.messagesUnacknowledged || 0)}</small></td>
                    <td><span class="badge ${Number(queue.consumers || 0) > 0 ? 'active' : 'warning'}">${formatNumber(queue.consumers || 0)}</span></td>
                    <td>${escapeHtml(queue.deadLetterExchange || '-')}</td>
                </tr>
            `).join('');
        }
        document.getElementById('reliability-dlq-peek').innerHTML = renderReliabilityDlqPeek(dlqPayload?.peek);

        const incidentsTbody = document.querySelector('#reliability-incidents-table tbody');
        if (!state.reliabilityIncidents.length) {
            incidentsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Nenhum incidente relevante encontrado.</td></tr>';
        } else {
            incidentsTbody.innerHTML = state.reliabilityIncidents.map((incident) => `
                <tr>
                    <td>${escapeHtml(formatDateTime(incident.occurredAt))}</td>
                    <td><span class="badge ${getReliabilitySeverityClass(incident.severity)}">${escapeHtml(formatReliabilityIncidentType(incident.incidentType))}</span></td>
                    <td>${escapeHtml(incident.tenantName || incident.tenantId || '-')}</td>
                    <td>${escapeHtml(incident.summary || '-')}</td>
                    <td style="font-family:monospace; font-size:12px; color:var(--text-muted)">${escapeHtml(formatReliabilityCorrelation(incident.correlation))}</td>
                    <td>
                        ${incident?.retry?.action === 'retry_outbox'
                            ? `<button class="btn" style="padding:6px 12px" onclick="retryReliabilityOutbox('${escapeHtml(incident.entityId)}')">Retry outbox</button>`
                            : incident?.retry?.action === 'retry_inbox'
                                ? `<button class="btn" style="padding:6px 12px" onclick="retryReliabilityInbox('${escapeHtml(incident.entityId)}')">Retry inbox</button>`
                                : '<span style="color:var(--text-muted)">Somente leitura</span>'}
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error(error);
        setTableLoading('#reliability-tenants-table tbody', 2, `Falha ao carregar confiabilidade: ${error.message}`);
        setTableLoading('#reliability-incidents-table tbody', 6, `Falha ao carregar incidentes: ${error.message}`);
        setTableLoading('#reliability-dlq-table tbody', 5, `Falha ao carregar filas: ${error.message}`);
        document.getElementById('reliability-dlq-peek').innerHTML = '';
    }
}

function renderReliabilityCorrelationResults(payload) {
    const tenant = payload?.tenant || null;
    const correlation = payload?.correlation || {};
    const sections = [];

    if (tenant) {
        sections.push(`
            <div class="card" style="margin-top:16px">
                <h4 style="margin-bottom:12px">Tenant</h4>
                <div class="stack-list">
                    <div class="sub-metric"><strong>${escapeHtml(tenant.name || '-')}</strong> · ${escapeHtml(tenant.id || '-')}</div>
                    <div class="sub-metric">Slug: ${escapeHtml(tenant.slug || '-')} · Plano: ${escapeHtml(tenant.billingPlan || '-')} · ${tenant.active ? 'Ativo' : 'Pausado'}</div>
                </div>
            </div>
        `);
    }

    if (correlation.payment) {
        sections.push(`
            <div class="card" style="margin-top:16px">
                <h4 style="margin-bottom:12px">Pagamento</h4>
                <div class="stack-list">
                    <div class="sub-metric"><strong>${escapeHtml(correlation.payment.id || '-')}</strong> · ${escapeHtml(correlation.payment.status || '-')} · ${escapeHtml(formatCurrency(correlation.payment.amount || 0))}</div>
                    <div class="sub-metric">Ref externa: ${escapeHtml(correlation.payment.externalReference || '-')} · Pix TXID: ${escapeHtml(correlation.payment.pixTxid || '-')}</div>
                    <div class="sub-metric">Criado: ${escapeHtml(formatDateTime(correlation.payment.createdAt))} · Pago: ${escapeHtml(formatDateTime(correlation.payment.paidAt))}</div>
                </div>
            </div>
        `);
    }

    sections.push(renderReliabilityList('Inbox correlacionada', correlation.inboxEvents, (item) => (
        `<strong>${escapeHtml(item.providerMessageId || item.id || '-')}</strong> · ${item.processed ? 'processado' : 'pendente'} · ${escapeHtml(formatDateTime(item.receivedAt))}${item.processingError ? ` · ${escapeHtml(item.processingError)}` : ''}`
    )));
    sections.push(renderReliabilityList('Message logs', correlation.messageLogs, (item) => (
        `<strong>${escapeHtml(item.messageId || item.id || '-')}</strong> · ${escapeHtml(item.direction || '-')} · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.userPhone || '-')} · ${escapeHtml(formatDateTime(item.createdAt))}`
    )));
    sections.push(renderReliabilityList('Outbox pendente', correlation.outboxMessages, (item) => (
        `<strong>${escapeHtml(item.id || '-')}</strong> · ${escapeHtml(item.destination || '-')} para ${escapeHtml(item.recipient || '-')} · ${escapeHtml(String(item.attempts || 0))}/${escapeHtml(String(item.maxAttempts || 0))} tentativa(s)${item.lastError ? ` · ${escapeHtml(item.lastError)}` : ''}`
    )));
    sections.push(renderReliabilityList('Tentativas de pagamento', correlation.paymentAttempts, (item) => (
        `<strong>${escapeHtml(item.id || '-')}</strong> · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.providerPaymentId || item.externalReference || '-')} · ${escapeHtml(formatCurrency(item.requestedAmount || 0))} · ${escapeHtml(formatDateTime(item.createdAt))}`
    )));
    sections.push(renderReliabilityList('Incidentes recentes do tenant', correlation.recentIncidents, (item) => (
        `<strong>${escapeHtml(formatReliabilityIncidentType(item.incidentType))}</strong> · ${escapeHtml(formatDateTime(item.occurredAt))} · ${escapeHtml(item.summary || '-')}`
    )));

    return sections.join('');
}

async function searchReliabilityCorrelation(event) {
    event.preventDefault();
    const tenantId = document.getElementById('rel-search-tenant')?.value.trim() || '';
    const messageId = document.getElementById('rel-search-message')?.value.trim() || '';
    const paymentId = document.getElementById('rel-search-payment')?.value.trim() || '';
    const statusEl = document.getElementById('reliability-correlation-status');
    const resultsEl = document.getElementById('reliability-correlation-results');

    if (!tenantId && !messageId && !paymentId) {
        statusEl.textContent = 'Informe ao menos um identificador.';
        resultsEl.innerHTML = '';
        return;
    }

    statusEl.textContent = 'Buscando correlação...';
    resultsEl.innerHTML = '';

    try {
        const payload = await api.getReliabilityCorrelation({ tenantId, messageId, paymentId });
        statusEl.textContent = 'Correlação carregada.';
        resultsEl.innerHTML = renderReliabilityCorrelationResults(payload);
    } catch (error) {
        console.error(error);
        statusEl.textContent = `Falha ao buscar correlação: ${error.message}`;
        resultsEl.innerHTML = '';
    }
}

async function retryReliabilityOutbox(outboxId) {
    if (!outboxId) return;
    const confirmed = window.confirm('Solicitar nova tentativa para esta mensagem da outbox?');
    if (!confirmed) return;

    try {
        const response = await api.retryReliabilityOutbox(outboxId);
        const target = response?.outbox || {};
        alert(`Retentativa agendada para ${target.recipient || outboxId}.`);
        await loadReliability();
    } catch (error) {
        console.error(error);
        alert(`Falha ao solicitar retentativa: ${error.message}`);
    }
}

async function retryReliabilityInbox(inboxId) {
    if (!inboxId) return;
    const confirmed = window.confirm('Solicitar reprocessamento manual deste evento de inbox?');
    if (!confirmed) return;

    try {
        const response = await api.retryReliabilityInbox(inboxId);
        const target = response?.inbox || {};
        alert(`Reprocessamento agendado para ${target.providerMessageId || inboxId}.`);
        await loadReliability();
    } catch (error) {
        console.error(error);
        alert(`Falha ao solicitar retry da inbox: ${error.message}`);
    }
}

function openTenantModal(tenantId = '') {
    const form = document.getElementById('tenant-form');
    form.reset();

    const tenant = state.tenants.find((item) => item.id === tenantId);
    const isEditing = !!tenant;

    document.getElementById('tm-id').value = isEditing ? tenant.id : '';
    document.getElementById('tm-title').textContent = isEditing ? 'Editar estabelecimento' : 'Novo estabelecimento';
    document.getElementById('tm-name').value = isEditing ? (tenant.name || '') : '';
    document.getElementById('tm-slug').value = isEditing ? (tenant.slug || '') : '';
    document.getElementById('tm-waba-id').value = isEditing ? (tenant.wabaId || '') : '';
    document.getElementById('tm-message-price').value = isEditing ? (tenant.messagePrice !== undefined ? tenant.messagePrice : 0.02) : '0.02';
    document.getElementById('tm-whatsapp-number').value = isEditing ? (tenant.whatsappNumber || '') : '';
    document.getElementById('tm-email').value = isEditing ? (tenant.adminEmail || '') : '';
    document.getElementById('tm-password').value = '';
    document.getElementById('tm-establishment-type').value = isEditing ? getTenantEstablishmentType(tenant) : 'RESTAURANT';
    renderTenantProfilePreview();

    const passwordInput = document.getElementById('tm-password');
    passwordInput.required = !isEditing;
    passwordInput.placeholder = isEditing ? 'Preencha só se quiser trocar a senha' : '******';

    document.getElementById('tenant-modal').classList.add('active');
}

function renderTenantProfilePreview() {
    const type = document.getElementById('tm-establishment-type')?.value || 'RESTAURANT';
    const target = document.getElementById('tm-profile-preview');
    if (!target) return;
    const retail = ['MARKET', 'PHARMACY'].includes(type);
    target.innerHTML = retail
        ? `<div><span>▦</span><section><strong>Perfil operacional de loja</strong><p>Produtos, estoque, separação, pagamentos e Delivery. Mesas, comandas e cozinha ficam fora deste perfil.</p><div><b>Produtos</b><b>Estoque</b><b>Separação</b><b>Delivery opcional</b></div></section></div>${runtimeConfig.retailProfileApiEnabled ? '' : '<small>Frontend preparado. A seleção ficará como rascunho local até o módulo Loja ser ativado.</small>'}`
        : '<div><span>🍽</span><section><strong>Perfil FOOD SERVICE</strong><p>Cardápio, atendimento, mesas, comandas e produção em cozinha/bar.</p></section></div>';
}

function closeTenantModal() {
    document.getElementById('tenant-modal').classList.remove('active');
}

async function openPaymentGatewayModal(tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    try {
        const response = await api.getPaymentGateway(tenantId);
        document.getElementById('pgm-tenant-id').value = tenantId;
        document.getElementById('pgm-tenant-name').textContent = response?.tenantName || tenant.name || '';
        renderPaymentGatewayProfiles(response?.profiles || []);
        resetPaymentGatewayProfileForm();
        document.getElementById('payment-gateway-modal').classList.add('active');
    } catch (error) {
        console.error(error);
        alert(`Falha ao abrir gateway: ${error.message}`);
    }
}

function renderPaymentGatewayProfiles(profiles) {
    const container = document.getElementById('pgm-profiles');
    if (!container) return;
    if (!profiles.length) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Nenhuma credencial cadastrada. Cadastre a primeira abaixo.</div>';
        return;
    }
    container.innerHTML = profiles.map((profile) => `
        <div style="border:1px solid ${profile.active ? 'rgba(16,185,129,.55)' : 'var(--border)'};border-radius:10px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>${escapeHtml(profile.name)}</strong><span style="font-size:12px;color:${profile.active ? '#22c55e' : 'var(--text-muted)'}">${profile.active ? '● Ativa' : 'Inativa'} · ${escapeHtml(profile.environment)}</span></div>
            <div style="font-size:12px;color:var(--text-muted);margin:5px 0 10px">Public Key: ${escapeHtml(profile.publicKey || '-')} · Token: ${profile.accessTokenConfigured ? 'protegido' : 'ausente'}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn" style="padding:5px 9px" onclick="editPaymentGatewayProfile('${escapeHtml(profile.id)}')">Editar</button>
                ${profile.active ? '' : `<button type="button" class="btn" style="padding:5px 9px;background:rgba(16,185,129,.2);color:#86efac" onclick="activatePaymentGatewayProfile('${escapeHtml(profile.id)}')">Ativar</button><button type="button" class="btn" style="padding:5px 9px;background:rgba(239,68,68,.15);color:#fca5a5" onclick="deletePaymentGatewayProfile('${escapeHtml(profile.id)}')">Excluir</button>`}
            </div>
        </div>`).join('');
    window.paymentGatewayProfiles = profiles;
}

function resetPaymentGatewayProfileForm() {
    document.getElementById('pgm-profile-id').value = '';
    document.getElementById('pgm-profile-name').value = '';
    document.getElementById('pgm-environment').value = 'TEST';
    document.getElementById('pgm-public-key').value = '';
    document.getElementById('pgm-access-token').value = '';
    document.getElementById('pgm-activate').checked = true;
    document.getElementById('pgm-token-status').textContent = 'O Access Token será salvo cifrado e nunca será exibido novamente.';
    document.getElementById('pgm-form-title').textContent = 'Nova credencial Mercado Pago';
}

function editPaymentGatewayProfile(profileId) {
    const profile = (window.paymentGatewayProfiles || []).find((item) => item.id === profileId);
    if (!profile) return;
    document.getElementById('pgm-profile-id').value = profile.id;
    document.getElementById('pgm-profile-name').value = profile.name || '';
    document.getElementById('pgm-environment').value = profile.environment || 'TEST';
    document.getElementById('pgm-public-key').value = profile.publicKey || '';
    document.getElementById('pgm-access-token').value = '';
    document.getElementById('pgm-activate').checked = !!profile.active;
    document.getElementById('pgm-token-status').textContent = 'Token já protegido. Deixe vazio para mantê-lo ou preencha para substituir.';
    document.getElementById('pgm-form-title').textContent = `Editar: ${profile.name}`;
}

async function refreshPaymentGatewayProfiles() {
    const tenantId = document.getElementById('pgm-tenant-id').value.trim();
    const response = await api.getPaymentGateway(tenantId);
    renderPaymentGatewayProfiles(response?.profiles || []);
    return response;
}

async function activatePaymentGatewayProfile(profileId) {
    const tenantId = document.getElementById('pgm-tenant-id').value.trim();
    try {
        await api.activatePaymentGatewayProfile(tenantId, profileId);
        await refreshPaymentGatewayProfiles();
        await loadTenants();
    } catch (error) { alert(`Falha ao ativar credencial: ${error.message}`); }
}

async function deletePaymentGatewayProfile(profileId) {
    if (!confirm('Excluir esta credencial? A credencial ativa não pode ser excluída.')) return;
    const tenantId = document.getElementById('pgm-tenant-id').value.trim();
    try {
        await api.deletePaymentGatewayProfile(tenantId, profileId);
        await refreshPaymentGatewayProfiles();
    } catch (error) { alert(`Falha ao excluir credencial: ${error.message}`); }
}

function closePaymentGatewayModal() {
    document.getElementById('payment-gateway-modal').classList.remove('active');
}

async function savePaymentGateway(event) {
    event.preventDefault();
    const tenantId = document.getElementById('pgm-tenant-id').value.trim();
    const profileId = document.getElementById('pgm-profile-id').value.trim();
    const payload = {
        name: document.getElementById('pgm-profile-name').value.trim(),
        provider: 'MERCADO_PAGO',
        environment: document.getElementById('pgm-environment').value,
        public_key: document.getElementById('pgm-public-key').value.trim(),
        access_token: document.getElementById('pgm-access-token').value.trim(),
        activate: !!document.getElementById('pgm-activate').checked,
    };
    try {
        if (profileId) await api.updatePaymentGatewayProfile(tenantId, profileId, payload);
        else await api.createPaymentGatewayProfile(tenantId, payload);
        await refreshPaymentGatewayProfiles();
        resetPaymentGatewayProfileForm();
        await loadTenants();
        alert('Credencial de pagamento salva.');
    } catch (error) {
        console.error(error);
        alert(`Falha ao salvar gateway: ${error.message}`);
    }
}

async function saveTenant(event) {
    event.preventDefault();

    const tenantId = document.getElementById('tm-id').value.trim();
    const payload = {
        name: document.getElementById('tm-name').value.trim(),
        slug: document.getElementById('tm-slug').value.trim().toLowerCase(),
        waba_id: normalizeDigits(document.getElementById('tm-waba-id').value),
        message_price: parseFloat(document.getElementById('tm-message-price').value),
        whatsapp_number: normalizeDigits(document.getElementById('tm-whatsapp-number').value),
        admin_email: document.getElementById('tm-email').value.trim().toLowerCase(),
        admin_password: document.getElementById('tm-password').value,
    };
    const establishmentType = document.getElementById('tm-establishment-type').value;
    if (runtimeConfig.retailProfileApiEnabled) payload.establishment_type = establishmentType;

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

        if (!runtimeConfig.retailProfileApiEnabled && tenantId) {
            const drafts = readRetailProfileDrafts();
            drafts[tenantId] = establishmentType;
            localStorage.setItem(RETAIL_PROFILE_DRAFT_KEY, JSON.stringify(drafts));
        }

        closeTenantModal();
        await loadTenants();
        if (state.activePage === 'dashboard') {
            await loadDashboard();
        }
        if (state.activePage === 'operations') {
            await loadOperations();
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
        if (state.activePage === 'operations') {
            await loadOperations();
        }
    } catch (error) {
        console.error(error);
        alert(`Falha ao atualizar status: ${error.message}`);
    }
}

function closeDeliveryModuleModal() {
    document.getElementById('delivery-module-modal')?.classList.remove('active');
}

function closeAttendanceModuleModal() {
    document.getElementById('attendance-module-modal')?.classList.remove('active');
}

function closeRetailModuleModal() {
    document.getElementById('retail-module-modal')?.classList.remove('active');
}

function closeFoodStoreModuleModal() {
    document.getElementById('food-store-module-modal')?.classList.remove('active');
}

function openAttendanceModuleModal(tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const enabled = tenant.attendanceEnabled !== false;
    document.getElementById('am-title').textContent = `Atendimento · ${enabled ? 'Ativo' : 'Desativado'}`;
    document.getElementById('am-body').innerHTML = `<div class="card" style="margin:0;border-color:${enabled ? 'rgba(16,185,129,.35)' : 'rgba(245,158,11,.35)'}">
                <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Tenant</div>
                <h3 style="margin-bottom:10px">${escapeHtml(tenant.name)}</h3>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="badge ${enabled ? 'active' : 'inactive'}">${enabled ? 'ATIVO' : 'DESATIVADO'}</span><strong>Atendimento</strong></div>
                <p class="page-sub" style="margin:0">${enabled ? 'Mesas, comandas, chamados de garçom e KDS Salão estão disponíveis.' : 'Novas operações presenciais estão bloqueadas. Dados existentes permanecem preservados.'}</p>
                <div style="margin-top:18px;padding:14px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)"><strong style="display:block;font-size:13px;margin-bottom:8px">O que o Atendimento libera</strong><ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:12px;line-height:1.7"><li>Mesas e comandas presenciais</li><li>Chamados de garçom e fluxo de atendimento</li><li>KDS Salão para acompanhar a operação</li></ul></div>
           </div>`;
    document.getElementById('am-footer').innerHTML = enabled
        ? `<button class="btn" style="background:rgba(239,68,68,.18);color:#fca5a5" onclick="setTenantAttendance('${escapeHtml(tenant.id)}', false)">Desativar Atendimento</button><button class="btn" onclick="closeAttendanceModuleModal()">Fechar</button>`
        : `<button class="btn" onclick="setTenantAttendance('${escapeHtml(tenant.id)}', true)">Ativar Atendimento</button><button class="btn" style="background:transparent;border:1px solid var(--border);color:var(--text-main)" onclick="closeAttendanceModuleModal()">Cancelar</button>`;
    document.getElementById('attendance-module-modal').classList.add('active');
}

async function setTenantAttendance(tenantId, enabled) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const action = enabled ? 'ativar' : 'desativar';
    if (!confirm(`Deseja ${action} o módulo Atendimento de ${tenant.name}?`)) return;
    try {
        await api.setTenantAttendanceEnabled(tenantId, enabled);
        await loadTenants();
        closeAttendanceModuleModal();
        alert(`Módulo Atendimento ${enabled ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (error) {
        alert(`Falha ao ${action} o módulo Atendimento: ${error.message}`);
    }
}

function openFoodStoreModuleModal(tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const enabled = tenant.foodStoreEnabled === true;
    document.getElementById('fsm-title').textContent = `Loja de comidas · ${enabled ? 'Ativa' : 'Desativada'}`;
    document.getElementById('fsm-body').innerHTML = `<div class="card" style="margin:0;border-color:${enabled ? 'rgba(16,185,129,.35)' : 'rgba(245,158,11,.35)'}"><div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Tenant</div><h3 style="margin-bottom:10px">${escapeHtml(tenant.name)}</h3><div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="badge ${enabled ? 'active' : 'inactive'}">${enabled ? 'ATIVA' : 'DESATIVADA'}</span><strong>Cardápio e pedidos de comida</strong></div><p class="page-sub" style="margin:0">${enabled ? 'O cardápio autenticado, adicionais e pedidos de comida ficam disponíveis. Delivery continua sendo apenas a forma de entrega.' : 'Ative para vender comidas preparadas pelo cardápio. Produtos, estoque e Central de Separação continuam no módulo Loja de produtos.'}</p><div style="margin-top:18px;padding:14px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)"><strong style="display:block;font-size:13px;margin-bottom:8px">O que este módulo libera</strong><ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:12px;line-height:1.7"><li>Cardápio, categorias e complementos</li><li>Pedidos para Cozinha e KDS</li><li>Link “Comidas” no WhatsApp</li></ul></div></div>`;
    document.getElementById('fsm-footer').innerHTML = enabled
        ? `<button class="btn" style="background:rgba(239,68,68,.18);color:#fca5a5" onclick="setTenantFoodStore('${escapeHtml(tenant.id)}', false)">Desativar Loja de comidas</button><button class="btn" onclick="closeFoodStoreModuleModal()">Fechar</button>`
        : `<button class="btn" onclick="setTenantFoodStore('${escapeHtml(tenant.id)}', true)">Ativar Loja de comidas</button><button class="btn" style="background:transparent;border:1px solid var(--border);color:var(--text-main)" onclick="closeFoodStoreModuleModal()">Cancelar</button>`;
    document.getElementById('food-store-module-modal').classList.add('active');
}

async function setTenantFoodStore(tenantId, enabled) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const action = enabled ? 'ativar' : 'desativar';
    if (!confirm(`Deseja ${action} a Loja de comidas de ${tenant.name}?`)) return;
    try {
        await api.setTenantFoodStoreEnabled(tenantId, enabled);
        await loadTenants();
        closeFoodStoreModuleModal();
        alert(`Loja de comidas ${enabled ? 'ativada' : 'desativada'} com sucesso.`);
    } catch (error) {
        alert(`Falha ao ${action} a Loja de comidas: ${error.message}`);
    }
}

function openRetailModuleModal(tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const enabled = tenant.retailEnabled === true;
    document.getElementById('rm-title').textContent = `${RETAIL_DISPLAY_NAME} · ${enabled ? 'Ativo' : 'Desativado'}`;
    document.getElementById('rm-body').innerHTML = `<div class="card" style="margin:0;border-color:${enabled ? 'rgba(16,185,129,.35)' : 'rgba(96,165,250,.35)'}">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Tenant</div>
        <h3 style="margin-bottom:10px">${escapeHtml(tenant.name)}</h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="badge ${enabled ? 'active' : 'inactive'}">${enabled ? 'ATIVO' : 'DESATIVADO'}</span><strong>${RETAIL_DISPLAY_NAME}</strong></div>
        <p class="page-sub" style="margin:0">${enabled ? 'Produtos, estoque e separação ficam disponíveis junto dos módulos já ativos. Atendimento e Delivery não são alterados.' : 'Ative para operar catálogo de produtos, estoque e Central de Separação sem remover os fluxos de restaurante.'}</p>
        <div style="margin-top:18px;padding:14px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)"><strong style="display:block;font-size:13px;margin-bottom:8px">O que o módulo Loja libera</strong><ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:12px;line-height:1.7"><li>Produtos, SKU e categorias próprias</li><li>Estoque, saldos e lotes</li><li>Central de Separação, sem criar pedido na cozinha</li></ul></div>
    </div>`;
    document.getElementById('rm-footer').innerHTML = enabled
        ? `<button class="btn" style="background:rgba(239,68,68,.18);color:#fca5a5" onclick="setTenantRetail('${escapeHtml(tenant.id)}', false)">Desativar ${RETAIL_DISPLAY_NAME}</button><button class="btn" onclick="closeRetailModuleModal()">Fechar</button>`
        : `<button class="btn" onclick="setTenantRetail('${escapeHtml(tenant.id)}', true)">Ativar ${RETAIL_DISPLAY_NAME}</button><button class="btn" style="background:transparent;border:1px solid var(--border);color:var(--text-main)" onclick="closeRetailModuleModal()">Cancelar</button>`;
    document.getElementById('retail-module-modal').classList.add('active');
}

async function setTenantRetail(tenantId, enabled) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const action = enabled ? 'ativar' : 'desativar';
    if (!confirm(`Deseja ${action} o módulo ${RETAIL_DISPLAY_NAME} de ${tenant.name}?`)) return;
    try {
        await api.setTenantRetailEnabled(tenantId, enabled);
        await loadTenants();
        closeRetailModuleModal();
        alert(`Módulo ${RETAIL_DISPLAY_NAME} ${enabled ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (error) {
        alert(`Falha ao ${action} o módulo ${RETAIL_DISPLAY_NAME}: ${error.message}`);
    }
}

function formatModuleDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '—';
}

function toDateTimeLocal(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toggleDeliveryExpiryField(permanent) {
    const field = document.getElementById('dm-expires-at');
    if (!field) return;
    field.disabled = !!permanent;
    if (permanent) field.value = '';
}

function openDeliveryModuleModal(tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const enabled = tenant.deliveryEnabled === true;
    document.getElementById('dm-title').textContent = `Delivery · ${enabled ? 'Ativo' : 'Desativado'}`;
    const permanent = tenant.deliveryPermanent === true || (!tenant.deliveryExpiresAt && enabled);
    document.getElementById('dm-body').innerHTML = `<div class="card" style="margin:0;border-color:${enabled ? 'rgba(16,185,129,.35)' : 'rgba(96,165,250,.35)'}">
                <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Tenant</div>
                <h3 style="margin-bottom:10px">${escapeHtml(tenant.name)}</h3>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><span class="badge ${enabled ? 'active' : 'inactive'}">${enabled ? 'ATIVO' : 'DESATIVADO'}</span><strong>Delivery</strong></div>
                <p class="page-sub" style="margin:0">${enabled ? 'O restaurante pode configurar e operar entregas pelo painel Admin e WhatsApp.' : 'O Delivery não aparece para o restaurante nem para os clientes deste tenant.'}</p>
                <div style="margin-top:18px;padding:14px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)"><strong style="display:block;font-size:13px;margin-bottom:8px">O que o Delivery libera</strong><ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:12px;line-height:1.7"><li>Área de atendimento, endereço de origem e taxas</li><li>Agenda, capacidade e aceite automático</li><li>Pedidos pelo WhatsApp/cardápio, KDS Delivery e rastreamento</li></ul></div>
                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px">
                    <div><div style="font-size:12px;color:var(--text-muted);margin-bottom:5px">Ativo desde</div><strong>${escapeHtml(formatModuleDate(tenant.deliveryEnabledAt))}</strong></div>
                    <div><div style="font-size:12px;color:var(--text-muted);margin-bottom:5px">Última data limite</div><strong>${escapeHtml(tenant.deliveryPermanent || (enabled && !tenant.deliveryExpiresAt) ? 'Permanente' : formatModuleDate(tenant.deliveryExpiresAt))}</strong></div>
                </div>
                <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
                    <div style="font-size:13px;font-weight:700;margin-bottom:10px">Validade do módulo</div>
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px"><input id="dm-permanent" type="checkbox" ${permanent ? 'checked' : ''} onchange="toggleDeliveryExpiryField(this.checked)"> Ativação permanente</label>
                    <input id="dm-expires-at" class="input" type="datetime-local" value="${escapeHtml(toDateTimeLocal(tenant.deliveryExpiresAt))}" ${permanent ? 'disabled' : ''}>
                    <small style="display:block;color:var(--text-muted);margin-top:7px">Escolha uma data futura ou marque permanente.</small>
                </div>
           </div>`;
    document.getElementById('dm-footer').innerHTML = enabled
        ? `<button class="btn" onclick="setTenantDelivery('${escapeHtml(tenant.id)}', true)">Salvar validade</button><button class="btn" style="background:rgba(239,68,68,.18);color:#fca5a5" onclick="setTenantDelivery('${escapeHtml(tenant.id)}', false)">Desativar Delivery</button><button class="btn" onclick="closeDeliveryModuleModal()">Fechar</button>`
        : `<button class="btn" onclick="setTenantDelivery('${escapeHtml(tenant.id)}', true)">Ativar Delivery</button><button class="btn" style="background:transparent;border:1px solid var(--border);color:var(--text-main)" onclick="closeDeliveryModuleModal()">Cancelar</button>`;
    document.getElementById('delivery-module-modal').classList.add('active');
}

async function setTenantDelivery(tenantId, enabled) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const action = enabled ? 'ativar' : 'desativar';
    const payload = { enabled: !!enabled };
    if (enabled) {
        const permanent = document.getElementById('dm-permanent')?.checked === true;
        const rawExpiry = String(document.getElementById('dm-expires-at')?.value || '').trim();
        if (!permanent) {
            const expiry = rawExpiry ? new Date(rawExpiry) : null;
            if (!expiry || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
                alert('Informe uma data limite futura ou marque a ativação como permanente.');
                return;
            }
            payload.expires_at = expiry.toISOString();
            payload.permanent = false;
        } else {
            payload.expires_at = null;
            payload.permanent = true;
        }
    }
    if (!confirm(`Deseja ${action} o módulo Delivery de ${tenant.name}?`)) return;
    try {
        await api.setTenantDeliveryEnabled(tenantId, payload);
        await loadTenants();
        closeDeliveryModuleModal();
        alert(`Módulo Delivery ${enabled ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (error) {
        alert(`Falha ao ${action} o módulo Delivery: ${error.message}`);
    }
}

function openWalletModal(tenantId) {
    const form = document.getElementById('wallet-form');
    form.reset();

    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;

    document.getElementById('wm-id').value = tenant.id;
    document.getElementById('wm-tenant-name').textContent = tenant.name;
    document.getElementById('wm-plan').value = tenant.billingPlan || 'pre_paid';
    document.getElementById('wm-amount').value = '';

    document.getElementById('wallet-modal').classList.add('active');
}

function closeWalletModal() {
    document.getElementById('wallet-modal').classList.remove('active');
}

async function saveWallet(event) {
    event.preventDefault();

    const tenantId = document.getElementById('wm-id').value.trim();
    if (!tenantId) return;

    const amountStr = document.getElementById('wm-amount').value.trim();
    const plan = document.getElementById('wm-plan').value;

    const payload = { billing_plan: plan };
    if (amountStr) {
        payload.amount = parseFloat(amountStr);
    }

    try {
        await api.updateWallet(tenantId, payload);
        closeWalletModal();
        await loadWallet();
        if (state.activePage === 'operations') {
            await loadOperations();
        }
        alert('Carteira atualizada com sucesso!');
    } catch (error) {
        console.error(error);
        alert(`Falha ao atualizar carteira: ${error.message}`);
    }
}

async function logout() {
    try {
        await api.logout();
    } catch (_error) {
        // The client still clears the local session if the token is already invalid.
    }
    clearSession();
    window.location.href = LOGIN_PAGE_PATH;
}

async function bootstrap() {
    try {
        state.session = await api.getSessionProfile();
        if (state.session?.operatorName) {
            sessionStorage.setItem('super_admin_operator_name', state.session.operatorName);
        }
        navigate('dashboard');
    } catch (error) {
        console.error(error);
        clearSession();
        window.location.href = LOGIN_PAGE_PATH;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
});
