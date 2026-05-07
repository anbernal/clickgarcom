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
    document.getElementById('tm-title').textContent = isEditing ? 'Editar Restaurante' : 'Novo Restaurante';
    document.getElementById('tm-name').value = isEditing ? (tenant.name || '') : '';
    document.getElementById('tm-slug').value = isEditing ? (tenant.slug || '') : '';
    document.getElementById('tm-waba-id').value = isEditing ? (tenant.wabaId || '') : '';
    document.getElementById('tm-message-price').value = isEditing ? (tenant.messagePrice !== undefined ? tenant.messagePrice : 0.02) : '0.02';
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
        message_price: parseFloat(document.getElementById('tm-message-price').value),
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
