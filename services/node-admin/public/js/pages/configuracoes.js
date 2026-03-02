// configuracoes.js - Gerencia as telas de configurações do admin

// Agrupamento lógico das mensagens
const MessageGroups = [
    {
        id: 'atendimento',
        icon: '💬',
        title: 'Atendimento & Boas-vindas',
        subtitle: 'Primeiras interações com o cliente via WhatsApp',
        color: 'var(--teal)',
        colorBg: 'var(--teal-light)',
        templates: [
            { key: 'msg_welcome', label: 'Boas-vindas', desc: 'Enviada quando um cliente inicia conversa no WhatsApp.', vars: ['{nome_restaurante}'] },
            { key: 'msg_restaurant_closed', label: 'Restaurante Fechado', desc: 'Resposta automática fora do horário de funcionamento.', vars: [] },
            { key: 'msg_main_menu', label: 'Menu de Opções', desc: 'Texto exibido com as opções interativas do bot.', vars: [] },
            { key: 'msg_invalid_option', label: 'Opção Inválida', desc: 'Quando o cliente digita algo não reconhecido pelo bot.', vars: [] },
        ],
    },
    {
        id: 'mesas',
        icon: '🪑',
        title: 'Mesas & Comandas',
        subtitle: 'Mensagens do fluxo de ocupação de mesa via QR Code',
        color: 'var(--accent-orange)',
        colorBg: 'var(--pending-bg)',
        templates: [
            { key: 'msg_welcome_table', label: 'Leitura do QR Code', desc: 'Enviada quando o cliente escaneia o QR Code da mesa.', vars: ['{nome_restaurante}', '{numero_mesa}'] },
            { key: 'msg_table_request_pending', label: 'Aguardando Liberação', desc: 'Após o cliente confirmar nome e CPF na mesa.', vars: ['{numero_mesa}'] },
            { key: 'msg_table_approved', label: 'Mesa Liberada', desc: 'Quando o garçom aceita o cliente na mesa.', vars: ['{numero_mesa}'] },
        ],
    },
    {
        id: 'pedidos',
        icon: '🛒',
        title: 'Pedidos & Cozinha',
        subtitle: 'Atualizações sobre o status dos pedidos do cliente',
        color: 'var(--accent-blue)',
        colorBg: 'var(--prep-bg)',
        templates: [
            { key: 'msg_order_confirmed', label: 'Pedido Confirmado', desc: 'Enviada quando o pedido é criado com sucesso.', vars: ['{codigo_pedido}'] },
            { key: 'msg_order_ready', label: 'Pedido Pronto', desc: 'Quando a cozinha finaliza o preparo (via Painel KDS).', vars: ['{codigo_pedido}'] },
            { key: 'msg_tab_summary', label: 'Resumo da Comanda', desc: 'Quando o cliente pede o extrato ou conta parcial.', vars: ['{resumo}', '{total}'] },
            { key: 'msg_service_request', label: 'Chamada de Garçom', desc: 'Confirmação ao solicitar atendimento na mesa.', vars: ['{servico}'] },
        ],
    },
    {
        id: 'pagamento',
        icon: '💳',
        title: 'Pagamentos',
        subtitle: 'Mensagens do fluxo de pagamento via PIX',
        color: 'var(--accent-purple)',
        colorBg: '#f5f3ff',
        templates: [
            { key: 'msg_payment_pending', label: 'Link de Pagamento', desc: 'Enviada com o QR Code / link PIX para pagamento.', vars: ['{valor}', '{link_pagamento}'] },
            { key: 'msg_payment_confirmed', label: 'Pagamento Aprovado', desc: 'Confirmação automática após aprovação do MercadoPago.', vars: [] },
        ],
    },
];

let configuracoesDefaults = {};
let configuracoesAtuais = {};
let expedienteAberto = false;
let activeGroup = null; // null = mostra todos

async function loadConfiguracoesPage() {
    document.getElementById('page-title').textContent = 'Configurações';
    document.getElementById('page-sub').textContent = 'Expediente, mensagens automáticas e personalizações do seu restaurante';

    const container = document.getElementById('page-configuracoes');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando...</div>';

    try {
        const [me, res] = await Promise.all([
            api.get('/auth/me'),
            api.get('/auth/messages'),
        ]);

        expedienteAberto = !!me.isOpen;
        configuracoesAtuais = res.messages || {};
        configuracoesDefaults = res.defaults || {};

        renderConfiguracoesUI(container);
    } catch (err) {
        console.error('Erro ao carregar configurações:', err);
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar</h3><p>${err.message || 'Tente novamente.'}</p></div>`;
    }
}

function renderConfiguracoesUI(container) {
    const groups = activeGroup
        ? MessageGroups.filter(g => g.id === activeGroup)
        : MessageGroups;

    let html = '';

    // ─── CARD: EXPEDIENTE ───
    html += `
        <div class="full-card" style="margin-bottom: 20px;">
            <div class="card-header">
                <div>
                    <div class="card-title">🕐 Expediente do Restaurante</div>
                    <div class="card-subtitle">Controle o funcionamento e bloqueie novos pedidos</div>
                </div>
            </div>
            <div style="padding: 20px 22px;">
                <div class="config-expediente-box" id="expediente-box">
                    <div class="config-expediente-indicator ${expedienteAberto ? 'open' : 'closed'}">
                        <span class="config-expediente-dot"></span>
                        <div>
                            <div class="config-expediente-title">${expedienteAberto ? 'Aberto para pedidos' : 'Fechado para novos pedidos'}</div>
                            <div class="config-expediente-desc">${expedienteAberto
            ? 'Clientes podem enviar pedidos normalmente pelo WhatsApp.'
            : 'Novos pedidos bloqueados. Clientes com comanda aberta podem finalizar.'}</div>
                        </div>
                    </div>
                    <button type="button" class="btn-sm ${expedienteAberto ? 'btn-danger' : 'btn-primary'}" id="btn-expediente-config" onclick="toggleExpedienteFromConfig()">
                        ${expedienteAberto ? '⏸ Fechar Expediente' : '▶ Abrir Expediente'}
                    </button>
                </div>
            </div>
        </div>
    `;

    // ─── CARD: MENSAGENS DO BOT ───
    html += `
        <div class="full-card">
            <div class="card-header">
                <div>
                    <div class="card-title">🤖 Mensagens do Bot WhatsApp</div>
                    <div class="card-subtitle">Personalize os textos automáticos. Variáveis entre <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:11px;">{chaves}</code> são substituídas pelo sistema.</div>
                </div>
            </div>

            <!-- Filtros por grupo -->
            <div class="cat-tags" id="config-group-tags">
                <div class="cat-tag ${!activeGroup ? 'active' : ''}" data-group="">Todos</div>
                ${MessageGroups.map(g => `
                    <div class="cat-tag ${activeGroup === g.id ? 'active' : ''}" data-group="${g.id}">${g.icon} ${g.title}</div>
                `).join('')}
            </div>

            <form id="form-config-messages">
    `;

    // ─── SEÇÕES DE MENSAGENS POR GRUPO ───
    groups.forEach(group => {
        html += `
            <div class="config-group-section">
                <div class="config-group-header">
                    <div class="config-group-icon" style="background: ${group.colorBg}; color: ${group.color};">${group.icon}</div>
                    <div>
                        <div class="config-group-title">${group.title}</div>
                        <div class="config-group-subtitle">${group.subtitle}</div>
                    </div>
                </div>
                <div class="config-fields-grid">
        `;

        group.templates.forEach(tmpl => {
            const valorAtual = configuracoesAtuais[tmpl.key] || configuracoesDefaults[tmpl.key] || '';
            const isCustom = configuracoesAtuais[tmpl.key] && configuracoesAtuais[tmpl.key] !== configuracoesDefaults[tmpl.key];

            html += `
                <div class="config-field-card ${isCustom ? 'customized' : ''}">
                    <div class="config-field-top">
                        <label class="config-field-label">${tmpl.label}</label>
                        <button type="button" class="config-restore-btn" onclick="restoreDefault('${tmpl.key}')" ${!isCustom ? 'disabled' : ''} id="btn-restore-${tmpl.key}" title="Restaurar texto padrão">
                            ↺ Padrão
                        </button>
                    </div>
                    <div class="config-field-desc">${tmpl.desc}</div>
                    <textarea
                        id="input-${tmpl.key}"
                        class="config-textarea"
                        rows="3"
                        oninput="handleMessageChange('${tmpl.key}')"
                    >${valorAtual}</textarea>
                    ${tmpl.vars.length > 0 ? `
                        <div class="config-vars">
                            ${tmpl.vars.map(v => `<span class="config-var-tag">${v}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    // ─── FOOTER COM BOTÕES ───
    html += `
                <div class="config-form-footer">
                    <button type="button" class="btn-sm btn-outline" onclick="loadConfiguracoesPage()">Cancelar</button>
                    <button type="submit" class="btn-sm btn-primary" id="btn-save-messages">💾 Salvar Alterações</button>
                </div>
            </form>
        </div>
    `;

    container.innerHTML = html;

    // ─── EVENT LISTENERS ───
    document.getElementById('form-config-messages').addEventListener('submit', handleSaveMessages);

    document.querySelectorAll('#config-group-tags .cat-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            activeGroup = tag.dataset.group || null;
            renderConfiguracoesUI(container);
        });
    });
}

function handleMessageChange(key) {
    const input = document.getElementById('input-' + key);
    const btnRestore = document.getElementById('btn-restore-' + key);
    const card = input.closest('.config-field-card');

    if (input.value !== configuracoesDefaults[key]) {
        btnRestore.disabled = false;
        if (card) card.classList.add('customized');
    } else {
        btnRestore.disabled = true;
        if (card) card.classList.remove('customized');
    }
}

function restoreDefault(key) {
    const input = document.getElementById('input-' + key);
    input.value = configuracoesDefaults[key] || '';
    handleMessageChange(key);
}

async function handleSaveMessages(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-messages');
    btnSave.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    btnSave.disabled = true;

    const payload = {};
    const allTemplates = MessageGroups.flatMap(g => g.templates);

    allTemplates.forEach(tmpl => {
        const value = document.getElementById('input-' + tmpl.key).value.trim();
        if (value !== configuracoesDefaults[tmpl.key]) {
            payload[tmpl.key] = value;
        } else {
            payload[tmpl.key] = "";
        }
    });

    try {
        await api.put('/auth/messages', payload);
        showToast('Configurações salvas com sucesso!', 'success');
        loadConfiguracoesPage();
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar. Tente novamente.', 'error');
    } finally {
        btnSave.innerHTML = '💾 Salvar Alterações';
        btnSave.disabled = false;
    }
}

async function toggleExpedienteFromConfig() {
    const btn = document.getElementById('btn-expediente-config');
    if (!btn) return;

    btn.disabled = true;
    const nextState = !expedienteAberto;
    try {
        const res = await api.patch('/auth/status', { is_open: nextState });
        expedienteAberto = !!res.is_open;

        // Re-render box
        const box = document.getElementById('expediente-box');
        if (box) {
            const indicator = box.querySelector('.config-expediente-indicator');
            if (indicator) {
                indicator.className = `config-expediente-indicator ${expedienteAberto ? 'open' : 'closed'}`;
                indicator.querySelector('.config-expediente-title').textContent = expedienteAberto ? 'Aberto para pedidos' : 'Fechado para novos pedidos';
                indicator.querySelector('.config-expediente-desc').textContent = expedienteAberto
                    ? 'Clientes podem enviar pedidos normalmente pelo WhatsApp.'
                    : 'Novos pedidos bloqueados. Clientes com comanda aberta podem finalizar.';
            }
            btn.className = `btn-sm ${expedienteAberto ? 'btn-danger' : 'btn-primary'}`;
            btn.innerHTML = expedienteAberto ? '⏸ Fechar Expediente' : '▶ Abrir Expediente';
        }

        if (typeof window.setExpedienteButtonState === 'function') {
            window.setExpedienteButtonState(expedienteAberto);
        }

        showToast(expedienteAberto ? 'Expediente aberto!' : 'Expediente fechado!', expedienteAberto ? 'success' : 'error');
    } catch (err) {
        showToast(err.message || 'Falha ao alterar expediente', 'error');
    } finally {
        btn.disabled = false;
    }
}

// Register page handler
if (window.registerPageHandler) {
    window.registerPageHandler('configuracoes', loadConfiguracoesPage);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        const btnEvent = document.querySelector('[data-page="configuracoes"]');
        if (btnEvent) {
            btnEvent.addEventListener('click', () => {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById('page-configuracoes').classList.add('active');
                btnEvent.classList.add('active');
                loadConfiguracoesPage();
            });
        }
    });
}
