(() => {
    'use strict';

    const ADMIN_PREVIEW_STORAGE = 'clickgarcom_appointments_preview_v1';
    const CUSTOMER_BOOKINGS_STORAGE = 'clickgarcom_customer_bookings_v1';
    const DRAFT_STORAGE = 'clickgarcom_booking_draft_v1';
    // Public appointment endpoints deliberately share the existing public
    // admin gateway. This keeps a secure WhatsApp link on the same origin and
    // avoids the web shell returning HTML for an unproxied `/api/...` request.
    const PUBLIC_APPOINTMENTS_API_BASE = '/admin/api/appointments/public';
    const app = document.getElementById('booking-app');
    const query = new URLSearchParams(location.search);
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || 'agenda');

    const state = {
        step: 1,
        category: 'Todos',
        serviceId: '',
        professionalId: 'ANY',
        date: '',
        time: '',
        customer: '',
        phone: '',
        consent: true,
        workspace: null,
        success: null,
        slots: {},
    };

    const copyByProfile = {
        SALON: { mark: 'SA', business: 'Studio Aurora', eyebrow: 'BELEZA NO SEU TEMPO', title: 'Escolha seu momento', subtitle: 'Serviço, profissional e horário em poucos passos.', client: 'Seu nome', professional: 'profissional', service: 'serviço' },
        SPA: { mark: 'SP', business: 'Sereno Spa', eyebrow: 'UMA PAUSA PARA VOCÊ', title: 'Escolha seu cuidado', subtitle: 'Encontre o tratamento e o melhor horário para você.', client: 'Seu nome', professional: 'terapeuta', service: 'tratamento' },
        CLINIC: { mark: 'CA', business: 'Clínica Aurora', eyebrow: 'AGENDE COM TRANQUILIDADE', title: 'Escolha seu atendimento', subtitle: 'Selecione consulta, profissional e horário. Dados clínicos não são solicitados aqui.', client: 'Nome do paciente', professional: 'profissional', service: 'consulta' },
        GENERIC: { mark: 'AG', business: 'Espaço Modelo', eyebrow: 'AGENDE SEM COMPLICAÇÃO', title: 'Escolha seu horário', subtitle: 'Tudo o que você precisa em uma única página.', client: 'Seu nome', professional: 'responsável', service: 'serviço' },
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function profileFromQuery() {
        const raw = String(query.get('preview') || 'salon').toUpperCase();
        if (['CLINIC', 'CLINICA'].includes(raw)) return 'CLINIC';
        if (raw === 'SPA') return 'SPA';
        if (['GENERIC', 'GENERICO'].includes(raw)) return 'GENERIC';
        return 'SALON';
    }

    function isPreview() { return query.has('preview'); }
    function accessCredential() { return query.get('token') || query.get('access_token') || new URLSearchParams(location.hash.replace(/^#/, '')).get('access') || ''; }
    function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
    function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); result.setHours(12, 0, 0, 0); return result; }
    function dateLabel(value) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); }
    function service() { return state.workspace?.services.find((item) => item.id === state.serviceId); }
    function professional() { return state.professionalId === 'ANY' ? null : state.workspace?.professionals.find((item) => item.id === state.professionalId); }
    function profileCopy() { return state.workspace?.copy || copyByProfile[profileFromQuery()]; }

    function seedWorkspace() {
        const profile = profileFromQuery();
        const copy = copyByProfile[profile];
        const shared = {
            SALON: [
                ['svc-cut','Corte feminino','Cabelo','Consulta de estilo, corte e finalização.',60,89,'✂','#d95670','AUTO_CONFIRM'],
                ['svc-color','Coloração completa','Cabelo','Coloração personalizada com diagnóstico de tom.',150,239,'◐','#8057bf','MANUAL_APPROVAL'],
                ['svc-hydration','Hidratação profunda','Tratamentos','Cuidado nutritivo e finalização profissional.',75,119,'✦','#208b72','AUTO_CONFIRM'],
                ['svc-manicure','Manicure','Unhas','Cuidado completo e esmaltação.',45,45,'◇','#d17d31','AUTO_CONFIRM'],
                ['svc-brush','Escova e finalização','Cabelo','Lavagem, escova e acabamento.',50,69,'≈','#3d78cc','AUTO_CONFIRM'],
                ['svc-brow','Design de sobrancelhas','Rosto','Design personalizado e acabamento.',35,39,'⌁','#c85a91','AUTO_CONFIRM'],
            ],
            SPA: [
                ['svc-massage','Massagem relaxante','Massagens','Uma sessão para relaxamento e bem-estar.',60,160,'≈','#208b72','AUTO_CONFIRM'],
                ['svc-facial','Ritual facial','Rosto','Cuidado facial com preparação e finalização.',75,210,'✦','#8057bf','AUTO_CONFIRM'],
                ['svc-day','Day spa essencial','Experiências','Uma pausa completa com uma sequência de tratamentos.',180,490,'☼','#c07849','MANUAL_APPROVAL'],
                ['svc-feet','Escalda-pés terapêutico','Bem-estar','Ritual de descanso e relaxamento para os pés.',40,95,'♨','#397e98','AUTO_CONFIRM'],
            ],
            CLINIC: [
                ['svc-consult','Consulta inicial','Consultas','Primeiro atendimento presencial com o profissional.',50,180,'+','#207c69','MANUAL_APPROVAL'],
                ['svc-return','Consulta de retorno','Consultas','Acompanhamento previamente orientado.',30,0,'↻','#3478b8','AUTO_CONFIRM'],
                ['svc-evaluation','Avaliação','Avaliações','Avaliação presencial. Nenhuma informação clínica é solicitada online.',40,120,'✓','#8057bf','MANUAL_APPROVAL'],
            ],
            GENERIC: [
                ['svc-one','Atendimento inicial','Serviços','Conversa inicial para entender sua necessidade.',45,80,'✦','#207c69','AUTO_CONFIRM'],
                ['svc-two','Atendimento completo','Serviços','Horário estendido com o profissional.',90,150,'◇','#8057bf','MANUAL_APPROVAL'],
            ],
        };
        const services = shared[profile].map(([id,name,category,description,durationMinutes,price,icon,color,confirmationMode]) => ({ id,name,category,description,durationMinutes,price,icon,color,confirmationMode,active:true,bufferMinutes:10 }));
        const role = profile === 'SPA' ? 'Terapeuta' : profile === 'CLINIC' ? 'Profissional' : 'Especialista';
        const professionals = [
            { id:'pro-ana',name:profile === 'CLINIC' ? 'Dra. Ana Martins' : 'Ana Martins',role,initials:'AM',color:'#277864',active:true,services:services.slice(0,3).map((item)=>item.id) },
            { id:'pro-luiza',name:profile === 'CLINIC' ? 'Dra. Luiza Costa' : 'Luiza Costa',role,initials:'LC',color:'#8057bf',active:true,services:services.filter((_,index)=>index !== 0).map((item)=>item.id) },
            { id:'pro-bia',name:'Beatriz Santos',role,initials:'BS',color:'#d17d31',active:true,services:services.slice(-3).map((item)=>item.id) },
        ];
        return { tenant:{ name:copy.business,profile,open:true },copy,services,professionals,appointments:[],settings:{ minNoticeHours:2,maxAdvanceDays:60,allowCustomerCancellation:true,cancellationLimitHours:6 } };
    }

    async function request(path, options = {}) {
        const response = await fetch(path, { ...options, headers: { 'Content-Type':'application/json', ...(options.headers || {}) } });
        if (!response.ok) throw new Error((await response.json().catch(()=>null))?.message || 'Não foi possível carregar os horários.');
        return response.json();
    }

    const gateway = {
        async bootstrap() {
            if (isPreview()) {
                try {
                    const stored = JSON.parse(localStorage.getItem(ADMIN_PREVIEW_STORAGE) || 'null');
                    if (stored?.tenant?.profile === profileFromQuery() && stored?.services?.length) return stored;
                } catch (_) {}
                return seedWorkspace();
            }
            const token = accessCredential();
            return request(`${PUBLIC_APPOINTMENTS_API_BASE}/${encodeURIComponent(slug)}/bootstrap?token=${encodeURIComponent(token)}`);
        },
        async create(payload) {
            if (!isPreview()) {
                const token = accessCredential();
                return request(`${PUBLIC_APPOINTMENTS_API_BASE}/${encodeURIComponent(slug)}/bookings?token=${encodeURIComponent(token)}`, { method:'POST',body:JSON.stringify(payload) });
            }
            const item = { ...payload,id:`apt-${Date.now()}`,code:Math.random().toString(16).slice(2,8).toUpperCase(),version:1,createdAt:new Date().toISOString() };
            try {
                const adminData = JSON.parse(localStorage.getItem(ADMIN_PREVIEW_STORAGE) || 'null');
                if (adminData?.appointments) { adminData.appointments.push(item); localStorage.setItem(ADMIN_PREVIEW_STORAGE,JSON.stringify(adminData)); }
            } catch (_) {}
            return item;
        },
        async slots(serviceId, date, professionalId) {
            if (isPreview()) return null;
            const token = accessCredential();
            return request(`${PUBLIC_APPOINTMENTS_API_BASE}/${encodeURIComponent(slug)}/slots?token=${encodeURIComponent(token)}&service_id=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}&professional_id=${encodeURIComponent(professionalId || 'ANY')}`);
        },
    };

    function loadDraft() {
        try {
            const draft = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE) || 'null');
            if (draft?.slug === slug && !draft.success) Object.assign(state,draft,{ workspace:state.workspace });
        } catch (_) {}
    }
    function saveDraft() { sessionStorage.setItem(DRAFT_STORAGE,JSON.stringify({ slug,step:state.step,category:state.category,serviceId:state.serviceId,professionalId:state.professionalId,date:state.date,time:state.time,customer:state.customer,phone:state.phone,consent:state.consent })); }
    function customerBookings() { try { return JSON.parse(localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE) || '[]').filter((item)=>item.slug === slug); } catch (_) { return []; } }
    function storeCustomerBooking(item) { const all = JSON.parse(localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE) || '[]'); all.unshift({ ...item,slug }); localStorage.setItem(CUSTOMER_BOOKINGS_STORAGE,JSON.stringify(all.slice(0,40))); }
    function updateCustomerBooking(id, patch) { const all = JSON.parse(localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE) || '[]'); const index = all.findIndex((item)=>item.id===id); if(index>=0) all[index]={...all[index],...patch}; localStorage.setItem(CUSTOMER_BOOKINGS_STORAGE,JSON.stringify(all)); }

    function summaryMarkup() {
        const chosenService = service(); const chosenProfessional = professional();
        if (!chosenService) return '<div class="booking-summary__empty">Suas escolhas aparecem aqui enquanto você agenda. Nada será confirmado antes da revisão final.</div>';
        return `${summaryItem('✦',chosenService.name,`${chosenService.durationMinutes} min`)}${summaryItem('♙',chosenProfessional?.name || `Qualquer ${profileCopy().professional} disponível`,chosenProfessional?.role || 'Escolha mais rápida')}${state.date ? summaryItem('◷',dateLabel(state.date),state.time ? `às ${state.time}` : 'Escolha um horário') : ''}<div class="booking-summary__price"><span>Valor do serviço</span><strong>${money(chosenService.price)}</strong></div>`;
    }
    function summaryItem(icon,title,detail) { return `<div class="booking-summary__item"><span>${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></div>`; }
    function progress() { return `<div class="booking-progress" aria-label="Etapa ${state.step} de 4">${[1,2,3,4].map((step)=>`<span class="${state.step>=step?'is-done':''}"></span>`).join('')}</div>`; }
    function bookingCount() { return customerBookings().filter((item)=>!String(item.status).startsWith('CANCELED') && item.status !== 'COMPLETED').length; }

    function renderShell() {
        const copy = profileCopy(); const count = bookingCount();
        const logo = state.workspace.tenant.logoUrl ? `<img src="${escapeHtml(state.workspace.tenant.logoUrl)}" alt="">` : escapeHtml(copy.mark || state.workspace.tenant.name.slice(0,2).toUpperCase());
        app.innerHTML = `<div class="booking-shell"><header class="booking-header"><div class="booking-brand"><span class="booking-brand__logo">${logo}</span><div><strong>${escapeHtml(state.workspace.tenant.name)}</strong><small>Agenda online · horários atualizados</small></div></div><div class="booking-header__actions"><button class="booking-header__button" onclick="bookingOpenManage()"><span>Meus horários</span>${count?`<i>${count}</i>`:'<b>◷</b>'}</button></div></header><div class="booking-layout"><aside class="booking-context"><div class="booking-context__hero"><span>${escapeHtml(copy.eyebrow)}</span><h2>Seu horário,<br>do seu jeito.</h2><p>Escolha com calma. Você pode revisar tudo antes de confirmar.</p></div><div class="booking-summary"><small>RESUMO DO AGENDAMENTO</small>${summaryMarkup()}</div></aside><main class="booking-main" id="booking-main">${state.success ? successMarkup() : stepMarkup()}</main></div></div><div id="booking-modal-root"></div>`;
        saveDraft();
    }

    function stepMarkup() {
        const titles = {
            1:['ESCOLHA O QUE VOCÊ PRECISA',profileCopy().title,profileCopy().subtitle],
            2:['QUEM VAI ATENDER','Escolha quem combina com você',`Você também pode deixar que a gente encontre o primeiro ${profileCopy().professional} disponível.`],
            3:['DIA E HORÁRIO','Quando fica melhor para você?','Os horários abaixo já consideram a duração do serviço e a agenda da equipe.'],
            4:['REVISE E CONFIRME','Está tudo certo?','Informe apenas seus dados de contato e confira o resumo antes de confirmar.'],
        };
        const [kicker,title,subtitle] = titles[state.step];
        return `<header class="booking-main__head"><div><span class="booking-kicker">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${state.step>1?'<button class="booking-back" onclick="bookingBack()" aria-label="Voltar">←</button>':''}</header>${progress()}<div class="booking-content">${state.step===1?serviceStep():state.step===2?professionalStep():state.step===3?dateStep():reviewStep()}${footerMarkup()}</div>`;
    }

    function serviceStep() {
        const categories = ['Todos',...new Set(state.workspace.services.filter((item)=>item.active).map((item)=>item.category))];
        const items = state.workspace.services.filter((item)=>item.active && (state.category==='Todos' || item.category===state.category));
        return `<div class="booking-categories">${categories.map((item)=>`<button class="booking-chip ${state.category===item?'is-active':''}" onclick="bookingCategory('${escapeHtml(item)}')">${escapeHtml(item)}</button>`).join('')}</div><div class="booking-service-grid">${items.map((item)=>`<button class="booking-service ${state.serviceId===item.id?'is-selected':''}" style="--service-color:${escapeHtml(item.color)}" onclick="bookingSelectService('${escapeHtml(item.id)}')"><span class="booking-service__icon">${escapeHtml(item.icon||'✦')}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small><em>${item.price?money(item.price):'Sem custo'} · ${Number(item.durationMinutes)} min</em></span><i class="booking-service__check">✓</i></button>`).join('')}</div>`;
    }

    function eligibleProfessionals() { return state.workspace.professionals.filter((item)=>item.active && item.services.includes(state.serviceId)); }
    function professionalStep() {
        const items = eligibleProfessionals();
        return `<div class="booking-professionals"><button class="booking-professional ${state.professionalId==='ANY'?'is-selected':''}" onclick="bookingSelectProfessional('ANY')"><span class="booking-professional__avatar" style="--avatar-color:#176b5b">✦</span><span><strong>Primeiro horário disponível</strong><small>A forma mais rápida de agendar</small></span><i>✓</i></button>${items.map((item)=>`<button class="booking-professional ${state.professionalId===item.id?'is-selected':''}" onclick="bookingSelectProfessional('${escapeHtml(item.id)}')"><span class="booking-professional__avatar" style="--avatar-color:${escapeHtml(item.color)}">${escapeHtml(item.initials)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.role)}</small></span><i>✓</i></button>`).join('')}</div><div class="booking-helper"><span>✦</span><div><strong>Escolha sem pressão</strong><small>Se você não tiver preferência, selecionaremos automaticamente alguém habilitado para esse serviço.</small></div></div>`;
    }

    function availableDates() {
        const today = new Date();
        return Array.from({length:10},(_,index)=>addDays(today,index)).filter((date)=>date.getDay()!==0);
    }
    function slotsForDate(date) {
        const live = state.slots[`${date}:${state.professionalId}`];
        if (live) return live.map((time)=>({ time, disabled:false }));
        const base = ['09:00','09:45','10:30','11:15','12:00','13:30','14:15','15:00','15:45','16:30','17:15','18:00'];
        const day = new Date(`${date}T12:00:00`).getDay();
        return base.map((time,index)=>({ time,disabled:(index + day + service().durationMinutes)%7===0 }));
    }
    function dateStep() {
        const dates = availableDates(); if(!state.date) state.date=dateKey(dates[0]);
        const slots = slotsForDate(state.date); const morning=slots.filter((item)=>item.time<'12:00'); const afternoon=slots.filter((item)=>item.time>='12:00'&&item.time<'18:00'); const evening=slots.filter((item)=>item.time>='18:00');
        return `<div class="booking-date-strip">${dates.map((date)=>{const key=dateKey(date);return `<button class="booking-date ${state.date===key?'is-selected':''}" onclick="bookingSelectDate('${key}')"><span>${date.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span><strong>${date.getDate()}</strong><small>${date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</small></button>`}).join('')}</div>${slotGroup('Manhã',morning)}${slotGroup('Tarde',afternoon)}${evening.length?slotGroup('Noite',evening):''}<div class="booking-helper"><span>◷</span><div><strong>Horário reservado só depois da confirmação</strong><small>Se outro cliente confirmar antes, mostraremos imediatamente novas opções.</small></div></div>`;
    }
    function slotGroup(label,items) { return `<section class="booking-slot-group"><h3>${label}</h3><div class="booking-slots">${items.map((item)=>`<button class="booking-slot ${state.time===item.time?'is-selected':''}" ${item.disabled?'disabled':''} onclick="bookingSelectTime('${item.time}')">${item.time}</button>`).join('')}</div></section>`; }

    function reviewStep() {
        const chosenService=service(),chosenProfessional=professional();
        return `<div class="booking-review"><section class="booking-form-card"><h3>Seus dados de contato</h3><p>${state.workspace.tenant.profile==='CLINIC'?'Usaremos estes dados somente para identificar e confirmar o agendamento. Informações clínicas ficam fora desta etapa.':'Você receberá somente a confirmação e avisos importantes sobre este horário.'}</p><label class="booking-field"><span>${escapeHtml(profileCopy().client)} *</span><input id="booking-customer" autocomplete="name" value="${escapeHtml(state.customer)}" placeholder="Como podemos chamar você?" oninput="bookingUpdateField('customer',this.value)"></label><label class="booking-field"><span>WhatsApp *</span><input id="booking-phone" autocomplete="tel" inputmode="tel" value="${escapeHtml(state.phone)}" placeholder="(11) 99999-9999" oninput="bookingPhone(this)"></label><label class="booking-consent"><input type="checkbox" ${state.consent?'checked':''} onchange="bookingUpdateField('consent',this.checked)"><span>Concordo em receber mensagens relacionadas a este agendamento. Sem promoções ou conversas desnecessárias.</span></label></section><aside class="booking-review-card"><h3>Resumo</h3><p>Confira antes de confirmar.</p><div class="booking-review-line"><span>✦</span><div><strong>${escapeHtml(chosenService.name)}</strong><small>${chosenService.durationMinutes} min · ${money(chosenService.price)}</small></div></div><div class="booking-review-line"><span>♙</span><div><strong>${escapeHtml(chosenProfessional?.name || `Qualquer ${profileCopy().professional}`)}</strong><small>${escapeHtml(chosenProfessional?.role || 'Primeiro disponível')}</small></div></div><div class="booking-review-line"><span>◷</span><div><strong>${escapeHtml(dateLabel(state.date))}</strong><small>às ${escapeHtml(state.time)}</small></div></div><div class="booking-review-total"><span>Total</span><strong>${money(chosenService.price)}</strong></div></aside></div>`;
    }

    function footerMarkup() {
        const enabled = state.step===1?!!state.serviceId:state.step===2?!!state.professionalId:state.step===3?!!state.date&&!!state.time:true;
        const labels={1:'Escolher profissional',2:'Escolher data e hora',3:'Revisar agendamento',4:service()?.confirmationMode==='MANUAL_APPROVAL'?'Solicitar horário':'Confirmar agendamento'};
        return `<footer class="booking-footer"><span class="booking-footer__hint">Etapa ${state.step} de 4 · você poderá revisar antes de confirmar</span><button class="booking-primary" ${enabled?'':'disabled'} onclick="bookingContinue()">${escapeHtml(labels[state.step])}</button></footer>`;
    }

    function successMarkup() {
        const pending=state.success.status==='PENDING_APPROVAL';
        return `<section class="booking-success"><span class="booking-success__mark">${pending?'◷':'✓'}</span><span class="booking-kicker">AGENDAMENTO #${escapeHtml(state.success.code)}</span><h1>${pending?'Pedido de horário enviado':'Horário confirmado!'}</h1><p>${pending?'A equipe vai conferir a agenda e você receberá uma confirmação pelo WhatsApp.':'Pronto. Você receberá somente as atualizações importantes pelo WhatsApp.'}</p><div class="booking-success__ticket"><span>${pending?'AGUARDANDO CONFIRMAÇÃO':'SEU PRÓXIMO HORÁRIO'}</span><h3>${escapeHtml(service().name)} · ${escapeHtml(state.time)}</h3><p>${escapeHtml(dateLabel(state.date))} · ${escapeHtml(professional()?.name || `Primeiro ${profileCopy().professional} disponível`)}</p></div><div class="booking-success__actions"><button class="booking-secondary" onclick="bookingOpenManage()">Gerenciar horário</button><button class="booking-primary" onclick="bookingNew()">Agendar outro serviço</button></div></section>`;
    }

    async function confirmBooking() {
        state.customer=document.getElementById('booking-customer')?.value.trim()||state.customer;
        state.phone=document.getElementById('booking-phone')?.value.trim()||state.phone;
        if(state.customer.length<2){ toast('Informe seu nome para continuar.'); document.getElementById('booking-customer')?.focus(); return; }
        if(state.phone.replace(/\D/g,'').length<10){ toast('Informe um WhatsApp válido.'); document.getElementById('booking-phone')?.focus(); return; }
        if(!state.consent){ toast('Confirme o uso do WhatsApp para receber os detalhes.'); return; }
        const button=document.querySelector('.booking-primary'); if(button){button.disabled=true;button.textContent='Confirmando…';}
        try {
            const chosenService=service(); const duration=Number(chosenService.durationMinutes||60); const [hour,minute]=state.time.split(':').map(Number); const end=new Date(2000,0,1,hour,minute+duration);
            const payload={ date:state.date,time:state.time,endTime:`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,serviceId:state.serviceId,professionalId:state.professionalId==='ANY'?(eligibleProfessionals()[0]?.id||''):state.professionalId,customer:state.customer,phone:state.phone,status:chosenService.confirmationMode==='MANUAL_APPROVAL'?'PENDING_APPROVAL':'CONFIRMED',source:'WHATSAPP' };
            state.success=await gateway.create(payload); storeCustomerBooking({ ...state.success,serviceName:chosenService.name,professionalName:professional()?.name||`Primeiro ${profileCopy().professional} disponível`,tenantName:state.workspace.tenant.name }); sessionStorage.removeItem(DRAFT_STORAGE); renderShell(); window.scrollTo({top:0,behavior:'smooth'});
        } catch(error){ toast(error.message||'Não foi possível confirmar. Tente outro horário.'); if(button){button.disabled=false;button.textContent='Confirmar agendamento';} }
    }

    function manageMarkup() {
        const items=customerBookings();
        return `<div class="booking-overlay" onclick="if(event.target===this)bookingCloseManage()"><section class="booking-sheet" role="dialog" aria-modal="true" aria-labelledby="booking-manage-title"><header class="booking-sheet__head"><div><h2 id="booking-manage-title">Meus horários</h2><p>Confirme, altere ou cancele sem trocar mensagens.</p></div><button onclick="bookingCloseManage()" aria-label="Fechar">×</button></header><div class="booking-sheet__body">${items.length?items.map((item)=>manageCard(item)).join(''):'<div class="booking-sheet-empty"><span>◷</span><h3>Nenhum horário por aqui</h3><p>Quando você agendar, os detalhes aparecerão nesta tela.</p></div>'}</div></section></div>`;
    }
    function manageCard(item) {
        const canceled=String(item.status).startsWith('CANCELED'); const status=canceled?'Cancelado':item.status==='PENDING_APPROVAL'?'Aguardando confirmação':item.status==='COMPLETED'?'Concluído':'Confirmado';
        return `<article class="booking-manage-card"><div class="booking-manage-card__top"><span>AGENDAMENTO #${escapeHtml(item.code||item.id.slice(-5))}</span><i>${status}</i></div><h3>${escapeHtml(item.serviceName||'Serviço')} · ${escapeHtml(item.time)}</h3><p>${escapeHtml(dateLabel(item.date))} · ${escapeHtml(item.professionalName||'Profissional disponível')}</p><footer>${!canceled&&item.status!=='COMPLETED'?`<button onclick="bookingReschedule('${escapeHtml(item.id)}','${escapeHtml(item.serviceId)}')">Alterar horário</button><button class="is-danger" onclick="bookingCancel('${escapeHtml(item.id)}')">Cancelar</button>`:`<button onclick="bookingRebook('${escapeHtml(item.serviceId)}')">Agendar novamente</button>`}</footer></article>`;
    }

    function toast(message) { document.querySelector('.booking-toast')?.remove(); const node=document.createElement('div'); node.className='booking-toast'; node.textContent=message; document.body.appendChild(node); document.getElementById('booking-live').textContent=message; setTimeout(()=>node.remove(),3500); }
    function syncAndRender() { saveDraft(); renderShell(); }

    window.bookingCategory=(category)=>{state.category=category;renderShell();};
    window.bookingSelectService=(id)=>{state.serviceId=id;state.professionalId='ANY';state.date='';state.time='';syncAndRender();};
    window.bookingSelectProfessional=(id)=>{state.professionalId=id;state.time='';syncAndRender(); if(state.date) loadLiveSlots(state.date);};
    window.bookingSelectDate=(date)=>{state.date=date;state.time='';syncAndRender();loadLiveSlots(date);};
    window.bookingSelectTime=(time)=>{state.time=time;syncAndRender();};
    window.bookingBack=()=>{state.step=Math.max(1,state.step-1);syncAndRender();};
    window.bookingContinue=()=>{if(state.step<4){state.step+=1;syncAndRender();if(state.step===3) loadLiveSlots(state.date || dateKey(new Date()));window.scrollTo({top:0,behavior:'smooth'});}else confirmBooking();};
    window.bookingUpdateField=(field,value)=>{state[field]=value;saveDraft();};
    window.bookingPhone=(input)=>{let digits=input.value.replace(/\D/g,'').slice(0,11);input.value=digits.length>10?`(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`:digits.length>6?`(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`:digits.length>2?`(${digits.slice(0,2)}) ${digits.slice(2)}`:digits;state.phone=input.value;saveDraft();};
    window.bookingOpenManage=()=>{document.getElementById('booking-modal-root').innerHTML=manageMarkup();document.body.style.overflow='hidden';};
    window.bookingCloseManage=()=>{document.getElementById('booking-modal-root').innerHTML='';document.body.style.overflow='';};
    window.bookingCancel=(id)=>{if(!confirm('Cancelar este agendamento? O horário será liberado para outra pessoa.'))return;updateCustomerBooking(id,{status:'CANCELED_BY_CUSTOMER',canceledAt:new Date().toISOString()});bookingOpenManage();toast('Agendamento cancelado.');renderHeaderCount();};
    window.bookingReschedule=(id,serviceId)=>{updateCustomerBooking(id,{status:'CANCELED_BY_CUSTOMER',rescheduledAt:new Date().toISOString()});bookingCloseManage();state.success=null;state.serviceId=serviceId;state.professionalId='ANY';state.date='';state.time='';state.step=2;renderShell();toast('Escolha um novo horário.');};
    window.bookingRebook=(serviceId)=>{bookingCloseManage();state.success=null;state.serviceId=serviceId;state.professionalId='ANY';state.date='';state.time='';state.step=2;renderShell();};
    window.bookingNew=()=>{state.success=null;state.step=1;state.serviceId='';state.professionalId='ANY';state.date='';state.time='';renderShell();};
    async function loadLiveSlots(date) {
        if (isPreview() || !state.serviceId || !date) return;
        try { const result=await gateway.slots(state.serviceId,date,state.professionalId); state.slots[`${date}:${state.professionalId}`]=result.slots||[]; renderShell(); }
        catch(error) { toast(error.message||'Não foi possível atualizar os horários.'); }
    }
    function renderHeaderCount(){const button=document.querySelector('.booking-header__button');if(!button)return;const count=bookingCount();button.innerHTML=`<span>Meus horários</span>${count?`<i>${count}</i>`:'<b>◷</b>'}`;}

    (async()=>{
        try {
            state.workspace=await gateway.bootstrap();
            if(!state.workspace?.tenant?.open) throw new Error('A agenda está fechada no momento. Tente novamente mais tarde.');
            if (/^#[0-9a-f]{6}$/i.test(String(state.workspace.tenant.brandColor || ''))) document.documentElement.style.setProperty('--book-brand', state.workspace.tenant.brandColor);
            state.workspace.copy={...copyByProfile[state.workspace.tenant.profile||profileFromQuery()],...(state.workspace.copy||{})};
            loadDraft(); renderShell();
        } catch(error){ app.innerHTML=`<section class="booking-error"><span>!</span><h1>Agenda indisponível</h1><p>${escapeHtml(error.message||'Este link expirou ou a agenda está fechada no momento.')}</p></section>`; }
    })();
})();
