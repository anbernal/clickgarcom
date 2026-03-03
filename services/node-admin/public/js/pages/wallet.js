// public/js/pages/wallet.js
function formatWalletCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatWalletInteger(value) {
    return Number(value || 0).toLocaleString('pt-BR');
}

async function loadWallet() {
    const container = document.getElementById('page-wallet');
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--muted);">Carregando Carteira...</div>`;

    try {
        const res = await api.get('/wallet/balance');
        if (!res) throw new Error('Erro ao carregar saldo');

        const balance = Number(res.wallet_balance || 0);
        const isPrePaid = res.billing_plan === 'pre_paid';
        const plan = isPrePaid ? 'Pre-Pago' : 'Pos-Pago';
        const messagePrice = Number(res.message_price || 0.02);
        const messagesIn = Number(res.messages_in || 0);
        const messagesOut = Number(res.messages_out || 0);
        const messagesUsed = Number(res.messages_used || (messagesIn + messagesOut));
        const messagesRemaining = res.messages_remaining === null || res.messages_remaining === undefined
            ? null
            : Number(res.messages_remaining);

        const remainingLabel = isPrePaid
            ? formatWalletInteger(messagesRemaining)
            : 'Ilimitado';

        container.innerHTML = `
            <div style="max-width: 760px; margin: 0 auto; background: var(--card-bg); padding: 30px; border-radius: var(--border-radius-lg); box-shadow: var(--shadow-md);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="font-size: 14px; color: var(--muted); text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Plano Atual: ${plan}</div>
                    <div style="font-size: 48px; font-weight: 700; color: ${balance <= 0 ? 'var(--danger)' : 'var(--primary)'}; margin: 10px 0;">
                        R$ ${formatWalletCurrency(balance)}
                    </div>
                    <div style="font-size: 14px; color: var(--muted);">
                        Cada mensagem recebida e cada resposta enviada consomem credito no plano pre-pago.
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom: 24px;">
                    <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:rgba(255,255,255,0.02);">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:600;">Custo por Mensagem</div>
                        <div style="font-size:24px; font-weight:700; margin-top:8px;">R$ ${formatWalletCurrency(messagePrice)}</div>
                    </div>
                    <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:rgba(255,255,255,0.02);">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:600;">Mensagens Usadas</div>
                        <div style="font-size:24px; font-weight:700; margin-top:8px;">${formatWalletInteger(messagesUsed)}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">Historico total</div>
                    </div>
                    <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px; background:rgba(255,255,255,0.02);">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:600;">Mensagens Restantes</div>
                        <div style="font-size:24px; font-weight:700; margin-top:8px; color:${isPrePaid && balance <= 0 ? 'var(--danger)' : 'var(--primary)'};">${remainingLabel}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">${isPrePaid ? 'Estimativa pelo saldo atual' : 'Nao bloqueia por saldo'}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom: 28px;">
                    <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px;">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:600;">Recebidas do Usuario (IN)</div>
                        <div style="font-size:22px; font-weight:700; margin-top:8px; color:var(--primary);">${formatWalletInteger(messagesIn)}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">Inclui pedir mesa e demais mensagens do cliente</div>
                    </div>
                    <div style="padding:16px; border:1px solid var(--border-color); border-radius:12px;">
                        <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:600;">Respostas ao Usuario (OUT)</div>
                        <div style="font-size:22px; font-weight:700; margin-top:8px; color:var(--primary);">${formatWalletInteger(messagesOut)}</div>
                        <div style="font-size:12px; color:var(--muted); margin-top:6px;">Mensagens enviadas pelo sistema ao WhatsApp</div>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 30px 0;">

                <h3 style="margin-bottom: 16px; font-family: var(--font-heading);">Recarregar Saldo (PIX Instantaneo)</h3>
                <form id="wallet-recharge-form" style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label style="font-weight:600; font-size:14px;">Valor sugerido da Recarga (R$)</label>
                        <input type="number" id="wallet-amount" style="padding:12px; border:1px solid var(--border-color); border-radius:6px; font-size:16px;" value="50.00" min="10" step="10" required>
                    </div>
                    <div style="display:flex; gap: 16px;">
                        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                            <label style="font-weight:600; font-size:14px;">Seu E-mail</label>
                            <input type="email" id="wallet-email" style="padding:12px; border:1px solid var(--border-color); border-radius:6px;" placeholder="admin@restaurante.com" required>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
                            <label style="font-weight:600; font-size:14px;">Seu Nome Completo</label>
                            <input type="text" id="wallet-name" style="padding:12px; border:1px solid var(--border-color); border-radius:6px;" placeholder="Joao Silva" required>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label style="font-weight:600; font-size:14px;">Seu CPF</label>
                        <input type="text" id="wallet-cpf" style="padding:12px; border:1px solid var(--border-color); border-radius:6px;" placeholder="00011122233" required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 16px; font-size: 16px; margin-top: 10px; cursor: pointer;">
                        Gerar Pagamento PIX
                    </button>
                    <div style="font-size: 12px; text-align: center; color: var(--muted); margin-top: 8px;">
                        Powered by Mercado Pago. O valor entra na hora em sua carteira.
                    </div>
                </form>

                <div id="wallet-qr-container" style="display: none; text-align: center; margin-top: 30px; background: #f8f9fa; padding: 30px; border-radius: 12px; border: 1px dashed var(--border-color);">
                    <h4 style="margin-bottom: 20px; color: #333;">Escaneie o QRCode Abaixo</h4>
                    <img id="wallet-qr-image" src="" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ccc; background:#fff; padding:10px;">
                    <div style="margin-bottom: 10px;">
                        <input type="text" id="wallet-qr-copy-input" style="width:100%; padding:10px; font-family:monospace; font-size:12px; border:1px solid #ddd; border-radius:4px;" readonly>
                    </div>
                    <p style="color: var(--success); font-weight: 600; font-size: 14px; margin-top:15px;">Aguardando pagamento... O saldo sera atualizado automaticamente assim que compensar.</p>
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
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--danger);">Erro: ${err.message}</div>`;
    }
}
