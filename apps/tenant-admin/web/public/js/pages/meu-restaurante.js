// Meu Restaurante — Edição do perfil do restaurante
async function loadMeuRestaurante() {
    document.getElementById('page-title').textContent = 'Meu Restaurante';
    document.getElementById('page-sub').textContent = 'Gerencie os dados cadastrais do seu estabelecimento';

    const container = document.getElementById('page-meuRestaurante');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando...</div>';

    try {
        const profile = await api.get('/auth/tenant-profile');
        const showBillingInfo = !['WAITER', 'KITCHEN', 'BAR'].includes(getCurrentUserRole());

        const planLabel = profile.billing_plan === 'pre_paid' ? 'Pré-pago (Recarga)' : 'Pós-pago (Fatura)';

        container.innerHTML = `
            <div class="full-card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <div>
                        <div class="card-title">🏢 Dados do Restaurante</div>
                        <div class="card-subtitle">Informações exibidas no perfil e identificação do seu negócio</div>
                    </div>
                </div>
                <div style="padding: 20px 22px;">
                    <form id="form-tenant-profile" style="display: flex; flex-direction: column; gap: 18px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
                            <div class="form-group" style="margin: 0;">
                                <label for="tenant-name">Nome do Restaurante</label>
                                <input id="tenant-name" type="text" value="${escapeHTML(profile.name || '')}" placeholder="Ex: Restaurante Sabor & Arte" />
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label for="tenant-document">CPF / CNPJ</label>
                                <input id="tenant-document" type="text" value="${escapeHTML(profile.document || '')}" placeholder="Ex: 12.345.678/0001-90" />
                            </div>
                        </div>

                        <div class="form-group" style="margin: 0;">
                            <label for="tenant-address">Endereço Completo</label>
                            <input id="tenant-address" type="text" value="${escapeHTML(profile.address || '')}" placeholder="Ex: Rua das Flores, 123 — Centro, São Paulo/SP" />
                        </div>

                        <div style="display: flex; justify-content: flex-end; padding-top: 6px;">
                            <button type="submit" class="btn-sm btn-primary" id="btn-save-tenant-profile">
                                Salvar alterações
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="full-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">📋 Informações da Conta</div>
                        <div class="card-subtitle">Dados gerenciados pelo sistema — somente leitura</div>
                    </div>
                </div>
                <div style="padding: 20px 22px;">
                    <div style="display: grid; grid-template-columns: repeat(${showBillingInfo ? 3 : 2}, 1fr); gap: 14px;">
                        <div style="border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: var(--bg);">
                            <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px; margin-bottom: 6px;">Identificador (Slug)</div>
                            <div style="font-size: 15px; font-weight: 700; color: var(--dark); font-family: 'JetBrains Mono', monospace;">${escapeHTML(profile.slug || '—')}</div>
                        </div>
                        <div style="border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: var(--bg);">
                            <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px; margin-bottom: 6px;">WhatsApp</div>
                            <div style="font-size: 15px; font-weight: 700; color: var(--dark);">${escapeHTML(profile.whatsapp_number || '—')}</div>
                        </div>
                        ${showBillingInfo ? `
                        <div style="border: 1px solid var(--border); border-radius: 14px; padding: 16px; background: var(--bg);">
                            <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: var(--muted); letter-spacing: 0.6px; margin-bottom: 6px;">Plano</div>
                            <div style="font-size: 15px; font-weight: 700; color: var(--dark); display: flex; align-items: center; gap: 8px;">
                                ${escapeHTML(planLabel)}
                                <span class="status-pill status-done" style="font-size: 10px;">Ativo</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Form submit handler
        document.getElementById('form-tenant-profile').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-tenant-profile');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';

            const payload = {
                name: document.getElementById('tenant-name').value.trim(),
                document: document.getElementById('tenant-document').value.trim(),
                address: document.getElementById('tenant-address').value.trim(),
            };

            if (!payload.name) {
                showToast('O nome do restaurante é obrigatório.', 'error');
                btn.disabled = false;
                btn.textContent = 'Salvar alterações';
                return;
            }

            try {
                const res = await api.put('/auth/tenant-profile', payload);
                showToast('Perfil do restaurante atualizado com sucesso!', 'success');

                // Update sidebar logo text
                const logoText = document.querySelector('.logo-text');
                if (logoText) logoText.textContent = res.name || 'Restaurante';

                // Update session cache so drawer picks up the new data
                try {
                    const raw = localStorage.getItem('clickgarcom_auth') || sessionStorage.getItem('clickgarcom_auth');
                    if (raw) {
                        const session = JSON.parse(raw);
                        if (session && session.user) {
                            session.user.tenant_name = res.name || session.user.tenant_name;
                            session.user.tenant_document = res.document || '';
                            session.user.tenant_address = res.address || '';
                            const storage = localStorage.getItem('clickgarcom_auth') ? localStorage : sessionStorage;
                            storage.setItem('clickgarcom_auth', JSON.stringify(session));
                        }
                    }
                } catch (_) {}

            } catch (err) {
                showToast(err.message || 'Erro ao salvar perfil do restaurante.', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Salvar alterações';
            }
        });

    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar</h3><p>${err.message || 'Tente novamente.'}</p></div>`;
    }
}
