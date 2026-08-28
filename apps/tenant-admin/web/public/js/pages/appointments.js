// ClickGarçom — Agenda & Serviços (frontend-first).
// O gateway mantém fixtures somente no modo explícito ?appointments-preview=...
// e deixa os contratos prontos para a integração do backend.

const APPOINTMENTS_PREVIEW_QUERY = 'appointments-preview';
const APPOINTMENTS_PREVIEW_STORAGE = 'clickgarcom_appointments_preview_v1';
const APPOINTMENT_STATUS = Object.freeze({
    PENDING_APPROVAL: { label: 'Aguardando confirmação', tone: 'pending' },
    CONFIRMED: { label: 'Confirmado', tone: 'confirmed' },
    CHECKED_IN: { label: 'Cliente chegou', tone: 'arrived' },
    IN_SERVICE: { label: 'Em atendimento', tone: 'service' },
    COMPLETED: { label: 'Concluído', tone: 'completed' },
    CANCELED_BY_CUSTOMER: { label: 'Cancelado pelo cliente', tone: 'canceled' },
    CANCELED_BY_TENANT: { label: 'Cancelado pela equipe', tone: 'canceled' },
    NO_SHOW: { label: 'Não compareceu', tone: 'noshow' },
});

const APPOINTMENT_PROFILE_COPY = Object.freeze({
    SALON: { client: 'Cliente', professional: 'Profissional', service: 'Serviço', title: 'Sua agenda, leve e organizada', subtitle: 'Atendimentos, equipe e confirmações em um só lugar.' },
    SPA: { client: 'Cliente', professional: 'Terapeuta', service: 'Tratamento', title: 'Cuidado em cada horário', subtitle: 'Tratamentos, terapeutas e uma jornada tranquila para o cliente.' },
    CLINIC: { client: 'Paciente', professional: 'Profissional', service: 'Consulta', title: 'Agenda clínica sem ruído', subtitle: 'Horários e confirmações com o mínimo de mensagens.' },
    GENERIC: { client: 'Cliente', professional: 'Responsável', service: 'Serviço', title: 'Horários sob controle', subtitle: 'Organize serviços, equipe e confirmações com clareza.' },
});

const appointmentUiState = {
    tab: 'agenda',
    view: 'week',
    anchorDate: new Date(),
    professional: 'ALL',
    service: 'ALL',
    search: '',
    selectedTrigger: 'BOOKING_CONFIRMED',
    selectedNodeId: '',
    workspace: null,
    loading: false,
    dragNodeId: '',
};

function appointmentPreviewProfile() {
    const raw = String(new URLSearchParams(window.location.search).get(APPOINTMENTS_PREVIEW_QUERY) || '').trim().toUpperCase();
    if (['CLINIC', 'CLINICA'].includes(raw)) return 'CLINIC';
    if (raw === 'SPA') return 'SPA';
    if (['GENERIC', 'GENERICO'].includes(raw)) return 'GENERIC';
    return 'SALON';
}

function isAppointmentsPreview() {
    return new URLSearchParams(window.location.search).has(APPOINTMENTS_PREVIEW_QUERY);
}

function appointmentClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function appointmentDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function appointmentAddDays(value, amount) {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + amount);
    return date;
}

function appointmentMonday(value) {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return date;
}

function appointmentPreviewSeed() {
    const profile = appointmentPreviewProfile();
    const copy = APPOINTMENT_PROFILE_COPY[profile];
    const today = new Date();
    const monday = appointmentMonday(today);
    const day = (offset) => appointmentDateKey(appointmentAddDays(monday, offset));
    const salonServices = [
        { id: 'svc-cut', name: 'Corte feminino', category: 'Cabelo', description: 'Consulta de estilo, corte e finalização.', durationMinutes: 60, bufferMinutes: 10, price: 89, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#e75d73', icon: '✂' },
        { id: 'svc-color', name: 'Coloração completa', category: 'Cabelo', description: 'Coloração personalizada com diagnóstico de tom.', durationMinutes: 150, bufferMinutes: 20, price: 239, confirmationMode: 'MANUAL_APPROVAL', active: true, color: '#8557d3', icon: '◐' },
        { id: 'svc-hydration', name: 'Hidratação profunda', category: 'Tratamentos', description: 'Cuidado nutritivo e finalização profissional.', durationMinutes: 75, bufferMinutes: 10, price: 119, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#2b9f87', icon: '✦' },
        { id: 'svc-manicure', name: 'Manicure', category: 'Unhas', description: 'Cuidado completo e esmaltação.', durationMinutes: 45, bufferMinutes: 5, price: 45, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#dd8c38', icon: '◇' },
        { id: 'svc-brush', name: 'Escova e finalização', category: 'Cabelo', description: 'Lavagem, escova e acabamento.', durationMinutes: 50, bufferMinutes: 10, price: 69, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#3d78cc', icon: '≈' },
    ];
    const clinicServices = [
        { id: 'svc-consult', name: 'Consulta inicial', category: 'Consultas', description: 'Primeiro atendimento com o profissional.', durationMinutes: 50, bufferMinutes: 10, price: 180, confirmationMode: 'MANUAL_APPROVAL', active: true, color: '#2f7f72', icon: '+' },
        { id: 'svc-return', name: 'Consulta de retorno', category: 'Consultas', description: 'Acompanhamento agendado.', durationMinutes: 30, bufferMinutes: 10, price: 0, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#3478b8', icon: '↻' },
        { id: 'svc-evaluation', name: 'Avaliação', category: 'Avaliações', description: 'Avaliação presencial sem coleta clínica online.', durationMinutes: 40, bufferMinutes: 10, price: 120, confirmationMode: 'MANUAL_APPROVAL', active: true, color: '#8a62c4', icon: '✓' },
    ];
    const spaServices = [
        { id: 'svc-massage', name: 'Massagem relaxante', category: 'Massagens', description: 'Sessão para relaxamento e bem-estar.', durationMinutes: 60, bufferMinutes: 20, price: 160, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#2b9f87', icon: '≈' },
        { id: 'svc-facial', name: 'Ritual facial', category: 'Rosto', description: 'Cuidado facial com preparação e finalização.', durationMinutes: 75, bufferMinutes: 20, price: 210, confirmationMode: 'AUTO_CONFIRM', active: true, color: '#9b6bc4', icon: '✦' },
        { id: 'svc-day', name: 'Day spa essencial', category: 'Experiências', description: 'Sequência de tratamentos para uma pausa completa.', durationMinutes: 180, bufferMinutes: 30, price: 490, confirmationMode: 'MANUAL_APPROVAL', active: true, color: '#c47b4e', icon: '☼' },
    ];
    const services = profile === 'CLINIC' ? clinicServices : profile === 'SPA' ? spaServices : salonServices;
    const professionals = [
        { id: 'pro-ana', name: profile === 'CLINIC' ? 'Dra. Ana Martins' : 'Ana Martins', role: profile === 'SPA' ? 'Terapeuta' : profile === 'CLINIC' ? 'Clínica geral' : 'Especialista em cortes', initials: 'AM', active: true, color: '#2f7f72', services: services.slice(0, 3).map((item) => item.id), schedule: { MON: ['09:00', '18:00'], TUE: ['09:00', '18:00'], WED: ['09:00', '18:00'], THU: ['10:00', '19:00'], FRI: ['09:00', '18:00'] } },
        { id: 'pro-luiza', name: profile === 'CLINIC' ? 'Dra. Luiza Costa' : 'Luiza Costa', role: profile === 'SPA' ? 'Esteticista' : profile === 'CLINIC' ? 'Especialista' : 'Colorista', initials: 'LC', active: true, color: '#8557d3', services: services.filter((_, index) => index !== 0 || profile !== 'SALON').map((item) => item.id), schedule: { TUE: ['10:00', '19:00'], WED: ['10:00', '19:00'], THU: ['10:00', '19:00'], FRI: ['10:00', '19:00'], SAT: ['09:00', '16:00'] } },
        { id: 'pro-bia', name: 'Beatriz Santos', role: profile === 'SPA' ? 'Massoterapeuta' : profile === 'CLINIC' ? 'Atendimento' : 'Manicure', initials: 'BS', active: true, color: '#dd8c38', services: services.slice(-2).map((item) => item.id), schedule: { MON: ['09:00', '17:00'], TUE: ['09:00', '17:00'], WED: ['09:00', '17:00'], FRI: ['09:00', '17:00'], SAT: ['09:00', '15:00'] } },
        { id: 'pro-caio', name: 'Caio Ribeiro', role: profile === 'SPA' ? 'Terapeuta' : profile === 'CLINIC' ? 'Profissional parceiro' : 'Hair stylist', initials: 'CR', active: false, color: '#3d78cc', services: services.slice(0, 2).map((item) => item.id), schedule: {} },
    ];
    const booking = (id, offset, time, endTime, serviceId, professionalId, customer, status, source = 'WHATSAPP') => ({ id, code: id.slice(-4).toUpperCase(), date: day(offset), time, endTime, serviceId, professionalId, customer, phone: '(11) 97506-2841', status, source, version: 1 });
    const appointments = [
        booking('apt-1041', 0, '09:00', '10:00', services[0].id, 'pro-ana', 'Mariana Silva', 'CONFIRMED'),
        booking('apt-1042', 0, '10:30', '11:45', services[Math.min(2, services.length - 1)].id, 'pro-bia', 'Camila Oliveira', 'CHECKED_IN'),
        booking('apt-1043', 0, '13:30', '14:30', services[0].id, 'pro-luiza', 'Fernanda Souza', 'PENDING_APPROVAL'),
        booking('apt-1044', 1, '09:30', '10:20', services[Math.min(1, services.length - 1)].id, 'pro-ana', 'Juliana Freitas', 'CONFIRMED'),
        booking('apt-1045', 1, '14:00', '15:00', services[0].id, 'pro-luiza', 'Renata Lima', 'CONFIRMED', 'ADMIN'),
        booking('apt-1046', 2, '11:00', '12:00', services[Math.min(2, services.length - 1)].id, 'pro-bia', 'Patrícia Melo', 'CONFIRMED'),
        booking('apt-1047', 3, '15:00', '16:00', services[0].id, 'pro-ana', 'Carla Ribeiro', 'CONFIRMED'),
        booking('apt-1048', 4, '10:00', '11:00', services[Math.min(1, services.length - 1)].id, 'pro-luiza', 'Bianca Alves', 'PENDING_APPROVAL'),
    ];
    const automations = {
        version: 3,
        status: 'PUBLISHED',
        updatedAt: new Date().toISOString(),
        triggers: {
            BOOKING_REQUESTED: [
                { id: 'node-request-message', type: 'MESSAGE', title: 'Solicitação recebida', text: 'Olá, {cliente}! Recebemos sua solicitação para {data}, às {hora}. Vamos conferir a agenda e avisar você por aqui.', buttonLabel: 'Ver solicitação', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
                { id: 'node-request-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
            BOOKING_CONFIRMED: [
                { id: 'node-confirm-message', type: 'MESSAGE', title: 'Confirmação imediata', text: 'Olá, {cliente}! Seu {serviço} está confirmado para {data}, às {hora}, com {profissional}.', buttonLabel: 'Gerenciar agendamento', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
                { id: 'node-confirm-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
            BOOKING_REMINDER_DUE: [
                { id: 'node-reminder-wait', type: 'WAIT', title: '24 horas antes', offsetHours: 24 },
                { id: 'node-reminder-message', type: 'MESSAGE', title: 'Lembrete', text: 'Oi, {cliente}. Passando para lembrar do seu horário amanhã, às {hora}.', buttonLabel: 'Confirmar ou alterar', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
                { id: 'node-reminder-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
            BOOKING_RESCHEDULED: [
                { id: 'node-rescheduled-message', type: 'MESSAGE', title: 'Novo horário', text: 'Seu horário foi atualizado para {data}, às {hora}. Confira os detalhes abaixo.', buttonLabel: 'Ver agendamento', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
                { id: 'node-rescheduled-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
            BOOKING_CANCELED: [
                { id: 'node-cancel-message', type: 'MESSAGE', title: 'Cancelamento', text: 'Seu agendamento de {serviço} em {data} foi cancelado. Quando quiser, você pode escolher um novo horário.', buttonLabel: 'Agendar novamente', expectedAction: 'OPEN_BOOKING', enabled: true },
                { id: 'node-cancel-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
            BOOKING_REJECTED: [
                { id: 'node-rejected-message', type: 'MESSAGE', title: 'Horário indisponível', text: 'Olá, {cliente}. Esse horário não ficou disponível, mas você pode escolher uma nova opção em poucos passos.', buttonLabel: 'Escolher outro horário', expectedAction: 'OPEN_BOOKING', enabled: true },
                { id: 'node-rejected-stop', type: 'STOP', title: 'Encerrar fluxo' },
            ],
        },
    };
    // O snapshot publicado é preservado antes de qualquer edição local, para
    // que histórico e rollback tenham uma origem real mesmo no preview.
    automations.history = [{ version: automations.version, publishedAt: automations.updatedAt, triggers: appointmentClone(automations.triggers) }];
    return {
        tenant: { name: profile === 'CLINIC' ? 'Clínica Aurora' : profile === 'SPA' ? 'Sereno Spa' : profile === 'GENERIC' ? 'Espaço Modelo' : 'Studio Aurora', profile, timezone: 'America/Sao_Paulo', open: true },
        copy,
        services,
        professionals,
        appointments,
        blocks: [{ id: 'block-lunch', date: day(2), start: '12:00', end: '13:30', professionalId: 'pro-ana', label: 'Horário bloqueado' }],
        automations,
        settings: { minNoticeHours: 2, maxAdvanceDays: 60, defaultReminderHours: 24, allowCustomerCancellation: true, cancellationLimitHours: 6 },
    };
}

function loadAppointmentsPreviewData() {
    if (new URLSearchParams(window.location.search).get('appointments-reset') === '1') {
        localStorage.removeItem(APPOINTMENTS_PREVIEW_STORAGE);
        const url = new URL(window.location.href);
        url.searchParams.delete('appointments-reset');
        window.history.replaceState({}, '', url);
    }
    try {
        const stored = JSON.parse(localStorage.getItem(APPOINTMENTS_PREVIEW_STORAGE) || 'null');
        if (stored?.services && stored?.professionals && stored?.appointments && stored?.automations) return stored;
    } catch (_) {}
    const seeded = appointmentPreviewSeed();
    localStorage.setItem(APPOINTMENTS_PREVIEW_STORAGE, JSON.stringify(seeded));
    return seeded;
}

function saveAppointmentsPreviewData(data) {
    localStorage.setItem(APPOINTMENTS_PREVIEW_STORAGE, JSON.stringify(data));
}

const appointmentsGateway = {
    async workspace() {
        return isAppointmentsPreview() ? loadAppointmentsPreviewData() : api.get('/appointments/workspace');
    },
    async saveService(service) {
        if (!isAppointmentsPreview()) return service.id ? api.patch(`/appointments/services/${encodeURIComponent(service.id)}`, service) : api.post('/appointments/services', service);
        const data = loadAppointmentsPreviewData();
        const index = data.services.findIndex((item) => item.id === service.id);
        const saved = { ...service, id: service.id || `svc-${Date.now()}` };
        if (index >= 0) data.services[index] = { ...data.services[index], ...saved };
        else data.services.push(saved);
        saveAppointmentsPreviewData(data);
        return saved;
    },
    async saveProfessional(professional) {
        if (!isAppointmentsPreview()) return professional.id ? api.patch(`/appointments/professionals/${encodeURIComponent(professional.id)}`, professional) : api.post('/appointments/professionals', professional);
        const data = loadAppointmentsPreviewData();
        const index = data.professionals.findIndex((item) => item.id === professional.id);
        const saved = { ...professional, id: professional.id || `pro-${Date.now()}`, initials: appointmentInitials(professional.name), schedule: professional.schedule || {} };
        if (index >= 0) data.professionals[index] = { ...data.professionals[index], ...saved };
        else data.professionals.push(saved);
        saveAppointmentsPreviewData(data);
        return saved;
    },
    async saveAppointment(appointment) {
        if (!isAppointmentsPreview()) return appointment.id ? api.patch(`/appointments/${encodeURIComponent(appointment.id)}`, appointment) : api.post('/appointments', appointment);
        const data = loadAppointmentsPreviewData();
        const index = data.appointments.findIndex((item) => item.id === appointment.id);
        const saved = { ...appointment, id: appointment.id || `apt-${Date.now()}`, code: appointment.code || String(Date.now()).slice(-4), version: Number(appointment.version || 0) + 1 };
        if (index >= 0) data.appointments[index] = { ...data.appointments[index], ...saved };
        else data.appointments.push(saved);
        saveAppointmentsPreviewData(data);
        return saved;
    },
    async transition(id, status, version, reason = '') {
        if (!isAppointmentsPreview()) return api.command(`/appointments/${encodeURIComponent(id)}/${appointmentTransitionPath(status)}`, { expected_version: version, ...(reason ? { reason } : {}) });
        const data = loadAppointmentsPreviewData();
        const item = data.appointments.find((appointment) => appointment.id === id);
        if (!item) throw new Error('Agendamento não encontrado.');
        if (Number(item.version || 1) !== Number(version || 1)) throw new Error('Este agendamento foi atualizado em outra tela.');
        item.status = status;
        item.version = Number(item.version || 1) + 1;
        saveAppointmentsPreviewData(data);
        return item;
    },
    async saveAutomation(automation, publish = false) {
        if (!isAppointmentsPreview()) return api.post(`/appointments/automations/${publish ? 'publish' : 'draft'}`, automation);
        const data = loadAppointmentsPreviewData();
        const history = Array.isArray(automation.history) ? appointmentClone(automation.history) : [];
        if (publish && automation.status === 'PUBLISHED') history.unshift({ version: Number(automation.version || 1), publishedAt: automation.updatedAt || new Date().toISOString(), triggers: appointmentClone(automation.triggers) });
        data.automations = { ...appointmentClone(automation), history: history.slice(0, 8), version: Number(automation.version || 0) + (publish ? 1 : 0), status: publish ? 'PUBLISHED' : 'DRAFT', updatedAt: new Date().toISOString() };
        saveAppointmentsPreviewData(data);
        return data.automations;
    },
};

function appointmentTransitionPath(status) {
    return ({ CONFIRMED: 'confirm', CHECKED_IN: 'check-in', IN_SERVICE: 'start', COMPLETED: 'complete', NO_SHOW: 'no-show', CANCELED_BY_TENANT: 'cancel' })[status] || 'transition';
}

function appointmentEscape(value) {
    return typeof escapeHTML === 'function' ? escapeHTML(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function appointmentMoney(value) {
    if (!Number(value)) return 'Gratuito';
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function appointmentInitials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PR';
}

function appointmentService(id) {
    return appointmentUiState.workspace?.services.find((item) => String(item.id) === String(id));
}

function appointmentProfessional(id) {
    return appointmentUiState.workspace?.professionals.find((item) => String(item.id) === String(id));
}

function appointmentFormatDate(dateKey, options = {}) {
    const date = new Date(`${dateKey}T12:00:00`);
    return date.toLocaleDateString('pt-BR', options.short ? { weekday: 'short', day: '2-digit' } : { weekday: 'long', day: '2-digit', month: 'long' });
}

function appointmentCopy() {
    return appointmentUiState.workspace?.copy || APPOINTMENT_PROFILE_COPY.GENERIC;
}

function appointmentCan(action) {
    return typeof canPerformAction !== 'function' || canPerformAction(action);
}

async function loadAppointmentsPage() {
    const root = document.getElementById('page-appointments');
    if (!root || appointmentUiState.loading) return;
    appointmentUiState.loading = true;
    root.innerHTML = `<div class="appointments-loading"><span></span><strong>Organizando sua agenda…</strong><small>Horários, serviços e equipe</small></div>`;
    try {
        appointmentUiState.workspace = await appointmentsGateway.workspace();
        renderAppointmentsModule();
    } catch (error) {
        root.innerHTML = `<section class="appointments-error"><span>!</span><h2>Não foi possível carregar a agenda</h2><p>${appointmentEscape(error.message || 'Tente novamente em instantes.')}</p><button class="btn-sm btn-primary" onclick="loadAppointmentsPage()">Tentar novamente</button></section>`;
    } finally {
        appointmentUiState.loading = false;
    }
}

function renderAppointmentsModule() {
    const root = document.getElementById('page-appointments');
    const data = appointmentUiState.workspace;
    if (!root || !data) return;
    const todayKey = appointmentDateKey(new Date());
    const activeToday = data.appointments.filter((item) => item.date === todayKey && !String(item.status).startsWith('CANCELED') && item.status !== 'NO_SHOW');
    const pending = data.appointments.filter((item) => item.status === 'PENDING_APPROVAL').length;
    const next = [...activeToday].filter((item) => item.status === 'CONFIRMED').sort((a, b) => a.time.localeCompare(b.time))[0];
    document.getElementById('badge-appointments').textContent = pending ? String(pending) : '';
    root.innerHTML = `<div class="appointments-page">
        <section class="appointments-hero">
            <div class="appointments-hero__copy"><span class="appointments-eyebrow">AGENDA & SERVIÇOS</span><h2>${appointmentEscape(data.copy?.title || appointmentCopy().title)}</h2><p>${appointmentEscape(data.copy?.subtitle || appointmentCopy().subtitle)}</p></div>
            <div class="appointments-hero__actions"><a class="appointments-button appointments-button--ghost" href="/agendar/${appointmentEscape(String(data.tenant?.name || 'agenda').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}?preview=${String(data.tenant?.profile || 'SALON').toLowerCase()}" target="_blank" rel="noopener">Ver experiência do cliente</a>${appointmentCan('operateAppointments') ? '<button class="appointments-button" onclick="openAppointmentModal()">+ Novo agendamento</button>' : ''}</div>
        </section>
        <section class="appointments-snapshot" aria-label="Resumo de hoje">
            ${appointmentMetric('Hoje', activeToday.length, `${activeToday.filter((item) => item.status === 'COMPLETED').length} concluído(s)`, 'calendar')}
            ${appointmentMetric('Aguardando aceite', pending, pending ? 'Precisa da sua atenção' : 'Tudo em dia', 'attention', pending > 0)}
            ${appointmentMetric('Próximo horário', next?.time || 'Livre', next ? `${next.customer} · ${appointmentService(next.serviceId)?.name || ''}` : 'Nenhum cliente aguardando', 'clock')}
            ${appointmentMetric('Equipe disponível', data.professionals.filter((item) => item.active).length, `de ${data.professionals.length} cadastrados`, 'team')}
        </section>
        <nav class="appointments-tabs" aria-label="Seções da Agenda & Serviços">
            ${appointmentTabButton('agenda', 'Agenda', 'Visualize e opere o dia')}
            ${appointmentTabButton('services', 'Serviços', 'Catálogo e duração')}
            ${appointmentTabButton('professionals', 'Profissionais', 'Equipe e disponibilidade')}
            ${appointmentTabButton('automations', 'Automações', 'Mensagens sem excesso')}
        </nav>
        <div id="appointments-content"></div>
    </div>`;
    renderAppointmentsActiveTab();
}

function appointmentMetric(label, value, detail, icon, alert = false) {
    const symbols = { calendar: '▦', attention: '!', clock: '◷', team: '♙' };
    return `<article class="appointments-metric${alert ? ' appointments-metric--alert' : ''}"><span class="appointments-metric__icon">${symbols[icon] || '•'}</span><div><small>${appointmentEscape(label)}</small><strong>${appointmentEscape(value)}</strong><p>${appointmentEscape(detail)}</p></div></article>`;
}

function appointmentTabButton(id, label, detail) {
    if (id === 'automations' && !appointmentCan('configureAppointments')) return '';
    return `<button class="appointments-tab${appointmentUiState.tab === id ? ' is-active' : ''}" type="button" onclick="setAppointmentsTab('${id}')"><strong>${label}</strong><small>${detail}</small></button>`;
}

function setAppointmentsTab(tab) {
    if (tab === 'automations' && !appointmentCan('configureAppointments')) tab = 'agenda';
    appointmentUiState.tab = tab;
    document.querySelectorAll('.appointments-tab').forEach((item) => item.classList.toggle('is-active', item.getAttribute('onclick')?.includes(`'${tab}'`)));
    renderAppointmentsActiveTab();
}

function renderAppointmentsActiveTab() {
    const content = document.getElementById('appointments-content');
    if (!content) return;
    if (appointmentUiState.tab === 'services') content.innerHTML = renderAppointmentServices();
    else if (appointmentUiState.tab === 'professionals') content.innerHTML = renderAppointmentProfessionals();
    else if (appointmentUiState.tab === 'automations') content.innerHTML = renderAppointmentAutomations();
    else content.innerHTML = renderAppointmentAgenda();
}

function renderAppointmentAgenda() {
    const data = appointmentUiState.workspace;
    const start = appointmentUiState.view === 'day' ? new Date(appointmentUiState.anchorDate) : appointmentMonday(appointmentUiState.anchorDate);
    const days = appointmentUiState.view === 'day' ? [start] : Array.from({ length: 7 }, (_, index) => appointmentAddDays(start, index));
    const filtered = data.appointments.filter((item) => (appointmentUiState.professional === 'ALL' || item.professionalId === appointmentUiState.professional) && (appointmentUiState.service === 'ALL' || item.serviceId === appointmentUiState.service));
    const label = appointmentUiState.view === 'day'
        ? appointmentFormatDate(appointmentDateKey(start))
        : `${appointmentAddDays(start, 0).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${appointmentAddDays(start, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    return `<section class="appointments-panel appointments-agenda">
        <header class="appointments-panel__head appointments-agenda__toolbar"><div><span class="appointments-eyebrow">VISÃO OPERACIONAL</span><h3>${appointmentEscape(appointmentUiState.view === 'list' ? 'Próximos agendamentos' : label)}</h3><p>Abra qualquer horário para confirmar, reagendar ou operar o atendimento.</p></div><div class="appointments-toolbar-actions"><div class="appointments-segmented"><button class="${appointmentUiState.view === 'day' ? 'is-active' : ''}" onclick="setAppointmentView('day')">Dia</button><button class="${appointmentUiState.view === 'week' ? 'is-active' : ''}" onclick="setAppointmentView('week')">Semana</button><button class="${appointmentUiState.view === 'list' ? 'is-active' : ''}" onclick="setAppointmentView('list')">Lista</button></div>${appointmentUiState.view !== 'list' ? '<button class="appointments-icon-action" onclick="moveAppointmentPeriod(-1)" aria-label="Período anterior">←</button><button class="appointments-today" onclick="goAppointmentsToday()">Hoje</button><button class="appointments-icon-action" onclick="moveAppointmentPeriod(1)" aria-label="Próximo período">→</button>' : ''}</div></header>
        <div class="appointments-agenda__filters"><label><span>Profissional</span><select onchange="filterAppointmentsProfessional(this.value)"><option value="ALL">Toda a equipe</option>${data.professionals.filter((item) => item.active).map((item) => `<option value="${appointmentEscape(item.id)}" ${appointmentUiState.professional === item.id ? 'selected' : ''}>${appointmentEscape(item.name)}</option>`).join('')}</select></label><label><span>Serviço</span><select onchange="filterAppointmentsService(this.value)"><option value="ALL">Todos os serviços</option>${data.services.filter((item) => item.active).map((item) => `<option value="${appointmentEscape(item.id)}" ${appointmentUiState.service === item.id ? 'selected' : ''}>${appointmentEscape(item.name)}</option>`).join('')}</select></label><div class="appointments-agenda__legend"><span><i class="is-confirmed"></i>Confirmado</span><span><i class="is-pending"></i>Aguardando</span><span><i class="is-service"></i>Em atendimento</span></div>${appointmentCan('operateAppointments') ? '<button class="appointments-button appointments-button--soft" onclick="openAppointmentBlockModal()">Bloquear horário</button>' : ''}</div>
        ${appointmentUiState.view === 'list' ? renderAppointmentList(filtered) : `<div class="appointments-calendar ${appointmentUiState.view === 'day' ? 'appointments-calendar--day' : ''}">${days.map((date) => renderAppointmentDay(date, filtered)).join('')}</div>`}
    </section>`;
}

function renderAppointmentList(items) {
    const sorted = [...items].filter((item) => !String(item.status).startsWith('CANCELED')).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    if (!sorted.length) return '<div class="appointments-empty-state"><span>◷</span><h4>Nenhum agendamento encontrado</h4><p>Altere os filtros ou crie um novo horário.</p></div>';
    return `<div class="appointments-list">${sorted.map((item) => { const service = appointmentService(item.serviceId) || {}; const professional = appointmentProfessional(item.professionalId) || {}; const meta = APPOINTMENT_STATUS[item.status] || APPOINTMENT_STATUS.CONFIRMED; return `<button onclick="openAppointmentDetails('${appointmentEscape(item.id)}')"><span class="appointments-list__date"><strong>${new Date(`${item.date}T12:00:00`).getDate()}</strong><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR',{month:'short'})}</small></span><span class="appointments-list__time"><strong>${appointmentEscape(item.time)}–${appointmentEscape(item.endTime)}</strong><small>${appointmentEscape(appointmentFormatDate(item.date))}</small></span><span class="appointments-list__client"><strong>${appointmentEscape(item.customer)}</strong><small>${appointmentEscape(service.name)}</small></span><span class="appointments-list__professional"><strong>${appointmentEscape(professional.name)}</strong><small>${appointmentEscape(professional.role)}</small></span><span class="appointments-status-pill is-${appointmentEscape(meta.tone)}">${appointmentEscape(meta.label)}</span><i>›</i></button>`; }).join('')}</div>`;
}

function renderAppointmentDay(date, appointments) {
    const key = appointmentDateKey(date);
    const items = appointments.filter((item) => item.date === key && !String(item.status).startsWith('CANCELED')).sort((a, b) => a.time.localeCompare(b.time));
    const blocks = appointmentUiState.workspace.blocks.filter((item) => item.date === key && (appointmentUiState.professional === 'ALL' || item.professionalId === appointmentUiState.professional));
    const today = key === appointmentDateKey(new Date());
    return `<section class="appointments-day${today ? ' is-today' : ''}"><header><span>${date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span><strong>${date.getDate()}</strong><small>${items.length} horário${items.length === 1 ? '' : 's'}</small></header><div class="appointments-day__body">${items.length || blocks.length ? `${items.map(renderAppointmentCard).join('')}${blocks.map((block) => `<div class="appointments-block"><span>${appointmentEscape(block.start)}–${appointmentEscape(block.end)}</span><strong>${appointmentEscape(block.label)}</strong></div>`).join('')}` : `<button class="appointments-empty-slot" onclick="openAppointmentModal('${key}')"><span>+</span><strong>Dia livre</strong><small>Adicionar horário</small></button>`}</div></section>`;
}

function renderAppointmentCard(item) {
    const service = appointmentService(item.serviceId) || {};
    const professional = appointmentProfessional(item.professionalId) || {};
    const meta = APPOINTMENT_STATUS[item.status] || APPOINTMENT_STATUS.CONFIRMED;
    return `<button class="appointment-card appointment-card--${meta.tone}" onclick="openAppointmentDetails('${appointmentEscape(item.id)}')"><span class="appointment-card__time">${appointmentEscape(item.time)}<small>${appointmentEscape(item.endTime)}</small></span><span class="appointment-card__dot" style="--appointment-color:${appointmentEscape(service.color || professional.color || '#2f7f72')}"></span><span class="appointment-card__copy"><strong>${appointmentEscape(item.customer)}</strong><small>${appointmentEscape(service.name || 'Serviço')}</small><em>${appointmentEscape(professional.name || 'A definir')}</em></span><span class="appointment-card__status">${appointmentEscape(meta.label)}</span></button>`;
}

function setAppointmentView(view) { appointmentUiState.view = view; renderAppointmentsActiveTab(); }
function moveAppointmentPeriod(direction) { appointmentUiState.anchorDate = appointmentAddDays(appointmentUiState.anchorDate, direction * (appointmentUiState.view === 'day' ? 1 : 7)); renderAppointmentsActiveTab(); }
function goAppointmentsToday() { appointmentUiState.anchorDate = new Date(); renderAppointmentsActiveTab(); }
function filterAppointmentsProfessional(id) { appointmentUiState.professional = id; renderAppointmentsActiveTab(); }
function filterAppointmentsService(id) { appointmentUiState.service = id; renderAppointmentsActiveTab(); }

function renderAppointmentServices() {
    const data = appointmentUiState.workspace;
    const query = appointmentUiState.search.toLocaleLowerCase('pt-BR');
    const services = data.services.filter((item) => !query || `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase('pt-BR').includes(query));
    return `<section class="appointments-panel"><header class="appointments-panel__head appointments-panel__head--actions"><div><span class="appointments-eyebrow">CATÁLOGO DE SERVIÇOS</span><h3>O que seus clientes podem agendar</h3><p>Duração e intervalos alimentam automaticamente os horários disponíveis.</p></div>${appointmentCan('configureAppointments') ? '<div class="appointments-toolbar-actions"><button class="appointments-button appointments-button--ghost" onclick="openAppointmentCategoriesModal()">Organizar categorias</button><button class="appointments-button" onclick="openAppointmentServiceModal()">+ Novo serviço</button></div>' : ''}</header><div class="appointments-search"><span>⌕</span><input type="search" value="${appointmentEscape(appointmentUiState.search)}" placeholder="Buscar serviço ou categoria" oninput="searchAppointmentServices(this.value)"><small>${services.length} serviço(s)</small></div><div class="appointments-service-grid">${services.map(renderAppointmentServiceCard).join('') || '<div class="appointments-empty-state"><span>⌕</span><h4>Nenhum serviço encontrado</h4><p>Tente outra busca ou cadastre um novo serviço.</p></div>'}</div></section>`;
}

function renderAppointmentServiceCard(service) {
    const eligible = appointmentUiState.workspace.professionals.filter((item) => item.active && item.services.includes(service.id));
    return `<article class="appointment-service-card${service.active ? '' : ' is-inactive'}"><div class="appointment-service-card__visual" style="--service-color:${appointmentEscape(service.color || '#2f7f72')}"><span>${appointmentEscape(service.icon || '✦')}</span><small>${appointmentEscape(service.category || 'Serviços')}</small></div><div class="appointment-service-card__body"><div class="appointment-service-card__title"><div><h4>${appointmentEscape(service.name)}</h4><p>${appointmentEscape(service.description || 'Sem descrição')}</p></div><span class="appointments-status-pill ${service.active ? 'is-active' : 'is-off'}">${service.active ? 'Publicado' : 'Pausado'}</span></div><div class="appointment-service-card__facts"><span><small>Duração</small><strong>${Number(service.durationMinutes)} min</strong></span><span><small>Intervalo</small><strong>${Number(service.bufferMinutes || 0)} min</strong></span><span><small>Valor</small><strong>${appointmentMoney(service.price)}</strong></span></div><div class="appointment-service-card__footer"><div class="appointment-avatar-stack">${eligible.slice(0, 3).map((item) => `<i style="--avatar-color:${appointmentEscape(item.color)}">${appointmentEscape(item.initials)}</i>`).join('')}<span>${eligible.length} profissional${eligible.length === 1 ? '' : 'is'}</span></div>${appointmentCan('configureAppointments') ? `<button onclick="openAppointmentServiceModal('${appointmentEscape(service.id)}')">Editar</button>` : ''}</div></div></article>`;
}

function searchAppointmentServices(value) { appointmentUiState.search = value; renderAppointmentsActiveTab(); }

function openAppointmentCategoriesModal() {
    const categories = [...new Set(appointmentUiState.workspace.services.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    openModal(`<div class="modal-header"><div><h3>Categorias de serviços</h3><div class="modal-header-subtitle">Organize o catálogo sem alterar horários já agendados.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-category-add"><input id="appointment-category-name" placeholder="Ex.: Terapias"><button class="appointments-button" onclick="addAppointmentCategory()">Adicionar</button></div><div class="appointments-category-list">${categories.map((category) => { const count = appointmentUiState.workspace.services.filter((item) => item.category === category).length; return `<article><div><strong>${appointmentEscape(category)}</strong><small>${count} serviço${count === 1 ? '' : 's'}</small></div><button onclick="renameAppointmentCategory('${appointmentEscape(category)}')">Renomear</button><button class="is-danger" onclick="removeAppointmentCategory('${appointmentEscape(category)}')" ${count ? 'disabled title="Mova os serviços antes de excluir"' : ''}>Excluir</button></article>`; }).join('')}</div></div><div class="modal-footer"><button class="btn-sm btn-primary" onclick="closeModal()">Concluir</button></div>`, { size: 'lg' });
}

function addAppointmentCategory() {
    const input = document.getElementById('appointment-category-name');
    const category = input?.value.trim();
    if (!category) { showToast('Informe o nome da categoria.', 'error'); return; }
    if (appointmentUiState.workspace.services.some((item) => item.category.toLocaleLowerCase('pt-BR') === category.toLocaleLowerCase('pt-BR'))) { showToast('Essa categoria já existe.', 'error'); return; }
    closeModal();
    openAppointmentServiceModal();
    const categoryInput = document.getElementById('appointment-service-category');
    if (categoryInput) categoryInput.value = category;
    showToast('Categoria criada. Cadastre o primeiro serviço.', 'success');
}

function renameAppointmentCategory(category) {
    const next = prompt(`Novo nome para “${category}”:`, category)?.trim();
    if (!next || next === category) return;
    appointmentUiState.workspace.services.forEach((service) => { if (service.category === category) service.category = next; });
    if (isAppointmentsPreview()) saveAppointmentsPreviewData(appointmentUiState.workspace);
    openAppointmentCategoriesModal();
    showToast('Categoria renomeada.', 'success');
}

function removeAppointmentCategory(category) {
    if (appointmentUiState.workspace.services.some((item) => item.category === category)) { showToast('Mova os serviços antes de excluir a categoria.', 'error'); return; }
    showToast('Categoria removida.', 'success');
    openAppointmentCategoriesModal();
}

function renderAppointmentProfessionals() {
    const data = appointmentUiState.workspace;
    return `<section class="appointments-panel"><header class="appointments-panel__head appointments-panel__head--actions"><div><span class="appointments-eyebrow">EQUIPE & DISPONIBILIDADE</span><h3>Quem realiza cada atendimento</h3><p>Conecte serviços aos profissionais e defina uma agenda realista.</p></div>${appointmentCan('configureAppointments') ? '<button class="appointments-button" onclick="openAppointmentProfessionalModal()">+ Novo profissional</button>' : ''}</header><div class="appointments-professional-grid">${data.professionals.map(renderAppointmentProfessionalCard).join('')}</div></section>`;
}

function renderAppointmentProfessionalCard(professional) {
    const assigned = appointmentUiState.workspace.services.filter((service) => professional.services.includes(service.id));
    const upcoming = appointmentUiState.workspace.appointments.filter((item) => item.professionalId === professional.id && ['CONFIRMED', 'PENDING_APPROVAL'].includes(item.status)).length;
    const scheduleDays = Object.keys(professional.schedule || {}).length;
    return `<article class="appointment-professional-card${professional.active ? '' : ' is-inactive'}"><header><span class="appointment-professional-card__avatar" style="--avatar-color:${appointmentEscape(professional.color)}">${appointmentEscape(professional.initials)}</span><div><h4>${appointmentEscape(professional.name)}</h4><p>${appointmentEscape(professional.role)}</p></div><span class="appointments-status-pill ${professional.active ? 'is-active' : 'is-off'}">${professional.active ? 'Ativo' : 'Inativo'}</span></header><div class="appointment-professional-card__numbers"><span><strong>${upcoming}</strong><small>próximos</small></span><span><strong>${scheduleDays}</strong><small>dias/semana</small></span><span><strong>${assigned.length}</strong><small>serviços</small></span></div><div class="appointment-professional-card__services">${assigned.slice(0, 3).map((service) => `<span>${appointmentEscape(service.name)}</span>`).join('')}${assigned.length > 3 ? `<span>+${assigned.length - 3}</span>` : ''}</div>${appointmentCan('configureAppointments') ? `<footer><button onclick="openProfessionalAvailability('${appointmentEscape(professional.id)}')">Disponibilidade</button><button onclick="openAppointmentProfessionalModal('${appointmentEscape(professional.id)}')">Editar perfil</button></footer>` : ''}</article>`;
}

function renderAppointmentAutomations() {
    const automation = appointmentUiState.workspace.automations;
    const triggerOptions = [
        ['BOOKING_CONFIRMED', 'Agendamento confirmado', 'Depois que o horário é garantido'],
        ['BOOKING_REQUESTED', 'Solicitação recebida', 'Quando depende do aceite da equipe'],
        ['BOOKING_REMINDER_DUE', 'Lembrete do horário', 'Antes do atendimento'],
        ['BOOKING_RESCHEDULED', 'Horário alterado', 'Quando data ou hora mudar'],
        ['BOOKING_CANCELED', 'Agendamento cancelado', 'Somente após cancelamento'],
        ['BOOKING_REJECTED', 'Horário recusado', 'Quando a equipe não puder confirmar'],
    ];
    const nodes = automation.triggers[appointmentUiState.selectedTrigger] || [];
    if (!appointmentUiState.selectedNodeId || !nodes.some((item) => item.id === appointmentUiState.selectedNodeId)) appointmentUiState.selectedNodeId = nodes.find((item) => item.type === 'MESSAGE')?.id || nodes[0]?.id || '';
    return `<section class="appointments-automation"><header class="appointments-panel__head appointments-panel__head--actions"><div><span class="appointments-eyebrow">AUTOMAÇÕES</span><h3>Mensagens úteis, no momento certo</h3><p>Personalize a jornada sem transformar o WhatsApp em uma sequência cansativa.</p></div><div class="appointments-automation__publish"><span><i class="${automation.status === 'PUBLISHED' ? 'is-live' : ''}"></i>${automation.status === 'PUBLISHED' ? `Versão ${automation.version} publicada` : 'Rascunho com alterações'}</span><button class="appointments-button appointments-button--ghost" onclick="openAppointmentAutomationHistory()">Histórico</button><button class="appointments-button appointments-button--ghost" onclick="saveAppointmentAutomation(false)">Salvar rascunho</button>${appointmentCan('publishAppointmentAutomations') ? '<button class="appointments-button" onclick="saveAppointmentAutomation(true)">Publicar fluxo</button>' : ''}</div></header><div class="appointments-automation__layout"><aside class="appointments-trigger-list"><span class="appointments-eyebrow">QUANDO ACONTECER</span>${triggerOptions.map(([id, label, detail]) => `<button class="${appointmentUiState.selectedTrigger === id ? 'is-active' : ''}" onclick="selectAppointmentTrigger('${id}')"><i></i><strong>${label}</strong><small>${detail}</small></button>`).join('')}<div class="appointments-message-policy"><strong>Comunicação consciente</strong><p>O padrão usa confirmação, um lembrete e mensagens somente quando algo mudar.</p></div></aside><main class="appointments-flow-builder"><div class="appointments-flow-builder__head"><div><span>FLUXO</span><strong>${appointmentEscape(triggerOptions.find(([id]) => id === appointmentUiState.selectedTrigger)?.[1] || '')}</strong></div><small>Arraste mensagens e esperas para organizar</small></div><div class="appointments-flow-palette"><button draggable="true" ondragstart="dragAppointmentPalette(event,'MESSAGE')" onclick="addAppointmentFlowNode('MESSAGE')"><span>＋</span>Mensagem</button><button draggable="true" ondragstart="dragAppointmentPalette(event,'WAIT')" onclick="addAppointmentFlowNode('WAIT')"><span>◷</span>Espera</button><button draggable="true" ondragstart="dragAppointmentPalette(event,'EXPECT_ACTION')" onclick="addAppointmentFlowNode('EXPECT_ACTION')"><span>↳</span>Resposta esperada</button></div><div class="appointments-flow-canvas" ondragover="event.preventDefault()" ondrop="dropAppointmentFlowNode(event)">${nodes.map((node, index) => renderAppointmentFlowNode(node, index, nodes.length)).join('')}</div></main><aside class="appointments-node-inspector">${renderAppointmentNodeInspector(nodes.find((item) => item.id === appointmentUiState.selectedNodeId))}</aside></div></section>`;
}

function renderAppointmentFlowNode(node, index, total) {
    const labels = { MESSAGE: ['Mensagem', '▤'], WAIT: ['Espera', '◷'], EXPECT_ACTION: ['Resposta esperada', '↳'], STOP: ['Encerrar', '■'] };
    const [label, icon] = labels[node.type] || [node.type, '•'];
    const detail = node.type === 'MESSAGE' ? node.text : node.type === 'WAIT' ? `${Number(node.offsetHours || 24)}h antes` : node.type === 'EXPECT_ACTION' ? appointmentExpectedActionLabel(node.expectedAction) : 'Fim deste fluxo';
    return `<div class="appointments-flow-step"><button class="appointments-flow-node${appointmentUiState.selectedNodeId === node.id ? ' is-selected' : ''}" draggable="${node.type !== 'STOP'}" ondragstart="dragAppointmentFlowNode(event,'${appointmentEscape(node.id)}')" onclick="selectAppointmentFlowNode('${appointmentEscape(node.id)}')"><span class="appointments-flow-node__handle" aria-hidden="true">⋮⋮</span><span class="appointments-flow-node__icon">${icon}</span><span class="appointments-flow-node__copy"><small>${label}</small><strong>${appointmentEscape(node.title || label)}</strong><em>${appointmentEscape(String(detail || '')).slice(0, 86)}</em></span><span class="appointments-flow-node__actions">${index > 0 && node.type !== 'STOP' ? `<i onclick="event.stopPropagation();moveAppointmentFlowNode('${appointmentEscape(node.id)}',-1)" title="Mover para cima">↑</i>` : ''}${index < total - 1 && node.type !== 'STOP' ? `<i onclick="event.stopPropagation();moveAppointmentFlowNode('${appointmentEscape(node.id)}',1)" title="Mover para baixo">↓</i>` : ''}${node.type !== 'STOP' ? `<i onclick="event.stopPropagation();removeAppointmentFlowNode('${appointmentEscape(node.id)}')" title="Remover">×</i>` : ''}</span></button>${index < total - 1 ? '<span class="appointments-flow-connector"></span>' : ''}</div>`;
}

function renderAppointmentNodeInspector(node) {
    if (!node) return '<div class="appointments-inspector-empty"><span>↖</span><h4>Selecione uma etapa</h4><p>Os ajustes aparecem aqui.</p></div>';
    if (node.type === 'MESSAGE') return `<div class="appointments-inspector-head"><span>PROPRIEDADES</span><h4>Mensagem para o cliente</h4><p>Use apenas o necessário para essa etapa.</p></div><label class="appointments-field"><span>Nome interno</span><input value="${appointmentEscape(node.title || '')}" oninput="updateAppointmentFlowNode('title',this.value)"></label><label class="appointments-field"><span>Texto da mensagem</span><textarea rows="6" maxlength="600" oninput="updateAppointmentFlowNode('text',this.value);refreshAppointmentPhonePreview()">${appointmentEscape(node.text || '')}</textarea><small>Variáveis: {cliente}, {serviço}, {data}, {hora}, {profissional}</small></label><label class="appointments-field"><span>Texto do botão</span><input maxlength="25" value="${appointmentEscape(node.buttonLabel || '')}" oninput="updateAppointmentFlowNode('buttonLabel',this.value);refreshAppointmentPhonePreview()"></label><label class="appointments-field"><span>O que esperamos</span><select onchange="updateAppointmentFlowNode('expectedAction',this.value)">${appointmentExpectedActionOptions(node.expectedAction)}</select></label>${appointmentPhonePreview(node)}`;
    if (node.type === 'WAIT') return `<div class="appointments-inspector-head"><span>PROPRIEDADES</span><h4>Momento do envio</h4><p>Escolha quando a próxima mensagem será liberada.</p></div><label class="appointments-field"><span>Horas antes do atendimento</span><input type="number" min="1" max="720" value="${Number(node.offsetHours || 24)}" oninput="updateAppointmentFlowNode('offsetHours',Number(this.value))"></label><div class="appointments-inspector-tip"><strong>Boa prática</strong><p>Um lembrete 24 horas antes costuma ser suficiente. Use um segundo apenas quando a operação realmente precisar.</p></div>`;
    if (node.type === 'EXPECT_ACTION') return `<div class="appointments-inspector-head"><span>PROPRIEDADES</span><h4>Resposta esperada</h4><p>A ação usa um ID seguro, independente do texto.</p></div><label class="appointments-field"><span>Ação permitida</span><select onchange="updateAppointmentFlowNode('expectedAction',this.value)">${appointmentExpectedActionOptions(node.expectedAction)}</select></label>`;
    return `<div class="appointments-inspector-head"><span>ETAPA PROTEGIDA</span><h4>Fim do fluxo</h4><p>Evita mensagens adicionais depois que o objetivo foi concluído.</p></div>`;
}

function appointmentExpectedActionOptions(selected) {
    return [['NONE', 'Nenhuma resposta'], ['OPEN_MANAGE_BOOKING', 'Abrir gerenciamento'], ['CONFIRM_ATTENDANCE', 'Confirmar presença'], ['REQUEST_RESCHEDULE', 'Solicitar reagendamento'], ['REQUEST_CANCEL', 'Solicitar cancelamento'], ['OPEN_BOOKING', 'Agendar novamente'], ['HUMAN_HANDOFF', 'Falar com atendente']].map(([id, label]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${label}</option>`).join('');
}

function appointmentExpectedActionLabel(value) {
    const temp = document.createElement('select');
    temp.innerHTML = appointmentExpectedActionOptions(value);
    temp.value = value || 'NONE';
    return temp.selectedOptions[0]?.textContent || 'Nenhuma resposta';
}

function appointmentPhonePreview(node) {
    return `<div class="appointments-phone-preview"><div class="appointments-phone-preview__bar"><span></span><strong>WhatsApp</strong><i></i></div><div class="appointments-phone-preview__body"><div class="appointments-phone-preview__bubble" id="appointments-phone-bubble">${appointmentEscape(node.text || '').replace(/\n/g, '<br>')}<small>10:42 ✓✓</small></div>${node.buttonLabel ? `<button id="appointments-phone-button">${appointmentEscape(node.buttonLabel)}</button>` : ''}</div></div>`;
}

function refreshAppointmentPhonePreview() {
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger] || [];
    const node = nodes.find((item) => item.id === appointmentUiState.selectedNodeId);
    const bubble = document.getElementById('appointments-phone-bubble');
    if (bubble && node) bubble.innerHTML = `${appointmentEscape(node.text || '').replace(/\n/g, '<br>')}<small>10:42 ✓✓</small>`;
    const button = document.getElementById('appointments-phone-button');
    if (button && node) button.textContent = node.buttonLabel || '';
}

function selectAppointmentTrigger(trigger) { appointmentUiState.selectedTrigger = trigger; appointmentUiState.selectedNodeId = ''; renderAppointmentsActiveTab(); }
function selectAppointmentFlowNode(id) { appointmentUiState.selectedNodeId = id; renderAppointmentsActiveTab(); }

function addAppointmentFlowNode(type, targetIndex) {
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger];
    const node = type === 'WAIT'
        ? { id: `node-${Date.now()}`, type, title: 'Definir espera', offsetHours: 24 }
        : type === 'EXPECT_ACTION'
            ? { id: `node-${Date.now()}`, type, title: 'Aguardar ação do cliente', expectedAction: 'OPEN_MANAGE_BOOKING' }
            : { id: `node-${Date.now()}`, type: 'MESSAGE', title: 'Nova mensagem', text: 'Escreva aqui uma mensagem curta e útil.', buttonLabel: 'Ver detalhes', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true };
    const stopIndex = nodes.findIndex((item) => item.type === 'STOP');
    const index = Number.isInteger(targetIndex) ? Math.min(Math.max(0, targetIndex), nodes.length) : stopIndex >= 0 ? stopIndex : nodes.length;
    nodes.splice(index, 0, node);
    appointmentUiState.selectedNodeId = node.id;
    appointmentUiState.workspace.automations.status = 'DRAFT';
    renderAppointmentsActiveTab();
}

function removeAppointmentFlowNode(id) {
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger];
    const index = nodes.findIndex((item) => item.id === id);
    if (index >= 0 && nodes[index].type !== 'STOP') nodes.splice(index, 1);
    appointmentUiState.selectedNodeId = nodes.find((item) => item.type === 'MESSAGE')?.id || '';
    appointmentUiState.workspace.automations.status = 'DRAFT';
    renderAppointmentsActiveTab();
}

function moveAppointmentFlowNode(id, direction) {
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger];
    const index = nodes.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= nodes.length || nodes[target].type === 'STOP') return;
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    appointmentUiState.workspace.automations.status = 'DRAFT';
    renderAppointmentsActiveTab();
}

function updateAppointmentFlowNode(field, value) {
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger];
    const node = nodes.find((item) => item.id === appointmentUiState.selectedNodeId);
    if (!node) return;
    node[field] = value;
    appointmentUiState.workspace.automations.status = 'DRAFT';
}

function dragAppointmentPalette(event, type) { event.dataTransfer.setData('application/x-appointment-node-type', type); event.dataTransfer.effectAllowed = 'copy'; }
function dragAppointmentFlowNode(event, id) { appointmentUiState.dragNodeId = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }
function dropAppointmentFlowNode(event) {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-appointment-node-type');
    if (type) { addAppointmentFlowNode(type); return; }
    const id = event.dataTransfer.getData('text/plain') || appointmentUiState.dragNodeId;
    const nodes = appointmentUiState.workspace.automations.triggers[appointmentUiState.selectedTrigger];
    const index = nodes.findIndex((item) => item.id === id);
    const stopIndex = nodes.findIndex((item) => item.type === 'STOP');
    if (index >= 0 && stopIndex >= 0 && index !== stopIndex - 1) {
        const [node] = nodes.splice(index, 1);
        nodes.splice(nodes.findIndex((item) => item.type === 'STOP'), 0, node);
        appointmentUiState.workspace.automations.status = 'DRAFT';
        renderAppointmentsActiveTab();
    }
}

async function saveAppointmentAutomation(publish) {
    const automation = appointmentUiState.workspace.automations;
    const messages = Object.values(automation.triggers).flat().filter((item) => item.type === 'MESSAGE');
    if (messages.some((item) => !String(item.text || '').trim())) { showToast('Toda mensagem precisa ter um texto.', 'error'); return; }
    if (messages.some((item) => String(item.text).length > 600)) { showToast('Uma mensagem ultrapassou 600 caracteres.', 'error'); return; }
    try {
        appointmentUiState.workspace.automations = await appointmentsGateway.saveAutomation(automation, publish);
        showToast(publish ? 'Fluxo publicado com segurança.' : 'Rascunho salvo.', 'success');
        renderAppointmentsActiveTab();
    } catch (error) { showToast(error.message || 'Não foi possível salvar o fluxo.', 'error'); }
}

function openAppointmentAutomationHistory() {
    const automation = appointmentUiState.workspace.automations;
    const history = Array.isArray(automation.history) ? automation.history : [];
    openModal(`<div class="modal-header"><div><h3>Histórico de publicações</h3><div class="modal-header-subtitle">Compare versões e restaure uma delas como novo rascunho.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-history"><article class="is-current"><span>ATUAL</span><div><strong>Versão ${Number(automation.version || 1)}</strong><small>${automation.status === 'PUBLISHED' ? 'Publicada' : 'Rascunho'} · ${new Date(automation.updatedAt || Date.now()).toLocaleString('pt-BR')}</small></div><b>${Object.values(automation.triggers || {}).flat().filter((item) => item.type === 'MESSAGE').length} mensagens</b></article>${history.map((item) => `<article><span>VERSÃO</span><div><strong>Versão ${Number(item.version)}</strong><small>Publicada em ${new Date(item.publishedAt).toLocaleString('pt-BR')}</small></div><b>${Object.values(item.triggers || {}).flat().filter((node) => node.type === 'MESSAGE').length} mensagens</b><button onclick="rollbackAppointmentAutomation(${Number(item.version)})">Usar como rascunho</button></article>`).join('') || '<div class="appointments-empty-state"><span>↶</span><h4>A primeira versão está em uso</h4><p>As versões anteriores aparecerão depois da próxima publicação.</p></div>'}</div></div><div class="modal-footer"><button class="btn-sm btn-primary" onclick="closeModal()">Fechar</button></div>`, { size: 'lg' });
}

function rollbackAppointmentAutomation(version) {
    const automation = appointmentUiState.workspace.automations;
    const snapshot = (automation.history || []).find((item) => Number(item.version) === Number(version));
    if (!snapshot) return;
    automation.triggers = appointmentClone(snapshot.triggers);
    automation.status = 'DRAFT';
    if (isAppointmentsPreview()) saveAppointmentsPreviewData(appointmentUiState.workspace);
    closeModal();
    appointmentUiState.selectedNodeId = '';
    renderAppointmentsActiveTab();
    showToast(`Versão ${version} restaurada como rascunho.`, 'success');
}

function openAppointmentServiceModal(id = '') {
    const service = appointmentService(id);
    openModal(`<div class="modal-header"><div><h3>${service ? 'Editar serviço' : 'Novo serviço'}</h3><div class="modal-header-subtitle">Duração e intervalos definem os horários disponíveis.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-form-grid"><label class="appointments-field appointments-field--wide"><span>Nome do serviço *</span><input id="appointment-service-name" value="${appointmentEscape(service?.name || '')}" placeholder="Ex.: Corte feminino"></label><label class="appointments-field"><span>Categoria *</span><input id="appointment-service-category" value="${appointmentEscape(service?.category || '')}" placeholder="Ex.: Cabelo"></label><label class="appointments-field"><span>Preço (R$)</span><input id="appointment-service-price" type="number" min="0" step="0.01" value="${Number(service?.price || 0)}"></label><label class="appointments-field"><span>Duração *</span><div class="appointments-input-suffix"><input id="appointment-service-duration" type="number" min="5" max="720" value="${Number(service?.durationMinutes || 60)}"><i>min</i></div></label><label class="appointments-field"><span>Intervalo antes</span><div class="appointments-input-suffix"><input id="appointment-service-buffer-before" type="number" min="0" max="180" value="${Number(service?.bufferBeforeMinutes || 0)}"><i>min</i></div></label><label class="appointments-field"><span>Intervalo depois</span><div class="appointments-input-suffix"><input id="appointment-service-buffer" type="number" min="0" max="180" value="${Number(service?.bufferAfterMinutes ?? service?.bufferMinutes ?? 10)}"><i>min</i></div></label><label class="appointments-field"><span>Confirmação</span><select id="appointment-service-confirmation"><option value="AUTO_CONFIRM" ${service?.confirmationMode !== 'MANUAL_APPROVAL' ? 'selected' : ''}>Automática</option><option value="MANUAL_APPROVAL" ${service?.confirmationMode === 'MANUAL_APPROVAL' ? 'selected' : ''}>Aceite da equipe</option></select></label><label class="appointments-field"><span>Cor</span><input id="appointment-service-color" type="color" value="${appointmentEscape(service?.color || '#2f7f72')}"></label><label class="appointments-field appointments-field--wide"><span>Descrição</span><textarea id="appointment-service-description" rows="3" placeholder="Explique de forma simples o que está incluído.">${appointmentEscape(service?.description || '')}</textarea></label><label class="appointments-check appointments-field--wide"><input id="appointment-service-active" type="checkbox" ${service?.active !== false ? 'checked' : ''}><span><strong>Disponível para agendamento</strong><small>Quando pausado, não aparece para novos clientes.</small></span></label></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button class="btn-sm btn-primary" onclick="saveAppointmentService('${appointmentEscape(id)}')">Salvar serviço</button></div>`, { size: 'lg' });
}

async function saveAppointmentService(id) {
    const name = document.getElementById('appointment-service-name')?.value.trim();
    const category = document.getElementById('appointment-service-category')?.value.trim();
    const durationMinutes = Number(document.getElementById('appointment-service-duration')?.value);
    if (!name || !category || durationMinutes < 5) { showToast('Preencha nome, categoria e uma duração válida.', 'error'); return; }
    const current = appointmentService(id) || {};
    try {
        const bufferAfterMinutes = Number(document.getElementById('appointment-service-buffer')?.value || 0);
        await appointmentsGateway.saveService({ ...current, id: id || undefined, name, category, description: document.getElementById('appointment-service-description')?.value.trim(), durationMinutes, bufferBeforeMinutes: Number(document.getElementById('appointment-service-buffer-before')?.value || 0), bufferAfterMinutes, bufferMinutes: bufferAfterMinutes, price: Number(document.getElementById('appointment-service-price')?.value || 0), confirmationMode: document.getElementById('appointment-service-confirmation')?.value, color: document.getElementById('appointment-service-color')?.value, icon: current.icon || '✦', active: !!document.getElementById('appointment-service-active')?.checked });
        closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); renderAppointmentsModule(); setAppointmentsTab('services'); showToast('Serviço salvo.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível salvar.', 'error'); }
}

function openAppointmentProfessionalModal(id = '') {
    const professional = appointmentProfessional(id);
    const services = appointmentUiState.workspace.services;
    openModal(`<div class="modal-header"><div><h3>${professional ? 'Editar profissional' : 'Novo profissional'}</h3><div class="modal-header-subtitle">Defina o perfil e os serviços que podem ser agendados.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-form-grid"><label class="appointments-field"><span>Nome *</span><input id="appointment-professional-name" value="${appointmentEscape(professional?.name || '')}" placeholder="Nome completo"></label><label class="appointments-field"><span>Função *</span><input id="appointment-professional-role" value="${appointmentEscape(professional?.role || '')}" placeholder="Ex.: Colorista"></label><label class="appointments-field"><span>Cor na agenda</span><input id="appointment-professional-color" type="color" value="${appointmentEscape(professional?.color || '#2f7f72')}"></label><div class="appointments-field appointments-field--wide"><span>Serviços realizados</span><div class="appointments-checkbox-grid">${services.map((service) => `<label><input type="checkbox" name="appointment-professional-service" value="${appointmentEscape(service.id)}" ${professional?.services?.includes(service.id) ? 'checked' : ''}><span>${appointmentEscape(service.name)}</span></label>`).join('')}</div></div><label class="appointments-check appointments-field--wide"><input id="appointment-professional-active" type="checkbox" ${professional?.active !== false ? 'checked' : ''}><span><strong>Profissional ativo</strong><small>Pode receber novos agendamentos.</small></span></label></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button class="btn-sm btn-primary" onclick="saveAppointmentProfessional('${appointmentEscape(id)}')">Salvar profissional</button></div>`, { size: 'lg' });
}

async function saveAppointmentProfessional(id) {
    const name = document.getElementById('appointment-professional-name')?.value.trim();
    const role = document.getElementById('appointment-professional-role')?.value.trim();
    const services = [...document.querySelectorAll('input[name="appointment-professional-service"]:checked')].map((item) => item.value);
    if (!name || !role || !services.length) { showToast('Informe nome, função e ao menos um serviço.', 'error'); return; }
    const current = appointmentProfessional(id) || {};
    try {
        await appointmentsGateway.saveProfessional({ ...current, id: id || undefined, name, role, services, color: document.getElementById('appointment-professional-color')?.value, active: !!document.getElementById('appointment-professional-active')?.checked });
        closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); renderAppointmentsModule(); setAppointmentsTab('professionals'); showToast('Profissional salvo.', 'success');
    } catch (error) { showToast(error.message || 'Não foi possível salvar.', 'error'); }
}

function openProfessionalAvailability(id) {
    const professional = appointmentProfessional(id);
    const days = [['MON', 'Segunda'], ['TUE', 'Terça'], ['WED', 'Quarta'], ['THU', 'Quinta'], ['FRI', 'Sexta'], ['SAT', 'Sábado'], ['SUN', 'Domingo']];
    openModal(`<div class="modal-header"><div><h3>Disponibilidade de ${appointmentEscape(professional.name)}</h3><div class="modal-header-subtitle">Os horários publicados respeitam esta jornada e os bloqueios.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-availability-editor">${days.map(([key, label]) => { const value = professional.schedule?.[key]; return `<div class="appointments-availability-row"><label><input type="checkbox" data-schedule-active="${key}" ${value ? 'checked' : ''} onchange="toggleAppointmentScheduleRow('${key}',this.checked)"><span>${label}</span></label><div id="appointment-schedule-${key}" class="${value ? '' : 'is-disabled'}"><input type="time" data-schedule-start="${key}" value="${value?.[0] || '09:00'}"><span>até</span><input type="time" data-schedule-end="${key}" value="${value?.[1] || '18:00'}"></div></div>`; }).join('')}</div><div class="appointments-inspector-tip"><strong>Intervalos automáticos</strong><p>A duração e o buffer de cada serviço são aplicados dentro dessas janelas.</p></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button class="btn-sm btn-primary" onclick="saveProfessionalAvailability('${appointmentEscape(id)}')">Salvar disponibilidade</button></div>`, { size: 'lg' });
}

function toggleAppointmentScheduleRow(key, active) { document.getElementById(`appointment-schedule-${key}`)?.classList.toggle('is-disabled', !active); }

async function saveProfessionalAvailability(id) {
    const professional = appointmentProfessional(id);
    const schedule = {};
    document.querySelectorAll('[data-schedule-active]').forEach((checkbox) => { const key = checkbox.dataset.scheduleActive; if (checkbox.checked) schedule[key] = [document.querySelector(`[data-schedule-start="${key}"]`).value, document.querySelector(`[data-schedule-end="${key}"]`).value]; });
    try { await appointmentsGateway.saveProfessional({ ...professional, schedule }); closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); renderAppointmentsModule(); setAppointmentsTab('professionals'); showToast('Disponibilidade atualizada.', 'success'); } catch (error) { showToast(error.message || 'Não foi possível salvar.', 'error'); }
}

function openAppointmentModal(date = '') {
    const data = appointmentUiState.workspace;
    const selectedDate = date || appointmentDateKey(appointmentUiState.anchorDate);
    openModal(`<div class="modal-header"><div><h3>Novo agendamento</h3><div class="modal-header-subtitle">Crie pela recepção sem perder as mesmas regras da agenda online.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-form-grid"><label class="appointments-field"><span>${appointmentEscape(data.copy.client)} *</span><input id="appointment-customer" placeholder="Nome completo"></label><label class="appointments-field"><span>Telefone *</span><input id="appointment-phone" inputmode="tel" placeholder="(11) 99999-9999"></label><label class="appointments-field"><span>${appointmentEscape(data.copy.service)} *</span><select id="appointment-service" onchange="updateAppointmentProfessionalOptions(this.value)"><option value="">Selecione</option>${data.services.filter((item) => item.active).map((item) => `<option value="${appointmentEscape(item.id)}">${appointmentEscape(item.name)} · ${item.durationMinutes} min</option>`).join('')}</select></label><label class="appointments-field"><span>${appointmentEscape(data.copy.professional)} *</span><select id="appointment-professional"><option value="">Escolha o serviço primeiro</option></select></label><label class="appointments-field"><span>Data *</span><input id="appointment-date" type="date" value="${appointmentEscape(selectedDate)}"></label><label class="appointments-field"><span>Horário *</span><input id="appointment-time" type="time" value="09:00"></label><label class="appointments-check appointments-field--wide"><input id="appointment-notify" type="checkbox" checked><span><strong>Enviar confirmação pelo WhatsApp</strong><small>Uma única mensagem com os detalhes e o link de gerenciamento.</small></span></label></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button class="btn-sm btn-primary" onclick="saveNewAppointment()">Confirmar agendamento</button></div>`, { size: 'lg' });
}

function updateAppointmentProfessionalOptions(serviceId) {
    const select = document.getElementById('appointment-professional');
    const professionals = appointmentUiState.workspace.professionals.filter((item) => item.active && item.services.includes(serviceId));
    select.innerHTML = `<option value="">Selecione</option>${professionals.map((item) => `<option value="${appointmentEscape(item.id)}">${appointmentEscape(item.name)}</option>`).join('')}`;
}

async function saveNewAppointment() {
    const customer = document.getElementById('appointment-customer')?.value.trim();
    const phone = document.getElementById('appointment-phone')?.value.trim();
    const serviceId = document.getElementById('appointment-service')?.value;
    const professionalId = document.getElementById('appointment-professional')?.value;
    const date = document.getElementById('appointment-date')?.value;
    const time = document.getElementById('appointment-time')?.value;
    if (!customer || !phone || !serviceId || !professionalId || !date || !time) { showToast('Preencha todos os campos obrigatórios.', 'error'); return; }
    const service = appointmentService(serviceId);
    const [hours, minutes] = time.split(':').map(Number);
    const end = new Date(`${date}T${time}:00`); end.setMinutes(end.getMinutes() + Number(service.durationMinutes));
    try { await appointmentsGateway.saveAppointment({ customer, phone, serviceId, professionalId, date, time, endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`, status: service.confirmationMode === 'MANUAL_APPROVAL' ? 'PENDING_APPROVAL' : 'CONFIRMED', source: 'ADMIN', version: 0 }); closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); appointmentUiState.anchorDate = new Date(`${date}T12:00:00`); renderAppointmentsModule(); showToast('Agendamento criado.', 'success'); } catch (error) { showToast(error.message || 'Esse horário não está mais disponível.', 'error'); }
}

function openAppointmentDetails(id) {
    const item = appointmentUiState.workspace.appointments.find((appointment) => appointment.id === id);
    if (!item) return;
    const service = appointmentService(item.serviceId) || {};
    const professional = appointmentProfessional(item.professionalId) || {};
    const meta = APPOINTMENT_STATUS[item.status] || APPOINTMENT_STATUS.CONFIRMED;
    const nextActions = appointmentCan('operateAppointments') ? appointmentStatusActions(item) : '';
    openModal(`<div class="modal-header"><div><h3>${appointmentEscape(item.customer)}</h3><div class="modal-header-subtitle">Agendamento #${appointmentEscape(item.code)} · ${appointmentEscape(meta.label)}</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointment-detail-hero"><span class="appointment-detail-hero__date"><strong>${new Date(`${item.date}T12:00:00`).getDate()}</strong><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</small></span><div><span>${appointmentEscape(appointmentFormatDate(item.date))}</span><h4>${appointmentEscape(item.time)}–${appointmentEscape(item.endTime)}</h4><p>${appointmentEscape(service.name)} com ${appointmentEscape(professional.name)}</p></div><span class="appointments-status-pill is-${appointmentEscape(meta.tone)}">${appointmentEscape(meta.label)}</span></div><div class="appointment-detail-grid"><div><small>${appointmentEscape(appointmentCopy().client)}</small><strong>${appointmentEscape(item.customer)}</strong><a href="tel:${appointmentEscape(item.phone)}">${appointmentEscape(item.phone)}</a></div><div><small>Origem</small><strong>${item.source === 'WHATSAPP' ? 'WhatsApp' : 'Recepção'}</strong><span>${item.source === 'WHATSAPP' ? 'Cliente agendou online' : 'Criado pela equipe'}</span></div><div><small>Valor</small><strong>${appointmentMoney(service.price)}</strong><span>${service.confirmationMode === 'MANUAL_APPROVAL' ? 'Aceite manual' : 'Confirmação automática'}</span></div></div><div class="appointment-detail-timeline"><span class="is-done"><i>✓</i><small>Solicitado</small></span><span class="${['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED'].includes(item.status) ? 'is-done' : ''}"><i>✓</i><small>Confirmado</small></span><span class="${['CHECKED_IN', 'IN_SERVICE', 'COMPLETED'].includes(item.status) ? 'is-done' : ''}"><i>✓</i><small>Chegou</small></span><span class="${['IN_SERVICE', 'COMPLETED'].includes(item.status) ? 'is-done' : ''}"><i>✓</i><small>Atendimento</small></span><span class="${item.status === 'COMPLETED' ? 'is-done' : ''}"><i>✓</i><small>Concluído</small></span></div></div><div class="modal-footer appointment-detail-actions"><button class="btn-sm btn-outline" onclick="closeModal()">Fechar</button>${nextActions}</div>`, { size: 'lg' });
}

function appointmentStatusActions(item) {
    const action = (status, label, cls = 'btn-primary') => `<button class="btn-sm ${cls}" onclick="transitionAppointment('${appointmentEscape(item.id)}','${status}',${Number(item.version || 1)})">${label}</button>`;
    const reschedule = `<button class="btn-sm btn-outline" onclick="openAppointmentRescheduleModal('${appointmentEscape(item.id)}')">Reagendar</button>`;
    if (item.status === 'PENDING_APPROVAL') return `${reschedule}${action('CANCELED_BY_TENANT', 'Recusar', 'btn-outline')}${action('CONFIRMED', 'Confirmar horário')}`;
    if (item.status === 'CONFIRMED') return `${reschedule}${action('CANCELED_BY_TENANT', 'Cancelar', 'btn-outline')}${action('NO_SHOW', 'Não compareceu', 'btn-outline')}${action('CHECKED_IN', 'Registrar chegada')}`;
    if (item.status === 'CHECKED_IN') return action('IN_SERVICE', 'Iniciar atendimento');
    if (item.status === 'IN_SERVICE') return action('COMPLETED', 'Concluir atendimento');
    return '';
}

function openAppointmentRescheduleModal(id) {
    const item = appointmentUiState.workspace.appointments.find((appointment) => appointment.id === id);
    if (!item) return;
    const eligible = appointmentUiState.workspace.professionals.filter((professional) => professional.active && professional.services.includes(item.serviceId));
    openModal(`<div class="modal-header"><div><h3>Reagendar ${appointmentEscape(item.customer)}</h3><div class="modal-header-subtitle">O horário anterior só será liberado quando a alteração for confirmada.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-form-grid"><label class="appointments-field"><span>Nova data *</span><input id="appointment-reschedule-date" type="date" value="${appointmentEscape(item.date)}"></label><label class="appointments-field"><span>Novo horário *</span><input id="appointment-reschedule-time" type="time" value="${appointmentEscape(item.time)}"></label><label class="appointments-field appointments-field--wide"><span>Profissional *</span><select id="appointment-reschedule-professional">${eligible.map((professional) => `<option value="${appointmentEscape(professional.id)}" ${professional.id === item.professionalId ? 'selected' : ''}>${appointmentEscape(professional.name)}</option>`).join('')}</select></label><div class="appointments-inspector-tip appointments-field--wide"><strong>Mensagem automática</strong><p>O cliente receberá somente a confirmação com a nova data e o novo horário.</p></div></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Voltar</button><button class="btn-sm btn-primary" onclick="saveAppointmentReschedule('${appointmentEscape(item.id)}')">Confirmar novo horário</button></div>`, { size: 'lg' });
}

async function saveAppointmentReschedule(id) {
    const item = appointmentUiState.workspace.appointments.find((appointment) => appointment.id === id);
    const date = document.getElementById('appointment-reschedule-date')?.value;
    const time = document.getElementById('appointment-reschedule-time')?.value;
    const professionalId = document.getElementById('appointment-reschedule-professional')?.value;
    if (!item || !date || !time || !professionalId) { showToast('Preencha a nova data, horário e profissional.', 'error'); return; }
    const duration = Number(appointmentService(item.serviceId)?.durationMinutes || 60);
    const end = new Date(`${date}T${time}:00`); end.setMinutes(end.getMinutes() + duration);
    try {
        await appointmentsGateway.saveAppointment({ ...item, date, time, professionalId, endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` });
        closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); appointmentUiState.anchorDate = new Date(`${date}T12:00:00`); renderAppointmentsModule(); showToast('Agendamento reagendado e cliente avisado.', 'success');
    } catch (error) { showToast(error.message || 'O novo horário não está mais disponível.', 'error'); }
}

async function transitionAppointment(id, status, version) {
    const destructive = ['CANCELED_BY_TENANT', 'NO_SHOW'].includes(status);
    if (destructive && typeof showConfirmDialog === 'function') {
        const accepted = await showConfirmDialog({ title: status === 'NO_SHOW' ? 'Marcar ausência?' : 'Cancelar agendamento?', message: status === 'NO_SHOW' ? 'O horário será registrado como não comparecimento.' : 'O cliente será avisado e o horário voltará a ficar disponível.', confirmLabel: status === 'NO_SHOW' ? 'Marcar ausência' : 'Cancelar horário', variant: 'warning' });
        if (!accepted) return;
    }
    try { await appointmentsGateway.transition(id, status, version, destructive ? 'Atualização operacional' : ''); closeModal(); appointmentUiState.workspace = await appointmentsGateway.workspace(); renderAppointmentsModule(); showToast('Agenda atualizada.', 'success'); } catch (error) { showToast(error.message || 'Não foi possível atualizar.', 'error'); }
}

function openAppointmentBlockModal() {
    const data = appointmentUiState.workspace;
    openModal(`<div class="modal-header"><div><h3>Bloquear horário</h3><div class="modal-header-subtitle">Folgas, pausas e compromissos deixam de aparecer para clientes.</div></div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="appointments-form-grid"><label class="appointments-field"><span>Profissional</span><select id="appointment-block-professional"><option value="">Todo o estabelecimento</option>${data.professionals.filter((item) => item.active).map((item) => `<option value="${appointmentEscape(item.id)}">${appointmentEscape(item.name)}</option>`).join('')}</select></label><label class="appointments-field"><span>Data</span><input id="appointment-block-date" type="date" value="${appointmentDateKey(appointmentUiState.anchorDate)}"></label><label class="appointments-field"><span>Início</span><input id="appointment-block-start" type="time" value="12:00"></label><label class="appointments-field"><span>Fim</span><input id="appointment-block-end" type="time" value="13:00"></label><label class="appointments-field appointments-field--wide"><span>Motivo interno</span><input id="appointment-block-label" value="Pausa / indisponibilidade" maxlength="80"></label></div></div><div class="modal-footer"><button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button><button class="btn-sm btn-primary" onclick="saveAppointmentBlock()">Bloquear horário</button></div>`);
}

function saveAppointmentBlock() {
    const data = appointmentUiState.workspace;
    const date = document.getElementById('appointment-block-date').value;
    const start = document.getElementById('appointment-block-start').value;
    const end = document.getElementById('appointment-block-end').value;
    if (!date || !start || !end || start >= end) { showToast('Informe um intervalo válido.', 'error'); return; }
    data.blocks.push({ id: `block-${Date.now()}`, date, start, end, professionalId: document.getElementById('appointment-block-professional').value, label: document.getElementById('appointment-block-label').value.trim() || 'Horário bloqueado' });
    if (isAppointmentsPreview()) saveAppointmentsPreviewData(data);
    closeModal(); renderAppointmentsModule(); showToast('Horário bloqueado.', 'success');
}

window.loadAppointmentsPage = loadAppointmentsPage;
window.setAppointmentsTab = setAppointmentsTab;
window.openAppointmentModal = openAppointmentModal;
window.openAppointmentDetails = openAppointmentDetails;
window.openAppointmentServiceModal = openAppointmentServiceModal;
window.openAppointmentProfessionalModal = openAppointmentProfessionalModal;
window.openProfessionalAvailability = openProfessionalAvailability;
window.saveAppointmentAutomation = saveAppointmentAutomation;
window.isAppointmentsPreview = isAppointmentsPreview;
