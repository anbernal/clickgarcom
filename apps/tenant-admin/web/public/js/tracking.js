(function () {
    'use strict';
    const runtime = window.CLICKGARCOM_RUNTIME_CONFIG || {};
    // Tracking always uses the same-origin web proxy so its HttpOnly cookie
    // remains first-party and the public page never needs CORS credentials.
    const APP_BASE_PATH = String(runtime.appBasePath || '').replace(/\/+$/, '');
    const API_BASE = `${APP_BASE_PATH}/admin/api`;
    const app = document.getElementById('tracking-app');
    const terminalStatuses = new Set(['DELIVERED', 'CANCELED', 'REJECTED', 'RETURNED']);
    const statusCopy = {
        PENDING_RESTAURANT_ACCEPTANCE: ['Pedido recebido', 'O restaurante está revisando os detalhes do seu pedido.'],
        ACCEPTED: ['Pedido confirmado', 'Tudo certo. O restaurante confirmou sua entrega.'],
        PREPARING: ['Preparando com cuidado', 'Seu pedido está sendo preparado para sair.'],
        READY_FOR_DISPATCH: ['Pronto para coleta', 'Seu pedido está pronto e aguarda o entregador.'],
        ASSIGNED: ['Entregador a caminho', 'Um entregador já foi definido para a sua entrega.'],
        PICKED_UP: ['Pedido coletado', 'O entregador está começando o deslocamento.'],
        IN_TRANSIT: ['Sua entrega está a caminho', 'A posição abaixo é atualizada durante o trajeto.'],
        ARRIVED: ['O entregador chegou', 'Tenha o código de recebimento em mãos para informar ao entregador.'],
        DELIVERED: ['Entrega concluída', 'Recebimento confirmado. Bom apetite!'],
        REJECTED: ['Pedido não aceito', 'O restaurante não conseguiu atender esta entrega. Entre em contato para saber mais.'],
        CANCELED: ['Entrega cancelada', 'Esta entrega foi cancelada. Entre em contato com o restaurante se precisar de ajuda.'],
        DELIVERY_FAILED: ['Precisamos da sua atenção', 'Houve uma dificuldade na tentativa de entrega.'],
        RETURNING: ['Pedido em retorno', 'O pedido está retornando ao restaurante.'],
        RETURNED: ['Pedido retornado', 'A operação de retorno foi concluída.'],
    };
    const state = { snapshot: null, poll: null, socket: null, reconnect: null, reconnectAttempt: 0, connection: 'connecting', lastVersion: -1, lastEventAt: 0, map: null, confirmationOpen: false, confirmationPin: '', confirmationBusy: false, confirmationError: '' };

    function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
    function extractToken() {
        const hash = window.location.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const token = params.get('token') || (hash && !hash.includes('=') ? hash : '');
        if (hash) window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        return token;
    }
    async function jsonFetch(path, options) {
        const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : String(body?.message || body?.data?.message || 'Este acompanhamento não está disponível.'));
        return body?.data || body;
    }
    async function init() {
        const token = extractToken();
        try {
            const snapshot = token
                ? await jsonFetch('/public/deliveries/track/session', { method: 'POST', body: JSON.stringify({ token }) })
                : await jsonFetch('/public/deliveries/track', { method: 'GET' });
            applySnapshot(snapshot);
            if (!terminalStatuses.has(snapshot.status) && snapshot.tracking_active !== false) { startPolling(); connectSocket(); }
        } catch (_) { renderError(); }
    }
    function applySnapshot(snapshot) {
        if (!snapshot || Number(snapshot.version ?? 0) < state.lastVersion) return;
        state.snapshot = snapshot; state.lastVersion = Number(snapshot.version ?? 0); render();
        if (terminalStatuses.has(snapshot.status) || snapshot.tracking_active === false) stopRealtime();
    }
    function applyRealtimeEvent(event) {
        if (!state.snapshot || !event || !event.data) return;
        const occurredAt = new Date(event.occurred_at || 0).getTime();
        if (Number.isFinite(occurredAt) && occurredAt < state.lastEventAt) return;
        state.lastEventAt = Number.isFinite(occurredAt) ? occurredAt : Date.now();
        const data = event.data;
        const location = data.location ? {
            lat: data.location.latitude, lng: data.location.longitude, accuracy_m: data.location.accuracy_m ?? null,
            speed_mps: data.location.speed_mps ?? null, heading_deg: data.location.heading_deg ?? null,
            recorded_at: data.location.recorded_at || event.occurred_at,
        } : state.snapshot.driver_location;
        state.snapshot = {
            ...state.snapshot,
            ...(data.status ? { status: data.status } : {}),
            ...(data.eta_seconds != null ? { eta_seconds: data.eta_seconds } : {}),
            ...(data.eta_updated_at ? { eta_updated_at: data.eta_updated_at } : {}),
            ...(data.location ? { driver_location: location } : {}),
            updated_at: event.occurred_at || state.snapshot.updated_at,
        };
        render();
        if (terminalStatuses.has(state.snapshot.status)) stopRealtime();
    }
    function render() {
        const data = state.snapshot;
        const currentPin = document.getElementById('tracking-confirm-pin')?.value;
        if (currentPin != null) state.confirmationPin = currentPin;
        const copy = statusCopy[data.status] || ['Acompanhando sua entrega', 'O status será atualizado por aqui.'];
        const location = data.driver_location;
        const stale = location && Date.now() - new Date(location.recorded_at).getTime() > 45000;
        const connectionLabel = terminalStatuses.has(data.status) ? 'Acompanhamento encerrado' : stale ? `Última posição ${relative(location.recorded_at)}` : state.connection === 'online' ? 'Atualização ao vivo' : 'Atualizando automaticamente';
        app.innerHTML = `<header class="tracking-top"><div class="tracking-brand"><span class="tracking-brand-mark">CG</span> ClickGarçom</div><span class="tracking-connection ${stale ? 'stale' : ''}">${esc(connectionLabel)}</span></header>
            <section class="tracking-hero"><div class="tracking-overline">Status da sua entrega</div><h1>${esc(copy[0])}</h1><div class="tracking-order"><div class="tracking-code"><span>Entrega</span><strong>#${esc(data.display_code)}</strong></div><div class="tracking-eta"><span>Previsão</span><strong>${esc(eta(data.eta_seconds))}</strong></div></div></section>
            ${renderMap(data, stale)}
            <section class="tracking-card"><div class="tracking-card-head"><h2>Passo a passo</h2><span>Atualizado ${esc(relative(data.updated_at))}</span></div>${renderSteps(data.status)}</section>
            <div class="tracking-note"><span class="tracking-note-icon">${data.status === 'ARRIVED' ? '🔐' : terminalStatuses.has(data.status) ? '✓' : '✦'}</span><div><strong>${data.status === 'ARRIVED' ? 'Prepare seu código de recebimento' : terminalStatuses.has(data.status) ? 'Acompanhamento finalizado' : 'Você não precisa atualizar a página'}</strong><p>${data.status === 'ARRIVED' ? 'Informe o código somente ao entregador quando estiver com o pedido. Ele não é exibido nesta página.' : esc(copy[1])}</p></div></div>
            ${renderReceiptConfirmation(data)}
            <div class="tracking-help"><button type="button" class="tracking-button" data-tracking-action="help">Preciso de ajuda</button></div><footer class="tracking-footer">Por segurança, este link é temporário e exibe apenas os dados necessários para acompanhar esta entrega.</footer>`;
        renderActualMap(data, stale);
    }

    function renderReceiptConfirmation(data) {
        if (!data.receipt_confirmation_available || !['IN_TRANSIT', 'ARRIVED'].includes(data.status)) return '';
        if (!state.confirmationOpen) return `<section class="tracking-confirm"><div><span class="tracking-confirm-icon">✓</span><div><strong>Já recebeu seu pedido?</strong><p>Confirme o recebimento com o código enviado no WhatsApp.</p></div></div><button type="button" class="tracking-confirm-primary" data-tracking-action="open-confirmation">Confirmar recebimento</button></section>`;
        return `<section class="tracking-confirm tracking-confirm--open"><div class="tracking-confirm-head"><span class="tracking-confirm-icon">🔐</span><div><strong>Confirmar recebimento</strong><p>Digite o código somente depois de receber o pedido.</p></div></div><form class="tracking-confirm-form" data-tracking-form="confirmation"><label for="tracking-confirm-pin">Código de entrega</label><input id="tracking-confirm-pin" value="${esc(state.confirmationPin)}" maxlength="6" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="A3F9" ${state.confirmationBusy ? 'disabled' : ''}><small>Novos códigos têm 4 caracteres. Entregas anteriores podem usar 6 números.</small>${state.confirmationError ? `<div class="tracking-confirm-error" role="alert">${esc(state.confirmationError)}</div>` : ''}<div class="tracking-confirm-actions"><button type="button" class="tracking-button" data-tracking-action="close-confirmation" ${state.confirmationBusy ? 'disabled' : ''}>Voltar</button><button type="submit" class="tracking-confirm-primary" ${state.confirmationBusy ? 'disabled' : ''}>${state.confirmationBusy ? 'Confirmando…' : 'Confirmar entrega'}</button></div></form></section>`;
    }
    function renderMap(data, stale) {
        const destination = data.destination || {};
        const hasDestination = destination.lat != null && destination.lng != null;
        const driver = data.driver_location;
        const hasDriver = ['PICKED_UP','IN_TRANSIT','ARRIVED'].includes(data.status) && driver && driver.lat != null && driver.lng != null && !terminalStatuses.has(data.status);
        if (!hasDestination) return `<section class="tracking-map"><div class="tracking-map-grid"></div><div class="tracking-map-unavailable"><div><strong>Destino em atualização</strong><span>Assim que o endereço for confirmado, o mapa aparecerá aqui.</span></div></div></section>`;
        const mapStatus = hasDriver ? (stale ? `Posição de ${relative(driver.recorded_at)}` : '● Entregador em deslocamento') : terminalStatuses.has(data.status) ? 'Acompanhamento encerrado' : '⌂ Destino da entrega';
        const mapHint = hasDriver ? 'Acompanhe o motoboy e o destino neste mapa.' : terminalStatuses.has(data.status) ? 'A localização deixa de ser compartilhada após a entrega.' : 'A posição do entregador aparecerá aqui assim que a localização for recebida.';
        return `<section class="tracking-map" aria-label="Mapa da entrega"><div id="tracking-live-map" class="tracking-leaflet-map"></div><div class="tracking-map-legend"><span>${esc(mapStatus)}</span><span>${esc(mapHint)}</span></div></section>`;
    }
    function renderActualMap(data, stale) {
        if (state.map) { state.map.remove(); state.map=null; }
        const node=document.getElementById('tracking-live-map'); const driver=data.driver_location; const destination=data.destination||{};
        if(!node||!window.L||destination.lat==null||destination.lng==null)return;
        state.map=window.L.map(node,{zoomControl:false,attributionControl:true,dragging:true,scrollWheelZoom:false,tap:true});
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
        const destinationIcon=window.L.divIcon({className:'tracking-leaflet-icon destination',html:'⌂',iconSize:[38,38]});
        const destinationPoint=[Number(destination.lat),Number(destination.lng)];
        window.L.marker(destinationPoint,{icon:destinationIcon,keyboard:false}).addTo(state.map);
        if(driver&&driver.lat!=null&&driver.lng!=null&&!terminalStatuses.has(data.status)){
            const driverIcon=window.L.divIcon({className:'tracking-leaflet-icon',html:stale?'◷':'➜',iconSize:[38,38]});
            const driverPoint=[Number(driver.lat),Number(driver.lng)];
            window.L.marker(driverPoint,{icon:driverIcon,keyboard:false}).addTo(state.map);
            state.map.fitBounds(window.L.latLngBounds([driverPoint,destinationPoint]),{padding:[48,48],maxZoom:16});
        } else state.map.setView(destinationPoint,16);
    }
    function renderSteps(status) {
        const steps = [
            ['PENDING_RESTAURANT_ACCEPTANCE','Recebido'], ['ACCEPTED','Aceito'], ['PREPARING','Preparando'], ['READY_FOR_DISPATCH','Pronto'], ['IN_TRANSIT','Em rota'], ['ARRIVED','Chegou'], ['DELIVERED','Concluído'],
        ];
        const rank = { PENDING_RESTAURANT_ACCEPTANCE:0, ACCEPTED:1, PREPARING:2, READY_FOR_DISPATCH:3, ASSIGNED:3, PICKED_UP:4, IN_TRANSIT:4, ARRIVED:5, DELIVERED:6 };
        const current = rank[status];
        return `<div class="tracking-steps">${steps.map(([value,label],index) => `<div class="tracking-step ${Number.isFinite(current) && index <= current ? 'done' : ''} ${index === current ? 'current' : ''}"><span class="tracking-step-dot"></span><span class="tracking-step-label">${label}</span></div>`).join('')}</div>`;
    }
    function eta(seconds) { if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return 'calculando'; const min=Math.max(1,Math.round(Number(seconds)/60)); return `${Math.max(1,min-3)}–${min+3} min`; }
    function relative(value) { if (!value) return 'agora'; const seconds=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/1000)); if(seconds<45)return 'agora'; if(seconds<3600)return `há ${Math.round(seconds/60)} min`; return `há ${Math.round(seconds/3600)} h`; }
    function startPolling() { clearInterval(state.poll); state.poll=setInterval(async()=>{ if(document.hidden)return; try{applySnapshot(await jsonFetch('/public/deliveries/track',{method:'GET'}));}catch(_){state.connection='fallback';render();}},12000); }
    function connectSocket() {
        if (!('WebSocket' in window)) return;
        try {
            const protocol=location.protocol==='https:'?'wss:':'ws:'; state.socket=new WebSocket(`${protocol}//${location.host}/ws/delivery`);
            state.socket.onopen=()=>{state.connection='online';state.reconnectAttempt=0;render();};
            state.socket.onmessage=(event)=>{try{const message=JSON.parse(event.data);const type=message.type||message.event_type;if(['delivery.location_updated.v1','delivery.status_changed.v1','delivery.completed.v1','delivery.accepted.v1','delivery.ready_for_dispatch.v1','delivery.assigned.v1','delivery.picked_up.v1','delivery.arrived.v1','delivery.exception_opened.v1','delivery.returned.v1','delivery.eta_updated.v1'].includes(type)){ if(message.snapshot) applySnapshot(message.snapshot); else applyRealtimeEvent(message); }}catch(_){}};
            state.socket.onclose=()=>{state.connection='fallback';scheduleReconnect();render();}; state.socket.onerror=()=>state.socket?.close();
        } catch (_) { state.connection='fallback'; scheduleReconnect(); }
    }
    function scheduleReconnect(){ if(terminalStatuses.has(state.snapshot?.status))return; clearTimeout(state.reconnect); const wait=Math.min(30000,1000*(2**state.reconnectAttempt++))+Math.random()*800; state.reconnect=setTimeout(connectSocket,wait); }
    function stopRealtime(){clearInterval(state.poll);clearTimeout(state.reconnect);state.poll=null;state.reconnect=null;if(state.socket){state.socket.onclose=null;state.socket.close();state.socket=null;}}
    function renderError(){stopRealtime();app.innerHTML='<section class="tracking-error"><div><div class="tracking-error-icon">🔗</div><h1>Acompanhamento indisponível</h1><p>Este link pode ter expirado ou sido encerrado. Por segurança, não mostramos detalhes adicionais. Solicite um novo link ao restaurante.</p></div></section>';}
    window.deliveryTrackingHelp=function(){window.alert('Entre em contato com o restaurante pelo mesmo canal em que fez o pedido. Informe apenas o número da entrega — nunca compartilhe seu código antes de receber o pedido.');};
    window.deliveryTrackingOpenConfirmation=function(){state.confirmationOpen=true;state.confirmationError='';render();window.setTimeout(()=>document.getElementById('tracking-confirm-pin')?.focus(),0);};
    window.deliveryTrackingCloseConfirmation=function(){if(state.confirmationBusy)return;state.confirmationOpen=false;state.confirmationError='';render();};
    window.deliveryTrackingPinChanged=function(value){state.confirmationPin=String(value||'');state.confirmationError='';};
    window.deliveryTrackingConfirm=async function(event){event?.preventDefault();const pin=String(state.confirmationPin||'').trim().toUpperCase();if(!/^(?:[0-9A-F]{4}|\d{6})$/.test(pin)){state.confirmationError='Digite os 4 caracteres do código recebido.';render();return;}state.confirmationBusy=true;state.confirmationError='';render();try{const result=await jsonFetch('/public/deliveries/track/confirm',{method:'POST',body:JSON.stringify({pin})});state.confirmationPin='';state.confirmationOpen=false;applySnapshot({...state.snapshot,...result,tracking_active:false,receipt_confirmation_available:false});}catch(error){state.confirmationError=error.message||'Não foi possível confirmar. Confira o código.';}finally{state.confirmationBusy=false;render();}};
    app.addEventListener('click',(event)=>{const action=event.target.closest('[data-tracking-action]')?.dataset.trackingAction;if(action==='help')window.deliveryTrackingHelp();else if(action==='open-confirmation')window.deliveryTrackingOpenConfirmation();else if(action==='close-confirmation')window.deliveryTrackingCloseConfirmation();});
    app.addEventListener('input',(event)=>{if(event.target.id!=='tracking-confirm-pin')return;event.target.value=event.target.value.toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,6);window.deliveryTrackingPinChanged(event.target.value);});
    app.addEventListener('submit',(event)=>{if(event.target.matches('[data-tracking-form="confirmation"]'))window.deliveryTrackingConfirm(event);});
    window.addEventListener('pagehide',stopRealtime); document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.snapshot&&!terminalStatuses.has(state.snapshot.status)){jsonFetch('/public/deliveries/track',{method:'GET'}).then(applySnapshot).catch(()=>{});}}); init();
})();
