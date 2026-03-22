const messageStatementState = {
    page: 1,
    limit: 20,
};

async function loadExtratoMensagens() {
    const container = document.getElementById('page-extratoMensagens');
    if (!container) return;

    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            Carregando extrato de mensagens...
        </div>
    `;

    try {
        const response = await api.get('/wallet/messages/statement', {
            page: messageStatementState.page,
            limit: messageStatementState.limit,
        });

        const items = Array.isArray(response?.items) ? response.items : [];
        const total = Number(response?.total || 0);
        const summary = response?.summary || {};
        const messagesIn = Number(summary.messagesIn || 0);
        const messagesOut = Number(summary.messagesOut || 0);
        const messagesUsed = Number(summary.messagesUsed || (messagesIn + messagesOut));
        const totalPages = Math.max(1, Math.ceil(total / messageStatementState.limit));
        const currentPage = Math.min(Math.max(Number(response?.page || messageStatementState.page), 1), totalPages);
        const canGoPrev = currentPage > 1;
        const canGoNext = currentPage < totalPages;

        messageStatementState.page = currentPage;

        const rows = items.map((item, index) => {
            const actor = item.actor === 'user'
                ? {
                    label: 'Usuário',
                    detail: 'Mensagem recebida',
                    badgeStyle: 'background:rgba(59,130,246,0.12); color:#2563eb;',
                    iconStyle: 'background:linear-gradient(135deg, #dbeafe, #bfdbfe); color:#1d4ed8;',
                }
                : {
                    label: 'Robô',
                    detail: 'Resposta enviada',
                    badgeStyle: 'background:rgba(26,188,156,0.14); color:#0f766e;',
                    iconStyle: 'background:linear-gradient(135deg, #dcfce7, #a7f3d0); color:#047857;',
                };

            return `
                <tr>
                    <td style="padding:16px 18px; border-bottom:1px solid var(--border);">
                        <div class="cell-name">
                            <div class="cell-avatar" style="${actor.iconStyle}">${item.actor === 'user' ? 'IN' : 'OUT'}</div>
                            <div>
                                <div style="font-weight:700; color:var(--dark);">${escapeHTML(item.userPhone || 'Não identificado')}</div>
                                <div style="font-size:12px; color:var(--muted);">Registro ${escapeHTML(String(total - ((currentPage - 1) * messageStatementState.limit + index)))}</div>
                            </div>
                        </div>
                    </td>
                    <td style="padding:16px 18px; border-bottom:1px solid var(--border);">
                        <span class="status-pill" style="${actor.badgeStyle}">${actor.label}</span>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">${actor.detail}</div>
                    </td>
                    <td style="padding:16px 18px; border-bottom:1px solid var(--border);">
                        <div style="font-weight:700; color:var(--dark);">${formatStatementDate(item.occurredAt)}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">${formatStatementTime(item.occurredAt)}</div>
                    </td>
                    <td style="padding:16px 18px; border-bottom:1px solid var(--border);">
                        <span title="${escapeHTML(item.preview || 'Sem detalhes')}">${escapeHTML(item.previewShort || 'Sem dados')}</span>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:22px;">
                <div style="
                    background: linear-gradient(135deg, #1f2937 0%, #334155 100%);
                    color:#fff;
                    border-radius:20px;
                    padding:28px 30px;
                    position:relative;
                    overflow:hidden;
                    box-shadow: var(--shadow-lg);
                ">
                    <div style="position:absolute; inset:auto -40px -60px auto; width:200px; height:200px; border-radius:50%; background:rgba(26,188,156,0.08);"></div>
                    <div style="position:relative; z-index:1; display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;">
                        <div>
                            <div style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:10px;">Transparência de cobrança</div>
                            <div style="font-size:30px; font-weight:800; font-family:'Sora',sans-serif; line-height:1.1; margin-bottom:10px;">Cada linha abaixo equivale a 1 mensagem contabilizada.</div>
                            <div style="font-size:13px; color:rgba(255,255,255,0.65); max-width:640px;">
                                O extrato mostra o telefone do cliente, quem originou a mensagem, data e hora do evento e um resumo curto do conteúdo.
                            </div>
                        </div>
                        <button type="button" class="btn-sm btn-outline" style="background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.12); color:#fff;" onclick="navigate('wallet')">
                            Voltar para carteira
                        </button>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
                    <div class="stat-card">
                        <div class="stat-icon">🧾</div>
                        <div class="stat-label">Total contabilizado</div>
                        <div class="stat-value">${formatWalletInteger(messagesUsed)}</div>
                        <div class="stat-change" style="color:var(--muted);">${formatWalletInteger(total)} lançamentos no extrato</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📥</div>
                        <div class="stat-label">Recebidas do usuário</div>
                        <div class="stat-value">${formatWalletInteger(messagesIn)}</div>
                        <div class="stat-change" style="color:var(--muted);">Entrada via WhatsApp</div>
                    </div>
                    <div class="stat-card teal-card">
                        <div class="stat-icon">📤</div>
                        <div class="stat-label">Respostas do robô</div>
                        <div class="stat-value">${formatWalletInteger(messagesOut)}</div>
                        <div class="stat-change" style="color:rgba(255,255,255,0.72);">Saída para o cliente</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Extrato de Mensagens</div>
                            <div class="card-subtitle">Página ${formatWalletInteger(currentPage)} de ${formatWalletInteger(totalPages)} · ${formatWalletInteger(total)} registros</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-sm btn-outline" ${canGoPrev ? '' : 'disabled'} onclick="changeMessageStatementPage(-1)" style="${canGoPrev ? '' : 'opacity:0.5; cursor:not-allowed;'}">
                                Anterior
                            </button>
                            <button type="button" class="btn-sm btn-primary" ${canGoNext ? '' : 'disabled'} onclick="changeMessageStatementPage(1)" style="${canGoNext ? '' : 'opacity:0.5; cursor:not-allowed;'}">
                                Próxima
                            </button>
                        </div>
                    </div>

                    <div style="padding:0 0 8px;">
                        <div style="overflow:auto;">
                            <table style="width:100%; border-collapse:collapse; min-width:760px;">
                                <thead>
                                    <tr style="background:rgba(240,242,245,0.7);">
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Telefone do usuário</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Origem</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Data e hora</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Descrição breve</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows || `
                                        <tr>
                                            <td colspan="4">
                                                <div class="empty-state">
                                                    <div class="icon">🧾</div>
                                                    <h3>Nenhuma mensagem contabilizada</h3>
                                                    <p>Quando o restaurante começar a consumir mensagens, o extrato aparecerá aqui.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">⚠️</div>
                <h3>Erro ao carregar extrato</h3>
                <p>${escapeHTML(err.message || 'Tente novamente.')}</p>
            </div>
        `;
    }
}

function changeMessageStatementPage(delta) {
    const nextPage = Math.max(1, messageStatementState.page + Number(delta || 0));
    if (nextPage === messageStatementState.page) return;
    messageStatementState.page = nextPage;
    loadExtratoMensagens();
}

function formatStatementDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function formatStatementTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}
