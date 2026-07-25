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
    let preservedScrollTop = 0;
    let lastRenderedMessageCount = 0;

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

    function syncViewportHeight() {
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        document.documentElement.style.setProperty('--portal-vh', `${Math.round(viewportHeight)}px`);
    }

    function normalizeImageUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, window.location.origin);
            const secure = parsed.protocol === 'https:';
            const localDevelopment = parsed.protocol === 'http:' && window.location.protocol === 'http:';
            return secure || localDevelopment ? parsed.href : '';
        } catch (_error) {
            return '';
        }
    }

    function presentMessage(message) {
        const rawText = String(message?.message || '').trim();
        const structuredImage = normalizeImageUrl(message?.imageUrl);
        if (structuredImage || !rawText) {
            return { text: rawText, imageUrl: structuredImage };
        }

        const lines = rawText.split(/\r?\n/);
        let lastContentIndex = lines.length - 1;
        while (lastContentIndex >= 0 && !lines[lastContentIndex].trim()) {
            lastContentIndex -= 1;
        }
        const legacyImage = lastContentIndex >= 0 ? normalizeImageUrl(lines[lastContentIndex]) : '';
        if (!legacyImage) {
            return { text: rawText, imageUrl: '' };
        }

        lines.splice(lastContentIndex, 1);
        return { text: lines.join('\n').trim(), imageUrl: legacyImage };
    }

    function formatMessageContent(value) {
        return String(value || '')
            .split(/\r?\n/)
            .map((line) => {
                if (/^[_━─┈-]{3,}$/.test(line.trim())) {
                    return '<span class="portal-message__divider"></span>';
                }
                let formatted = escapeHtml(line);
                formatted = formatted.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
                formatted = formatted.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
                return formatted || '&nbsp;';
            })
            .join('<br>');
    }

    function resolveActionIcon(action) {
        const id = String(action?.id || '').toLowerCase();
        const icons = { '1': '＋', '2': '▤', '3': '↻', '4': '♟', '5': '✓', '6': '⌁', '0': '←' };
        if (icons[id]) return icons[id];
        if (id.includes('menu:category')) return '⌘';
        if (id.includes('menu:item')) return '◇';
        if (id.includes('qty:')) return '×';
        if (id.includes('order:confirm')) return '✓';
        if (id.includes('order:')) return '▤';
        return '›';
    }

    function isMilestoneMessage(text) {
        return /(pedido aceito|pedido pronto|já está pronto|pedido entregue|pedido cancelado|pagamento confirmado)/i.test(text);
    }

    function renderPortalAction(action) {
        return `<button type="button" class="portal-action-btn" data-portal-action-id="${escapeHtml(action.id)}" data-portal-action-label="${escapeHtml(action.label)}">
            <span class="portal-action-icon" aria-hidden="true">${escapeHtml(resolveActionIcon(action))}</span>
            <span class="portal-action-copy"><span>${escapeHtml(action.label)}</span>${action.description ? `<small>${escapeHtml(action.description)}</small>` : ''}</span>
        </button>`;
    }

    function renderPortalMessage(message, index, activeActionIndex, animateFromIndex) {
        const senderType = String(message.senderType || '').toUpperCase();
        const isCustomer = senderType === 'CUSTOMER';
        const isStaff = senderType === 'STAFF';
        const actions = Array.isArray(message.actions) ? message.actions : [];
        const showActions = !isCustomer && index === activeActionIndex && actions.length > 0;
        const presented = presentMessage(message);
        const milestone = !isCustomer && isMilestoneMessage(presented.text);
        const senderName = message.senderName || (isCustomer ? 'Você' : isStaff ? 'Equipe' : 'Assistente');
        const avatar = isStaff ? 'EQ' : 'CG';
        const media = presented.imageUrl
            ? `<figure class="portal-message-media"><img src="${escapeHtml(presented.imageUrl)}" alt="Imagem enviada por ${escapeHtml(senderName)}" loading="lazy" decoding="async"></figure>`
            : '';
        const body = presented.text
            ? `<div class="portal-message__text">${formatMessageContent(presented.text)}</div>`
            : '';

        return `<article class="portal-message-wrap ${isCustomer ? 'portal-message-wrap--customer' : 'portal-message-wrap--staff'} ${index >= animateFromIndex ? 'portal-message-wrap--new' : ''}">
            ${isCustomer ? '' : `<span class="portal-message-avatar" aria-hidden="true">${avatar}</span>`}
            <div class="portal-message ${isCustomer ? 'portal-message--customer' : 'portal-message--staff'} ${milestone ? 'portal-message--milestone' : ''}">
                ${media}
                ${body}
                <div class="portal-message__meta"><span>${escapeHtml(senderName)}</span><span>·</span><time>${escapeHtml(formatMessageTime(message.createdAt))}</time>${isCustomer ? '<span class="portal-message__check" aria-label="Enviada">✓✓</span>' : ''}</div>
            </div>
            ${showActions ? `<div class="portal-actions">${actions.map(renderPortalAction).join('')}</div>` : ''}
        </article>`;
    }

    function captureChatPosition() {
        const history = document.getElementById('portal-history');
        if (!history) return;
        followChat = history.scrollHeight - history.scrollTop - history.clientHeight < 72;
        preservedScrollTop = history.scrollTop;
    }

    function scrollChatToEnd() {
        const history = document.getElementById('portal-history');
        if (!history) return;
        history.scrollTop = followChat ? history.scrollHeight : preservedScrollTop;
    }

    function render(tab, { restoreComposerFocus = false } = {}) {
        currentTab = tab;
        const table = tab.tableNumber ? `Mesa ${escapeHtml(String(tab.tableNumber).padStart(2, '0'))}` : 'Comanda sem mesa';
        const items = Array.isArray(tab.items) ? tab.items : [];
        const messages = Array.isArray(tab.messages) ? tab.messages : [];
        const activeActionIndex = findActiveActionIndex(messages);
        const animateFromIndex = lastRenderedMessageCount > 0
            ? Math.min(lastRenderedMessageCount, messages.length)
            : Math.max(messages.length - 2, 0);
        const itemCount = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
        const panelVisible = activePanel === 'account';
        root.innerHTML = `
            <section class="portal-shell">
                <header class="portal-chat-header">
                    <div class="portal-logo"><span class="portal-logo__mark">🍽</span><div><strong>${escapeHtml(tab.tenantName || 'ClickGarçom')}</strong><small><i></i> Atendimento ativo</small></div></div>
                    <div class="portal-header-code"><span>COMANDA</span><strong>${escapeHtml(tab.publicCode || '---')}</strong></div>
                </header>
                <section class="portal-summary" aria-label="Resumo da comanda">
                    <div><span>${escapeHtml(table)} · Total</span><strong>${money.format(Number(tab.fullTotal || 0))}</strong></div>
                    <div class="portal-summary-balance"><span>Saldo</span><strong>${money.format(Number(tab.amountDue || 0))}</strong></div>
                    <button type="button" data-portal-panel="account">Ver conta</button>
                </section>
                <section class="portal-conversation" aria-label="Conversa da comanda">
                    <div class="portal-history" id="portal-history" role="log" aria-live="polite">
                        ${Number(tab.amountDue || 0) <= 0 ? '<div class="portal-notice"><strong>Conta regularizada.</strong> Aguarde a equipe confirmar a saída.</div>' : ''}
                        ${messages.length ? messages.map((message, index) => renderPortalMessage(message, index, activeActionIndex, animateFromIndex)).join('') : '<div class="portal-chat-empty">Sua conversa começa aqui. Envie uma mensagem ou escolha uma opção para falar com o restaurante.</div>'}
                    </div>
                </section>
                <form class="portal-compose" id="portal-compose">
                    <button class="portal-compose-plus" type="button" data-portal-panel="account" aria-label="Abrir resumo da conta">Conta</button>
                    <textarea id="portal-message" rows="1" maxlength="1000" placeholder="Escreva uma mensagem...">${escapeHtml(composerDraft)}</textarea>
                    <button class="portal-compose-send" type="submit" aria-label="Enviar mensagem"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4.8 20 12 4 19.2l2.1-6.1L14 12l-7.9-1.1L4 4.8Z" fill="currentColor"/></svg></button>
                </form>
                ${panelVisible ? '<button type="button" class="portal-sheet-backdrop" data-portal-close-panel aria-label="Fechar resumo da conta"></button>' : ''}
                <aside class="portal-sheet ${panelVisible ? 'portal-sheet--open' : ''}" aria-hidden="${panelVisible ? 'false' : 'true'}" aria-label="Resumo da conta">
                    <div class="portal-sheet__handle"></div>
                    <div class="portal-sheet__head"><div><span>MINHA COMANDA</span><h2>Pedidos e conta</h2></div><button type="button" data-portal-close-panel aria-label="Fechar">✕</button></div>
                    <div class="portal-sheet__metrics"><div><span>Total</span><strong>${money.format(Number(tab.fullTotal || 0))}</strong></div><div><span>Pago</span><strong>${money.format(Number(tab.paidAmount || 0))}</strong></div><div><span>Saldo</span><strong>${money.format(Number(tab.amountDue || 0))}</strong></div></div>
                    <section class="portal-sheet__section"><h3>Como pedir</h3><p>Use os botões da conversa para abrir cardápio, escolher itens, informar quantidade e acompanhar a comanda com as mesmas regras do WhatsApp.</p></section>
                    <section class="portal-sheet__section"><h3>Pedidos lançados <span>${itemCount}</span></h3>${items.length ? `<ul class="portal-items">${items.map((item) => `<li class="portal-item"><div><span class="portal-item__name">${Number(item.quantity || 0)}x ${escapeHtml(item.name)}</span><span class="portal-item__status">${escapeHtml(formatStatus(item.orderStatus))}</span></div><span class="portal-item__price">${money.format(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span></li>`).join('')}</ul>` : '<p class="portal-sheet__empty">Nenhum item lançado até agora.</p>'}</section>
                </aside>
            </section>`;
        lastRenderedMessageCount = messages.length;
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
            imageUrl: '',
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

    root.addEventListener('error', (event) => {
        if (!(event.target instanceof HTMLImageElement)) return;
        const media = event.target.closest('.portal-message-media');
        if (media) media.classList.add('portal-message-media--error');
    }, true);

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

    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);
    window.visualViewport?.addEventListener('resize', syncViewportHeight);
})();
