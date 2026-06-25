// Compras & Fornecedores

let comprasState = {
    purchases: [],
    search: '',
};

let purchaseItemRowCounter = 0;

async function loadComprasPage() {
    document.getElementById('page-title').textContent = 'Compras & Fornecedores';
    document.getElementById('page-sub').textContent = 'Lançamento de notas, histórico de compras e referência de fornecedores';

    const container = document.getElementById('page-compras');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div> Carregando compras...</div>';

    try {
        const purchases = await api.get('/purchases');
        comprasState.purchases = Array.isArray(purchases) ? purchases.map(normalizePurchaseEntry) : [];
        renderComprasPage();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro</h3><p>${escapeHTML(err.message)}</p></div>`;
    }
}

function renderComprasPage() {
    const container = document.getElementById('page-compras');
    if (!container) return;

    const canManagePurchases = canPerformAction('managePurchases');
    const purchases = filterPurchaseEntries(comprasState.purchases, comprasState.search);
    const totalSpent = purchases.reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);
    const suppliers = new Set(purchases.map((entry) => String(entry.supplierName || '').trim().toLowerCase()).filter(Boolean));
    const totalItems = purchases.reduce((sum, entry) => sum + Number(entry.itemCount || 0), 0);
    const averageTicket = purchases.length ? totalSpent / purchases.length : 0;
    const lastPurchase = purchases[0] || null;

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:18px;">
            <div class="full-card" style="background:linear-gradient(135deg, #1f2937 0%, #334155 100%); color:#fff; border:none;">
                <div class="card-header" style="border:none;">
                    <div>
                        <div class="card-title" style="color:#fff;">Lançamento de Compras</div>
                        <div class="card-subtitle" style="color:rgba(255,255,255,0.72);">Registre notas, fornecedores e itens comprados para consulta futura</div>
                    </div>
                    ${canManagePurchases ? '<button class="btn-sm btn-primary" onclick="openPurchaseEntryModal()">+ Nova Compra</button>' : ''}
                </div>
                <div style="padding:0 22px 22px;">
                    <div style="font-size:13px; color:rgba(255,255,255,0.72); line-height:1.6; max-width:920px;">
                        Use esta área para lançar compras de lona, adesivo, material de embalagem, insumos e qualquer outra entrada que queira ter como referência.
                    </div>
                </div>
            </div>

            <div class="stats-grid">
                ${renderComprasStatCard('🧾', 'Lançamentos', purchases.length, 'Compras registradas no histórico', 'rgba(59,130,246,0.10)', '#2563eb')}
                ${renderComprasStatCard('💰', 'Total investido', formatCurrency(totalSpent), 'Somatório do período filtrado', 'rgba(26,188,156,0.10)', '#0f766e')}
                ${renderComprasStatCard('🏷️', 'Fornecedores', suppliers.size, 'Fornecedores distintos', 'rgba(245,158,11,0.10)', '#b45309')}
                ${renderComprasStatCard('📦', 'Itens lançados', totalItems, lastPurchase ? `Última compra: ${formatPurchaseDate(lastPurchase.purchaseDate)}` : 'Nenhuma compra lançada', 'rgba(139,92,246,0.10)', '#7c3aed')}
            </div>

            <div class="full-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">Histórico de Compras</div>
                        <div class="card-subtitle">${purchases.length} lançamento(s) no filtro atual</div>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                        <div class="search-box">
                            <span>🔎</span>
                            <input type="text" id="compras-search" placeholder="Buscar por fornecedor, nota ou item..." value="${escapeHTML(comprasState.search)}">
                        </div>
                        ${canManagePurchases ? '<button class="btn-sm btn-dark" onclick="openPurchaseEntryModal()">+ Nova Compra</button>' : ''}
                    </div>
                </div>

                <div style="overflow:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Fornecedor</th>
                                <th>Nota</th>
                                <th>Data</th>
                                <th>Itens</th>
                                <th>Total</th>
                                <th>Responsável</th>
                                ${canManagePurchases ? '<th>Ações</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${purchases.length ? purchases.map((entry) => renderPurchaseRow(entry, canManagePurchases)).join('') : `
                                <tr>
                                    <td colspan="${canManagePurchases ? 7 : 6}" style="text-align:center; padding:36px 20px; color:var(--muted);">
                                        Nenhum lançamento encontrado neste filtro
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const searchInput = document.getElementById('compras-search');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            comprasState.search = event.target.value || '';
            renderComprasPage();
        });
    }
}

function renderComprasStatCard(icon, label, value, detail, bg, color) {
    return `
        <div class="stat-card animate-slide-up">
            <div class="stat-icon" style="background:${bg}; color:${color};">${icon}</div>
            <div class="stat-label">${escapeHTML(label)}</div>
            <div class="stat-value">${escapeHTML(String(value))}</div>
            <div class="stat-change" style="color:var(--muted)">${escapeHTML(detail)}</div>
        </div>
    `;
}

function renderPurchaseRow(entry, canManagePurchases) {
    return `
        <tr>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <strong>${escapeHTML(entry.supplierName || '-')}</strong>
                    ${entry.supplierDocument ? `<span style="font-size:12px; color:var(--muted);">Doc: ${escapeHTML(entry.supplierDocument)}</span>` : ''}
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span>${escapeHTML(entry.invoiceNumber || 'Sem nota')}</span>
                    <span style="font-size:12px; color:var(--muted);">#${escapeHTML(String(entry.id || '').slice(-6))}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span>${escapeHTML(formatPurchaseDate(entry.purchaseDate))}</span>
                    <span style="font-size:12px; color:var(--muted);">${escapeHTML(formatPurchaseTime(entry.createdAt))}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span>${escapeHTML(String(entry.itemCount || 0))} item(ns)</span>
                    <span style="font-size:12px; color:var(--muted);">${escapeHTML(summarizePurchaseItems(entry.items || []))}</span>
                </div>
            </td>
            <td style="font-weight:700; font-family:'JetBrains Mono', monospace;">${escapeHTML(formatCurrency(entry.totalAmount || 0))}</td>
            <td>${escapeHTML(entry.createdByUserName || 'Sistema')}</td>
            ${canManagePurchases ? `
            <td>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-sm btn-dark" onclick="openPurchaseEntryModal('${entry.id}')">Editar</button>
                    <button class="btn-sm btn-outline" onclick="deletePurchaseEntry('${entry.id}')">Excluir</button>
                </div>
            </td>
            ` : ''}
        </tr>
    `;
}

function openPurchaseEntryModal(purchaseId = null) {
    if (!canPerformAction('managePurchases')) {
        showToast('Seu perfil nao pode lancar compras.', 'error');
        return;
    }

    const entry = purchaseId ? comprasState.purchases.find((item) => item.id === purchaseId) : null;
    const isEdit = !!entry;
    const itemRows = isEdit && Array.isArray(entry.items) && entry.items.length ? entry.items : [null];
    purchaseItemRowCounter = 0;

    openModal(`
        <div class="modal-header">
            <div>
                <h3>${isEdit ? 'Editar lançamento de compra' : 'Nova compra / nota de entrada'}</h3>
                <div class="modal-header-subtitle">Registre fornecedor, número da nota e os itens comprados.</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="max-height:70vh; overflow:auto; padding-right:8px;">
            <div style="display:flex; flex-direction:column; gap:18px;">
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Fornecedor</label>
                        <input type="text" id="purchase-supplier-name" value="${escapeHTML(entry?.supplierName || '')}" placeholder="Ex: ABC Lonas e Adesivos">
                    </div>
                    <div class="form-group">
                        <label>Documento do fornecedor</label>
                        <input type="text" id="purchase-supplier-document" value="${escapeHTML(entry?.supplierDocument || '')}" placeholder="CNPJ ou CPF">
                    </div>
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label>Número da nota / referência</label>
                        <input type="text" id="purchase-invoice-number" value="${escapeHTML(entry?.invoiceNumber || '')}" placeholder="Ex: NF 12345">
                    </div>
                    <div class="form-group">
                        <label>Data da compra</label>
                        <input type="date" id="purchase-date" value="${escapeHTML(entry?.purchaseDate || toInputDateValue(new Date()))}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Observações</label>
                    <textarea id="purchase-notes" rows="3" placeholder="Ex: compra de lona, adesivo e insumos para a unidade">${escapeHTML(entry?.notes || '')}</textarea>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:var(--dark);">Itens da compra</div>
                        <div style="font-size:12px; color:var(--muted);">Informe nome, quantidade e custo unitário.</div>
                    </div>
                    <button type="button" class="btn-sm btn-outline" onclick="addPurchaseItemRow()">+ Adicionar item</button>
                </div>

                <div id="purchase-items-list" style="display:flex; flex-direction:column; gap:10px;"></div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                        <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); margin-bottom:6px;">Itens</div>
                        <div id="purchase-summary-item-count" style="font-size:24px; font-weight:800; color:var(--dark);">0</div>
                    </div>
                    <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:var(--bg);">
                        <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); margin-bottom:6px;">Total estimado</div>
                        <div id="purchase-summary-total" style="font-size:24px; font-weight:800; color:var(--teal);">R$0,00</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-sm btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn-sm btn-primary" id="btn-save-purchase" onclick="savePurchaseEntry('${escapeHTML(String(purchaseId || ''))}')">
                ${isEdit ? 'Salvar alterações' : 'Salvar compra'}
            </button>
        </div>
    `, { size: 'lg' });

    itemRows.forEach((item) => addPurchaseItemRow(item || null));
    updatePurchaseDraftSummary();
}

function renderPurchaseItemRow(item = null) {
    purchaseItemRowCounter += 1;
    const rowKey = `purchase-item-${purchaseItemRowCounter}`;

    return `
        <div class="purchase-item-row" data-row-key="${rowKey}" style="border:1px solid var(--border); border-radius:14px; padding:14px; background:var(--card-bg);">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:10px;">
                <div style="font-size:13px; font-weight:700; color:var(--dark);">Item ${purchaseItemRowCounter}</div>
                <button type="button" class="btn-sm btn-outline" onclick="removePurchaseItemRow('${rowKey}')">Remover</button>
            </div>
            <div class="form-row-2">
                <div class="form-group">
                    <label>Produto / Material</label>
                    <input type="text" class="purchase-item-name" value="${escapeHTML(item?.productName || item?.product_name || '')}" placeholder="Ex: lona, adesivo, tinta...">
                </div>
                <div class="form-group">
                    <label>Observações do item</label>
                    <input type="text" class="purchase-item-notes" value="${escapeHTML(item?.notes || '')}" placeholder="Opcional">
                </div>
            </div>
            <div class="form-row-3">
                <div class="form-group">
                    <label>Quantidade</label>
                    <input type="number" min="0.001" step="0.001" class="purchase-item-quantity" value="${escapeHTML(String(item?.quantity ?? 1))}">
                </div>
                <div class="form-group">
                    <label>Custo unitário</label>
                    <input type="number" min="0" step="0.01" class="purchase-item-unit-cost" value="${escapeHTML(String(item?.unitCost ?? item?.unit_cost ?? 0))}">
                </div>
                <div class="form-group">
                    <label>Total do item</label>
                    <input type="text" class="purchase-item-total" value="${escapeHTML(formatCurrency(Number(item?.totalCost ?? item?.total_cost ?? ((Number(item?.quantity || 0) * Number(item?.unitCost || item?.unit_cost || 0))))))}" readonly>
                </div>
            </div>
        </div>
    `;
}

function addPurchaseItemRow(item = null) {
    const list = document.getElementById('purchase-items-list');
    if (!list) return;
    if (!list.querySelector('.purchase-item-row')) {
        list.innerHTML = '';
    }
    list.insertAdjacentHTML('beforeend', renderPurchaseItemRow(item));
    bindPurchaseItemRowEvents();
    updatePurchaseDraftSummary();
}

function removePurchaseItemRow(rowKey) {
    document.querySelector(`.purchase-item-row[data-row-key="${rowKey}"]`)?.remove();
    if (!document.querySelector('.purchase-item-row')) {
        addPurchaseItemRow();
    }
    bindPurchaseItemRowEvents();
    updatePurchaseDraftSummary();
}

function bindPurchaseItemRowEvents() {
    document.querySelectorAll('.purchase-item-row').forEach((row) => {
        const inputs = row.querySelectorAll('.purchase-item-quantity, .purchase-item-unit-cost, .purchase-item-name, .purchase-item-notes');
        inputs.forEach((input) => {
            input.oninput = () => updatePurchaseDraftSummary();
            input.onchange = () => updatePurchaseDraftSummary();
        });
    });
}

function collectPurchaseItems() {
    const rows = Array.from(document.querySelectorAll('.purchase-item-row'));
    const items = [];

    for (const row of rows) {
        const name = String(row.querySelector('.purchase-item-name')?.value || '').trim();
        const notes = String(row.querySelector('.purchase-item-notes')?.value || '').trim();
        const quantity = parseFloat(String(row.querySelector('.purchase-item-quantity')?.value || '0'));
        const unitCost = parseFloat(String(row.querySelector('.purchase-item-unit-cost')?.value || '0'));

        if (!name && !notes && (!Number.isFinite(quantity) || quantity === 0) && (!Number.isFinite(unitCost) || unitCost === 0)) {
            continue;
        }

        if (!name) {
            showToast('Cada item precisa ter um nome.', 'error');
            return null;
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            showToast(`Quantidade inválida no item ${name}.`, 'error');
            return null;
        }

        if (!Number.isFinite(unitCost) || unitCost < 0) {
            showToast(`Custo unitário inválido no item ${name}.`, 'error');
            return null;
        }

        items.push({
            product_name: name,
            quantity,
            unit_cost: unitCost,
            notes: notes || null,
        });
    }

    if (!items.length) {
        showToast('Adicione ao menos um item na compra.', 'error');
        return null;
    }

    return items;
}

async function savePurchaseEntry(purchaseId = '') {
    if (!canPerformAction('managePurchases')) {
        showToast('Seu perfil nao pode salvar compras.', 'error');
        return;
    }

    const btn = document.getElementById('btn-save-purchase');
    const items = collectPurchaseItems();
    if (!items) return;

    const supplierName = String(document.getElementById('purchase-supplier-name')?.value || '').trim();
    const supplierDocument = String(document.getElementById('purchase-supplier-document')?.value || '').trim();
    const invoiceNumber = String(document.getElementById('purchase-invoice-number')?.value || '').trim();
    const purchaseDate = String(document.getElementById('purchase-date')?.value || '').trim();
    const notes = String(document.getElementById('purchase-notes')?.value || '').trim();

    if (!supplierName) {
        showToast('Informe o fornecedor.', 'error');
        return;
    }

    const payload = {
        supplier_name: supplierName,
        supplier_document: supplierDocument || undefined,
        invoice_number: invoiceNumber || undefined,
        purchase_date: purchaseDate || undefined,
        notes: notes || undefined,
        items,
    };

    if (btn) {
        btn.disabled = true;
        btn.textContent = purchaseId ? 'Salvando...' : 'Salvando...';
    }

    try {
        if (purchaseId) {
            await api.put(`/purchases/${purchaseId}`, payload);
            showToast('Compra atualizada com sucesso.', 'success');
        } else {
            await api.post('/purchases', payload);
            showToast('Compra lançada com sucesso.', 'success');
        }
        closeModal();
        await loadComprasPage();
    } catch (err) {
        showToast(err.message || 'Erro ao salvar compra.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = purchaseId ? 'Salvar alterações' : 'Salvar compra';
        }
    }
}

async function deletePurchaseEntry(purchaseId) {
    if (!canPerformAction('managePurchases')) {
        showToast('Seu perfil nao pode excluir compras.', 'error');
        return;
    }

    const entry = comprasState.purchases.find((item) => item.id === purchaseId);
    const confirmed = window.confirm(`Excluir o lançamento de ${entry?.supplierName || 'compra'}?`);
    if (!confirmed) return;

    try {
        await api.delete(`/purchases/${purchaseId}`);
        showToast('Compra excluída com sucesso.', 'success');
        await loadComprasPage();
    } catch (err) {
        showToast(err.message || 'Erro ao excluir compra.', 'error');
    }
}

function updatePurchaseDraftSummary() {
    const rows = Array.from(document.querySelectorAll('.purchase-item-row'));
    let total = 0;
    let itemCount = 0;

    rows.forEach((row) => {
        const name = String(row.querySelector('.purchase-item-name')?.value || '').trim();
        const quantity = parseFloat(String(row.querySelector('.purchase-item-quantity')?.value || '0'));
        const unitCost = parseFloat(String(row.querySelector('.purchase-item-unit-cost')?.value || '0'));
        const totalInput = row.querySelector('.purchase-item-total');

        if (!name && (!Number.isFinite(quantity) || quantity === 0) && (!Number.isFinite(unitCost) || unitCost === 0)) {
            if (totalInput) totalInput.value = formatCurrency(0);
            return;
        }

        const rowTotal = Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0;
        total += rowTotal;
        itemCount += 1;
        if (totalInput) totalInput.value = formatCurrency(rowTotal);
    });

    const itemCountEl = document.getElementById('purchase-summary-item-count');
    const totalEl = document.getElementById('purchase-summary-total');
    if (itemCountEl) itemCountEl.textContent = String(itemCount);
    if (totalEl) totalEl.textContent = formatCurrency(total);
}

function filterPurchaseEntries(entries, search) {
    const term = String(search || '').trim().toLowerCase();
    if (!term) {
        return entries;
    }

    return entries.filter((entry) => {
        const haystack = [
            entry.supplierName,
            entry.supplierDocument || '',
            entry.invoiceNumber || '',
            entry.notes || '',
            formatPurchaseDate(entry.purchaseDate),
            ...(entry.items || []).map((item) => [item.productName, item.notes || ''].join(' ')),
        ].join(' ').toLowerCase();

        return haystack.includes(term);
    });
}

function normalizePurchaseEntry(entry) {
    const items = Array.isArray(entry.items) ? entry.items.map((item) => ({
        productName: String(item.productName || item.product_name || '').trim(),
        quantity: Number(item.quantity || 0),
        unitCost: Number(item.unitCost || item.unit_cost || 0),
        totalCost: Number(item.totalCost || item.total_cost || 0),
        notes: String(item.notes || '').trim(),
    })) : [];

    return {
        ...entry,
        supplierName: entry.supplierName || entry.supplier_name || '',
        supplierDocument: entry.supplierDocument || entry.supplier_document || '',
        invoiceNumber: entry.invoiceNumber || entry.invoice_number || '',
        purchaseDate: entry.purchaseDate || entry.purchase_date || '',
        notes: entry.notes || '',
        items,
        itemCount: Number(entry.itemCount || entry.item_count || items.length || 0),
        totalAmount: Number(entry.totalAmount || entry.total_amount || 0),
        createdByUserName: entry.createdByUserName || entry.created_by_user_name || '',
        createdAt: entry.createdAt || entry.created_at || '',
    };
}

function summarizePurchaseItems(items) {
    if (!Array.isArray(items) || !items.length) {
        return '-';
    }

    return items.slice(0, 2).map((item) => item.productName).filter(Boolean).join(' · ') + (items.length > 2 ? ' ...' : '');
}

function formatPurchaseDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split('-');
        return `${day}/${month}/${year}`;
    }
    return formatDate(raw);
}

function formatPurchaseTime(value) {
    if (!value) return '-';
    return formatTime(value);
}

function toInputDateValue(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

if (window.registerPageHandler) {
    window.registerPageHandler('compras', loadComprasPage);
}
