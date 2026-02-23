/**
 * ClickGarçom - Mercado Pago Checkout UI logic (SDK V2)
 * Fase 14: Suporta Split Checks via ?tab_id= na URL
 */

const ADMIN_API_URL = window.location.origin; // Node-Admin BFF
const GO_API_URL = 'http://localhost:8080'; // Go-Core direto para pagamentos

let currentTabId = null;
let currentAmount = 0;

// ─────────────────────────────────────────────
// 1. Ler parâmetros da URL
// ─────────────────────────────────────────────
function getURLParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

// ─────────────────────────────────────────────
// 2. Formatar moeda BR
// ─────────────────────────────────────────────
function fmtBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

// ─────────────────────────────────────────────
// 3. Carregar dados da comanda
// ─────────────────────────────────────────────
async function loadTabData(tabId) {
    try {
        const resp = await fetch(`${ADMIN_API_URL}/admin/api/tables/public/tab/${tabId}`);
        if (!resp.ok) throw new Error('Comanda não encontrada');
        return await resp.json();
    } catch (err) {
        return null;
    }
}

// ─────────────────────────────────────────────
// 4. Inicializar Checkout
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // --- Tab Switcher (PIX / Cartão) ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.method-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.method}`).classList.add('active');
        });
    });

    // --- Descobrir Tab ID e carregar dados ---
    currentTabId = getURLParam('tab_id');

    const loadingEl = document.getElementById('checkout-loading');
    const contentEl = document.getElementById('checkout-content');
    const tabInfoEl = document.getElementById('checkout-tab-info');
    const totalEl = document.getElementById('checkout-total-amount');

    if (currentTabId) {
        const tab = await loadTabData(currentTabId);

        if (tab) {
            currentAmount = parseFloat(tab.total || 0);
            totalEl.textContent = fmtBRL(currentAmount);
            tabInfoEl.textContent = `Comanda ${currentTabId.substring(0, 8).toUpperCase()} — Total`;
        } else {
            tabInfoEl.textContent = '⚠️ Comanda não encontrada';
            tabInfoEl.style.color = 'var(--danger, red)';
        }
    } else {
        // Modo Demo / Fallback quando não tem tab_id (ex: tela de demo)
        currentAmount = 150.00;
        totalEl.textContent = fmtBRL(currentAmount);
        tabInfoEl.textContent = 'Mesa 04 — Demo';
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // --- Mercado Pago SDK V2 ---
    const MP_PUBLIC_KEY = 'TEST-ff17792e-d00c-4ea5-a8ba-fbec1ab15e69';
    const TENANT_ID = getURLParam('tenant_id') || 'd290f1ee-6c54-4b01-90e6-d701748f0851';

    const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });

    // ── PIX ──────────────────────────────────────────────────────────────────
    document.getElementById('btn-generate-pix').addEventListener('click', async () => {
        const btn = document.getElementById('btn-generate-pix');
        btn.innerHTML = 'Gerando PIX... ⏳';
        btn.disabled = true;

        try {
            const resp = await fetch(`${GO_API_URL}/payments/pix`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': TENANT_ID,
                },
                body: JSON.stringify({
                    order_id: currentTabId || '11111111-2222-3333-4444-555555555555',
                    amount: currentAmount,
                    description: `Comanda ${(currentTabId || 'Demo').substring(0, 8).toUpperCase()}`,
                    payer_email: 'cliente@email.com',
                    payer_name: 'Visitante',
                    payer_cpf: '19119119100',
                }),
            });

            if (!resp.ok) throw new Error('Falha ao gerar o PIX no Backend Go');

            const data = await resp.json();
            document.getElementById('pix-img').src = `data:image/jpeg;base64,${data.qr_code_base64}`;
            document.getElementById('pix-copy-paste').value = data.qr_code;
            document.getElementById('pix-qrcode-container').style.display = 'block';
            btn.style.display = 'none';

            // Simula confirmação após 60s
            setTimeout(() => {
                document.getElementById('pix-success-msg').style.display = 'block';
            }, 60000);

        } catch (e) {
            console.error(e);
            alert('Erro ao processar PIX. O Backend GO está online na porta 8080?');
            btn.innerHTML = 'Tentar Novamente';
            btn.disabled = false;
        }
    });

    // ── Cartão (SDK Tokenização) ─────────────────────────────────────────────
    const cardNumberEl = mp.fields.create('cardNumber', { placeholder: 'Número do cartão' });
    const expirationDateEl = mp.fields.create('expirationDate', { placeholder: 'MM/YY' });
    const securityCodeEl = mp.fields.create('securityCode', { placeholder: 'CVV' });

    cardNumberEl.mount('form-checkout__cardNumber');
    expirationDateEl.mount('form-checkout__expirationDate');
    securityCodeEl.mount('form-checkout__securityCode');

    (async function getIdentificationTypes() {
        try {
            const types = await mp.getIdentificationTypes();
            const select = document.getElementById('form-checkout__identificationType');
            types.forEach(type => {
                const opt = document.createElement('option');
                opt.value = type.id;
                opt.textContent = type.name;
                select.appendChild(opt);
            });
        } catch (e) { console.error('Error fetching docs', e); }
    })();

    document.getElementById('form-checkout').addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('form-checkout__submit');
        submitBtn.innerHTML = 'Tokenizando e Processando... ⏳';
        submitBtn.disabled = true;

        try {
            const tokenResp = await mp.fields.createCardToken({
                cardholderName: document.getElementById('form-checkout__cardholderName').value,
                identificationType: document.getElementById('form-checkout__identificationType').value,
                identificationNumber: document.getElementById('form-checkout__identificationNumber').value,
            });

            const pciToken = tokenResp.id;

            const resp = await fetch(`${GO_API_URL}/payments/card`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': TENANT_ID,
                },
                body: JSON.stringify({
                    order_id: currentTabId || '11111111-2222-3333-4444-555555555555',
                    amount: currentAmount,
                    description: `Comanda ${(currentTabId || 'Demo').substring(0, 8).toUpperCase()}`,
                    token: pciToken,
                    installments: 1,
                    payment_method_id: 'master',
                    payer_email: document.getElementById('form-checkout__cardholderEmail').value,
                    payer_cpf: document.getElementById('form-checkout__identificationNumber').value,
                }),
            });

            if (!resp.ok) throw new Error('A API Go-Core recusou ou erro de servidor no Cartão.');

            const data = await resp.json();
            if (data.status === 'approved' || data.status === 'in_process') {
                alert(`Pagamento Aprovado! (ID: ${data.mp_id})`);
                document.getElementById('form-checkout').innerHTML =
                    `<h3 style="color:var(--success);text-align:center">✅ Pagamento Aprovado!</h3><p style="text-align:center">Seu pedido já foi liberado na Cozinha.</p>`;
            } else {
                alert(`Cartão Não Autorizado. Status: ${data.status}`);
            }
        } catch (err) {
            console.error(err);
            alert('Falha Global de Transação. Verifique o console ou a API Go.');
        } finally {
            submitBtn.innerHTML = 'Pagar com Cartão 💳';
            submitBtn.disabled = false;
        }
    });
});
