// ─── SVG ICONS ─────────────────────────────────────────────────
const EXTRATO_ICONS = {
  receipt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>',
  inbox: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  coin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};

const messageStatementState = {
    page: 1,
    limit: 20,
    filters: {
        period: 'all',
        actor: 'all',
        phone: '',
        dateFrom: '',
        dateTo: '',
    },
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
        const queryParams = buildMessageStatementQueryParams();
        const activeFilters = resolveMessageStatementFilters(messageStatementState.filters);
        const response = await api.get('/wallet/messages/statement', queryParams);

        const items = Array.isArray(response?.items) ? response.items : [];
        const total = Number(response?.total || 0);
        const summary = response?.summary || {};
        const messagesIn = Number(summary.messagesIn || 0);
        const messagesOut = Number(summary.messagesOut || 0);
        const messagesUsed = Number(summary.messagesUsed || (messagesIn + messagesOut));
        const unitPrice = Number(summary.unitPrice || 0.02);
        const totalAmount = Number(summary.totalAmount || (messagesUsed * unitPrice));
        const missingPhoneCount = Number(summary.missingPhoneCount || 0);
        const totalPages = Math.max(1, Math.ceil(total / messageStatementState.limit));
        const currentPage = Math.min(Math.max(Number(response?.page || messageStatementState.page), 1), totalPages);
        const canGoPrev = currentPage > 1;
        const canGoNext = currentPage < totalPages;
        const filterSummary = buildMessageStatementFilterSummary(activeFilters);

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
                    <td style="padding:16px 18px; border-bottom:1px solid var(--border);">
                        <div style="font-weight:800; color:var(--dark);">R$ ${formatWalletCurrency(item.amount || unitPrice)}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">Cobrança unitária</div>
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
                            <div style="font-size:30px; font-weight:800; font-family:'Sora',sans-serif; line-height:1.1; margin-bottom:10px;">
                                ${formatWalletInteger(messagesUsed)} mensagens x R$ ${formatWalletCurrency(unitPrice)} = R$ ${formatWalletCurrency(totalAmount)}
                            </div>
                            <div style="font-size:13px; color:rgba(255,255,255,0.65); max-width:700px;">
                                Regra atual: cada mensagem recebida e cada mensagem enviada entram no consumo. O resumo acima considera exatamente o recorte filtrado abaixo.
                            </div>
                            <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:10px;">${escapeHTML(filterSummary)}</div>
                        </div>
                        <button type="button" class="btn-sm btn-outline" style="background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.12); color:#fff;" onclick="navigate('wallet')">
                            Voltar para carteira
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Filtros do Extrato</div>
                            <div class="card-subtitle">Refine o período, a origem e o telefone para auditar o consumo.</div>
                        </div>
                    </div>
                    <div style="padding:22px;">
                        <form id="message-statement-filters" style="display:flex; flex-direction:column; gap:16px;">
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Período</label>
                                    <select id="message-statement-period" style="height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font-family:inherit;">
                                        ${renderMessageStatementPeriodOptions(messageStatementState.filters.period)}
                                    </select>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Origem</label>
                                    <select id="message-statement-actor" style="height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font-family:inherit;">
                                        ${renderMessageStatementActorOptions(messageStatementState.filters.actor)}
                                    </select>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Telefone</label>
                                    <input
                                        type="text"
                                        id="message-statement-phone"
                                        value="${escapeHTML(messageStatementState.filters.phone || '')}"
                                        placeholder="Ex: 5511999999999"
                                        style="height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font-family:'JetBrains Mono',monospace;"
                                    >
                                </div>
                            </div>

                            <div
                                id="message-statement-custom-dates"
                                style="display:${messageStatementState.filters.period === 'custom' ? 'grid' : 'none'}; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;"
                            >
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Data inicial</label>
                                    <input
                                        type="date"
                                        id="message-statement-date-from"
                                        value="${escapeHTML(messageStatementState.filters.dateFrom || '')}"
                                        style="height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font-family:inherit;"
                                    >
                                </div>
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <label style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase;">Data final</label>
                                    <input
                                        type="date"
                                        id="message-statement-date-to"
                                        value="${escapeHTML(messageStatementState.filters.dateTo || '')}"
                                        style="height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font-family:inherit;"
                                    >
                                </div>
                            </div>

                            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                <button type="submit" class="btn-sm btn-primary" style="padding:10px 16px;">Aplicar filtros</button>
                                <button type="button" class="btn-sm btn-outline" style="padding:10px 16px;" id="message-statement-clear-filters">Limpar filtros</button>
                                <button type="button" class="btn-sm btn-outline" style="padding:10px 16px;" id="message-statement-export">Exportar CSV</button>
                                <button type="button" class="btn-sm btn-outline" style="padding:10px 16px;" id="message-statement-export-pdf">Exportar PDF</button>
                            </div>
                        </form>
                    </div>
                </div>

                ${missingPhoneCount > 0 ? `
                    <div style="padding:16px 18px; border-radius:14px; border:1px solid rgba(245,158,11,0.22); background:rgba(245,158,11,0.09); color:var(--text);">
                        <div style="font-weight:700; margin-bottom:6px;">Alguns registros antigos ainda não têm telefone identificado</div>
                        <div style="font-size:13px; color:var(--muted);">
                            ${formatWalletInteger(missingPhoneCount)} lançamento(s) deste recorte não puderam ser associados a um telefone. Isso costuma acontecer em histórico anterior à bilhetagem detalhada.
                        </div>
                    </div>
                ` : ''}

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px;">
                    <div class="stat-card">
                        <div class="stat-icon" style="color:#6366f1">${EXTRATO_ICONS.receipt}</div>
                        <div class="stat-label">Mensagens cobradas</div>
                        <div class="stat-value">${formatWalletInteger(messagesUsed)}</div>
                        <div class="stat-change" style="color:var(--muted);">${formatWalletInteger(total)} lançamento(s) no recorte</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="color:#3b82f6">${EXTRATO_ICONS.inbox}</div>
                        <div class="stat-label">Recebidas do usuário</div>
                        <div class="stat-value">${formatWalletInteger(messagesIn)}</div>
                        <div class="stat-change" style="color:var(--muted);">Entrada via WhatsApp</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="color:#10b981">${EXTRATO_ICONS.send}</div>
                        <div class="stat-label">Respostas do robô</div>
                        <div class="stat-value">${formatWalletInteger(messagesOut)}</div>
                        <div class="stat-change" style="color:var(--muted);">Saída para o cliente</div>
                    </div>
                    <div class="stat-card teal-card">
                        <div class="stat-icon">${EXTRATO_ICONS.coin}</div>
                        <div class="stat-label">Total cobrado</div>
                        <div class="stat-value">R$ ${formatWalletCurrency(totalAmount)}</div>
                        <div class="stat-change" style="color:rgba(255,255,255,0.72);">Preço unitário R$ ${formatWalletCurrency(unitPrice)}</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Extrato de Mensagens</div>
                            <div class="card-subtitle">Página ${formatWalletInteger(currentPage)} de ${formatWalletInteger(totalPages)} · ${formatWalletInteger(total)} registros filtrados</div>
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
                            <table style="width:100%; border-collapse:collapse; min-width:920px;">
                                <thead>
                                    <tr style="background:rgba(240,242,245,0.7);">
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Telefone do usuário</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Origem</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Data e hora</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Descrição breve</th>
                                        <th style="text-align:left; padding:14px 18px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted);">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows || `
                                        <tr>
                                            <td colspan="5">
                                                <div class="empty-state">
                                                    <div class="icon">${EXTRATO_ICONS.search}</div>
                                                    <h3>Nenhuma mensagem encontrada</h3>
                                                    <p>Altere os filtros ou aguarde novos lançamentos para visualizar o extrato.</p>
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

        bindMessageStatementFilters();
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon" style="color:#ef4444">${EXTRATO_ICONS.alert}</div>
                <h3>Erro ao carregar extrato</h3>
                <p>${escapeHTML(err.message || 'Tente novamente.')}</p>
            </div>
        `;
    }
}

function bindMessageStatementFilters() {
    const form = document.getElementById('message-statement-filters');
    if (form) {
        form.addEventListener('submit', handleMessageStatementFilterSubmit);
    }

    const periodSelect = document.getElementById('message-statement-period');
    if (periodSelect) {
        periodSelect.addEventListener('change', toggleMessageStatementCustomDates);
    }

    const clearButton = document.getElementById('message-statement-clear-filters');
    if (clearButton) {
        clearButton.addEventListener('click', clearMessageStatementFilters);
    }

    const exportButton = document.getElementById('message-statement-export');
    if (exportButton) {
        exportButton.addEventListener('click', downloadMessageStatementCsv);
    }

    const exportPdfButton = document.getElementById('message-statement-export-pdf');
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', downloadMessageStatementPdf);
    }
}

function handleMessageStatementFilterSubmit(event) {
    event.preventDefault();

    messageStatementState.filters = normalizeMessageStatementUiFilters({
        period: document.getElementById('message-statement-period')?.value || 'all',
        actor: document.getElementById('message-statement-actor')?.value || 'all',
        phone: document.getElementById('message-statement-phone')?.value.trim() || '',
        dateFrom: document.getElementById('message-statement-date-from')?.value || '',
        dateTo: document.getElementById('message-statement-date-to')?.value || '',
    });

    messageStatementState.page = 1;
    loadExtratoMensagens();
}

function clearMessageStatementFilters() {
    messageStatementState.filters = {
        period: 'all',
        actor: 'all',
        phone: '',
        dateFrom: '',
        dateTo: '',
    };
    messageStatementState.page = 1;
    loadExtratoMensagens();
}

function toggleMessageStatementCustomDates() {
    const period = document.getElementById('message-statement-period')?.value || 'all';
    const customDates = document.getElementById('message-statement-custom-dates');
    if (!customDates) return;

    customDates.style.display = period === 'custom' ? 'grid' : 'none';
}

function buildMessageStatementQueryParams() {
    const params = {
        page: messageStatementState.page,
        limit: messageStatementState.limit,
    };

    const filters = resolveMessageStatementFilters(messageStatementState.filters);

    if (filters.origin !== 'all') {
        params.origin = filters.origin;
    }

    if (filters.userPhone) {
        params.user_phone = filters.userPhone;
    }

    if (filters.dateFrom) {
        params.date_from = filters.dateFrom;
    }

    if (filters.dateTo) {
        params.date_to = filters.dateTo;
    }

    return params;
}

function buildMessageStatementExportParams() {
    const filters = resolveMessageStatementFilters(messageStatementState.filters);
    const params = {};

    if (filters.origin !== 'all') {
        params.origin = filters.origin;
    }

    if (filters.userPhone) {
        params.user_phone = filters.userPhone;
    }

    if (filters.dateFrom) {
        params.date_from = filters.dateFrom;
    }

    if (filters.dateTo) {
        params.date_to = filters.dateTo;
    }

    return params;
}

async function downloadMessageStatementCsv() {
    const button = document.getElementById('message-statement-export');
    if (!button) return;

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Exportando...';

    try {
        const file = await api.download('/wallet/messages/statement/export', buildMessageStatementExportParams());
        triggerMessageStatementFileDownload(file.blob, file.filename || 'extrato-mensagens.csv');
        showToast('Extrato exportado com sucesso.', 'success');
    } catch (err) {
        showToast(err.message || 'Falha ao exportar CSV.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}

async function downloadMessageStatementPdf() {
    const button = document.getElementById('message-statement-export-pdf');
    if (!button) return;

    const originalLabel = button.textContent;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Permita pop-ups no navegador para gerar o PDF.', 'error');
        return;
    }

    button.disabled = true;
    button.textContent = 'Preparando...';

    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Gerando extrato...</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
                .loading { font-size: 16px; font-weight: 700; }
                .muted { color: #6b7280; font-size: 13px; margin-top: 8px; }
            </style>
        </head>
        <body>
            <div class="loading">Preparando extrato para PDF...</div>
            <div class="muted">Isso pode levar alguns segundos dependendo do volume filtrado.</div>
        </body>
        </html>
    `);
    printWindow.document.close();

    try {
        const dataset = await loadMessageStatementPrintDataset();
        printWindow.document.open();
        printWindow.document.write(buildMessageStatementPrintDocument(dataset));
        printWindow.document.close();

        window.setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 350);

        showToast('Janela de impressão aberta. Escolha "Salvar como PDF".', 'success');
    } catch (err) {
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Falha ao gerar extrato</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
                    .error { font-size: 18px; font-weight: 700; color: #b91c1c; }
                    .muted { color: #6b7280; font-size: 13px; margin-top: 8px; }
                </style>
            </head>
            <body>
                <div class="error">Falha ao gerar o extrato para PDF.</div>
                <div class="muted">${escapeHTML(err.message || 'Tente novamente.')}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
        showToast(err.message || 'Falha ao gerar PDF.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}

function triggerMessageStatementFileDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}

async function loadMessageStatementPrintDataset() {
    const params = buildMessageStatementExportParams();
    const items = [];
    let page = 1;
    let total = 0;
    let summary = null;
    const limit = 100;

    while (page <= 1000) {
        const response = await api.get('/wallet/messages/statement', {
            ...params,
            page,
            limit,
        });
        const batch = Array.isArray(response?.items) ? response.items : [];

        if (!summary) {
            summary = response?.summary || {};
            total = Number(response?.total || batch.length || 0);
        }

        items.push(...batch);

        if (!batch.length || items.length >= total) {
            break;
        }

        page += 1;
    }

    return {
        generatedAt: new Date().toISOString(),
        filters: resolveMessageStatementFilters(messageStatementState.filters),
        summary: summary || {},
        total,
        items: total > 0 ? items.slice(0, total) : items,
    };
}

function buildMessageStatementPrintDocument(dataset) {
    const summary = dataset?.summary || {};
    const items = Array.isArray(dataset?.items) ? dataset.items : [];
    const filters = dataset?.filters || {};
    const messagesIn = Number(summary.messagesIn || 0);
    const messagesOut = Number(summary.messagesOut || 0);
    const messagesUsed = Number(summary.messagesUsed || (messagesIn + messagesOut));
    const unitPrice = Number(summary.unitPrice || 0.02);
    const totalAmount = Number(summary.totalAmount || (messagesUsed * unitPrice));
    const generatedAt = dataset?.generatedAt ? new Date(dataset.generatedAt) : new Date();
    const rows = items.length
        ? items.map((item) => `
            <tr>
                <td>${escapeHTML(item.userPhone || 'Nao identificado')}</td>
                <td>${escapeHTML(item.actor === 'user' ? 'Usuario' : 'Robo')}</td>
                <td>${escapeHTML(`${formatStatementDate(item.occurredAt)} ${formatStatementTime(item.occurredAt)}`)}</td>
                <td>${escapeHTML(item.preview || 'Sem dados')}</td>
                <td class="numeric">R$ ${formatWalletCurrency(item.amount || unitPrice)}</td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="5" class="empty">Nenhum registro encontrado para o recorte selecionado.</td>
            </tr>
        `;

    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Extrato de Mensagens</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 12mm;
                }

                * {
                    box-sizing: border-box;
                }

                body {
                    font-family: Arial, sans-serif;
                    color: #0f172a;
                    margin: 0;
                    background: #ffffff;
                }

                .page {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }

                .hero {
                    border: 1px solid #cbd5e1;
                    border-radius: 16px;
                    padding: 20px 22px;
                    background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
                }

                .eyebrow {
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    color: #64748b;
                    margin-bottom: 8px;
                }

                .title {
                    font-size: 26px;
                    font-weight: 800;
                    margin-bottom: 8px;
                }

                .subtitle {
                    font-size: 12px;
                    color: #475569;
                    line-height: 1.5;
                }

                .meta {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 12px;
                }

                .meta-card {
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 14px;
                    background: #ffffff;
                }

                .meta-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    margin-bottom: 6px;
                }

                .meta-value {
                    font-size: 20px;
                    font-weight: 800;
                    color: #0f172a;
                }

                .meta-detail {
                    font-size: 11px;
                    color: #475569;
                    margin-top: 6px;
                    line-height: 1.4;
                }

                .table-wrap {
                    border: 1px solid #e2e8f0;
                    border-radius: 14px;
                    overflow: hidden;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                th, td {
                    padding: 10px 12px;
                    border-bottom: 1px solid #e2e8f0;
                    text-align: left;
                    vertical-align: top;
                    font-size: 11px;
                    line-height: 1.5;
                }

                th {
                    background: #f8fafc;
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #64748b;
                }

                td.numeric {
                    white-space: nowrap;
                    font-weight: 700;
                }

                tr:last-child td {
                    border-bottom: none;
                }

                .empty {
                    text-align: center;
                    color: #64748b;
                    padding: 22px;
                }

                .footer {
                    font-size: 10px;
                    color: #64748b;
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 10px;
                }

                @media print {
                    .page {
                        gap: 14px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <section class="hero">
                    <div class="eyebrow">Transparencia de cobranca</div>
                    <div class="title">Extrato de Mensagens</div>
                    <div class="subtitle">
                        ${escapeHTML(buildMessageStatementFilterSummary(filters))}
                        <br>
                        Gerado em ${escapeHTML(generatedAt.toLocaleString('pt-BR'))}.
                    </div>
                </section>

                <section class="meta">
                    <div class="meta-card">
                        <div class="meta-label">Mensagens cobradas</div>
                        <div class="meta-value">${escapeHTML(formatWalletInteger(messagesUsed))}</div>
                        <div class="meta-detail">${escapeHTML(`${dataset.total || items.length} lancamento(s) no recorte`)}</div>
                    </div>
                    <div class="meta-card">
                        <div class="meta-label">Recebidas do usuario</div>
                        <div class="meta-value">${escapeHTML(formatWalletInteger(messagesIn))}</div>
                        <div class="meta-detail">Entradas via WhatsApp</div>
                    </div>
                    <div class="meta-card">
                        <div class="meta-label">Respostas do robo</div>
                        <div class="meta-value">${escapeHTML(formatWalletInteger(messagesOut))}</div>
                        <div class="meta-detail">Saidas cobradas no recorte</div>
                    </div>
                    <div class="meta-card">
                        <div class="meta-label">Total cobrado</div>
                        <div class="meta-value">R$ ${escapeHTML(formatWalletCurrency(totalAmount))}</div>
                        <div class="meta-detail">${escapeHTML(`Preco unitario: R$ ${formatWalletCurrency(unitPrice)}`)}</div>
                    </div>
                </section>

                <section class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Telefone do usuario</th>
                                <th>Origem</th>
                                <th>Data e hora</th>
                                <th>Descricao</th>
                                <th>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </section>

                <div class="footer">
                    <span>ClickGarcom · Extrato de mensagens contabilizadas</span>
                    <span>Recorte filtrado: ${escapeHTML(buildMessageStatementFilterSummary(filters))}</span>
                </div>
            </div>
        </body>
        </html>
    `;
}

function resolveMessageStatementFilters(filters) {
    const current = filters || {};
    const today = formatDateInputValue(new Date());

    if (current.period === 'today') {
        return {
            ...current,
            origin: current.actor || 'all',
            userPhone: current.phone || '',
            dateFrom: today,
            dateTo: today,
        };
    }

    if (current.period === '7d') {
        return {
            ...current,
            origin: current.actor || 'all',
            userPhone: current.phone || '',
            dateFrom: formatDateInputValue(shiftDateByDays(new Date(), -6)),
            dateTo: today,
        };
    }

    if (current.period === '30d') {
        return {
            ...current,
            origin: current.actor || 'all',
            userPhone: current.phone || '',
            dateFrom: formatDateInputValue(shiftDateByDays(new Date(), -29)),
            dateTo: today,
        };
    }

    const customFilters = {
        ...current,
        origin: current.actor || 'all',
        userPhone: current.phone || '',
        dateFrom: current.period === 'custom' ? (current.dateFrom || '') : '',
        dateTo: current.period === 'custom' ? (current.dateTo || '') : '',
    };

    if (customFilters.dateFrom && customFilters.dateTo && customFilters.dateFrom > customFilters.dateTo) {
        return {
            ...customFilters,
            dateFrom: customFilters.dateTo,
            dateTo: customFilters.dateFrom,
        };
    }

    return customFilters;
}

function buildMessageStatementFilterSummary(filters) {
    const parts = [];

    if (filters.dateFrom && filters.dateTo) {
        parts.push(`Período: ${formatStatementDate(filters.dateFrom)} até ${formatStatementDate(filters.dateTo)}`);
    } else if (filters.dateFrom) {
        parts.push(`A partir de: ${formatStatementDate(filters.dateFrom)}`);
    } else if (filters.dateTo) {
        parts.push(`Até: ${formatStatementDate(filters.dateTo)}`);
    } else {
        parts.push('Período: todos os registros');
    }

    if (filters.origin === 'user') {
        parts.push('Origem: mensagens do usuário');
    } else if (filters.origin === 'robot') {
        parts.push('Origem: respostas do robô');
    } else {
        parts.push('Origem: entradas e saídas');
    }

    if (filters.userPhone) {
        parts.push(`Telefone: ${filters.userPhone}`);
    }

    return parts.join(' · ');
}

function renderMessageStatementPeriodOptions(selectedValue) {
    const options = [
        { value: 'all', label: 'Todo o histórico' },
        { value: 'today', label: 'Hoje' },
        { value: '7d', label: 'Últimos 7 dias' },
        { value: '30d', label: 'Últimos 30 dias' },
        { value: 'custom', label: 'Período customizado' },
    ];

    return options
        .map(option => `<option value="${option.value}" ${selectedValue === option.value ? 'selected' : ''}>${option.label}</option>`)
        .join('');
}

function renderMessageStatementActorOptions(selectedValue) {
    const options = [
        { value: 'all', label: 'Todos' },
        { value: 'user', label: 'Usuário' },
        { value: 'robot', label: 'Robô' },
    ];

    return options
        .map(option => `<option value="${option.value}" ${selectedValue === option.value ? 'selected' : ''}>${option.label}</option>`)
        .join('');
}

function normalizeMessageStatementUiFilters(filters) {
    const current = filters || {};

    if (current.period !== 'custom') {
        return current;
    }

    if (current.dateFrom && current.dateTo && current.dateFrom > current.dateTo) {
        return {
            ...current,
            dateFrom: current.dateTo,
            dateTo: current.dateFrom,
        };
    }

    return current;
}

function changeMessageStatementPage(delta) {
    const nextPage = Math.max(1, messageStatementState.page + Number(delta || 0));
    if (nextPage === messageStatementState.page) return;
    messageStatementState.page = nextPage;
    loadExtratoMensagens();
}

function formatStatementDate(value) {
    if (!value) return '-';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-');
        return `${day}/${month}/${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return typeof value === 'string' ? value.split('-').reverse().join('/') : '-';
    }

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

function shiftDateByDays(baseDate, delta) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + delta);
    return date;
}

function formatDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
