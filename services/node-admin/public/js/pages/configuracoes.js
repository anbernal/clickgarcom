// configuracoes.js - Gerencia as telas de configurações do admin
const MessageTemplatesKeys = [
    { key: 'msg_welcome', label: 'Mensagem de Boas-vindas', desc: 'Enviada quando um cliente inicia uma conversa.', vars: '{nome_restaurante}' },
    { key: 'msg_restaurant_closed', label: 'Mensagem de Restaurante Fechado', desc: 'Enviada quando o cliente envia mensagem fora do expediente.', vars: 'Nenhuma' },
    { key: 'msg_welcome_table', label: 'Mensagem de Boas-vindas na Mesa', desc: 'Enviada quando cliente lê o QR Code da mesa.', vars: '{nome_restaurante}, {numero_mesa}' },
    { key: 'msg_table_request_pending', label: 'Solicitação de Mesa Pendente', desc: 'Enviada ao confirmar nome/cpf aguardando liberação.', vars: '{numero_mesa}' },
    { key: 'msg_table_approved', label: 'Mesa Liberada', desc: 'Enviada quando o garçom aceita o cliente na mesa.', vars: '{numero_mesa}' },
    { key: 'msg_main_menu', label: 'Menu Principal', desc: 'Texto principal antes das opções interativas do bot.', vars: 'Nenhuma' },
    { key: 'msg_invalid_option', label: 'Opção Inválida', desc: 'Enviada quando o cliente digita algo não reconhecido.', vars: 'Nenhuma' },
    { key: 'msg_order_confirmed', label: 'Pedido Confirmado', desc: 'Enviada quando um pedido é criado com sucesso.', vars: '{codigo_pedido}' },
    { key: 'msg_order_ready', label: 'Pedido Pronto', desc: 'Enviada quando o pedido sai da cozinha (Painel KDS).', vars: '{codigo_pedido}' },
    { key: 'msg_tab_summary', label: 'Resumo da Comanda', desc: 'Enviada ao pedir o extrato/conta parcial.', vars: '{resumo}, {total}' },
    { key: 'msg_service_request', label: 'Solicitação de Serviço', desc: 'Enviada ao chamar o garçom.', vars: '{servico}' },
    { key: 'msg_payment_pending', label: 'Pagamento Pendente', desc: 'Enviada com o link de pagamento PIX.', vars: '{valor}, {link_pagamento}' },
    { key: 'msg_payment_confirmed', label: 'Pagamento Confirmado', desc: 'Enviada após aprovação do MercadoPago.', vars: 'Nenhuma' },
];

let configuracoesDefaults = {};
let configuracoesAtuais = {};
let expedienteAberto = false;

async function loadConfiguracoesPage() {
    document.getElementById('page-title').textContent = 'Configurações de Mensagens';
    document.getElementById('page-sub').textContent = 'Personalize as mensagens automáticas do Robô do WhatsApp';

    const container = document.getElementById('page-configuracoes');

    // Mostra loading
    container.innerHTML = `
        <div class="layout-content">
            <main class="main-body" style="display:flex; justify-content:center; padding: 40px;">
                <div class="spinner"></div> Carregando...
            </main>
        </div>
    `;

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
        console.error('Erro ao carregar mensagens:', err);
        container.innerHTML = `<div class="layout-content"><main class="main-body">Erro ao carregar as configurações. Tente novamente.</main></div>`;
    }
}

function renderConfiguracoesUI(container) {
    let html = `
        <div class="layout-content">
            <main class="main-body">
                <div class="card" style="max-width: 800px; margin: 0 auto;">
                    <h2 class="card-title" style="margin-bottom: 8px;">Expediente</h2>
                    <p style="color: var(--muted); margin-bottom: 16px;">Controle o funcionamento do restaurante. Com o expediente fechado, novos pedidos ficam bloqueados no WhatsApp.</p>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 24px;">
                        <div>
                            <div style="font-weight: 700;" id="expediente-status-text">${expedienteAberto ? '🟢 Aberto para pedidos' : '🔴 Fechado para novos pedidos'}</div>
                            <div style="font-size: 13px; color: var(--muted); margin-top: 4px;">${expedienteAberto ? 'Clientes podem enviar pedidos normalmente.' : 'Pedidos novos bloqueados. Clientes com comanda aberta recebem orientação para fechamento.'}</div>
                        </div>
                        <button type="button" class="btn ${expedienteAberto ? 'btn-danger' : 'btn-primary'}" id="btn-expediente-config" onclick="toggleExpedienteFromConfig()">
                            ${expedienteAberto ? 'Fechar expediente' : 'Abrir expediente'}
                        </button>
                    </div>

                    <h2 class="card-title" style="margin-bottom: 8px;">Mensagens do Bot</h2>
                    <p style="color: var(--muted); margin-bottom: 24px;">Você pode personalizar o texto do bot abaixo. As variáveis entre chaves <code>{variavel}</code> serão substituídas automaticamente pelo sistema. Deixe vazio para usar o padrão.</p>
                    
                    <form id="form-config-messages">
    `;

    MessageTemplatesKeys.forEach(tmpl => {
        const valorAtual = configuracoesAtuais[tmpl.key] || configuracoesDefaults[tmpl.key] || '';
        const isCustom = configuracoesAtuais[tmpl.key] && configuracoesAtuais[tmpl.key] !== configuracoesDefaults[tmpl.key];

        html += `
            <div class="form-group" style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <label style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${tmpl.label}</label>
                    <button type="button" class="btn btn-sm btn-outline" onclick="restoreDefault('${tmpl.key}')" ${!isCustom ? 'disabled style="opacity: 0.5"' : ''} id="btn-restore-${tmpl.key}">
                        ↺ Restaurar Padrão
                    </button>
                </div>
                <div style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">${tmpl.desc}</div>
                
                <textarea 
                    id="input-${tmpl.key}" 
                    class="form-control" 
                    rows="3" 
                    oninput="handleMessageChange('${tmpl.key}')"
                    style="font-family: monospace; font-size: 13px;"
                >${valorAtual}</textarea>
                
                <div style="font-size: 12px; color: var(--primary); margin-top: 6px;">
                    <strong>Variáveis permitidas:</strong> ${tmpl.vars}
                </div>
            </div>
        `;
    });

    html += `
                        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;">
                            <button type="button" class="btn btn-outline" onclick="loadConfiguracoesPage()">Cancelar</button>
                            <button type="submit" class="btn btn-primary" id="btn-save-messages">Salvar Alterações</button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('form-config-messages').addEventListener('submit', handleSaveMessages);
}

function handleMessageChange(key) {
    const input = document.getElementById('input-' + key);
    const btnRestore = document.getElementById('btn-restore-' + key);

    // Se digitou algo diferente do default, habilita o botão de restaurar
    if (input.value !== configuracoesDefaults[key]) {
        btnRestore.disabled = false;
        btnRestore.style.opacity = '1';
    } else {
        btnRestore.disabled = true;
        btnRestore.style.opacity = '0.5';
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

    // Extrair apenas os valores customizados que forem diferentes do default
    MessageTemplatesKeys.forEach(tmpl => {
        const value = document.getElementById('input-' + tmpl.key).value.trim();
        if (value !== configuracoesDefaults[tmpl.key]) {
            payload[tmpl.key] = value;
        } else {
            payload[tmpl.key] = ""; // Envia vazio para apagar do BD e usar default do backend
        }
    });

    try {
        await api.put('/auth/messages', payload);

        alert('Configurações de mensagens salvas com sucesso!');
        loadConfiguracoesPage(); // recarrega botões
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar mensagens. Confira o console.');
    } finally {
        btnSave.innerHTML = 'Salvar Alterações';
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

        const statusText = document.getElementById('expediente-status-text');
        if (statusText) {
            statusText.textContent = expedienteAberto ? '🟢 Aberto para pedidos' : '🔴 Fechado para novos pedidos';
        }
        btn.classList.toggle('btn-danger', expedienteAberto);
        btn.classList.toggle('btn-primary', !expedienteAberto);
        btn.textContent = expedienteAberto ? 'Fechar expediente' : 'Abrir expediente';

        if (typeof window.setExpedienteButtonState === 'function') {
            window.setExpedienteButtonState(expedienteAberto);
        }

        showToast(expedienteAberto ? 'Expediente aberto com sucesso!' : 'Expediente fechado com sucesso!', expedienteAberto ? 'success' : 'error');
    } catch (err) {
        showToast(err.message || 'Falha ao alterar expediente', 'error');
    } finally {
        btn.disabled = false;
    }
}

// Intercepta a inicialização global para mapear a view (caso exista um roteador central)
// Como o app usa Vanilla JS com active pages:
if (window.registerPageHandler) {
    window.registerPageHandler('configuracoes', loadConfiguracoesPage);
} else {
    // Fallback improvisado se o mecanismo for via eventos de clique direto
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
