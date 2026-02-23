/**
 * ClickGarçom - Mercado Pago Checkout UI logic (SDK V2)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. UI Tabs Logic
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.method-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const method = tab.getAttribute('data-method');
            document.getElementById(`panel-${method}`).classList.add('active');
        });
    });

    // 2. Mock Global Variables for Demo/Test Environment (Normally fetched dynamically from Backend or URL Params)
    const MOCK_ORDER_ID = "11111111-2222-3333-4444-555555555555";
    const MOCK_AMOUNT = 150.00;
    const GO_API_URL = "http://localhost:3000"; // Go-Core Endpoint
    const TENANT_ID = "d290f1ee-6c54-4b01-90e6-d701748f0851"; // Identificador do Restaurante na plataforma

    // PUBLIC KEY (Extraída via API ou Renderizada. Para teste vamos usar a PUBKEY Sandbox informada)
    // Nota: Essa é a PublicKey que só serve para tokenizar cartão via JS (Não consegue gerar cobranças sozinha)
    const MP_PUBLIC_KEY = "TEST-4d4a8e29-65bf-4076-afde-48d616d00424"; // Exemplo provisório, em prod vem do banco

    const mp = new MercadoPago(MP_PUBLIC_KEY, {
        locale: 'pt-BR'
    });

    // 3. PIX Logic
    document.getElementById('btn-generate-pix').addEventListener('click', async () => {
        const btn = document.getElementById('btn-generate-pix');
        btn.innerHTML = "Gerando PIX... ⏳";
        btn.disabled = true;

        try {
            const resp = await fetch(`${GO_API_URL}/payments/pix`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': TENANT_ID // Informa pro Go de qual Restaurante é essa cobrança
                },
                body: JSON.stringify({
                    order_id: MOCK_ORDER_ID,
                    amount: MOCK_AMOUNT,
                    description: "Jantar Especial Mesa 04",
                    payer_email: "cliente@email.com",
                    payer_name: "Visitante",
                    payer_cpf: "19119119100"
                })
            });

            if (!resp.ok) throw new Error("Falha ao gerar o PIX no Backend Go");

            const data = await resp.json();

            // Exibe QR Code na Tela
            document.getElementById('pix-img').src = `data:image/jpeg;base64,${data.qr_code_base64}`;
            document.getElementById('pix-copy-paste').value = data.qr_code;
            document.getElementById('pix-qrcode-container').style.display = 'block';
            btn.style.display = 'none';

            // Simulate WebSocket / Polling for PIX Confirmation
            setTimeout(() => {
                document.getElementById('pix-success-msg').style.display = 'block';
            }, 60000); // 1 minuto delay falso para visualização

        } catch (e) {
            console.error(e);
            alert("Erro ao Processar PIX. O Backend GO está online na porta 3000?");
            btn.innerHTML = "Tentar Novamente";
            btn.disabled = false;
        }
    });

    // 4. Cartão de Crédito Logic (SDK V2 Core)
    const cardNumberElement = mp.fields.create('cardNumber', { placeholder: "Número do cartão" });
    cardNumberElement.mount('form-checkout__cardNumber');

    const expirationDateElement = mp.fields.create('expirationDate', { placeholder: "MM/YY" });
    expirationDateElement.mount('form-checkout__expirationDate');

    const securityCodeElement = mp.fields.create('securityCode', { placeholder: "CVV" });
    securityCodeElement.mount('form-checkout__securityCode');

    // Popular os tipos de documentos (CPF/CNPJ)
    (async function getIdentificationTypes() {
        try {
            const identificationTypes = await mp.getIdentificationTypes();
            const select = document.getElementById('form-checkout__identificationType');

            identificationTypes.forEach(type => {
                const opt = document.createElement('option');
                opt.value = type.id;
                opt.textContent = type.name;
                select.appendChild(opt);
            });
        } catch (e) { console.error("Error fetching docs", e); }
    })();

    // Handler de Submissão do Formulário de Cartão (Tokenização)
    const formElement = document.getElementById('form-checkout');
    formElement.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('form-checkout__submit');
        submitBtn.innerHTML = "Tokenizando e Processando... ⏳";
        submitBtn.disabled = true;

        try {
            // Passo 1: O Mercado Pago SDK coleta os dados (Numbers/CVV) dos Iframes ocultos
            // Assinando e validando via PCI internamente, gerando um TOKEN inofensivo
            const tokenResponse = await mp.fields.createCardToken({
                cardholderName: document.getElementById('form-checkout__cardholderName').value,
                identificationType: document.getElementById('form-checkout__identificationType').value,
                identificationNumber: document.getElementById('form-checkout__identificationNumber').value,
            });

            const pciToken = tokenResponse.id; // Ex: v2-2093j420jf2093jf2j

            // Passo 2: Enviar Token Seguro + Detalhes do Pedido para nossa API Rest do GO-CORE
            const resp = await fetch(`${GO_API_URL}/payments/card`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': TENANT_ID
                },
                body: JSON.stringify({
                    order_id: MOCK_ORDER_ID,
                    amount: MOCK_AMOUNT,
                    description: "Jantar Especial Mesa 04",
                    token: pciToken,  // Só o Token! O Núm. de cartão jamais passou pelo backend.
                    installments: 1,  // Mock (fácil extrair via getInstallments() do MP)
                    payment_method_id: "master", // ou visa, extraído pelas bins 
                    payer_email: document.getElementById('form-checkout__cardholderEmail').value,
                    payer_cpf: document.getElementById('form-checkout__identificationNumber').value,
                })
            });

            if (!resp.ok) throw new Error("A API Go-Core recusou ou erro de servidor no Cartão.");

            const data = await resp.json();

            if (data.status === "approved" || data.status === "in_process") {
                alert(`Pagamento Aprovado com Sucesso! (ID: ${data.mp_id})`);
                formElement.innerHTML = `<h3 style="color:var(--success);text-align:center">✅ Pagamento Aprovado!</h3><p style="text-align:center">Seu pedido já foi liberado na Cozinha.</p>`;
            } else {
                alert(`Cartão Não Autorizado. Status: ${data.status}`);
            }

        } catch (err) {
            console.error(err);
            alert("Falha Global de Transação. Verifique o console ou a API Go.");
        } finally {
            submitBtn.innerHTML = "Pagar com Cartão 💳";
            submitBtn.disabled = false;
        }
    });

});
