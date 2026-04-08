const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const PUBLIC_API_URL = String(runtimeConfig.publicTablesApiBaseUrl || `${window.location.origin}/admin/api/public/tables`).replace(/\/+$/, '');

let currentTabId = null;
let currentAccessToken = null;
let currentTabData = null;
let currentAmount = 0;
let pixPollingTimer = null;
let pendingCardReconciliation = false;
let checkoutExpiryTimer = null;

function isMercadoPagoTestEnvironment(publicKey) {
    return normalizeCheckoutText(publicKey).toUpperCase().startsWith('TEST-');
}

function showCardAlert(message, variant = 'error') {
    const alertEl = document.getElementById('checkout-card-alert');
    if (!alertEl) return;

    const text = normalizeCheckoutText(message);
    alertEl.style.display = text ? 'block' : 'none';
    alertEl.textContent = text;
    alertEl.style.borderColor = variant === 'warning' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.3)';
    alertEl.style.background = variant === 'warning' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
    alertEl.style.color = variant === 'warning' ? '#fcd34d' : '#fecaca';
}

function clearCardAlert() {
    showCardAlert('');
}

function fillSandboxBuyerData() {
    const nameEl = document.getElementById('form-checkout__cardholderName');
    const emailEl = document.getElementById('form-checkout__cardholderEmail');
    const documentEl = document.getElementById('form-checkout__identificationNumber');

    if (nameEl) nameEl.value = 'APRO';
    if (documentEl) documentEl.value = '12345678909';
    if (emailEl) {
        emailEl.value = 'test@testuser.com';
    }

    clearCardAlert();
}

function configureSandboxHelper(tab) {
    const helperEl = document.getElementById('checkout-card-sandbox-helper');
    if (!helperEl) return;

    if (!isMercadoPagoTestEnvironment(tab?.mpPublicKey)) {
        helperEl.style.display = 'none';
        helperEl.innerHTML = '';
        return;
    }

    helperEl.style.display = 'block';
    helperEl.style.borderColor = 'rgba(59, 130, 246, 0.3)';
    helperEl.style.background = 'rgba(59, 130, 246, 0.12)';
    helperEl.style.color = '#dbeafe';
    helperEl.innerHTML = `
        <div style="font-weight:700; margin-bottom:8px;">Modo teste Mercado Pago</div>
        <div style="line-height:1.5; margin-bottom:10px;">
            Para forçar aprovação, use titular <strong>APRO</strong>, CPF <strong>12345678909</strong>,
            cartão <strong>5031 4332 1540 6351</strong>, CVV <strong>123</strong>, validade <strong>11/30</strong>
            e e-mail <strong>test@testuser.com</strong>, que é o único permitido para testes segundo a documentação do Mercado Pago.
        </div>
        <button type="button" id="checkout-fill-sandbox-approved" style="border:none; border-radius:12px; padding:10px 14px; font-weight:700; cursor:pointer; background:#2563eb; color:white;">
            Preencher dados de aprovação
        </button>
    `;

    document.getElementById('checkout-fill-sandbox-approved')?.addEventListener('click', fillSandboxBuyerData);
}

function buildPublicApiHeaders() {
    if (!currentAccessToken) {
        return {};
    }

    return {
        Authorization: `Bearer ${currentAccessToken}`,
    };
}

function getCheckoutAccessPayload() {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const tabIdFromUrl = hashParams.get('tab_id') || searchParams.get('tab_id');
    const accessTokenFromUrl = hashParams.get('access_token') || searchParams.get('access_token');

    if (tabIdFromUrl && accessTokenFromUrl) {
        sessionStorage.setItem('checkout.tab_id', tabIdFromUrl);
        sessionStorage.setItem('checkout.access_token', accessTokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
        return {
            tabId: tabIdFromUrl,
            accessToken: accessTokenFromUrl,
        };
    }

    return {
        tabId: sessionStorage.getItem('checkout.tab_id'),
        accessToken: sessionStorage.getItem('checkout.access_token'),
    };
}

function fmtBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function normalizeCheckoutText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).trim();
}

function normalizeCheckoutResults(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (Array.isArray(payload?.results)) {
        return payload.results;
    }

    if (Array.isArray(payload?.payment_methods)) {
        return payload.payment_methods;
    }

    return [];
}

function normalizeIssuerId(value) {
    const text = normalizeCheckoutText(value);
    if (!text || !/^\d+$/.test(text)) {
        return '';
    }

    return text;
}

async function resolveCardPaymentMetadata(mp, tokenResp) {
    const bin = normalizeCheckoutText(
        tokenResp?.first_six_digits
        || tokenResp?.card?.first_six_digits
        || tokenResp?.firstSixDigits,
    ).replace(/\D/g, '');

    let paymentMethodId = normalizeCheckoutText(
        tokenResp?.payment_method_id
        || tokenResp?.paymentMethodId
        || tokenResp?.payment_method?.id
        || tokenResp?.paymentMethod?.id,
    );

    let issuerId = normalizeIssuerId(
        tokenResp?.issuer_id
        || tokenResp?.issuerId
        || tokenResp?.issuer?.id
        || tokenResp?.card?.issuer?.id,
    );

    if (!paymentMethodId && bin && typeof mp.getPaymentMethods === 'function') {
        try {
            const paymentMethods = normalizeCheckoutResults(await mp.getPaymentMethods({ bin }));
            const selectedMethod =
                paymentMethods.find((method) => ['credit_card', 'debit_card'].includes(
                    normalizeCheckoutText(method?.payment_type_id).toLowerCase(),
                ))
                || paymentMethods[0];

            paymentMethodId = normalizeCheckoutText(selectedMethod?.id);
            if (!issuerId) {
                issuerId = normalizeIssuerId(selectedMethod?.issuer?.id);
            }
        } catch (error) {
            console.warn('Nao foi possivel identificar a bandeira do cartao', error);
        }
    }

    if (!paymentMethodId) {
        throw new Error('Nao foi possivel identificar a bandeira do cartao. Confira os dados e tente novamente.');
    }

    if (!issuerId && bin && typeof mp.getIssuers === 'function') {
        try {
            const issuers = normalizeCheckoutResults(await mp.getIssuers({ paymentMethodId, bin }));
            issuerId = normalizeIssuerId(issuers[0]?.id);
        } catch (error) {
            console.warn('Nao foi possivel identificar a emissora do cartao', error);
        }
    }

    return {
        paymentMethodId,
        issuerId,
    };
}

function decodeJwtPayload(token) {
    const parts = String(token || '').split('.');
    if (parts.length < 2) {
        return null;
    }

    try {
        const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
        return JSON.parse(window.atob(padded));
    } catch (error) {
        return null;
    }
}

function formatRemainingValidity(seconds) {
    if (seconds <= 60) {
        return 'menos de 1 minuto';
    }

    const minutes = Math.ceil(seconds / 60);
    if (minutes === 1) {
        return '1 minuto';
    }

    return `${minutes} minutos`;
}

function updateCheckoutExpiryNotice() {
    const securityPillEl = document.getElementById('checkout-security-pill');
    const expiryDetailEl = document.getElementById('checkout-expiry-detail');
    if (!securityPillEl || !expiryDetailEl) {
        return;
    }

    securityPillEl.classList.remove('urgent', 'expired');

    const tokenPayload = decodeJwtPayload(currentAccessToken);
    const expiresAt = Number(tokenPayload?.exp || 0);
    if (!expiresAt) {
        securityPillEl.textContent = '🔒 Link individual • expira em 30 minutos';
        expiryDetailEl.textContent = 'Por segurança, após esse prazo será necessário pedir um novo link no WhatsApp.';
        return;
    }

    const remainingSeconds = expiresAt - Math.floor(Date.now() / 1000);
    if (remainingSeconds <= 0) {
        securityPillEl.textContent = '⛔ Link expirado';
        securityPillEl.classList.add('expired');
        expiryDetailEl.textContent = 'Este link venceu. Volte ao WhatsApp e solicite um novo link para pagar pelo celular.';
        return;
    }

    if (remainingSeconds <= 300) {
        securityPillEl.classList.add('urgent');
    }

    securityPillEl.textContent = `🔒 Link individual • expira em ${formatRemainingValidity(remainingSeconds)}`;
    expiryDetailEl.textContent = 'Por segurança, após esse prazo será necessário pedir um novo link no WhatsApp.';
}

function activatePaymentTab(method) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });

    document.querySelectorAll('.method-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `panel-${method}`);
    });
}

function configureCardCheckoutAvailability(tab) {
    const cardTabBtn = document.querySelector('.tab-btn[data-method="card"]');
    const cardAlertEl = document.getElementById('checkout-card-alert');
    const cardFormEl = document.getElementById('form-checkout');
    const cardEnabled = !!tab?.cardEnabled;
    const cardReason = normalizeCheckoutText(tab?.cardUnavailableReason);

    if (cardTabBtn) {
        cardTabBtn.disabled = !cardEnabled;
        cardTabBtn.title = !cardEnabled ? cardReason : '';
    }

    if (cardAlertEl) {
        cardAlertEl.style.display = !cardEnabled && cardReason ? 'block' : 'none';
        cardAlertEl.textContent = !cardEnabled ? cardReason : '';
    }

    if (cardFormEl) {
        cardFormEl.style.display = cardEnabled ? 'block' : 'none';
    }

    if (!cardEnabled) {
        activatePaymentTab('pix');
    }

    return cardEnabled;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();

    if (!contentType.includes('application/json')) {
        const body = await response.text().catch(() => '');
        if (!response.ok) {
            throw new Error('Falha ao processar a requisicao no checkout.');
        }

        const trimmedBody = String(body || '').trim();
        if (trimmedBody.startsWith('<!DOCTYPE') || trimmedBody.startsWith('<html')) {
            throw new Error('O checkout recebeu uma pagina HTML no lugar da API. Verifique a configuracao do proxy publico.');
        }

        throw new Error('A resposta da API de checkout veio em formato invalido.');
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const providerMessage = normalizeCheckoutText(payload?.provider_message);
        const userMessage = normalizeCheckoutText(payload?.message || payload?.error || 'Falha ao processar a requisicao');
        const composedMessage = providerMessage
            ? `${userMessage} Detalhe Mercado Pago: ${providerMessage}`
            : userMessage;
        throw new Error(composedMessage);
    }
    return response.json();
}

function buildPublicApiUrl(path) {
    return new URL(`${PUBLIC_API_URL}${path}`, window.location.origin).toString();
}

async function loadTabData(tabId) {
    return fetchJson(buildPublicApiUrl(`/tabs/${tabId}`), {
        headers: buildPublicApiHeaders(),
    });
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

function renderPixDetails(status) {
    const qrBase64 = String(status?.qr_code_base64 || '').trim();
    const qrCode = String(status?.qr_code || '').trim();
    if (!qrBase64 && !qrCode) {
        return;
    }

    if (qrBase64) {
        document.getElementById('pix-img').src = `data:image/jpeg;base64,${qrBase64}`;
    }
    if (qrCode) {
        document.getElementById('pix-copy-paste').value = qrCode;
    }
    document.getElementById('pix-qrcode-container').style.display = 'block';
}

function showPaymentInfo(message) {
    const successEl = document.getElementById('pix-success-msg');
    if (!successEl) return;
    successEl.style.display = 'block';
    successEl.textContent = message;
}

async function refreshTabState() {
    if (!currentTabId) return;
    const tab = await loadTabData(currentTabId);
    setCheckoutState(tab);
    configureCardCheckoutAvailability(tab);
}

async function startPaymentPolling(paymentId, options = {}) {
    stopPixPolling();
    pixPollingTimer = window.setInterval(async () => {
        try {
            const status = await fetchJson(buildPublicApiUrl(`/tabs/${currentTabId}/payments/${paymentId}/status`), {
                headers: buildPublicApiHeaders(),
            });
            renderPixDetails(status);
            if (status?.approved) {
                stopPixPolling();
                await refreshTabState();
                pendingCardReconciliation = false;
                if (options.onApproved) {
                    options.onApproved();
                }
                return;
            }

            const normalizedStatus = String(status?.status || '').trim().toLowerCase();
            if (normalizedStatus === 'rejected' || normalizedStatus === 'cancelled' || normalizedStatus === 'expired') {
                stopPixPolling();
                pendingCardReconciliation = false;
                if (options.onFailed) {
                    options.onFailed(status);
                }
                return;
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
            if (btn.disabled) {
                return;
            }

            activatePaymentTab(btn.dataset.method);
        });
    });

    const checkoutAccess = getCheckoutAccessPayload();
    currentTabId = checkoutAccess.tabId;
    currentAccessToken = checkoutAccess.accessToken;
    updateCheckoutExpiryNotice();
    if (checkoutExpiryTimer) {
        window.clearInterval(checkoutExpiryTimer);
    }
    checkoutExpiryTimer = window.setInterval(updateCheckoutExpiryNotice, 30000);

    const loadingEl = document.getElementById('checkout-loading');
    const contentEl = document.getElementById('checkout-content');

    try {
        if (!currentTabId || !currentAccessToken) {
            throw new Error('Link de pagamento invalido ou expirado');
        }

        const tab = await loadTabData(currentTabId);
        setCheckoutState(tab);

        fillInstallments();
        const cardEnabled = configureCardCheckoutAvailability(tab);
        configureSandboxHelper(tab);

        document.getElementById('btn-generate-pix').addEventListener('click', async () => {
            const btn = document.getElementById('btn-generate-pix');
            btn.innerHTML = 'Gerando PIX...';
            btn.disabled = true;

            try {
                const data = await fetchJson(buildPublicApiUrl(`/tabs/${currentTabId}/payments/pix`), {
                    method: 'POST',
                    headers: {
                        ...buildPublicApiHeaders(),
                        'Content-Type': 'application/json',
                    },
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

                renderPixDetails(data);
                if (data?.qr_code || data?.qr_code_base64) {
                    btn.style.display = 'none';
                } else {
                    showPaymentInfo('⏳ Estamos confirmando a geracao do PIX. Aguarde alguns segundos.');
                }

                if (data?.payment_id) {
                    startPaymentPolling(String(data.payment_id));
                }
            } catch (error) {
                alert(error.message || 'Erro ao gerar PIX');
                btn.innerHTML = 'Gerar QR Code PIX ⚡';
                btn.disabled = false;
            }
        });

        if (!cardEnabled) {
            return;
        }

        const mpPublicKey = String(tab?.mpPublicKey || '').trim();
        const mp = new MercadoPago(mpPublicKey, { locale: 'pt-BR' });

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
            pendingCardReconciliation = false;
            clearCardAlert();

            try {
                if (isMercadoPagoTestEnvironment(mpPublicKey)) {
                    const sandboxEmail = normalizeCheckoutText(document.getElementById('form-checkout__cardholderEmail')?.value).toLowerCase();
                    if (sandboxEmail !== 'test@testuser.com') {
                        showCardAlert('No ambiente de teste do Mercado Pago, o e-mail precisa ser exatamente test@testuser.com.');
                        return;
                    }
                }

                const tokenResp = await mp.fields.createCardToken({
                    cardholderName: document.getElementById('form-checkout__cardholderName').value,
                    identificationType: document.getElementById('form-checkout__identificationType').value,
                    identificationNumber: document.getElementById('form-checkout__identificationNumber').value,
                });

                const cardMetadata = await resolveCardPaymentMetadata(mp, tokenResp);
                const paymentPayload = {
                    token: tokenResp.id,
                    installments: Number(document.getElementById('form-checkout__installments').value || 1),
                    payment_method_id: cardMetadata.paymentMethodId,
                    payer_email: document.getElementById('form-checkout__cardholderEmail').value,
                    payer_cpf: document.getElementById('form-checkout__identificationNumber').value,
                };
                if (!isMercadoPagoTestEnvironment(mpPublicKey) && cardMetadata.issuerId) {
                    paymentPayload.issuer_id = cardMetadata.issuerId;
                }

                const response = await fetchJson(buildPublicApiUrl(`/tabs/${currentTabId}/payments/card`), {
                    method: 'POST',
                    headers: {
                        ...buildPublicApiHeaders(),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(paymentPayload),
                });

                if (String(response?.status || '').trim().toLowerCase() === 'approved' || response?.tabClosed) {
                    await refreshTabState();
                    document.getElementById('form-checkout').innerHTML =
                        '<h3 style="color:var(--success);text-align:center">Pagamento aprovado</h3><p style="text-align:center">Sua conta foi finalizada com sucesso.</p>';
                    return;
                }

                if (response?.payment_id && (response?.pending_confirmation || ['processing', 'unknown', 'pending', 'in_process'].includes(String(response?.status || '').trim().toLowerCase()))) {
                    pendingCardReconciliation = true;
                    showPaymentInfo('⏳ Pagamento enviado. Estamos confirmando com a operadora e te atualizo em instantes.');
                    startPaymentPolling(String(response.payment_id), {
                        onApproved: () => {
                            document.getElementById('form-checkout').innerHTML =
                                '<h3 style="color:var(--success);text-align:center">Pagamento aprovado</h3><p style="text-align:center">Sua conta foi finalizada com sucesso.</p>';
                        },
                        onFailed: (status) => {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = 'Pagar com Cartao 💳';
                            showCardAlert(`Pagamento retornou status ${status?.status || 'desconhecido'}${status?.status_detail ? ` (${status.status_detail})` : ''}.`, 'warning');
                        },
                    });
                    return;
                }

                showCardAlert(`Pagamento retornou status ${response?.status || 'desconhecido'}.`, 'warning');
            } catch (error) {
                showCardAlert(error?.message || 'Falha ao processar o pagamento');
            } finally {
                if (!pendingCardReconciliation) {
                    submitBtn.innerHTML = 'Pagar com Cartao 💳';
                    submitBtn.disabled = false;
                }
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
