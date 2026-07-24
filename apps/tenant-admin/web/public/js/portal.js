(() => {
    const root = document.getElementById('portal-root');
    const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
    const publicTablesApiBaseUrl = String(runtimeConfig.publicTablesApiBaseUrl || '/admin/api/public/tables').replace(/\/+$/, '');
    const API = `${publicTablesApiBaseUrl}/portal`;
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    let menuItems = [];
    const cart = new Map();
    let portalSocket = null;
    let reconnectTimer = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatStatus(status) {
        const labels = { PENDING:'Recebido', ACCEPTED:'Em preparo', PREPARING:'Em preparo', READY:'Pronto', DELIVERED:'Entregue' };
        return labels[String(status || '').toUpperCase()] || 'Em andamento';
    }

    function renderPortalMenu() {
        if (!menuItems.length) return '<p style="margin-top:15px">Não há itens disponíveis no cardápio neste momento.</p>';
        const cartEntries = Array.from(cart.entries()).map(([id, quantity]) => ({ item: menuItems.find((entry) => entry.id === id), quantity })).filter((entry) => entry.item);
        const total = cartEntries.reduce((sum, entry) => sum + Number(entry.item.price || 0) * entry.quantity, 0);
        return `<div class="portal-menu-list">${menuItems.map((item) => `<article class="portal-menu-item"><div><h3>${escapeHtml(item.name)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}<span class="portal-menu-price">${money.format(Number(item.price || 0))}</span></div><button type="button" data-portal-add="${escapeHtml(item.id)}">Adicionar</button></article>`).join('')}</div>
            ${cartEntries.length ? `<div class="portal-cart"><strong style="font-size:13px">Seu pedido</strong>${cartEntries.map(({ item, quantity }) => `<div class="portal-cart-row"><span>${quantity}x ${escapeHtml(item.name)}</span><span>${money.format(Number(item.price || 0) * quantity)} <button type="button" data-portal-remove="${escapeHtml(item.id)}" aria-label="Remover ${escapeHtml(item.name)}">−</button></span></div>`).join('')}<div class="portal-cart-row"><strong>Total parcial</strong><strong>${money.format(total)}</strong></div><button class="portal-cart-submit" type="button" data-portal-submit-order>Enviar pedido para a equipe</button></div>` : ''}`;
    }

    function render(tab) {
        const draft = document.getElementById('portal-message')?.value || '';
        const table = tab.tableNumber ? `Mesa ${escapeHtml(String(tab.tableNumber).padStart(2, '0'))}` : 'Comanda sem mesa';
        const items = Array.isArray(tab.items) ? tab.items : [];
        const messages = Array.isArray(tab.messages) ? tab.messages : [];
        root.innerHTML = `
            <div class="portal-logo"><span class="portal-logo__mark">🍽</span><span>${escapeHtml(tab.tenantName || 'ClickGarçom')}</span></div>
            <section class="portal-hero">
                <p class="portal-eyebrow">Minha comanda</p><h1>Acompanhe seu atendimento</h1>
                <p class="portal-location">${table} · acesso ativo enquanto sua conta estiver aberta</p>
                <div class="portal-code">CÓDIGO <strong>${escapeHtml(tab.publicCode || '---')}</strong></div>
            </section>
            <section class="portal-grid" aria-label="Resumo financeiro">
                <div class="portal-metric"><span>Total</span><strong>${money.format(Number(tab.fullTotal || 0))}</strong></div>
                <div class="portal-metric"><span>Pago</span><strong>${money.format(Number(tab.paidAmount || 0))}</strong></div>
                <div class="portal-metric"><span>Saldo</span><strong>${money.format(Number(tab.amountDue || 0))}</strong></div>
            </section>
            ${Number(tab.amountDue || 0) <= 0 ? '<div class="portal-notice"><strong>Conta regularizada.</strong> Aguarde a equipe confirmar a finalização e a saída.</div>' : ''}
            <section class="portal-card"><h2>Fazer pedido</h2><p>Escolha os itens disponíveis e envie direto para a equipe.</p>${renderPortalMenu()}</section>
            <section class="portal-card"><h2>Pedidos e itens</h2><p>Seu consumo atualizado nesta comanda.</p>
                ${items.length ? `<ul class="portal-items">${items.map((item) => `<li class="portal-item"><div><span class="portal-item__name">${Number(item.quantity || 0)}x ${escapeHtml(item.name)}</span><span class="portal-item__status">${escapeHtml(formatStatus(item.orderStatus))}</span></div><span class="portal-item__price">${money.format(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span></li>`).join('')}</ul>` : '<p style="margin-top:15px">Nenhum item lançado até agora.</p>'}
            </section>
            <section class="portal-card"><h2>Histórico do atendimento</h2><p>Mensagens vinculadas a esta comanda.</p>
                ${messages.length ? `<div class="portal-history">${messages.map((message) => `<div class="portal-message ${String(message.senderType).toUpperCase() === 'STAFF' ? 'portal-message--staff' : ''}">${escapeHtml(message.message)}<small>${escapeHtml(message.senderName || (String(message.senderType).toUpperCase() === 'STAFF' ? 'Equipe' : 'Cliente'))}</small></div>`).join('')}</div>` : '<p style="margin-top:15px">Ainda não há mensagens neste atendimento.</p>'}
                <form class="portal-compose" id="portal-compose"><textarea id="portal-message" maxlength="1000" placeholder="Escreva sua mensagem para a equipe...">${escapeHtml(draft)}</textarea><button type="submit">Enviar mensagem</button></form>
            </section><p class="portal-footer">O acesso é encerrado automaticamente ao finalizar a comanda.</p>`;
    }

    async function loadTab() {
        const response = await fetch(`${API}/tab`, { credentials:'same-origin', cache:'no-store' });
        if (!response.ok) throw new Error('Este acesso não está disponível. Leia novamente o QR Code da comanda.');
        render(await response.json());
    }

    async function loadMenu() {
        const response = await fetch(`${API}/menu`, { credentials:'same-origin', cache:'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar o cardápio.');
        menuItems = await response.json();
    }

    async function submitOrder(button) {
        const items = Array.from(cart.entries()).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
        if (!items.length) return;
        if (button) button.disabled = true;
        const response = await fetch(`${API}/orders`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials:'same-origin', body:JSON.stringify({ items }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Não foi possível enviar o pedido.');
        }
        cart.clear();
        await Promise.all([loadMenu(), loadTab()]);
    }

    function connectRealtime() {
        if (portalSocket?.readyState === WebSocket.OPEN || portalSocket?.readyState === WebSocket.CONNECTING) return;
        const fallbackProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const portalWsUrl = String(runtimeConfig.portalWsUrl || `${fallbackProtocol}//${window.location.host}/ws/portal`).replace(/\/+$/, '');
        portalSocket = new WebSocket(portalWsUrl);
        portalSocket.onmessage = () => {
            if (document.activeElement?.id !== 'portal-message') {
                Promise.all([loadMenu(), loadTab()]).catch(() => undefined);
            }
        };
        portalSocket.onclose = () => {
            portalSocket = null;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(connectRealtime, 4000);
        };
        portalSocket.onerror = () => portalSocket?.close();
    }

    async function sendMessage(message, button) {
        const response = await fetch(`${API}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ message }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Não foi possível enviar sua mensagem.');
        }
        if (button) button.disabled = true;
        await Promise.all([loadMenu(), loadTab()]);
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
        if (button) button.disabled = true;
        try {
            await sendMessage(message, button);
        } catch (error) {
            if (button) button.disabled = false;
            window.alert(error.message || 'Não foi possível enviar sua mensagem.');
        }
    });

    root.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const addId = button.dataset.portalAdd;
        const removeId = button.dataset.portalRemove;
        if (addId) {
            cart.set(addId, Math.min(20, (cart.get(addId) || 0) + 1));
            await loadTab();
            return;
        }
        if (removeId) {
            const next = (cart.get(removeId) || 0) - 1;
            if (next > 0) cart.set(removeId, next); else cart.delete(removeId);
            await loadTab();
            return;
        }
        if (button.hasAttribute('data-portal-submit-order')) {
            try {
                await submitOrder(button);
            } catch (error) {
                button.disabled = false;
                window.alert(error.message || 'Não foi possível enviar o pedido.');
            }
        }
    });

    start().then(() => {
        connectRealtime();
        window.setInterval(() => {
            if (document.activeElement?.id !== 'portal-message') {
                loadTab().catch(() => undefined);
            }
        }, 5000);
    }).catch((error) => { root.innerHTML = `<div class="portal-error"><strong>Não foi possível abrir sua comanda</strong><span>${escapeHtml(error.message)}</span></div>`; });
})();
