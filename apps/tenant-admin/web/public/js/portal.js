(() => {
    const root = document.getElementById('portal-root');
    const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
    const publicTablesApiBaseUrl = String(runtimeConfig.publicTablesApiBaseUrl || '/admin/api/public/tables').replace(/\/+$/, '');
    const API = `${publicTablesApiBaseUrl}/portal`;
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    let portalSocket = null;
    let reconnectTimer = null;
    let currentTab = null;
    let activePanel = '';
    let followChat = true;
    let composerDraft = '';

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatStatus(status) {
        const labels = { PENDING:'Recebido', ACCEPTED:'Em preparo', PREPARING:'Em preparo', READY:'Pronto', DELIVERED:'Entregue' };
        return labels[String(status || '').toUpperCase()] || 'Em andamento';
    }

    function formatMessageTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function captureChatPosition() {
        const history = document.getElementById('portal-history');
        if (!history) return;
        followChat = history.scrollHeight - history.scrollTop - history.clientHeight < 72;
    }

    function scrollChatToEnd() {
        if (!followChat) return;
        const history = document.getElementById('portal-history');
        if (history) history.scrollTop = history.scrollHeight;
    }

    function render(tab, { restoreComposerFocus = false } = {}) {
        currentTab = tab;
        const table = tab.tableNumber ? `Mesa ${escapeHtml(String(tab.tableNumber).padStart(2, '0'))}` : 'Comanda sem mesa';
        const items = Array.isArray(tab.items) ? tab.items : [];
        const messages = Array.isArray(tab.messages) ? tab.messages : [];
        const activeActionIndex = findActiveActionIndex(messages);
        const itemCount = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
        const panelVisible = activePanel === 'account';
        root.innerHTML = `
            <section class="portal-shell">
                <header class="portal-chat-header">
                    <div class="portal-logo"><span class="portal-logo__mark">🍽</span><div><strong>${escapeHtml(tab.tenantName || 'ClickGarçom')}</strong><small><i></i> Atendimento ativo</small></div></div>
                    <div class="portal-header-code"><span>COMANDA</span><strong>${escapeHtml(tab.publicCode || '---')}</strong></div>
                </header>
                <section class="portal-summary" aria-label="Resumo da comanda">
                    <div><span>${escapeHtml(table)}</span><strong>${money.format(Number(tab.fullTotal || 0))}</strong></div>
                    <div class="portal-summary-balance"><span>Saldo</span><strong>${money.format(Number(tab.amountDue || 0))}</strong></div>
                    <button type="button" data-portal-panel="account">Ver conta</button>
                </section>
                ${Number(tab.amountDue || 0) <= 0 ? '<div class="portal-notice"><strong>Conta regularizada.</strong> Aguarde a equipe confirmar a finalização e a saída.</div>' : ''}
                <section class="portal-conversation">
                    <div class="portal-chat-label">CONVERSA COM A EQUIPE</div>
                    <div class="portal-chat-intro">Você está falando sobre a comanda <strong>${escapeHtml(tab.publicCode || '---')}</strong>. O mesmo fluxo do WhatsApp continua aqui no navegador.</div>
                    <div class="portal-history" id="portal-history">
                        ${messages.length ? messages.map((message, index) => {
                            const senderType = String(message.senderType).toUpperCase();
                            const isCustomer = senderType === 'CUSTOMER';
                            const actions = Array.isArray(message.actions) ? message.actions : [];
                            const showActions = !isCustomer && index === activeActionIndex && actions.length > 0;
                            return `<div class="portal-message-wrap ${isCustomer ? 'portal-message-wrap--customer' : 'portal-message-wrap--staff'}">
                                <div class="portal-message ${isCustomer ? 'portal-message--customer' : 'portal-message--staff'}"><span>${escapeHtml(message.message)}</span><small>${escapeHtml(message.senderName || (isCustomer ? 'Você' : 'Equipe'))} · ${escapeHtml(formatMessageTime(message.createdAt))}</small></div>
                                ${showActions ? `<div class="portal-actions">${actions.map((action) => `<button type="button" class="portal-action-btn" data-portal-action-id="${escapeHtml(action.id)}" data-portal-action-label="${escapeHtml(action.label)}">${escapeHtml(action.label)}${action.description ? `<small>${escapeHtml(action.description)}</small>` : ''}</button>`).join('')}</div>` : ''}
                            </div>`;
                        }).join('') : '<div class="portal-chat-empty">Envie uma mensagem para iniciar o atendimento.</div>'}
                    </div>
                </section>
                <form class="portal-compose" id="portal-compose">
                    <button class="portal-compose-plus" type="button" data-portal-panel="account" aria-label="Abrir conta">+</button>
                    <textarea id="portal-message" rows="1" maxlength="1000" placeholder="Mensagem">${escapeHtml(composerDraft)}</textarea>
                    <button class="portal-compose-send" type="submit" aria-label="Enviar mensagem">➤</button>
                </form>
                <section class="portal-sheet ${panelVisible ? 'portal-sheet--open' : ''}" aria-hidden="${panelVisible ? 'false' : 'true'}">
                    <div class="portal-sheet__handle"></div>
                    <div class="portal-sheet__head"><div><span>MINHA COMANDA</span><h2>Pedidos e conta</h2></div><button type="button" data-portal-close-panel aria-label="Fechar">✕</button></div>
                    <div class="portal-sheet__metrics"><div><span>Total</span><strong>${money.format(Number(tab.fullTotal || 0))}</strong></div><div><span>Pago</span><strong>${money.format(Number(tab.paidAmount || 0))}</strong></div><div><span>Saldo</span><strong>${money.format(Number(tab.amountDue || 0))}</strong></div></div>
                    <section class="portal-sheet__section"><h3>Como pedir</h3><p>Use os botões da conversa para abrir cardápio, escolher itens, informar quantidade e acompanhar a comanda com as mesmas regras do WhatsApp.</p></section>
                    <section class="portal-sheet__section"><h3>Pedidos lançados <span>${itemCount}</span></h3>${items.length ? `<ul class="portal-items">${items.map((item) => `<li class="portal-item"><div><span class="portal-item__name">${Number(item.quantity || 0)}x ${escapeHtml(item.name)}</span><span class="portal-item__status">${escapeHtml(formatStatus(item.orderStatus))}</span></div><span class="portal-item__price">${money.format(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span></li>`).join('')}</ul>` : '<p class="portal-sheet__empty">Nenhum item lançado até agora.</p>'}</section>
                </section>
            </section>`;
        requestAnimationFrame(() => {
            scrollChatToEnd();
            if (!restoreComposerFocus) return;
            const input = document.getElementById('portal-message');
            if (!input) return;
            input.focus();
            const cursor = input.value.length;
            input.setSelectionRange(cursor, cursor);
        });
    }

    function findActiveActionIndex(messages) {
        let customerOrStaffReplyAfterAction = false;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const senderType = String(messages[index]?.senderType || '').toUpperCase();
            if (senderType === 'CUSTOMER' || senderType === 'STAFF') {
                customerOrStaffReplyAfterAction = true;
                continue;
            }
            if (Array.isArray(messages[index]?.actions) && messages[index].actions.length) {
                if (customerOrStaffReplyAfterAction) {
                    return -1;
                }
                return index;
            }
        }
        return -1;
    }

    function appendOptimisticCustomerMessage(message) {
        if (!currentTab) return;
        const text = String(message || '').trim();
        if (!text) return;
        const messages = Array.isArray(currentTab.messages) ? [...currentTab.messages] : [];
        messages.push({
            senderType: 'CUSTOMER',
            senderName: 'Você',
            message: text,
            createdAt: new Date().toISOString(),
            actions: [],
        });
        currentTab = { ...currentTab, messages };
        followChat = true;
        render(currentTab);
    }

    async function loadTab() {
        const restoreComposerFocus = document.activeElement?.id === 'portal-message';
        captureChatPosition();
        const response = await fetch(`${API}/tab`, { credentials:'same-origin', cache:'no-store' });
        if (!response.ok) throw new Error('Este acesso não está disponível. Leia novamente o QR Code da comanda.');
        render(await response.json(), { restoreComposerFocus });
    }

    function connectRealtime() {
        if (portalSocket?.readyState === WebSocket.OPEN || portalSocket?.readyState === WebSocket.CONNECTING) return;
        const fallbackProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const portalWsUrl = String(runtimeConfig.portalWsUrl || `${fallbackProtocol}//${window.location.host}/ws/portal`).replace(/\/+$/, '');
        portalSocket = new WebSocket(portalWsUrl);
        portalSocket.onmessage = () => {
            loadTab().catch(() => undefined);
        };
        portalSocket.onclose = () => {
            portalSocket = null;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(connectRealtime, 4000);
        };
        portalSocket.onerror = () => portalSocket?.close();
    }

    async function sendPortalInput(payload, button) {
        if (button) button.disabled = true;
        const response = await fetch(`${API}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Não foi possível enviar sua mensagem.');
        }
    }

    async function start() {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get('access_token');
        if (accessToken) {
            const response = await fetch(`${API}/session`, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body:JSON.stringify({ access_token:accessToken }) });
            if (!response.ok) throw new Error('O link da comanda não é mais válido. Peça um novo QR Code à equipe.');
            history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
        await loadTab();
    }

    root.addEventListener('submit', async (event) => {
        if (event.target?.id !== 'portal-compose') return;
        event.preventDefault();
        const input = document.getElementById('portal-message');
        const button = event.target.querySelector('button[type="submit"]');
        const message = String(input?.value || '').trim();
        if (!message) {
            input?.focus();
            return;
        }
        composerDraft = '';
        if (input) input.value = '';
        if (button) button.disabled = true;
        appendOptimisticCustomerMessage(message);
        try {
            await sendPortalInput({ message }, button);
        } catch (error) {
            composerDraft = message;
            if (input) {
                input.value = message;
                input.focus();
            }
            if (button) button.disabled = false;
            loadTab().catch(() => undefined);
            window.alert(error.message || 'Não foi possível enviar sua mensagem.');
        }
    });

    root.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const actionId = button.dataset.portalActionId;
        const actionLabel = button.dataset.portalActionLabel;
        if (button.dataset.portalPanel) {
            activePanel = button.dataset.portalPanel;
            render(currentTab);
            return;
        }
        if (button.hasAttribute('data-portal-close-panel')) {
            activePanel = '';
            render(currentTab);
            return;
        }
        if (actionId) {
            appendOptimisticCustomerMessage(actionLabel || actionId);
            try {
                await sendPortalInput({ action_id: actionId, action_label: actionLabel || '' }, button);
            } catch (error) {
                button.disabled = false;
                loadTab().catch(() => undefined);
                window.alert(error.message || 'Não foi possível enviar sua escolha.');
            }
            return;
        }
    });

    root.addEventListener('input', (event) => {
        if (event.target?.id !== 'portal-message') return;
        composerDraft = event.target.value;
        event.target.style.height = 'auto';
        event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
    });

    root.addEventListener('scroll', (event) => {
        if (event.target?.id !== 'portal-history') return;
        followChat = event.target.scrollHeight - event.target.scrollTop - event.target.clientHeight < 72;
    }, true);

    start().then(() => {
        connectRealtime();
        window.setInterval(() => {
            loadTab().catch(() => undefined);
        }, 5000);
    }).catch((error) => { root.innerHTML = `<div class="portal-error"><strong>Não foi possível abrir sua comanda</strong><span>${escapeHtml(error.message)}</span></div>`; });
})();
