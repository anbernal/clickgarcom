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
            { key: 'msg_order_confirmed', label: 'Pedido Confirmado', desc: 'Enviada quando o pedido é criado com sucesso.', vars: ['{numero_pedido}'] },
            { key: 'msg_order_ready', label: 'Pedido Pronto', desc: 'Quando a cozinha finaliza o preparo e o pedido entra na fila de entrega.', vars: ['{numero_pedido}'] },
            { key: 'msg_tab_summary', label: 'Resumo da Comanda', desc: 'Quando o cliente pede o extrato ou conta parcial.', vars: ['{nome_restaurante}', '{mesa_label}', '{itens}', '{subtotal}', '{taxa}', '{total}', '{percentual_taxa}'] },
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
let configuracoesOperacionais = {};
let configuracoesOperacionaisDefaults = {};
let expedienteAberto = false;
let activeGroup = null; // null = mostra todos
let botFlowPublishedList = [];
let botFlowVersionsByKey = {};
let botFlowActiveKey = '';
let botFlowActiveVersionByKey = {};
let botFlowCompareVersionByKey = {};
let botFlowDiffByPairKey = {};
let botFlowSandboxDraftByKey = {};
let botFlowSandboxErrorByKey = {};
let botFlowLoadError = '';

async function loadConfiguracoesPage() {
    document.getElementById('page-title').textContent = 'Configurações';
    document.getElementById('page-sub').textContent = 'Expediente, mensagens automáticas e personalizações do seu restaurante';

    const container = document.getElementById('page-configuracoes');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando...</div>';

    try {
        const [me, res, operational, publishedFlows] = await Promise.all([
            api.get('/auth/me'),
            api.get('/auth/messages'),
            api.get('/auth/settings/operational'),
            api.get('/bot-config/flows').catch(() => ({ flows: [] })),
        ]);

        expedienteAberto = !!me.isOpen;
        configuracoesAtuais = res.messages || {};
        configuracoesDefaults = res.defaults || {};
        configuracoesOperacionais = operational.settings || {};
        configuracoesOperacionaisDefaults = operational.defaults || {};
        botFlowPublishedList = Array.isArray(publishedFlows?.flows) ? publishedFlows.flows : [];
        botFlowLoadError = '';

        if (botFlowPublishedList.length > 0) {
            if (!botFlowActiveKey || !botFlowPublishedList.some((flow) => flow.key === botFlowActiveKey)) {
                botFlowActiveKey = String(botFlowPublishedList[0]?.key || '');
            }
            await ensureBotFlowVersionsLoaded(botFlowActiveKey);
            await ensureBotFlowDiffLoaded(botFlowActiveKey);
        } else {
            botFlowActiveKey = '';
            botFlowVersionsByKey = {};
            botFlowActiveVersionByKey = {};
            botFlowCompareVersionByKey = {};
            botFlowDiffByPairKey = {};
            botFlowSandboxDraftByKey = {};
            botFlowSandboxErrorByKey = {};
        }

        renderConfiguracoesUI(container);
    } catch (err) {
        console.error('Erro ao carregar configurações:', err);
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar</h3><p>${err.message || 'Tente novamente.'}</p></div>`;
    }
}

async function ensureBotFlowVersionsLoaded(flowKey) {
    const key = String(flowKey || '').trim();
    if (!key) return;
    if (Array.isArray(botFlowVersionsByKey[key]) && botFlowVersionsByKey[key].length) return;

    const response = await api.get(`/bot-config/flows/${encodeURIComponent(key)}/versions`);
    const versions = Array.isArray(response?.versions) ? response.versions : [];
    botFlowVersionsByKey[key] = versions;
    if (!botFlowActiveVersionByKey[key] && versions.length > 0) {
        botFlowActiveVersionByKey[key] = versions[0].id;
    }
    ensureBotFlowCompareVersionSelected(key);
}

function getBotFlowVersions(flowKey) {
    return Array.isArray(botFlowVersionsByKey[flowKey]) ? botFlowVersionsByKey[flowKey] : [];
}

function getBotFlowActiveVersion(flowKey) {
    const versions = getBotFlowVersions(flowKey);
    if (!versions.length) return null;

    const selectedId = String(botFlowActiveVersionByKey[flowKey] || '').trim();
    const active = versions.find((version) => String(version.id) === selectedId);
    return active || versions[0];
}

function getBotFlowPublishedVersion(flowKey) {
    return getBotFlowVersions(flowKey).find((version) => String(version.status || '').toUpperCase() === 'PUBLISHED') || null;
}

function ensureBotFlowCompareVersionSelected(flowKey) {
    const key = String(flowKey || '').trim();
    const versions = getBotFlowVersions(key);
    const activeVersion = getBotFlowActiveVersion(key);

    if (!activeVersion || versions.length < 2) {
        delete botFlowCompareVersionByKey[key];
        return;
    }

    const currentCompareId = String(botFlowCompareVersionByKey[key] || '').trim();
    const hasCurrentCompare = versions.some((version) => String(version.id) === currentCompareId && String(version.id) !== String(activeVersion.id));
    if (hasCurrentCompare) {
        return;
    }

    const fallback = versions.find((version) => String(version.id) !== String(activeVersion.id));
    if (fallback) {
        botFlowCompareVersionByKey[key] = fallback.id;
    }
}

function getBotFlowCompareVersion(flowKey) {
    ensureBotFlowCompareVersionSelected(flowKey);
    const compareId = String(botFlowCompareVersionByKey[flowKey] || '').trim();
    return getBotFlowVersions(flowKey).find((version) => String(version.id) === compareId) || null;
}

function ensureBotFlowSandboxDraft(flowKey) {
    const key = String(flowKey || '').trim();
    if (botFlowSandboxDraftByKey[key]) return;
    const activeVersion = getBotFlowActiveVersion(key);
    botFlowSandboxDraftByKey[key] = activeVersion?.definition
        ? JSON.stringify(activeVersion.definition, null, 2)
        : '{}';
}

function parseBotFlowSandboxDefinition(flowKey) {
    const key = String(flowKey || '').trim();
    ensureBotFlowSandboxDraft(key);
    const raw = String(botFlowSandboxDraftByKey[key] || '{}').trim() || '{}';

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { definition: null, error: 'O sandbox aceita apenas um objeto JSON válido.' };
        }
        return { definition: parsed, error: '' };
    } catch (err) {
        return { definition: null, error: err.message || 'JSON inválido.' };
    }
}

function buildBotFlowDiffCacheKey(flowKey, fromFlowId, toFlowId) {
    return `${String(flowKey || '').trim()}:${String(fromFlowId || '').trim()}:${String(toFlowId || '').trim()}`;
}

function getCurrentBotFlowDiff(flowKey) {
    const activeVersion = getBotFlowActiveVersion(flowKey);
    const compareVersion = getBotFlowCompareVersion(flowKey);
    if (!activeVersion || !compareVersion) return null;
    return botFlowDiffByPairKey[buildBotFlowDiffCacheKey(flowKey, compareVersion.id, activeVersion.id)] || null;
}

async function ensureBotFlowDiffLoaded(flowKey) {
    const key = String(flowKey || '').trim();
    ensureBotFlowCompareVersionSelected(key);
    const activeVersion = getBotFlowActiveVersion(key);
    const compareVersion = getBotFlowCompareVersion(key);
    if (!activeVersion || !compareVersion || String(activeVersion.id) === String(compareVersion.id)) {
        return;
    }

    const cacheKey = buildBotFlowDiffCacheKey(key, compareVersion.id, activeVersion.id);
    if (botFlowDiffByPairKey[cacheKey]) {
        return;
    }

    const diff = await api.get(`/bot-config/flows/${encodeURIComponent(key)}/diff`, {
        from_flow_id: compareVersion.id,
        to_flow_id: activeVersion.id,
    });
    botFlowDiffByPairKey[cacheKey] = diff;
}

function clearBotFlowDiffCache(flowKey) {
    const prefix = `${String(flowKey || '').trim()}:`;
    Object.keys(botFlowDiffByPairKey).forEach((cacheKey) => {
        if (cacheKey.startsWith(prefix)) {
            delete botFlowDiffByPairKey[cacheKey];
        }
    });
}

function extractBotFlowDefinitionSummary(definition) {
    const payload = definition && typeof definition === 'object' ? definition : {};
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    return {
        presentation: String(payload.presentation || '').trim(),
        body: String(payload.body || '').trim(),
        useWelcomeTemplate: !!(payload.use_welcome_template ?? payload.useWelcomeTemplate),
        actionCount: actions.length,
        actionIds: actions
            .map((action) => String(action?.id || '').trim())
            .filter(Boolean),
    };
}

function getBotFlowStatusMeta(status) {
    const map = {
        PUBLISHED: { label: 'Publicado', cls: 'status-done' },
        ARCHIVED: { label: 'Arquivado', cls: 'status-prep' },
        DRAFT: { label: 'Rascunho', cls: 'status-pending' },
    };
    return map[String(status || '').toUpperCase()] || { label: String(status || 'Desconhecido'), cls: 'status-pending' };
}

function formatBotFlowDate(value) {
    if (!value) return 'Sem data';
    return formatDateTime(value);
}

function getBotFlowActorLabel(version) {
    return String(version?.createdByName || version?.updatedByName || version?.createdBy || version?.updatedBy || 'Sistema').trim() || 'Sistema';
}

function getBotFlowVersionLabel(version) {
    if (!version) return 'Sem versão';
    return `v${String(version.version || '-')}`;
}

function formatBotFlowDiffValue(value) {
    if (value === null || value === undefined) return '—';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return String(text || '').length > 140 ? `${String(text).slice(0, 137)}...` : String(text);
}

function getBotFlowDiffChangeMeta(changeType) {
    const map = {
        ADDED: { label: 'Adicionado', cls: 'status-done' },
        REMOVED: { label: 'Removido', cls: 'status-canceled' },
        UPDATED: { label: 'Alterado', cls: 'status-prep' },
    };
    return map[String(changeType || '').toUpperCase()] || { label: String(changeType || 'Mudança'), cls: 'status-pending' };
}

function renderBotFlowSandbox(flowKey) {
    const key = String(flowKey || '').trim();
    ensureBotFlowSandboxDraft(key);
    const draft = String(botFlowSandboxDraftByKey[key] || '{}');
    const parsed = parseBotFlowSandboxDefinition(key);
    const sandboxSummary = extractBotFlowDefinitionSummary(parsed.definition);
    const sandboxActions = Array.isArray(parsed.definition?.actions) ? parsed.definition.actions : [];

    return `
        <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
                <div>
                    <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light);">Sandbox do fluxo</div>
                    <div style="font-size:13px; color:var(--text); margin-top:4px;">Edite o JSON abaixo para simular a definição antes de publicar.</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-sm btn-outline" type="button" onclick="loadActiveFlowIntoSandbox('${escapeHTML(key)}')">Usar versão selecionada</button>
                    <button class="btn-sm btn-outline" type="button" onclick="loadDefaultFlowIntoSandbox('${escapeHTML(key)}')">Carregar default</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start;">
                <div style="min-width:0;">
                    <textarea
                        id="bot-flow-sandbox-json"
                        class="config-textarea"
                        rows="16"
                        oninput="updateBotFlowSandboxDraft('${escapeHTML(key)}', this.value)"
                    >${escapeHTML(draft)}</textarea>
                    ${parsed.error ? `<div style="margin-top:8px; font-size:12px; color:#b91c1c;">${escapeHTML(parsed.error)}</div>` : ''}
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; min-width:0;">
                    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--card-bg);">
                        <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:6px;">Preview resumido</div>
                        <div style="font-size:14px; font-weight:700; color:var(--text);">${escapeHTML(sandboxSummary.presentation || 'Sem presentation')}</div>
                        <div style="font-size:13px; color:var(--text); margin-top:8px; line-height:1.6;">${escapeHTML(sandboxSummary.body || 'Sem body configurado')}</div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px;">
                        ${renderBotFlowMetric('Ações', String(sandboxSummary.actionCount))}
                        ${renderBotFlowMetric('Template', sandboxSummary.useWelcomeTemplate ? 'Sim' : 'Não')}
                        ${renderBotFlowMetric('Entradas', String(sandboxActions.reduce((sum, action) => sum + (Array.isArray(action?.accepted_inputs) ? action.accepted_inputs.length : 0), 0)))}
                    </div>

                    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--card-bg);">
                        <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Ações simuladas</div>
                        <div style="display:flex; flex-direction:column; gap:10px; max-height:230px; overflow:auto; padding-right:4px;">
                            ${sandboxActions.length ? sandboxActions.map((action, index) => `
                                <div style="border:1px solid var(--border); border-radius:10px; padding:12px; background:var(--bg);">
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                        <strong style="color:var(--text);">${escapeHTML(action?.label || `Ação ${index + 1}`)}</strong>
                                        <span class="config-var-tag">${escapeHTML(String(action?.id || 'sem-id'))}</span>
                                    </div>
                                    <div style="font-size:12px; color:var(--text-light); line-height:1.5;">
                                        Entradas aceitas:
                                        ${Array.isArray(action?.accepted_inputs) && action.accepted_inputs.length
                                            ? action.accepted_inputs.map((input) => `<span class="config-var-tag" style="margin-left:6px;">${escapeHTML(String(input))}</span>`).join('')
                                            : '<span style="color:var(--text-light);"> nenhuma</span>'}
                                    </div>
                                </div>
                            `).join('') : '<div style="font-size:12px; color:var(--text-light);">Nenhuma ação simulada no JSON atual.</div>'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBotFlowVersionsCard() {
    if (botFlowLoadError) {
        return `
            <div class="full-card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <div>
                        <div class="card-title">🧭 Fluxos Publicados</div>
                        <div class="card-subtitle">Versionamento operacional do bot</div>
                    </div>
                </div>
                <div style="padding:20px 22px; color:#b91c1c;">${escapeHTML(botFlowLoadError)}</div>
            </div>
        `;
    }

    if (!botFlowPublishedList.length) {
        return `
            <div class="full-card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <div>
                        <div class="card-title">🧭 Fluxos Publicados</div>
                        <div class="card-subtitle">Versionamento operacional do bot</div>
                    </div>
                </div>
                <div style="padding:20px 22px;">
                    <div style="padding:16px; border-radius:12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.15); color:var(--text-light);">
                        Ainda não existem fluxos publicados para este tenant. Assim que um fluxo for publicado, o histórico aparece aqui.
                    </div>
                </div>
            </div>
        `;
    }

    const activeVersions = getBotFlowVersions(botFlowActiveKey);
    const activeVersion = getBotFlowActiveVersion(botFlowActiveKey);
    const publishedVersion = getBotFlowPublishedVersion(botFlowActiveKey);
    const compareVersion = getBotFlowCompareVersion(botFlowActiveKey);
    const diff = getCurrentBotFlowDiff(botFlowActiveKey);
    const summary = extractBotFlowDefinitionSummary(activeVersion?.definition);
    const jsonPreview = activeVersion?.definition
        ? JSON.stringify(activeVersion.definition, null, 2)
        : '{}';
    const canRollback = !!activeVersion && String(activeVersion.status || '').toUpperCase() !== 'PUBLISHED';

    return `
        <div class="full-card" style="margin-bottom: 20px;">
            <div class="card-header">
                <div>
                    <div class="card-title">🧭 Fluxos Publicados</div>
                    <div class="card-subtitle">Compare versões, revise a definição e reverta publicações com histórico rastreável</div>
                </div>
            </div>
            <div style="padding:20px 22px;">
                <div style="margin-bottom:16px; padding:14px 16px; border-radius:12px; background:rgba(75,123,229,0.08); border:1px solid rgba(75,123,229,0.18); color:var(--text-primary, #1f2937);">
                    Compare a versão selecionada com outra publicação do mesmo flow. Se precisar voltar atrás, o rollback gera uma nova versão publicada e preserva o histórico anterior.
                </div>

                <div style="display:grid; grid-template-columns:280px minmax(0, 1fr); gap:18px; align-items:start;">
                    <div style="border:1px solid var(--border); border-radius:14px; background:var(--card-bg); padding:16px; display:flex; flex-direction:column; gap:14px;">
                        <div>
                            <label for="bot-flow-key-select" style="display:block; font-size:12px; font-weight:700; color:var(--text-light); margin-bottom:6px;">Flow key</label>
                            <select id="bot-flow-key-select" onchange="selectBotFlowKey(this.value)">
                                ${[...new Set(botFlowPublishedList.map((flow) => String(flow.key || '').trim()).filter(Boolean))]
                                    .map((key) => `<option value="${escapeHTML(key)}" ${key === botFlowActiveKey ? 'selected' : ''}>${escapeHTML(key)}</option>`)
                                    .join('')}
                            </select>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow:auto; padding-right:4px;">
                            ${activeVersions.map((version) => {
                                const statusMeta = getBotFlowStatusMeta(version.status);
                                const isActive = String(activeVersion?.id || '') === String(version.id || '');
                                return `
                                    <button
                                        type="button"
                                        onclick="selectBotFlowVersion('${escapeHTML(botFlowActiveKey)}', '${escapeHTML(String(version.id || ''))}')"
                                        style="text-align:left; border:1px solid ${isActive ? 'rgba(26,188,156,0.35)' : 'var(--border)'}; background:${isActive ? 'rgba(26,188,156,0.06)' : 'var(--card-bg)'}; border-radius:12px; padding:12px; cursor:pointer;"
                                    >
                                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                            <strong style="color:var(--text);">v${escapeHTML(String(version.version || '-'))}</strong>
                                            <span class="status-pill ${statusMeta.cls}">${escapeHTML(statusMeta.label)}</span>
                                        </div>
                                        <div style="font-size:12px; color:var(--text-light); line-height:1.5;">
                                            Canal: ${escapeHTML(String(version.channel || 'whatsapp'))}<br>
                                            Ator: ${escapeHTML(getBotFlowActorLabel(version))}<br>
                                            Publicado: ${escapeHTML(formatBotFlowDate(version.publishedAt || version.published_at))}<br>
                                            Atualizado: ${escapeHTML(formatBotFlowDate(version.updatedAt || version.updated_at))}
                                        </div>
                                        ${version.changeReason ? `<div style="margin-top:8px; font-size:12px; color:var(--text); line-height:1.5;">Motivo: ${escapeHTML(version.changeReason)}</div>` : ''}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div style="border:1px solid var(--border); border-radius:14px; background:var(--card-bg); padding:18px; display:flex; flex-direction:column; gap:16px; min-width:0;">
                        ${activeVersion ? `
                            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                                <div>
                                    <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); letter-spacing:0.6px;">Preview da versão</div>
                                    <div style="font-size:22px; font-weight:800; color:var(--text); margin-top:6px;">${escapeHTML(botFlowActiveKey)} · v${escapeHTML(String(activeVersion.version || '-'))}</div>
                                </div>
                                <div class="mono" style="font-size:12px; color:var(--text-light);">ID ${escapeHTML(String(activeVersion.id || '').slice(0, 8) || '--------')}</div>
                            </div>

                            <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px;">
                                ${renderBotFlowMetric('Status', getBotFlowStatusMeta(activeVersion.status).label)}
                                ${renderBotFlowMetric('Ações', String(summary.actionCount))}
                                ${renderBotFlowMetric('Template', summary.useWelcomeTemplate ? 'Sim' : 'Não')}
                                ${renderBotFlowMetric('Canal', String(activeVersion.channel || 'whatsapp'))}
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                                <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                    <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Ator da versão</div>
                                    <div style="font-size:13px; color:var(--text); line-height:1.6;">${escapeHTML(getBotFlowActorLabel(activeVersion))}</div>
                                </div>
                                <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                    <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Motivo registrado</div>
                                    <div style="font-size:13px; color:var(--text); line-height:1.6;">${escapeHTML(activeVersion.changeReason || 'Sem motivo registrado')}</div>
                                </div>
                            </div>

                            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:end;">
                                <div style="min-width:240px; flex:1;">
                                    <label for="bot-flow-compare-select" style="display:block; font-size:12px; font-weight:700; color:var(--text-light); margin-bottom:6px;">Comparar com</label>
                                    <select id="bot-flow-compare-select" onchange="selectBotFlowCompareVersion('${escapeHTML(botFlowActiveKey)}', this.value)">
                                        ${activeVersions
                                            .filter((version) => String(version.id) !== String(activeVersion.id))
                                            .map((version) => `<option value="${escapeHTML(String(version.id))}" ${String(compareVersion?.id || '') === String(version.id) ? 'selected' : ''}>${escapeHTML(getBotFlowVersionLabel(version))} · ${escapeHTML(getBotFlowStatusMeta(version.status).label)}</option>`)
                                            .join('')}
                                    </select>
                                </div>
                                ${canRollback ? `
                                    <button class="btn-sm btn-primary" type="button" onclick="rollbackBotFlow('${escapeHTML(botFlowActiveKey)}', '${escapeHTML(String(activeVersion.id || ''))}')">
                                        Rollback para ${escapeHTML(getBotFlowVersionLabel(activeVersion))}
                                    </button>
                                ` : `
                                    <div style="font-size:12px; color:var(--text-light);">
                                        ${publishedVersion ? `Versão ativa no momento: <strong>${escapeHTML(getBotFlowVersionLabel(publishedVersion))}</strong>.` : 'Nenhuma versão publicada ativa no momento.'}
                                    </div>
                                `}
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                                <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                    <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Presentation</div>
                                    <div style="font-size:13px; color:var(--text); line-height:1.6;">${escapeHTML(summary.presentation || 'Sem bloco de apresentação')}</div>
                                </div>
                                <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                    <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Body</div>
                                    <div style="font-size:13px; color:var(--text); line-height:1.6;">${escapeHTML(summary.body || 'Sem body configurado')}</div>
                                </div>
                            </div>

                            <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:8px;">Ações mapeadas</div>
                                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    ${summary.actionIds.length
                                        ? summary.actionIds.map((actionId) => `<span class="config-var-tag">${escapeHTML(actionId)}</span>`).join('')
                                        : '<span style="font-size:12px; color:var(--text-light);">Nenhuma ação cadastrada.</span>'}
                                </div>
                            </div>

                            <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
                                    <div>
                                        <div style="font-size:12px; text-transform:uppercase; font-weight:700; color:var(--text-light);">Diff entre versões</div>
                                        <div style="font-size:13px; color:var(--text); margin-top:4px;">
                                            ${compareVersion ? `${escapeHTML(getBotFlowVersionLabel(compareVersion))} → ${escapeHTML(getBotFlowVersionLabel(activeVersion))}` : 'Sem versão para comparar'}
                                        </div>
                                    </div>
                                    ${diff ? `
                                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                            <span class="config-var-tag">Total ${escapeHTML(String(diff.summary?.total_changes || 0))}</span>
                                            <span class="config-var-tag">+ ${escapeHTML(String(diff.summary?.added || 0))}</span>
                                            <span class="config-var-tag">- ${escapeHTML(String(diff.summary?.removed || 0))}</span>
                                            <span class="config-var-tag">~ ${escapeHTML(String(diff.summary?.updated || 0))}</span>
                                        </div>
                                    ` : ''}
                                </div>

                                ${compareVersion && diff ? `
                                    <div style="display:flex; flex-direction:column; gap:10px; max-height:280px; overflow:auto; padding-right:4px;">
                                        ${(diff.changes || []).length
                                            ? diff.changes.map((change) => {
                                                const changeMeta = getBotFlowDiffChangeMeta(change.change_type);
                                                return `
                                                    <div style="border:1px solid var(--border); border-radius:10px; padding:12px; background:var(--card-bg);">
                                                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
                                                            <div class="mono" style="font-size:12px; color:var(--text);">${escapeHTML(change.path || 'root')}</div>
                                                            <span class="status-pill ${changeMeta.cls}">${escapeHTML(changeMeta.label)}</span>
                                                        </div>
                                                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                                            <div>
                                                                <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:4px;">Antes</div>
                                                                <div class="mono" style="font-size:12px; color:var(--text); white-space:pre-wrap; word-break:break-word;">${escapeHTML(formatBotFlowDiffValue(change.from_value))}</div>
                                                            </div>
                                                            <div>
                                                                <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:4px;">Depois</div>
                                                                <div class="mono" style="font-size:12px; color:var(--text); white-space:pre-wrap; word-break:break-word;">${escapeHTML(formatBotFlowDiffValue(change.to_value))}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')
                                            : '<div style="font-size:12px; color:var(--text-light);">As duas versões são equivalentes.</div>'}
                                    </div>
                                ` : `
                                    <div style="font-size:12px; color:var(--text-light);">
                                        É preciso ter pelo menos duas versões para calcular diff.
                                    </div>
                                `}
                            </div>

                            <div style="border:1px solid var(--border); border-radius:12px; padding:0; background:#0f172a; overflow:hidden;">
                                <div style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:12px; font-weight:700; color:#cbd5e1;">Definição JSON</div>
                                <pre style="margin:0; padding:14px; max-height:340px; overflow:auto; font-size:12px; line-height:1.6; color:#e2e8f0; font-family:'DM Mono', monospace; white-space:pre-wrap;">${escapeHTML(jsonPreview)}</pre>
                            </div>

                            ${renderBotFlowSandbox(botFlowActiveKey)}
                        ` : `
                            <div style="padding:16px; border-radius:12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.15); color:var(--text-light);">
                                Nenhuma versão carregada para o flow selecionado.
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBotFlowMetric(label, value) {
    return `
        <div style="border:1px solid var(--border); border-radius:12px; padding:12px; background:var(--bg);">
            <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-light); margin-bottom:6px;">${escapeHTML(label)}</div>
            <div style="font-size:18px; font-weight:800; color:var(--text);">${escapeHTML(value)}</div>
        </div>
    `;
}

async function selectBotFlowKey(flowKey) {
    const key = String(flowKey || '').trim();
    botFlowActiveKey = key;
    botFlowLoadError = '';

    try {
        await ensureBotFlowVersionsLoaded(key);
        await ensureBotFlowDiffLoaded(key);
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    } catch (err) {
        console.error(err);
        botFlowLoadError = err.message || 'Erro ao carregar as versões do flow.';
        showToast(botFlowLoadError, 'error');
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    }
}

async function selectBotFlowVersion(flowKey, versionId) {
    const key = String(flowKey || '').trim();
    botFlowActiveVersionByKey[key] = String(versionId || '').trim();
    ensureBotFlowCompareVersionSelected(key);

    try {
        await ensureBotFlowDiffLoaded(key);
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    } catch (err) {
        console.error(err);
        botFlowLoadError = err.message || 'Erro ao calcular o diff entre versões.';
        showToast(botFlowLoadError, 'error');
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    }
}

async function selectBotFlowCompareVersion(flowKey, versionId) {
    const key = String(flowKey || '').trim();
    botFlowCompareVersionByKey[key] = String(versionId || '').trim();

    try {
        await ensureBotFlowDiffLoaded(key);
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    } catch (err) {
        console.error(err);
        botFlowLoadError = err.message || 'Erro ao calcular o diff entre versões.';
        showToast(botFlowLoadError, 'error');
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    }
}

async function rollbackBotFlow(flowKey, sourceFlowId) {
    const key = String(flowKey || '').trim();
    const versionId = String(sourceFlowId || '').trim();
    if (!key || !versionId) return;

    const selectedVersion = getBotFlowVersions(key).find((version) => String(version.id) === versionId);
    if (!selectedVersion) {
        showToast('Versão selecionada não encontrada para rollback.', 'error');
        return;
    }

    const reason = window.prompt(`Motivo do rollback para ${getBotFlowVersionLabel(selectedVersion)}:`) || '';
    if (!reason.trim()) {
        showToast('Informe um motivo para registrar o rollback.', 'error');
        return;
    }

    const confirmed = window.confirm(`Confirmar rollback do flow ${key} para ${getBotFlowVersionLabel(selectedVersion)}?`);
    if (!confirmed) return;

    try {
        await api.post(`/bot-config/flows/${encodeURIComponent(key)}/rollback`, {
            source_flow_id: versionId,
            reason,
        });
        delete botFlowVersionsByKey[key];
        clearBotFlowDiffCache(key);
        showToast('Rollback publicado com sucesso.', 'success');
        await loadConfiguracoesPage();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Erro ao executar rollback do flow.', 'error');
    }
}

function updateBotFlowSandboxDraft(flowKey, value) {
    const key = String(flowKey || '').trim();
    botFlowSandboxDraftByKey[key] = String(value || '');
}

function loadActiveFlowIntoSandbox(flowKey) {
    const key = String(flowKey || '').trim();
    const activeVersion = getBotFlowActiveVersion(key);
    botFlowSandboxDraftByKey[key] = activeVersion?.definition
        ? JSON.stringify(activeVersion.definition, null, 2)
        : '{}';
    const container = document.getElementById('page-configuracoes');
    if (container) renderConfiguracoesUI(container);
}

async function loadDefaultFlowIntoSandbox(flowKey) {
    const key = String(flowKey || '').trim();
    try {
        const response = await api.get(`/bot-config/flows/${encodeURIComponent(key)}/default`);
        botFlowSandboxDraftByKey[key] = JSON.stringify(response?.definition || {}, null, 2);
        const container = document.getElementById('page-configuracoes');
        if (container) renderConfiguracoesUI(container);
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Erro ao carregar o flow default para o sandbox.', 'error');
    }
}

function renderConfiguracoesUI(container) {
    const canToggleTenantStatus = canPerformAction('toggleTenantStatus');
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
                    ${canToggleTenantStatus ? `
                        <button type="button" class="btn-sm ${expedienteAberto ? 'btn-danger' : 'btn-primary'}" id="btn-expediente-config" onclick="toggleExpedienteFromConfig()">
                            ${expedienteAberto ? '⏸ Fechar Expediente' : '▶ Abrir Expediente'}
                        </button>
                    ` : `
                        <div style="font-size:12px; color:var(--text-light); max-width:220px; text-align:right;">
                            Alteração de expediente liberada apenas para perfis de gestão.
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;

    html += `
        <div class="full-card" style="margin-bottom: 20px;">
            <div class="card-header">
                <div>
                    <div class="card-title">⚙️ Regras Operacionais</div>
                    <div class="card-subtitle">Defina taxa de serviço, divisão de conta e automações base do restaurante</div>
                </div>
            </div>
            <div style="padding: 20px 22px;">
                <form id="form-operational-settings" style="display:flex; flex-direction:column; gap:18px;">
                    <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:18px;">
                        <div style="border:1px solid var(--border); border-radius:14px; padding:18px; background:var(--card-bg);">
                            <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:12px;">Taxa de serviço padrão</div>
                            <div class="form-row-2" style="align-items:end;">
                                <div class="form-group" style="margin:0;">
                                    <label for="operational-service-fee">Percentual</label>
                                    <input
                                        id="operational-service-fee"
                                        type="number"
                                        min="0"
                                        max="30"
                                        step="0.5"
                                        value="${escapeHTML(String(configuracoesOperacionais.service_fee_percent ?? configuracoesOperacionaisDefaults.service_fee_percent ?? 10))}"
                                    />
                                </div>
                                <div style="font-size:12px; color:var(--text-light); line-height:1.5;">
                                    Aplicada nas comandas e pedidos. Faixa permitida: <strong>0% a 30%</strong>.
                                </div>
                            </div>
                        </div>

                        <div style="border:1px solid var(--border); border-radius:14px; padding:18px; background:linear-gradient(135deg, rgba(26,188,156,0.06), rgba(59,130,246,0.05));">
                            <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:10px;">Leitura operacional</div>
                            <div style="font-size:12px; color:var(--text-light); line-height:1.6;">
                                Essas chaves controlam comportamento estrutural do atendimento. Qualquer alteração fica registrada na auditoria da equipe.
                            </div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
                        ${renderOperationalToggleCard('split_enabled', 'Split de comanda', 'Permite dividir a conta por pessoa ou por item na operação de mesas.')}
                        ${renderOperationalToggleCard('auto_accept_orders', 'Aceite automático de pedidos', 'Quando ligado, reduz etapas manuais na fila de pedidos. Use só se a operação estiver estável.')}
                        ${renderOperationalToggleCard('nps_enabled', 'Coleta de NPS', 'Mantém o fluxo preparado para medir satisfação do cliente após atendimento.')}
                        ${renderOperationalToggleCard('voucher_enabled', 'Voucher habilitado', 'Reserva a operação para cupons e campanhas promocionais futuras.')}
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button type="button" class="btn-sm btn-outline" onclick="resetOperationalSettingsForm()">Restaurar padrão</button>
                        <button type="submit" class="btn-sm btn-primary" id="btn-save-operational-settings">Salvar regras operacionais</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    html += renderBotFlowVersionsCard();

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
    document.getElementById('form-operational-settings').addEventListener('submit', handleSaveOperationalSettings);
    document.getElementById('form-config-messages').addEventListener('submit', handleSaveMessages);

    document.querySelectorAll('#config-group-tags .cat-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            activeGroup = tag.dataset.group || null;
            renderConfiguracoesUI(container);
        });
    });
}

function renderOperationalToggleCard(key, title, description) {
    const currentValue = typeof configuracoesOperacionais[key] === 'boolean'
        ? configuracoesOperacionais[key]
        : !!configuracoesOperacionaisDefaults[key];

    return `
        <label style="display:flex; gap:14px; align-items:flex-start; border:1px solid var(--border); border-radius:14px; padding:16px; background:var(--card-bg); cursor:pointer;">
            <input type="checkbox" id="operational-${key}" ${currentValue ? 'checked' : ''} style="margin-top:3px; width:16px; height:16px;">
            <div>
                <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:6px;">${title}</div>
                <div style="font-size:12px; color:var(--text-light); line-height:1.5;">${description}</div>
            </div>
        </label>
    `;
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

function resetOperationalSettingsForm() {
    document.getElementById('operational-service-fee').value = String(configuracoesOperacionaisDefaults.service_fee_percent ?? 10);
    ['split_enabled', 'auto_accept_orders', 'nps_enabled', 'voucher_enabled'].forEach((key) => {
        const checkbox = document.getElementById(`operational-${key}`);
        if (checkbox) {
            checkbox.checked = !!configuracoesOperacionaisDefaults[key];
        }
    });
}

async function handleSaveOperationalSettings(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-operational-settings');
    btnSave.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Salvando...';
    btnSave.disabled = true;

    const payload = {
        service_fee_percent: Number(document.getElementById('operational-service-fee').value || 0),
        split_enabled: !!document.getElementById('operational-split_enabled').checked,
        auto_accept_orders: !!document.getElementById('operational-auto_accept_orders').checked,
        nps_enabled: !!document.getElementById('operational-nps_enabled').checked,
        voucher_enabled: !!document.getElementById('operational-voucher_enabled').checked,
    };

    if (!Number.isFinite(payload.service_fee_percent) || payload.service_fee_percent < 0 || payload.service_fee_percent > 30) {
        showToast('A taxa de serviço deve ficar entre 0% e 30%.', 'error');
        btnSave.innerHTML = 'Salvar regras operacionais';
        btnSave.disabled = false;
        return;
    }

    try {
        const res = await api.put('/auth/settings/operational', payload);
        configuracoesOperacionais = res.settings || payload;
        showToast('Regras operacionais salvas com sucesso!', 'success');
        loadConfiguracoesPage();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Erro ao salvar as regras operacionais.', 'error');
    } finally {
        btnSave.innerHTML = 'Salvar regras operacionais';
        btnSave.disabled = false;
    }
}

function toggleExpedienteFromConfig() {
    if (window.confirmAndToggleExpediente) {
        window.confirmAndToggleExpediente();
    }
}

window.updateConfiguracoesExpediente = function() {
    expedienteAberto = window.isExpedienteAberto;
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
        const btn = document.getElementById('btn-expediente-config');
        if (btn) {
            btn.className = `btn-sm ${expedienteAberto ? 'btn-danger' : 'btn-primary'}`;
            btn.innerHTML = expedienteAberto ? '⏸ Fechar Expediente' : '▶ Abrir Expediente';
        }
    }
};

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
