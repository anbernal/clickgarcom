const PUBLIC_API_URL = `${window.location.origin}/admin/api/public/tables`;
const FALLBACK_MP_PUBLIC_KEY = 'TEST-ff17792e-d00c-4ea5-a8ba-fbec1ab15e69';

let currentTabId = null;
let currentTabData = null;
let currentAmount = 0;
let pixPollingTimer = null;

function getURLParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

function fmtBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || payload?.error || 'Falha ao processar a requisicao');
    }
    return response.json();
}

async function loadTabData(tabId) {
    return fetchJson(`${PUBLIC_API_URL}/tabs/${tabId}`);
}

function resolveCheckoutLabel(tab) {
    const tenantName = String(tab?.tenantName || 'ClickGarcom').trim();
    const tableNumber = String(tab?.tableNumber || '').trim();
    if (tableNumber) {
        return `${tenantName} · Mesa ${tableNumber}`;
    }
    return `${tenantName} · Comanda digital`;
}

function setCheckoutState(tab) {
    currentTabData = tab;
    currentAmount = Number(tab?.amountDue ?? tab?.total ?? 0) || 0;

    const infoEl = document.getElementById('checkout-tab-info');
    const totalEl = document.getElementById('checkout-total-amount');
    const pixBtn = document.getElementById('btn-generate-pix');
    const cardBtn = document.getElementById('form-checkout__submit');

    infoEl.textContent = resolveCheckoutLabel(tab);
    totalEl.textContent = fmtBRL(currentAmount);

    const closed = !!tab?.closed || currentAmount <= 0;
    if (closed) {
        stopPixPolling();
        if (pixBtn) {
            pixBtn.disabled = true;
            pixBtn.textContent = 'Conta finalizada';
        }
        if (cardBtn) {
            cardBtn.disabled = true;
            cardBtn.textContent = 'Conta finalizada';
        }
        const successEl = document.getElementById('pix-success-msg');
        if (successEl) {
            successEl.style.display = 'block';
            successEl.textContent = '✅ Conta finalizada com sucesso.';
        }
    }
}

function stopPixPolling() {
    if (pixPollingTimer) {
        window.clearInterval(pixPollingTimer);
        pixPollingTimer = null;
    }
}

async function refreshTabState() {
    if (!currentTabId) return;
    const tab = await loadTabData(currentTabId);
    setCheckoutState(tab);
}

async function startPixPolling(paymentId) {
    stopPixPolling();
    pixPollingTimer = window.setInterval(async () => {
        try {
            const status = await fetchJson(`${PUBLIC_API_URL}/tabs/${currentTabId}/payments/${paymentId}/status`);
            if (status?.approved) {
                stopPixPolling();
                await refreshTabState();
            }
        } catch (error) {
            console.warn('Falha ao consultar status do PIX:', error);
        }
    }, 5000);
}

function fillInstallments() {
    const installmentsEl = document.getElementById('form-checkout__installments');
    if (!installmentsEl) return;
    installmentsEl.innerHTML = '<option value="1">1x sem juros</option>';
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active'));
            document.querySelectorAll('.method-panel').forEach((panel) => panel.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.method}`).classList.add('active');
        });
    });

    currentTabId = getURLParam('tab_id');

    const loadingEl = document.getElementById('checkout-loading');
    const contentEl = document.getElementById('checkout-content');

    try {
        if (!currentTabId) {
            throw new Error('Comanda nao informada');
        }

        const tab = await loadTabData(currentTabId);
        setCheckoutState(tab);

        const MP_PUBLIC_KEY = String(tab?.mpPublicKey || '').trim() || FALLBACK_MP_PUBLIC_KEY;
        const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });

        fillInstallments();

        document.getElementById('btn-generate-pix').addEventListener('click', async () => {
            const btn = document.getElementById('btn-generate-pix');
            btn.innerHTML = 'Gerando PIX...';
            btn.disabled = true;

            try {
                const data = await fetchJson(`${PUBLIC_API_URL}/tabs/${currentTabId}/payments/pix`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        payer_email: 'cliente@email.com',
                        payer_name: 'Visitante',
                        payer_cpf: '19119119100',
                    }),
                });

                if (data?.tabClosed) {
                    await refreshTabState();
                    return;
                }

                document.getElementById('pix-img').src = `data:image/jpeg;base64,${data.qr_code_base64}`;
                document.getElementById('pix-copy-paste').value = data.qr_code || '';
                document.getElementById('pix-qrcode-container').style.display = 'block';
                btn.style.display = 'none';

                if (data?.mp_id || data?.payment_id) {
                    startPixPolling(String(data.mp_id || data.payment_id));
                }
            } catch (error) {
                alert(error.message || 'Erro ao gerar PIX');
                btn.innerHTML = 'Gerar QR Code PIX ⚡';
                btn.disabled = false;
            }
        });

        const cardNumberEl = mp.fields.create('cardNumber', { placeholder: 'Numero do cartao' });
        const expirationDateEl = mp.fields.create('expirationDate', { placeholder: 'MM/YY' });
        const securityCodeEl = mp.fields.create('securityCode', { placeholder: 'CVV' });

        cardNumberEl.mount('form-checkout__cardNumber');
        expirationDateEl.mount('form-checkout__expirationDate');
        securityCodeEl.mount('form-checkout__securityCode');

        try {
            const types = await mp.getIdentificationTypes();
            const select = document.getElementById('form-checkout__identificationType');
            types.forEach((type) => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar tipos de documento', error);
        }

        document.getElementById('form-checkout').addEventListener('submit', async (event) => {
            event.preventDefault();

            const submitBtn = document.getElementById('form-checkout__submit');
            submitBtn.innerHTML = 'Processando pagamento...';
            submitBtn.disabled = true;

            try {
                const tokenResp = await mp.fields.createCardToken({
                    cardholderName: document.getElementById('form-checkout__cardholderName').value,
                    identificationType: document.getElementById('form-checkout__identificationType').value,
                    identificationNumber: document.getElementById('form-checkout__identificationNumber').value,
                });

                const response = await fetchJson(`${PUBLIC_API_URL}/tabs/${currentTabId}/payments/card`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: tokenResp.id,
                        installments: Number(document.getElementById('form-checkout__installments').value || 1),
                        payment_method_id: 'master',
                        payer_email: document.getElementById('form-checkout__cardholderEmail').value,
                        payer_cpf: document.getElementById('form-checkout__identificationNumber').value,
                    }),
                });

                if (String(response?.status || '').trim().toLowerCase() === 'approved' || response?.tabClosed) {
                    await refreshTabState();
                    document.getElementById('form-checkout').innerHTML =
                        '<h3 style="color:var(--success);text-align:center">Pagamento aprovado</h3><p style="text-align:center">Sua conta foi finalizada com sucesso.</p>';
                    return;
                }

                alert(`Pagamento retornou status: ${response?.status || 'desconhecido'}`);
            } catch (error) {
                alert(error.message || 'Falha ao processar o pagamento');
            } finally {
                submitBtn.innerHTML = 'Pagar com Cartao 💳';
                submitBtn.disabled = false;
            }
        });
    } catch (error) {
        document.getElementById('checkout-tab-info').textContent = error.message || 'Comanda nao encontrada';
        document.getElementById('checkout-total-amount').textContent = fmtBRL(0);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    }
});
