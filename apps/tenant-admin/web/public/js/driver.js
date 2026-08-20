// Portal do motoboy — UI pronta para o adapter DEL-FLEET-BE-004/006/007.
const driverRuntime = window.CLICKGARCOM_RUNTIME_CONFIG || {};
const DRIVER_API_ENABLED = driverRuntime.fleetApiEnabled === true;
const driverState = { screen: 'queue', session: null, online: navigator.onLine, shiftOpen: true, assignments: [], history: [], timer: null, busy: new Set(), demoQueueInitialized: false };

function driverEscape(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
function driverNow(offset = 0) { return new Date(Date.now() + offset * 60000).toISOString(); }
function driverTenantSlug() { const match = location.pathname.match(/^\/entregador\/([^/]+)/i); return match ? decodeURIComponent(match[1]) : undefined; }
function driverDemoSession() { return { driver: { id: 'fleet-driver-luana', name: 'Luana Martins', plate: 'GDX-8C90' }, tenant: { name: driverRuntime.tenantName || 'Anderson Restaurant', logo_url: driverRuntime.tenantLogoUrl || '' } }; }
function driverDemoAssignments() { return [{ id:'assignment-demo-1',delivery_id:'delivery-demo-1',delivery_code:'600364',customer_name:'Mariana',address:'Rua José Leandro Machado, 12 · Vila Yolanda · Osasco/SP',reference:'Portão branco',status:'ASSIGNED',position:1,eta_minutes:16,distance_km:4.2,item_count:1,version:2 },{ id:'assignment-demo-2',delivery_id:'delivery-demo-2',delivery_code:'721388',customer_name:'Anderson',address:'Rua Aquiles Bellini, 460 · Padroeira · Osasco/SP',reference:'Loja 2',status:'ASSIGNED',position:2,eta_minutes:29,distance_km:6.8,item_count:2,version:1 }]; }

const driverGateway = {
    async exchange(token) {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/public/delivery/drivers/access/exchange', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ token }) });
            if (!response.ok) throw new Error('Este link expirou ou já foi utilizado.');
            return response.json();
        }
        return driverDemoSession();
    },
    async activate(pin) {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/public/delivery/drivers/access/activate', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ pin }) });
            if (!response.ok) throw new Error('Não foi possível concluir a ativação.');
            return response.json();
        }
        return driverDemoSession();
    },
    async login(cpf, pin) {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/public/delivery/drivers/login', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ cpf, pin, tenant_slug: driverTenantSlug() }) });
            if (!response.ok) throw new Error('Não foi possível entrar. Confira os dados e tente novamente.');
            return response.json();
        }
        return driverDemoSession();
    },
    async me() {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/driver/session', { credentials:'include' });
            if (!response.ok) throw new Error('Sessão expirada.');
            return response.json();
        }
        return sessionStorage.getItem('clickgarcom_driver_preview') ? driverDemoSession() : null;
    },
    async queue() {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/driver/deliveries', { credentials:'include' });
            if (!response.ok) throw new Error('Não foi possível atualizar sua fila.');
            const payload = await response.json(); return payload.data || payload.assignments || payload;
        }
        if (!driverState.demoQueueInitialized) {
            driverState.assignments = driverDemoAssignments();
            driverState.demoQueueInitialized = true;
        }
        return driverState.assignments;
    },
    async history() {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/driver/deliveries/history?period=today', { credentials:'include' });
            if (!response.ok) throw new Error('Histórico temporariamente indisponível.');
            const payload = await response.json(); return payload.data || payload.deliveries || payload;
        }
        return [{ id:'history-1', delivery_code:'584210', completed_at:driverNow(-52), address:'Rua das Flores, nº 120, Centro · Osasco/SP', neighborhood:'Centro', duration_minutes:34 }];
    },
    async command(deliveryId, command, body = {}) {
        if (DRIVER_API_ENABLED) {
            const response = await fetch(`/admin/api/public/delivery/drivers/deliveries/${encodeURIComponent(deliveryId)}/${command}`, { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}, credentials:'include', body:JSON.stringify(body) });
            if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.message || 'Não foi possível avançar a entrega.'); }
            return response.json();
        }
        const status = { pickup:'PICKED_UP', start:'IN_TRANSIT', arrive:'ARRIVED', complete:'DELIVERED', incident:'OCCURRENCE' }[command];
        const completed = driverState.assignments.find((item) => item.delivery_id === deliveryId);
        driverState.assignments = driverState.assignments.map((item) => item.delivery_id === deliveryId ? { ...item, status, version:Number(item.version)+1, updated_at:driverNow() } : item).filter((item) => item.status !== 'DELIVERED');
        if (command === 'complete' && completed) driverState.history.unshift({ id:`history-${deliveryId}`, delivery_code:completed.delivery_code, completed_at:driverNow(), neighborhood:String(completed.address || '').split('·')[1]?.trim() || 'Destino', duration_minutes:completed.eta_minutes });
        return { status };
    },
    async shift(open) {
        if (DRIVER_API_ENABLED) {
            const response = await fetch('/admin/api/driver/shift', { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ open }) });
            if (!response.ok) throw new Error('Não foi possível atualizar seu turno.');
        }
        return { open };
    },
    async logout() {
        if (DRIVER_API_ENABLED) await fetch('/admin/api/driver/session', { method:'DELETE', credentials:'include' });
    },
};

async function bootDriverPortal() {
    const activationToken = new URLSearchParams(location.hash.replace(/^#/,'')).get('activate');
    if (activationToken) {
        try {
            const access = await driverGateway.exchange(activationToken);
            history.replaceState({},'',location.pathname);
            driverState.session = access.activation_required ? access : null;
            if (access.activation_required) renderDriverActivation();
            else renderDriverLogin(access);
        }
        catch (error) { renderDriverAccessError(error.message); }
        return;
    }
    driverState.session = await driverGateway.me().catch(() => null);
    if (!driverState.session) { renderDriverLogin(); return; }
    await loadDriverQueue();
    bindDriverConnectivity();
}

function renderDriverLogin(access = null) {
    const reusedLink = access?.login_required === true;
    document.getElementById('driver-app').innerHTML = `<main class="driver-login"><section class="driver-login-card"><div class="driver-login-icon">🛵</div><h1>Acesse sua rota</h1>${reusedLink ? '<div class="driver-helper">Este acesso já foi ativado. Entre com seu CPF e PIN.</div>' : '<p>Use seu CPF e PIN pessoal. Por segurança, a mensagem de erro nunca informa se um cadastro existe.</p>'}<div class="driver-field"><label for="driver-login-cpf">CPF</label><input id="driver-login-cpf" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="000.000.000-00" oninput="this.value=driverCpfMask(this.value)"></div><div class="driver-field"><label for="driver-login-pin">PIN de 6 números</label><input class="driver-pin" id="driver-login-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" oninput="this.value=this.value.replace(/\D/g,'').slice(0,6)" onkeydown="if(event.key==='Enter')submitDriverLogin()"></div><div id="driver-login-error" class="driver-error"></div><button class="driver-btn driver-btn--primary" onclick="submitDriverLogin()">Entrar com segurança</button>${!DRIVER_API_ENABLED ? '<div class="driver-preview">Prévia do frontend: você também pode simular uma sessão sem dados reais.</div><button class="driver-btn driver-btn--secondary" onclick="enterDriverPreview()">Entrar na prévia</button>' : '<div class="driver-helper">Perdeu o acesso? Solicite um novo link ao restaurante para cadastrar outro PIN.</div>'}</section></main>`;
}
function renderDriverAccessError(message) { document.getElementById('driver-app').innerHTML = `<main class="driver-login"><section class="driver-login-card"><div class="driver-login-icon">!</div><h1>Acesso indisponível</h1><p>${driverEscape(message)}</p><button class="driver-btn driver-btn--primary" onclick="location.reload()">Tentar novamente</button></section></main>`; }
function enterDriverPreview() { sessionStorage.setItem('clickgarcom_driver_preview','1'); driverState.session=driverDemoSession(); loadDriverQueue(); bindDriverConnectivity(); }
function driverCpfMask(value){return String(value||'').replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}
async function submitDriverLogin(){const cpf=String(document.getElementById('driver-login-cpf')?.value||'').replace(/\D/g,'');const pin=document.getElementById('driver-login-pin')?.value;const error=document.getElementById('driver-login-error');if(cpf.length!==11||!/^\d{6}$/.test(pin||'')){error.textContent='Informe CPF e PIN para continuar.';return}try{driverState.session=await driverGateway.login(cpf,pin);sessionStorage.setItem('clickgarcom_driver_preview','1');await loadDriverQueue();bindDriverConnectivity()}catch(requestError){error.textContent='Não foi possível entrar. Confira os dados e tente novamente.'}}

function renderDriverActivation() {
    document.getElementById('driver-app').innerHTML = `<main class="driver-login"><section class="driver-login-card"><div class="driver-login-icon">✓</div><h1>Crie seu PIN</h1><p>Este PIN será usado para abrir sua fila neste aparelho. Não compartilhe com outras pessoas.</p><div class="driver-field"><label for="driver-new-pin">PIN de 6 números</label><input class="driver-pin" id="driver-new-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" oninput="this.value=this.value.replace(/\D/g,'').slice(0,6)"></div><div class="driver-field"><label for="driver-confirm-pin">Confirme o PIN</label><input class="driver-pin" id="driver-confirm-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" oninput="this.value=this.value.replace(/\D/g,'').slice(0,6)"></div><div id="driver-activation-error" class="driver-error"></div><button class="driver-btn driver-btn--primary" onclick="activateDriverPortal()">Ativar meu acesso</button></section></main>`;
}
async function activateDriverPortal() { const pin=document.getElementById('driver-new-pin')?.value; const confirmation=document.getElementById('driver-confirm-pin')?.value; const error=document.getElementById('driver-activation-error'); if(!/^\d{6}$/.test(pin||'')){error.textContent='Crie um PIN com 6 números.';return}if(pin!==confirmation){error.textContent='Os PINs não conferem.';return}try{driverState.session=await driverGateway.activate(pin);sessionStorage.setItem('clickgarcom_driver_preview','1');await loadDriverQueue();bindDriverConnectivity()}catch(requestError){error.textContent=requestError.message}}

async function loadDriverQueue() { try { const [queue, history] = await Promise.all([driverGateway.queue(), driverGateway.history().catch(()=>driverState.history)]); driverState.assignments = queue; driverState.history = history || []; renderDriverApp(); } catch(error){ driverToast(error.message); } }
function driverLogo(){const tenant=driverState.session?.tenant||{};return tenant.logo_url?`<img src="${driverEscape(tenant.logo_url)}" alt="">`:'🍽';}
function renderDriverApp(){const driver=driverState.session?.driver||{};const tenant=driverState.session?.tenant||{};const route=driverState.assignments.filter((item)=>item.status!=='DELIVERED');document.getElementById('driver-app').innerHTML=`<div class="driver-shell"><header class="driver-header"><div class="driver-brand"><span class="driver-logo">${driverLogo()}</span><div><strong>${driverEscape(tenant.name||'Restaurante')}</strong><span>${driverEscape(driver.name||'Motoboy')} · ${driverEscape(driver.plate||'')}</span></div></div><span class="driver-online"><i></i>${driverState.online?'Online':'Offline'}</span></header>${driverState.online?'':'<div class="driver-offline">Sem internet. A fila exibida pode estar desatualizada.</div>'}<main class="driver-main">${!DRIVER_API_ENABLED?'<div class="driver-preview"><strong>Prévia funcional.</strong> A autenticação HttpOnly, os eventos e as ações reais serão ligados pelo adapter.</div>':''}${driverState.screen==='queue'?renderDriverQueue(route):driverState.screen==='history'?renderDriverHistory() : renderDriverProfile()}</main>${renderDriverNav()}</div>`;}
function renderDriverQueue(route){return `<section class="driver-greeting"><span>MINHA ROTA</span><h1>Olá, ${driverEscape((driverState.session?.driver?.name||'Motoboy').split(' ')[0])}.</h1><p>${route.length?`Você tem ${route.length} parada(s) organizada(s) pelo restaurante.`:'Sua fila está livre. Mantenha o turno aberto para receber entregas.'}</p></section><section class="driver-shift"><div><strong>${driverState.shiftOpen?'Turno aberto':'Turno fechado'}</strong><small>${driverState.shiftOpen?'Você pode receber novas entregas.':'Nenhuma nova entrega será atribuída.'}</small></div><button class="driver-switch ${driverState.shiftOpen?'is-on':''}" onclick="toggleDriverShift()" aria-label="${driverState.shiftOpen?'Fechar':'Abrir'} turno" aria-pressed="${driverState.shiftOpen}"><i></i></button></section><section class="driver-summary"><article><span>Paradas</span><strong>${route.length}</strong></article><article><span>Distância</span><strong>${route.reduce((sum,item)=>sum+Number(item.distance_km||0),0).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</strong></article><article><span>Previsão</span><strong>${route.length?`${route[route.length-1].eta_minutes} min`:'—'}</strong></article></section><div class="driver-section-head"><h2>Próximas entregas</h2><span>Ordem definida pela expedição</span></div>${route.length?route.map((item,index)=>renderDriverStop(item,index)).join(''):'<div class="driver-empty"><span>✓</span><strong>Nenhuma entrega na fila</strong><small>Quando o restaurante atribuir um pedido, ele aparecerá aqui automaticamente.</small></div>'}`;}
function driverStage(item){return {ASSIGNED:['Aguardando retirada','pickup','Confirmar retirada'],PICKED_UP:['Pedido retirado','start','Iniciar rota'],IN_TRANSIT:['Em rota','arrive','Informar chegada'],ARRIVED:['No endereço','complete','Finalizar com código'],OCCURRENCE:['Ocorrência aberta','','Aguardar expedição']}[item.status]||['Atribuída','pickup','Confirmar retirada'];}
function renderDriverStop(item,index){const stage=driverStage(item);return `<article class="driver-stop"><div class="driver-stop-top"><span class="driver-position">${index+1}</span><div class="driver-stop-title"><strong>#${driverEscape(item.delivery_code)} · ${driverEscape(item.customer_name)}</strong><span>${index===0?'Próxima parada':'Depois da parada anterior'}</span></div><span class="driver-status">${driverEscape(stage[0])}</span></div><div class="driver-address"><span>📍</span><div>${driverEscape(item.address)}${item.reference?`<br><small>Referência: ${driverEscape(item.reference)}</small>`:''}</div></div><div class="driver-stop-meta"><span>${Number(item.distance_km||0).toLocaleString('pt-BR')} km</span><span>${Number(item.eta_minutes||0)} min</span><span>${Number(item.item_count||0)} volume(s)</span></div><div class="driver-actions"><button class="driver-btn driver-btn--secondary" onclick="openDriverNavigation('${driverEscape(item.delivery_id)}')">Abrir mapa</button>${stage[1]?`<button class="driver-btn driver-btn--primary" onclick="advanceDriverDelivery('${driverEscape(item.delivery_id)}','${stage[1]}',${Number(item.version||1)})">${driverEscape(stage[2])}</button>`:'<button class="driver-btn driver-btn--secondary" disabled>Aguardando</button>'}</div><button class="driver-btn driver-btn--danger" style="width:100%;margin-top:7px" onclick="openDriverIncident('${driverEscape(item.delivery_id)}')">Informar problema</button></article>`;}
function renderDriverHistory(){return `<section class="driver-greeting"><span>MEU DIA</span><h1>Entregas concluídas</h1><p>Resumo das entregas finalizadas no período.</p></section><div class="driver-history">${driverState.history.length?driverState.history.map((item)=>{const date=new Date(item.completed_at);const dateLabel=Number.isNaN(date.getTime())?'—':date.toLocaleDateString('pt-BR');const timeLabel=Number.isNaN(date.getTime())?'—':date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});return `<article><span>✓</span><div class="driver-history-body"><strong>Pedido #${driverEscape(item.delivery_code||'—')}</strong><small>Entregue em ${dateLabel} às ${timeLabel} · ${Number(item.duration_minutes||0)} min</small><p>📍 ${driverEscape(item.address||item.neighborhood||'Destino')}</p></div></article>`}).join(''):'<div class="driver-empty"><span>▤</span><strong>Nenhuma entrega concluída hoje</strong></div>'}</div>`;}
function renderDriverProfile(){const driver=driverState.session?.driver||{};return `<section class="driver-greeting"><span>MEU ACESSO</span><h1>${driverEscape(driver.name)}</h1><p>${driverEscape(driver.plate||'')} · sessão protegida pelo restaurante.</p></section><div class="driver-shift"><div><strong>Privacidade e segurança</strong><small>O restaurante pode revogar este aparelho a qualquer momento.</small></div><span>🔒</span></div><button class="driver-btn driver-btn--danger" style="width:100%" onclick="logoutDriverPortal()">Sair deste aparelho</button>`;}
function renderDriverNav(){return `<nav class="driver-nav"><button class="${driverState.screen==='queue'?'is-active':''}" onclick="setDriverScreen('queue')"><span>🛵</span>Minha rota</button><button class="${driverState.screen==='history'?'is-active':''}" onclick="setDriverScreen('history')"><span>▤</span>Histórico</button><button class="${driverState.screen==='profile'?'is-active':''}" onclick="setDriverScreen('profile')"><span>👤</span>Meu acesso</button></nav>`;}
function setDriverScreen(screen){driverState.screen=screen;renderDriverApp()}
async function toggleDriverShift(){try{await driverGateway.shift(!driverState.shiftOpen);driverState.shiftOpen=!driverState.shiftOpen;renderDriverApp();driverToast(driverState.shiftOpen?'Turno aberto.':'Turno fechado.')}catch(error){driverToast(error.message)}}
async function advanceDriverDelivery(deliveryId,command,version){if(driverState.busy.has(deliveryId))return;if(command==='complete'){openDriverCompletion(deliveryId,version);return}driverState.busy.add(deliveryId);try{await driverGateway.command(deliveryId,command,{expected_version:version});await loadDriverQueue();navigator.vibrate?.(45);driverToast({pickup:'Retirada confirmada.',start:'Rota iniciada.',arrive:'Chegada informada.'}[command]||'Entrega atualizada.')}catch(error){driverToast(error.message)}finally{driverState.busy.delete(deliveryId)}}
function openDriverNavigation(deliveryId){const item=driverState.assignments.find((assignment)=>assignment.delivery_id===deliveryId);if(!item)return;const query=encodeURIComponent(item.address);const apple=`https://maps.apple.com/?q=${query}`;const google=`https://www.google.com/maps/search/?api=1&query=${query}`;const waze=`https://waze.com/ul?q=${query}&navigate=yes`;document.body.insertAdjacentHTML('beforeend',`<div class="driver-modal" id="driver-modal" onclick="if(event.target===this)closeDriverModal()"><section class="driver-sheet"><div class="driver-sheet-head"><div><h2>Abrir navegação</h2><p>Escolha o aplicativo disponível neste aparelho.</p></div><button onclick="closeDriverModal()">✕</button></div><div class="driver-map-options"><a class="driver-btn driver-btn--secondary" href="${google}" target="_blank" rel="noopener noreferrer">Google Maps</a><a class="driver-btn driver-btn--secondary" href="${waze}" target="_blank" rel="noopener noreferrer">Waze</a><a class="driver-btn driver-btn--secondary" href="${apple}" target="_blank" rel="noopener noreferrer">Apple Maps</a></div></section></div>`)}
function openDriverCompletion(deliveryId,version){document.body.insertAdjacentHTML('beforeend',`<div class="driver-modal" id="driver-modal" onclick="if(event.target===this)closeDriverModal()"><section class="driver-sheet"><div class="driver-sheet-head"><div><h2>Finalizar entrega</h2><p>Peça ao cliente o código recebido no WhatsApp.</p></div><button onclick="closeDriverModal()" aria-label="Fechar">✕</button></div><div class="driver-field"><label for="driver-delivery-code">Código de 4 caracteres</label><input class="driver-code" id="driver-delivery-code" maxlength="4" autocomplete="one-time-code" autocapitalize="characters" oninput="this.value=this.value.toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,4)"></div><div class="driver-error" id="driver-code-error"></div><button class="driver-btn driver-btn--primary" style="width:100%" onclick="submitDriverCompletion('${driverEscape(deliveryId)}',${version})">Confirmar entrega</button></section></div>`);setTimeout(()=>document.getElementById('driver-delivery-code')?.focus(),0)}
async function submitDriverCompletion(deliveryId,version){const pin=document.getElementById('driver-delivery-code')?.value;const error=document.getElementById('driver-code-error');if(!/^[0-9A-F]{4}$/.test(pin||'')){error.textContent='Informe o código de 4 caracteres.';return}try{await driverGateway.command(deliveryId,'complete',{pin,expected_version:version});closeDriverModal();await loadDriverQueue();driverToast('Entrega concluída e removida da fila.')}catch(requestError){error.textContent=requestError.message}}
function openDriverIncident(deliveryId){document.body.insertAdjacentHTML('beforeend',`<div class="driver-modal" id="driver-modal" onclick="if(event.target===this)closeDriverModal()"><section class="driver-sheet"><div class="driver-sheet-head"><div><h2>Informar problema</h2><p>A expedição receberá a ocorrência imediatamente.</p></div><button onclick="closeDriverModal()">✕</button></div><div class="driver-field"><label for="driver-incident-reason">O que aconteceu?</label><textarea id="driver-incident-reason" maxlength="400" placeholder="Ex.: cliente ausente, endereço não localizado…"></textarea></div><div class="driver-error" id="driver-incident-error"></div><button class="driver-btn driver-btn--danger" style="width:100%" onclick="submitDriverIncident('${driverEscape(deliveryId)}')">Enviar ocorrência</button></section></div>`)}
async function submitDriverIncident(deliveryId){const reason=document.getElementById('driver-incident-reason')?.value.trim();const error=document.getElementById('driver-incident-error');if(!reason){error.textContent='Descreva o problema para a expedição.';return}try{await driverGateway.command(deliveryId,'incident',{reason});closeDriverModal();await loadDriverQueue();driverToast('Ocorrência enviada à expedição.')}catch(requestError){error.textContent=requestError.message}}
function closeDriverModal(){document.getElementById('driver-modal')?.remove()}
async function logoutDriverPortal(){await driverGateway.logout().catch(()=>{});sessionStorage.removeItem('clickgarcom_driver_preview');driverState.session=null;driverState.assignments=[];driverState.history=[];driverState.demoQueueInitialized=false;if(driverState.timer)clearInterval(driverState.timer);driverState.timer=null;renderDriverLogin()}
function driverToast(message){const toast=document.getElementById('driver-toast');toast.textContent=message;toast.classList.add('is-visible');setTimeout(()=>toast.classList.remove('is-visible'),2600)}
function bindDriverConnectivity(){window.addEventListener('online',()=>{driverState.online=true;loadDriverQueue()},{passive:true});window.addEventListener('offline',()=>{driverState.online=false;renderDriverApp()},{passive:true});if(!driverState.timer)driverState.timer=setInterval(()=>{if(driverState.online&&driverState.screen==='queue')loadDriverQueue()},15000)}
bootDriverPortal();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/driver-sw.js').catch(() => {});
