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
        const plan = isPrePaid ? 'PRÉ-PAGO' : 'PÓS-PAGO';
        const messagePrice = Number(res.message_price || 0.02);
        const messagesIn = Number(res.messages_in || 0);
        const messagesOut = Number(res.messages_out || 0);
        const messagesUsed = Number(res.messages_used || (messagesIn + messagesOut));
        const messagesRemaining = res.messages_remaining === null || res.messages_remaining === undefined
            ? null
            : Number(res.messages_remaining);

        const remainingLabel = isPrePaid
            ? formatWalletInteger(messagesRemaining)
            : '∞';

        const balanceColor = balance <= 0 ? '#ef4444' : balance < 5 ? '#f59e0b' : '#1abc9c';
        const planBadgeBg = isPrePaid ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)';
        const planBadgeColor = isPrePaid ? '#3b82f6' : '#8b5cf6';
        const planIcon = isPrePaid ? '🔒' : '🔓';

        container.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">

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

                <!-- Metrics Grid -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:16px;">
                    <div style="
                        background: var(--card-bg); border-radius:16px; padding:24px;
                        border:1px solid var(--border); box-shadow: var(--shadow);
                        display:flex; flex-direction:column; gap:8px;
                    ">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(249,115,22,0.1); display:flex; align-items:center; justify-content:center; font-size:16px;">💰</span>
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
                            <span style="width:32px; height:32px; border-radius:10px; background:rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; font-size:16px;">📊</span>
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
                            <span style="width:32px; height:32px; border-radius:10px; background:${isPrePaid && balance <= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(26,188,156,0.1)'}; display:flex; align-items:center; justify-content:center; font-size:16px;">${isPrePaid ? '⏳' : '♾️'}</span>
                            <span style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Restantes</span>
                        </div>
                        <div style="font-size:28px; font-weight:800; font-family:'Sora',sans-serif; color:${isPrePaid && balance <= 0 ? 'var(--accent-red)' : 'var(--teal)'};">${remainingLabel}</div>
                        <div style="font-size:12px; color:var(--muted);">${isPrePaid ? 'Estimativa pelo saldo atual' : 'Sem limite no pós-pago'}</div>
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
                        ">📥</span>
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
                        ">📤</span>
                        <div>
                            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Enviadas (OUT)</div>
                            <div style="font-size:24px; font-weight:800; font-family:'Sora',sans-serif; color:var(--text);">${formatWalletInteger(messagesOut)}</div>
                        </div>
                    </div>
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
                        ">⚡</span>
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
                            ⚡ Gerar Pagamento PIX
                        </button>
                        <div style="font-size: 12px; text-align: center; color: var(--muted);">
                            Powered by Mercado Pago · O valor entra na hora em sua carteira
                        </div>
                    </form>

                    <div id="wallet-qr-container" style="display: none; text-align: center; margin-top: 30px; background: #fafbfc; padding: 30px; border-radius: 16px; border: 2px dashed var(--border);">
                        <div style="width:56px; height:56px; border-radius:16px; background:linear-gradient(135deg, #1abc9c, #16a085); display:flex; align-items:center; justify-content:center; font-size:24px; margin:0 auto 16px; color:#fff;">📱</div>
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
