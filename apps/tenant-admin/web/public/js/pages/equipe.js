const equipeRoleVisuals = {
    ADMIN: { label: 'Administrador', bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.22)', color: '#b91c1c' },
    MANAGER: { label: 'Gerente', bg: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.22)', color: '#1d4ed8' },
    WAITER: { label: 'Garçom', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.24)', color: '#b45309' },
    KITCHEN: { label: 'Cozinha', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.24)', color: '#047857' },
    BAR: { label: 'Bar', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.24)', color: '#7c3aed' },
    CASHIER: { label: 'Caixa', bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.24)', color: '#0f766e' },
};

const equipeState = {
    payload: null,
    filters: {
        search: '',
        role: 'ALL',
        status: 'ALL',
    },
};

async function loadEquipePage() {
    const container = document.getElementById('page-equipe');
    if (!container) return;

    if (!canAccessPage('equipe')) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔒</div>
                <h3>Acesso restrito</h3>
                <p>Seu perfil nao possui permissao para gerenciar usuarios internos.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando equipe...</div>';

    try {
        equipeState.payload = await api.get('/auth/users');
        renderEquipePage();
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">⚠️</div>
                <h3>Erro ao carregar equipe</h3>
                <p>${escapeHTML(err.message || 'Falha ao consultar os usuarios internos.')}</p>
            </div>
        `;
    }
}

function renderEquipePage() {
    const container = document.getElementById('page-equipe');
    if (!container) return;

    const payload = equipeState.payload;
    if (!payload) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">👥</div>
                <h3>Nenhum dado carregado</h3>
                <p>Atualize a tela para consultar os usuarios internos.</p>
            </div>
        `;
        return;
    }

    const summary = payload.summary || {};
    const roleBreakdown = Array.isArray(summary.roleBreakdown) ? summary.roleBreakdown : [];
    const users = getEquipeFilteredUsers();
    const currentUser = getCurrentUser() || {};

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-label">Usuários Ativos</div>
                <div class="stat-value">${Number(summary.activeUsers || 0)}</div>
                <div class="stat-change" style="color:var(--muted)">${Number(summary.totalUsers || 0)} acessos cadastrados</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⏸</div>
                <div class="stat-label">Usuários Inativos</div>
                <div class="stat-value">${Number(summary.inactiveUsers || 0)}</div>
                <div class="stat-change" style="color:var(--muted)">Acessos bloqueados sem exclusao fisica</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🕒</div>
                <div class="stat-label">Login nos últimos 7 dias</div>
                <div class="stat-value">${Number(summary.recentLogins7d || 0)}</div>
                <div class="stat-change" style="color:var(--muted)">Base para conferir uso real da equipe</div>
            </div>
            <div class="stat-card teal-card">
                <div class="stat-icon">🔐</div>
                <div class="stat-label">Gestão de Acesso</div>
                <div class="stat-value">${escapeHTML(formatEquipeRoleLabel(currentUser.role || payload.currentUserRole || ''))}</div>
                <div class="stat-change">Seu perfil atual define o limite de criacao e manutencao da equipe.</div>
            </div>
        </div>

        <div class="full-card">
            <div class="card-header">
                <div>
                    <div class="card-title">Equipe interna</div>
                    <div class="card-subtitle">Crie acessos individuais e pare de compartilhar o login master do restaurante.</div>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-sm btn-outline" onclick="loadEquipePage()">Atualizar</button>
                    <button class="btn-sm btn-primary" onclick="openEquipeUserModal()">+ Novo usuário</button>
                </div>
            </div>

            <div style="padding:22px;">
                <div style="margin-bottom:18px; padding:14px 16px; border-radius:12px; background:rgba(26,188,156,0.08); border:1px solid rgba(26,188,156,0.18); color:var(--text-primary, #1f2937);">
                    Crie um acesso por pessoa, acompanhe ultimo login e desative rapidamente quem nao deve mais operar o tenant.
                </div>

                <div style="display:grid; grid-template-columns: minmax(220px, 2fr) minmax(160px, 1fr) minmax(160px, 1fr); gap:14px; margin-bottom:18px;">
                    <div class="form-group" style="margin:0;">
                        <label for="equipe-search">Buscar por nome ou email</label>
                        <input
                            id="equipe-search"
                            type="text"
                            value="${escapeHTML(equipeState.filters.search)}"
                            placeholder="Ex.: Maria ou maria@restaurante.com"
                            oninput="setEquipeFilter('search', this.value)"
                        />
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label for="equipe-role-filter">Perfil</label>
                        <select id="equipe-role-filter" onchange="setEquipeFilter('role', this.value)">
                            <option value="ALL">Todos os perfis</option>
                            ${buildEquipeRoleFilterOptions(payload.roleOptions || [], equipeState.filters.role)}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label for="equipe-status-filter">Status</label>
                        <select id="equipe-status-filter" onchange="setEquipeFilter('status', this.value)">
                            <option value="ALL" ${equipeState.filters.status === 'ALL' ? 'selected' : ''}>Todos</option>
                            <option value="ACTIVE" ${equipeState.filters.status === 'ACTIVE' ? 'selected' : ''}>Ativos</option>
                            <option value="INACTIVE" ${equipeState.filters.status === 'INACTIVE' ? 'selected' : ''}>Inativos</option>
                        </select>
                    </div>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px;">
                    ${roleBreakdown.length > 0 ? roleBreakdown.map((item) => `
                        <div style="padding:10px 12px; border-radius:12px; background:#fff; border:1px solid var(--border); display:flex; align-items:center; gap:10px;">
                            ${renderEquipeRoleBadge(item.role)}
                            <div>
                                <div style="font-size:12px; font-weight:700; color:var(--dark);">${escapeHTML(item.label)}</div>
                                <div style="font-size:11px; color:var(--muted);">${Number(item.active || 0)} ativos de ${Number(item.total || 0)}</div>
                            </div>
                        </div>
                    `).join('') : `
                        <div style="font-size:12px; color:var(--muted);">Nenhum perfil cadastrado ainda.</div>
                    `}
                </div>

                ${users.length === 0 ? `
                    <div class="empty-state" style="margin:12px 0 0;">
                        <div class="icon">🔎</div>
                        <h3>Nenhum usuário encontrado</h3>
                        <p>Altere os filtros ou crie um novo acesso para a equipe.</p>
                    </div>
                ` : `
                    <div style="overflow:auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuário</th>
                                    <th>Perfil</th>
                                    <th>Status</th>
                                    <th>Último acesso</th>
                                    <th>Criado em</th>
                                    <th style="width:240px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map((user) => renderEquipeUserRow(user)).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
    `;
}

function getEquipeFilteredUsers() {
    const payload = equipeState.payload || {};
    const rawUsers = Array.isArray(payload.users) ? payload.users : [];
    const search = String(equipeState.filters.search || '').trim().toLowerCase();
    const role = String(equipeState.filters.role || 'ALL').trim().toUpperCase();
    const status = String(equipeState.filters.status || 'ALL').trim().toUpperCase();

    return rawUsers.filter((user) => {
        const matchesSearch = !search
            || String(user.name || '').toLowerCase().includes(search)
            || String(user.email || '').toLowerCase().includes(search);
        const matchesRole = role === 'ALL' || String(user.role || '').toUpperCase() === role;
        const matchesStatus = status === 'ALL'
            || (status === 'ACTIVE' && !!user.active)
            || (status === 'INACTIVE' && !user.active);

        return matchesSearch && matchesRole && matchesStatus;
    });
}

function buildEquipeRoleFilterOptions(roleOptions, selectedRole) {
    return roleOptions.map((roleOption) => `
        <option value="${escapeHTML(roleOption.value)}" ${selectedRole === roleOption.value ? 'selected' : ''}>
            ${escapeHTML(roleOption.label)}
        </option>
    `).join('');
}

function renderEquipeUserRow(user) {
    const permissions = user.permissions || {};

    return `
        <tr>
            <td>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:38px; height:38px; border-radius:50%; background:${getGradient(Math.abs(hashString(String(user.email || user.id || ''))))}; color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center;">
                        ${escapeHTML(getInitials(user.name || 'U'))}
                    </div>
                    <div>
                        <div style="font-weight:700; color:var(--dark); display:flex; align-items:center; gap:8px;">
                            <span>${escapeHTML(user.name || '-')}</span>
                            ${user.isCurrentUser ? '<span style="font-size:10px; padding:4px 8px; border-radius:999px; background:rgba(26,188,156,0.10); color:var(--teal-dark);">Você</span>' : ''}
                        </div>
                        <div style="font-size:12px; color:var(--muted);">${escapeHTML(user.email || '-')}</div>
                        <div style="font-size:11px; color:var(--muted);">${escapeHTML(user.phone || 'Sem telefone informado')}</div>
                    </div>
                </div>
            </td>
            <td>${renderEquipeRoleBadge(user.role)}</td>
            <td>${renderEquipeStatusBadge(user.active)}</td>
            <td>
                <div style="font-size:12px; color:var(--dark);">${escapeHTML(formatEquipeDateTime(user.lastLoginAt))}</div>
                <div style="font-size:11px; color:var(--muted);">${user.lastLoginAt ? 'Ultima autenticacao registrada' : 'Usuario ainda nao entrou'}</div>
            </td>
            <td>
                <div style="font-size:12px; color:var(--dark);">${escapeHTML(formatDate(user.createdAt))}</div>
                <div style="font-size:11px; color:var(--muted);">${escapeHTML(formatTime(user.createdAt))}</div>
            </td>
            <td>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button class="btn-sm btn-outline" ${permissions.canEdit ? '' : 'disabled'} onclick="openEquipeUserModal('${escapeHTML(String(user.id))}')">Editar</button>
                    <button class="btn-sm btn-outline" ${permissions.canResetPassword ? '' : 'disabled'} onclick="openEquipePasswordResetModal('${escapeHTML(String(user.id))}')">Reset senha</button>
                    <button
                        class="btn-sm ${user.active ? 'btn-danger' : 'btn-primary'}"
                        ${permissions.canToggleStatus ? '' : 'disabled'}
                        onclick="toggleEquipeUserStatus('${escapeHTML(String(user.id))}', ${user.active ? 'false' : 'true'})"
                    >
                        ${user.active ? 'Desativar' : 'Reativar'}
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function renderEquipeRoleBadge(role) {
    const visual = equipeRoleVisuals[String(role || '').toUpperCase()] || {
        label: String(role || 'Perfil'),
        bg: 'rgba(31, 41, 55, 0.08)',
        border: 'rgba(31, 41, 55, 0.14)',
        color: '#1f2937',
    };

    return `
        <span style="display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; border:1px solid ${visual.border}; background:${visual.bg}; color:${visual.color}; font-size:11px; font-weight:700;">
            ${escapeHTML(visual.label)}
        </span>
    `;
}

function renderEquipeStatusBadge(active) {
    if (active) {
        return '<span class="status-pill status-done">Ativo</span>';
    }

    return '<span class="status-pill status-canceled">Inativo</span>';
}

function formatEquipeRoleLabel(role) {
    const visual = equipeRoleVisuals[String(role || '').toUpperCase()];
    return visual?.label || String(role || '-');
}

function formatEquipeDateTime(dateStr) {
    if (!dateStr) {
        return 'Nunca acessou';
    }

    return `${formatDate(dateStr)} às ${formatTime(dateStr)}`;
}

function setEquipeFilter(field, value) {
    equipeState.filters = {
        ...equipeState.filters,
        [field]: value,
    };
    renderEquipePage();
}

function openEquipeUserModal(userId = '') {
    const payload = equipeState.payload || {};
    const users = Array.isArray(payload.users) ? payload.users : [];
    const user = users.find((item) => String(item.id) === String(userId));
    const roleOptions = Array.isArray(payload.roleOptions) ? payload.roleOptions : [];
    const isEdit = !!user;
    const defaultRole = user?.role || roleOptions.find((roleOption) => roleOption.assignable)?.value || '';

    openModal(`
        <div class="modal-header">
            <h3>${isEdit ? 'Editar usuário interno' : 'Novo usuário interno'}</h3>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div style="margin-bottom:16px; padding:14px 16px; border-radius:12px; background:rgba(75,123,229,0.08); border:1px solid rgba(75,123,229,0.18); color:var(--text-primary, #1f2937);">
                ${isEdit
                    ? 'Atualize nome, contato e perfil operacional sem criar um novo login.'
                    : 'Crie um acesso individual para cada pessoa da operacao e defina o papel certo desde o inicio.'}
            </div>
            <div class="form-row-2">
                <div class="form-group">
                    <label for="equipe-user-name">Nome</label>
                    <input id="equipe-user-name" type="text" value="${escapeHTML(user?.name || '')}" />
                </div>
                <div class="form-group">
                    <label for="equipe-user-email">E-mail</label>
                    <input id="equipe-user-email" type="email" value="${escapeHTML(user?.email || '')}" />
                </div>
            </div>
            <div class="form-row-2">
                <div class="form-group">
                    <label for="equipe-user-phone">Telefone</label>
                    <input id="equipe-user-phone" type="text" value="${escapeHTML(user?.phone || '')}" placeholder="Opcional" />
                </div>
                <div class="form-group">
                    <label for="equipe-user-role">Perfil</label>
                    <select id="equipe-user-role">
                        ${roleOptions.map((roleOption) => `
                            <option
                                value="${escapeHTML(roleOption.value)}"
                                ${defaultRole === roleOption.value ? 'selected' : ''}
                                ${roleOption.assignable ? '' : 'disabled'}
                            >
                                ${escapeHTML(roleOption.label)}${roleOption.assignable ? '' : ' (restrito)'}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
            ${isEdit ? '' : `
                <div class="form-group">
                    <label for="equipe-user-password">Senha inicial</label>
                    <input id="equipe-user-password" type="password" autocomplete="new-password" />
                </div>
            `}
        </div>
        <div class="modal-footer">
            <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn-sm btn-primary" id="btn-save-equipe-user" onclick="saveEquipeUser('${escapeHTML(String(userId || ''))}')">
                ${isEdit ? 'Salvar alterações' : 'Criar usuário'}
            </button>
        </div>
    `);
}

async function saveEquipeUser(userId = '') {
    const isEdit = !!userId;
    const btnSave = document.getElementById('btn-save-equipe-user');
    const name = document.getElementById('equipe-user-name')?.value || '';
    const email = document.getElementById('equipe-user-email')?.value || '';
    const phone = document.getElementById('equipe-user-phone')?.value || '';
    const role = document.getElementById('equipe-user-role')?.value || '';
    const password = document.getElementById('equipe-user-password')?.value || '';

    if (!name.trim() || !email.trim() || !role.trim()) {
        showToast('Preencha nome, e-mail e perfil do usuário.', 'error');
        return;
    }

    if (!isEdit && password.trim().length < 6) {
        showToast('A senha inicial precisa ter pelo menos 6 caracteres.', 'error');
        return;
    }

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    }

    try {
        const payload = {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            role: role.trim(),
        };

        if (isEdit) {
            await api.patch(`/auth/users/${userId}`, payload);
            showToast('Usuário atualizado com sucesso.', 'success');
        } else {
            await api.post('/auth/users', {
                ...payload,
                password: password.trim(),
            });
            showToast('Usuário criado com sucesso.', 'success');
        }

        closeModal();
        await loadEquipePage();
    } catch (err) {
        showToast(err.message || 'Erro ao salvar o usuário.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = isEdit ? 'Salvar alterações' : 'Criar usuário';
        }
    }
}

async function toggleEquipeUserStatus(userId, nextActive) {
    const payload = equipeState.payload || {};
    const users = Array.isArray(payload.users) ? payload.users : [];
    const user = users.find((item) => String(item.id) === String(userId));
    if (!user) return;

    const actionLabel = nextActive ? 'reativar' : 'desativar';
    if (!window.confirm(`Deseja ${actionLabel} o acesso de ${user.name}?`)) {
        return;
    }

    try {
        await api.patch(`/auth/users/${userId}/status`, { active: !!nextActive });
        showToast(nextActive ? 'Usuário reativado com sucesso.' : 'Usuário desativado com sucesso.', 'success');
        await loadEquipePage();
    } catch (err) {
        showToast(err.message || 'Erro ao atualizar o status do usuário.', 'error');
    }
}

function openEquipePasswordResetModal(userId) {
    const payload = equipeState.payload || {};
    const users = Array.isArray(payload.users) ? payload.users : [];
    const user = users.find((item) => String(item.id) === String(userId));
    if (!user) return;

    openModal(`
        <div class="modal-header">
            <h3>Reset assistido de senha</h3>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div style="margin-bottom:16px; padding:14px 16px; border-radius:12px; background:rgba(245,158,11,0.10); border:1px solid rgba(245,158,11,0.24); color:var(--text-primary, #1f2937);">
                Defina uma nova senha temporaria para <strong>${escapeHTML(user.name)}</strong>. Oriente a pessoa a trocar a senha no primeiro acesso.
            </div>
            <div class="form-group">
                <label for="equipe-reset-password-input">Nova senha</label>
                <input id="equipe-reset-password-input" type="password" autocomplete="new-password" />
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn-sm btn-primary" id="btn-reset-equipe-password" onclick="resetEquipeUserPassword('${escapeHTML(String(user.id))}')">Atualizar senha</button>
        </div>
    `);
}

async function resetEquipeUserPassword(userId) {
    const password = document.getElementById('equipe-reset-password-input')?.value || '';
    const btnSave = document.getElementById('btn-reset-equipe-password');

    if (password.trim().length < 6) {
        showToast('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
        return;
    }

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    }

    try {
        await api.patch(`/auth/users/${userId}/password`, { password: password.trim() });
        closeModal();
        showToast('Senha redefinida com sucesso.', 'success');
        await loadEquipePage();
    } catch (err) {
        showToast(err.message || 'Erro ao redefinir a senha.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Atualizar senha';
        }
    }
}

function hashString(value) {
    let hash = 0;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return hash;
}
