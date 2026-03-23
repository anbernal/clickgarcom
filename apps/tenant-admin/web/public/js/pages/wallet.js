// public/js/pages/wallet.js

// ─── SVG ICONS ─────────────────────────────────────────────────
const WALLET_ICONS = {
  coin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  hourglass: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
  infinity: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8Z"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  inbox: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  zap: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  smartphone: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
};

function formatWalletCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatWalletInteger(value) {
    return Number(value || 0).toLocaleString('pt-BR');
}

function formatWalletMonthReference(reference) {
    const raw = String(reference || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return raw || '-';

    const [year, month] = raw.split('-');
    const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${labels[Math.max(0, Number(month) - 1)]}/${year}`;
}

async function loadWallet() {
    const container = document.getElementById('page-wallet');
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--muted);">Carregando Carteira...</div>`;

    try {
        const res = await api.get('/wallet/balance');
        if (!res) throw new Error('Erro ao carregar saldo');

        const balance = Number(res.wallet_balance || 0);
        const isPrePaid = res.billing_plan === 'pre_paid';
        const plan = isPrePaid ? 'PRÉ-PAGO' : 'PÓS-PAGO';
        const messagePrice = Number(res.message_price || 0.02);
        const messagesIn = Number(res.messages_in || 0);
        const messagesOut = Number(res.messages_out || 0);
        const messagesUsed = Number(res.messages_used || (messagesIn + messagesOut));
        const messagesRemaining = res.messages_remaining === null || res.messages_remaining === undefined
            ? null
            : Number(res.messages_remaining);
        const currentMonthSummary = res.current_month_summary || {};
        const previousMonthSummary = res.previous_month_summary || {};
        const forecast = res.forecast || {};
        const lowBalanceAlert = res.low_balance_alert || null;
        const financialOverview = res.financial_overview || {};
        const averageDailyMessages = Number(forecast.averageDailyMessages || 0);
        const expectedNext30DaysMessages = Number(forecast.expectedNext30DaysMessages || 0);
        const expectedNext30DaysAmount = Number(forecast.expectedNext30DaysAmount || 0);
        const projectedMonthMessages = Number(forecast.projectedMonthMessages || 0);
        const projectedMonthAmount = Number(forecast.projectedMonthAmount || 0);
        const estimatedDaysRemaining = forecast.estimatedDaysRemaining === null || forecast.estimatedDaysRemaining === undefined
            ? null
            : Number(forecast.estimatedDaysRemaining);
        const financialReferenceMonth = String(financialOverview.referenceMonth || currentMonthSummary.referenceMonth || '');
        const chargedMessages = Number(financialOverview.chargedMessages || currentMonthSummary.messagesUsed || 0);
        const chargedAmount = Number(financialOverview.chargedAmount || currentMonthSummary.amount || 0);
        const confirmedRechargeAmount = Number(financialOverview.confirmedRechargeAmount || 0);
        const confirmedRechargeCount = Number(financialOverview.confirmedRechargeCount || 0);
        const amountCoveredByRecharge = Number(financialOverview.amountCoveredByRecharge || 0);
        const amountCoveredByPreviousBalance = Number(financialOverview.amountCoveredByPreviousBalance || 0);
        const amountAddedToBalance = Number(financialOverview.amountAddedToBalance || 0);
        const estimatedOpeningBalance = financialOverview.estimatedOpeningBalance === null || financialOverview.estimatedOpeningBalance === undefined
            ? null
            : Number(financialOverview.estimatedOpeningBalance);
        const amountPendingInvoice = Number(financialOverview.amountPendingInvoice || 0);
        const financialNote = String(financialOverview.note || '');

        const remainingLabel = isPrePaid
            ? formatWalletInteger(messagesRemaining)
            : '∞';

        const balanceColor = balance <= 0 ? '#ef4444' : balance < 5 ? '#f59e0b' : '#1abc9c';
        const planBadgeBg = isPrePaid ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)';
        const planBadgeColor = isPrePaid ? '#3b82f6' : '#8b5cf6';
        const planIcon = isPrePaid ? WALLET_ICONS.lock : WALLET_ICONS.unlock;
        const alertStyles = lowBalanceAlert?.level === 'critical'
            ? {
                border: '1px solid rgba(239,68,68,0.18)',
                background: 'rgba(239,68,68,0.08)',
                title: '#b91c1c',
            }
            : {
                border: '1px solid rgba(245,158,11,0.18)',
                background: 'rgba(245,158,11,0.10)',
                title: '#b45309',
            };

        container.innerHTML = `
            <div style="max-width: 980px; margin: 0 auto;">

                <!-- Hero Balance Card -->
                <div style="
                    background: linear-gradient(135deg, #1a1d23 0%, #2d3748 100%);
                    border-radius: 20px;
                    padding: 40px 36px;
                    margin-bottom: 24px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                ">
                    <!-- Decorative circles -->
                    <div style="position:absolute; top:-40px; right:-40px; width:160px; height:160px; border-radius:50%; background:rgba(26,188,156,0.08);"></div>
                    <div style="position:absolute; bottom:-60px; right:60px; width:200px; height:200px; border-radius:50%; background:rgba(59,130,246,0.06);"></div>

                    <div style="position:relative; z-index:1;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                            <span style="
                                display:inline-flex; align-items:center; gap:6px;
                                padding:5px 14px; border-radius:20px; font-size:12px; font-weight:700;
                                letter-spacing:1.5px; text-transform:uppercase;
                                background:${planBadgeBg}; color:${planBadgeColor};
                            ">${planIcon} ${plan}</span>
                        </div>

                        <div style="font-size: 56px; font-weight: 800; color: #fff; font-family: 'Sora', sans-serif; line-height:1; margin-bottom:10px;">
                            R$ ${formatWalletCurrency(balance)}
                        </div>
                        <div style="font-size: 14px; color: rgba(255,255,255,0.5); max-width:420px;">
                            ${isPrePaid
                ? 'Cada mensagem recebida e cada resposta enviada consomem crédito do seu saldo.'
                : 'Seu plano pós-pago não bloqueia envios. O saldo reflete o consumo acumulado.'}
                        </div>
                    </div>
                </div>

                ${lowBalanceAlert && isPrePaid ? `
                    <div style="
                        border-radius:18px;
                        padding:20px 22px;
                        margin-bottom:18px;
                        ${alertStyles.border};
                        background:${alertStyles.background};
                        display:flex;
                        align-items:flex-start;
                        justify-content:space-between;
                        gap:18px;
                        flex-wrap:wrap;
                    ">
                        <div>
                            <div style="font-size:15px; font-weight:800; color:${alertStyles.title}; margin-bottom:6px;">${escapeHTML(lowBalanceAlert.title || 'Saldo em atenção')}</div>
                            <div style="font-size:13px; color:var(--text); margin-bottom:8px;">${escapeHTML(lowBalanceAlert.message || '')}</div>
                            <div style="font-size:12px; color:var(--muted);">
                                Recarga sugerida: <strong>R$ ${formatWalletCurrency(lowBalanceAlert.recommendedRechargeAmount || 0)}</strong>
                                ${Number(lowBalanceAlert.recommendedRechargeMessages || 0) > 0 ? ` · ${formatWalletInteger(lowBalanceAlert.recommendedRechargeMessages)} mensagens estimadas` : ''}
                            </div>
                        </div>
                        <button
                            type="button"
                            class="btn-sm btn-primary"
                            style="padding:10px 16px; white-space:nowrap;"
                            onclick="document.getElementById('wallet-amount').focus()"
                        >
                            Reforçar saldo
                        </button>
                    </div>
                ` : ''}

                <!-- Metrics Grid -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:16px;">
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(249,115,22,0.1); display:flex; align-items:center; justify-content:center; color:#f97316;">${WALLET_ICONS.coin}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Custo / Msg</span>
                        </div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--accent-orange);">R$ ${formatWalletCurrency(messagePrice)}</div>
                        <div style="font-size:12px; color:var(--muted);">Valor deduzido por mensagem IN/OUT</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; color:#3b82f6;">${WALLET_ICONS.chart}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Consumidas</span>
                        </div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--accent-blue);">${formatWalletInteger(messagesUsed)}</div>
                        <div style="font-size:12px; color:var(--muted);">Total de mensagens processadas</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:${isPrePaid && balance <= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(26,188,156,0.1)'}; display:flex; align-items:center; justify-content:center; color:${isPrePaid && balance <= 0 ? '#ef4444' : '#1abc9c'};">${isPrePaid ? WALLET_ICONS.hourglass : WALLET_ICONS.infinity}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Restantes</span>
                        </div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:${isPrePaid && balance <= 0 ? 'var(--accent-red)' : 'var(--teal)'};">${remainingLabel}</div>
                        <div style="font-size:12px; color:var(--muted);">${isPrePaid ? 'Estimativa pelo saldo atual' : 'Sem limite no pós-pago'}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:16px;">
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(26,188,156,0.1); display:flex; align-items:center; justify-content:center; color:#1abc9c;">${WALLET_ICONS.calendar}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Fechamento Atual</span>
                        </div>
                        <div style="font-size:26px; font-weight:800; font-family:'Sora',sans-serif; color:var(--teal);">R$ ${formatWalletCurrency(currentMonthSummary.amount || 0)}</div>
                        <div style="font-size:13px; color:var(--text);">${formatWalletMonthReference(currentMonthSummary.referenceMonth)}</div>
                        <div style="font-size:12px; color:var(--muted);">${formatWalletInteger(currentMonthSummary.messagesUsed || 0)} mensagens · IN ${formatWalletInteger(currentMonthSummary.messagesIn || 0)} · OUT ${formatWalletInteger(currentMonthSummary.messagesOut || 0)}</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; color:#3b82f6;">${WALLET_ICONS.book}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Fechamento Anterior</span>
                        </div>
                        <div style="font-size:26px; font-weight:800; font-family:'Sora',sans-serif; color:var(--accent-blue);">R$ ${formatWalletCurrency(previousMonthSummary.amount || 0)}</div>
                        <div style="font-size:13px; color:var(--text);">${formatWalletMonthReference(previousMonthSummary.referenceMonth)}</div>
                        <div style="font-size:12px; color:var(--muted);">${formatWalletInteger(previousMonthSummary.messagesUsed || 0)} mensagens · IN ${formatWalletInteger(previousMonthSummary.messagesIn || 0)} · OUT ${formatWalletInteger(previousMonthSummary.messagesOut || 0)}</div>
                    </div>
                </div>

                <div style="
                    background: var(--card-bg);
                    border-radius:18px;
                    padding:24px;
                    border:1px solid var(--border);
                    box-shadow: var(--shadow);
                    margin-bottom:16px;
                ">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap; margin-bottom:18px;">
                        <div>
                            <div style="font-size:14px; font-weight:800; color:var(--dark); margin-bottom:6px;">
                                ${isPrePaid ? 'Cobrado x cobertura financeira' : 'Cobrado x fechamento financeiro'}
                            </div>
                            <div style="font-size:13px; color:var(--muted); max-width:720px;">
                                ${isPrePaid
                ? 'No pré-pago, o consumo é abatido do saldo. Este quadro mostra o que foi consumido no mês e como isso se relaciona com as recargas confirmadas.'
                : 'No pós-pago, o consumo do mês ainda compõe o fechamento financeiro do período.'}
                            </div>
                        </div>
                        <div style="font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
                            Referência ${formatWalletMonthReference(financialReferenceMonth)}
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
                        <div style="
                            background:rgba(240,242,245,0.6);
                            border:1px solid var(--border);
                            border-radius:14px;
                            padding:18px;
                        ">
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px;">Cobrado no mês</div>
                            <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">R$ ${formatWalletCurrency(chargedAmount)}</div>
                            <div style="font-size:12px; color:var(--muted); margin-top:6px;">${formatWalletInteger(chargedMessages)} mensagens contabilizadas</div>
                        </div>

                        <div style="
                            background:rgba(240,242,245,0.6);
                            border:1px solid var(--border);
                            border-radius:14px;
                            padding:18px;
                        ">
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px;">Recargas confirmadas</div>
                            <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--accent-blue);">R$ ${formatWalletCurrency(confirmedRechargeAmount)}</div>
                            <div style="font-size:12px; color:var(--muted); margin-top:6px;">${formatWalletInteger(confirmedRechargeCount)} pagamento(s) aprovados no mês</div>
                        </div>

                        <div style="
                            background:rgba(240,242,245,0.6);
                            border:1px solid var(--border);
                            border-radius:14px;
                            padding:18px;
                        ">
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px;">
                                ${isPrePaid ? 'Saldo inicial estimado' : 'Pendente de fechamento'}
                            </div>
                            <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:${isPrePaid ? 'var(--teal)' : 'var(--accent-orange)'};">
                                ${isPrePaid
                ? (estimatedOpeningBalance === null ? '—' : `R$ ${formatWalletCurrency(estimatedOpeningBalance)}`)
                : `R$ ${formatWalletCurrency(amountPendingInvoice)}`}
                            </div>
                            <div style="font-size:12px; color:var(--muted); margin-top:6px;">
                                ${isPrePaid
                ? 'Saldo antes do consumo e das recargas do mês'
                : 'Valor ainda não faturado no período atual'}
                            </div>
                        </div>

                        <div style="
                            background:rgba(240,242,245,0.6);
                            border:1px solid var(--border);
                            border-radius:14px;
                            padding:18px;
                        ">
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px;">Saldo atual</div>
                            <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:${balanceColor};">R$ ${formatWalletCurrency(balance)}</div>
                            <div style="font-size:12px; color:var(--muted); margin-top:6px;">
                                ${isPrePaid ? 'Após dedução do consumo e crédito das recargas' : 'Visão atual disponibilizada pela carteira'}
                            </div>
                        </div>
                    </div>

                    <div style="
                        margin-top:16px;
                        padding:18px 20px;
                        border-radius:14px;
                        border:1px solid ${isPrePaid ? 'rgba(26,188,156,0.16)' : 'rgba(245,158,11,0.18)'};
                        background:${isPrePaid ? 'rgba(26,188,156,0.06)' : 'rgba(245,158,11,0.08)'};
                    ">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px;">
                            ${isPrePaid ? 'Equação do mês' : 'Leitura financeira'}
                        </div>
                        <div style="font-size:20px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark); line-height:1.4;">
                            ${isPrePaid
                ? (estimatedOpeningBalance === null
                    ? 'Saldo inicial estimado indisponível para conciliação automática neste ambiente.'
                    : `R$ ${formatWalletCurrency(estimatedOpeningBalance)} + R$ ${formatWalletCurrency(confirmedRechargeAmount)} - R$ ${formatWalletCurrency(chargedAmount)} = R$ ${formatWalletCurrency(balance)}`)
                : `R$ ${formatWalletCurrency(chargedAmount)} em mensagens contabilizadas no mês atual.`}
                        </div>
                        <div style="font-size:12px; color:var(--muted); margin-top:8px;">
                            ${isPrePaid
                ? (
                    amountCoveredByPreviousBalance > 0
                        ? `Do consumo do mês, R$ ${formatWalletCurrency(amountCoveredByRecharge)} foram cobertos pelas recargas confirmadas e R$ ${formatWalletCurrency(amountCoveredByPreviousBalance)} vieram do saldo anterior.`
                        : amountAddedToBalance > 0
                            ? `Após cobrir todo o consumo do mês, as recargas ainda adicionaram R$ ${formatWalletCurrency(amountAddedToBalance)} ao saldo da carteira.`
                            : `As recargas confirmadas do mês cobriram exatamente o consumo apurado neste período.`
                )
                : `Valor pendente de fechamento neste momento: R$ ${formatWalletCurrency(amountPendingInvoice)}.`}
                        </div>
                        ${financialNote ? `
                            <div style="font-size:12px; color:var(--text); margin-top:10px;">${escapeHTML(financialNote)}</div>
                        ` : ''}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-bottom:28px;">
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:22px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                    ">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:10px;">Média diária</div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">${averageDailyMessages.toLocaleString('pt-BR', { minimumFractionDigits: averageDailyMessages % 1 === 0 ? 0 : 1, maximumFractionDigits: 2 })}</div>
                        <div style="font-size:12px; color:var(--muted);">mensagens por dia nos últimos 30 dias</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:22px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                    ">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:10px;">Projeção do mês</div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">${formatWalletInteger(projectedMonthMessages)}</div>
                        <div style="font-size:12px; color:var(--muted);">Estimado em R$ ${formatWalletCurrency(projectedMonthAmount)}</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:22px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                    ">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:10px;">Próximos 30 dias</div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">${formatWalletInteger(expectedNext30DaysMessages)}</div>
                        <div style="font-size:12px; color:var(--muted);">Estimado em R$ ${formatWalletCurrency(expectedNext30DaysAmount)}</div>
                    </div>

                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:22px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                    ">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:10px;">Autonomia do saldo</div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:var(--dark);">${estimatedDaysRemaining === null ? '—' : estimatedDaysRemaining.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</div>
                        <div style="font-size:12px; color:var(--muted);">${estimatedDaysRemaining === null ? 'Sem histórico suficiente para estimar' : 'dias estimados no ritmo atual'}</div>
                    </div>
                </div>

                <!-- IN / OUT breakdown -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px;">
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:20px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; align-items:center; gap:16px;
                    ">
                        <span style="
                            width:44px; height:44px; border-radius:12px;
                            background: linear-gradient(135deg, #e0f2fe, #bae6fd);
                            display:flex; align-items:center; justify-content:center; font-size:20px;
                        ">${WALLET_ICONS.inbox}</span>
                        <div>
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Recebidas (IN)</div>
                            <div style="font-size:24px; font-weight:800; font-family:'Sora',sans-serif; color:var(--text);">${formatWalletInteger(messagesIn)}</div>
                        </div>
                    </div>
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:20px 24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; align-items:center; gap:16px;
                    ">
                        <span style="
                            width:44px; height:44px; border-radius:12px;
                            background: linear-gradient(135deg, #e8faf6, #a7f3d0);
                            display:flex; align-items:center; justify-content:center; font-size:20px;
                        ">${WALLET_ICONS.send}</span>
                        <div>
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Enviadas (OUT)</div>
                            <div style="font-size:24px; font-weight:800; font-family:'Sora',sans-serif; color:var(--text);">${formatWalletInteger(messagesOut)}</div>
                        </div>
                    </div>
                </div>

                <div style="
                    background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(26,188,156,0.06));
                    border: 1px solid rgba(59,130,246,0.12);
                    border-radius: 18px;
                    padding: 22px 24px;
                    margin-bottom: 28px;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:18px;
                ">
                    <div>
                        <div style="font-size:14px; font-weight:700; color:var(--dark); margin-bottom:6px;">Extrato detalhado de mensagens</div>
                        <div style="font-size:13px; color:var(--muted); max-width:520px;">
                            Veja linha por linha quem enviou, quando aconteceu e qual mensagem entrou no consumo do seu WhatsApp.
                        </div>
                    </div>
                    <button
                        type="button"
                        class="btn-sm btn-primary"
                        style="padding:10px 16px; white-space:nowrap;"
                        onclick="navigate('extratoMensagens')"
                    >
                        Ver extrato
                    </button>
                </div>

                <!-- PIX Recharge Section -->
                <div style="
                    background: var(--card-bg); border-radius:20px; padding:32px;
                    border:1px solid var(--border); box-shadow: var(--shadow-lg);
                ">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px;">
                        <span style="
                            width:40px; height:40px; border-radius:12px;
                            background: linear-gradient(135deg, #1abc9c, #16a085);
                            display:flex; align-items:center; justify-content:center; font-size:18px; color:#fff;
                        ">${WALLET_ICONS.zap}</span>
                        <div>
                            <h3 style="font-family:'Sora',sans-serif; font-weight:700; font-size:18px; color:var(--dark); margin:0;">Recarregar Saldo</h3>
                            <div style="font-size:13px; color:var(--muted);">PIX Instantâneo via Mercado Pago</div>
                        </div>
                    </div>

                    <form id="wallet-recharge-form" style="display: flex; flex-direction: column; gap: 18px;">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <label style="font-weight:600; font-size:13px; color:var(--text);">Valor da Recarga (R$)</label>
                            <input type="number" id="wallet-amount" style="
                                padding:14px 16px; border:2px solid var(--border); border-radius:12px;
                                font-size:18px; font-weight:700; font-family:'JetBrains Mono',monospace;
                                background:var(--bg); transition:border-color 0.2s; outline:none;
                            " value="50.00" min="10" step="10" required
                            onfocus="this.style.borderColor='#1abc9c'" onblur="this.style.borderColor='var(--border)'">
                        </div>
                        <div style="display:flex; gap: 16px;">
                            <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                                <label style="font-weight:600; font-size:13px; color:var(--text);">Seu E-mail</label>
                                <input type="email" id="wallet-email" style="
                                    padding:12px 14px; border:2px solid var(--border); border-radius:10px;
                                    font-size:14px; background:var(--bg); transition:border-color 0.2s; outline:none;
                                " placeholder="admin@restaurante.com" required
                                onfocus="this.style.borderColor='#1abc9c'" onblur="this.style.borderColor='var(--border)'">
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                                <label style="font-weight:600; font-size:13px; color:var(--text);">Seu Nome Completo</label>
                                <input type="text" id="wallet-name" style="
                                    padding:12px 14px; border:2px solid var(--border); border-radius:10px;
                                    font-size:14px; background:var(--bg); transition:border-color 0.2s; outline:none;
                                " placeholder="João Silva" required
                                onfocus="this.style.borderColor='#1abc9c'" onblur="this.style.borderColor='var(--border)'">
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <label style="font-weight:600; font-size:13px; color:var(--text);">Seu CPF</label>
                            <input type="text" id="wallet-cpf" style="
                                padding:12px 14px; border:2px solid var(--border); border-radius:10px;
                                font-size:14px; font-family:'JetBrains Mono',monospace;
                                background:var(--bg); transition:border-color 0.2s; outline:none;
                            " placeholder="000.111.222-33" required
                            onfocus="this.style.borderColor='#1abc9c'" onblur="this.style.borderColor='var(--border)'">
                        </div>
                        <button type="submit" style="
                            width:100%; padding:16px; font-size:16px; font-weight:700;
                            font-family:'Sora',sans-serif; cursor:pointer; border:none;
                            border-radius:14px; color:#fff; letter-spacing:0.5px;
                            background: linear-gradient(135deg, #1abc9c 0%, #16a085 100%);
                            box-shadow: 0 4px 16px rgba(26,188,156,0.3);
                            transition: transform 0.15s, box-shadow 0.15s;
                        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 20px rgba(26,188,156,0.4)';"
                           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(26,188,156,0.3)';">
                            ${WALLET_ICONS.zap} Gerar Pagamento PIX
                        </button>
                        <div style="font-size: 12px; text-align: center; color: var(--muted);">
                            Powered by Mercado Pago · O valor entra na hora em sua carteira
                        </div>
                    </form>

                    <div id="wallet-qr-container" style="display: none; text-align: center; margin-top: 30px; background: #fafbfc; padding: 30px; border-radius: 16px; border: 2px dashed var(--border);">
                        <div style="width:56px; height:56px; border-radius:16px; background:linear-gradient(135deg, #1abc9c, #16a085); display:flex; align-items:center; justify-content:center; margin:0 auto 16px; color:#fff;">${WALLET_ICONS.smartphone}</div>
                        <h4 style="margin-bottom: 20px; color: var(--dark); font-family:'Sora',sans-serif; font-weight:700;">Escaneie o QR Code</h4>
                        <img id="wallet-qr-image" src="" alt="QR Code" style="width: 200px; height: 200px; border-radius: 12px; margin-bottom: 20px; border: 2px solid var(--border); background:#fff; padding:12px;">
                        <div style="margin-bottom: 10px;">
                            <input type="text" id="wallet-qr-copy-input" style="width:100%; padding:12px; font-family:'JetBrains Mono',monospace; font-size:12px; border:2px solid var(--border); border-radius:10px; background:var(--bg);" readonly>
                        </div>
                        <p style="color: var(--teal); font-weight: 700; font-size: 14px; margin-top:15px;">⏳ Aguardando pagamento... O saldo será atualizado automaticamente.</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('wallet-recharge-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = 'Gerando...';

            const payload = {
                order_id: '00000000-0000-0000-0000-000000000000',
                amount: parseFloat(document.getElementById('wallet-amount').value),
                description: 'Recarga de Carteira - ClickGarcom TaaS',
                payer_email: document.getElementById('wallet-email').value,
                payer_name: document.getElementById('wallet-name').value,
                payer_cpf: document.getElementById('wallet-cpf').value.replace(/\D/g, ''),
            };

            try {
                const pixRes = await api.post('/payments/pix', payload);

                if (pixRes && pixRes.qr_code_base64) {
                    document.getElementById('wallet-recharge-form').style.display = 'none';
                    document.getElementById('wallet-qr-container').style.display = 'block';
                    document.getElementById('wallet-qr-image').src = `data:image/png;base64,${pixRes.qr_code_base64}`;
                    document.getElementById('wallet-qr-copy-input').value = pixRes.qr_code;
                } else {
                    alert('Erro ao gerar PIX: ' + JSON.stringify(pixRes));
                }
            } catch (err) {
                alert('Falha na geracao: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    } catch (err) {
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--accent-red);">Erro: ${err.message}</div>`;
    }
}
