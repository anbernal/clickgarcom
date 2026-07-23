let consultaScanner = null;
let consultaScannerRunning = false;

function consultaStatusMeta(status) {
  const map = {
    OPEN: { label: 'Aberta', color: '#2563eb', background: 'rgba(37,99,235,.10)' },
    WAITING_PAYMENT: { label: 'Aguardando pagamento', color: '#b45309', background: 'rgba(245,158,11,.12)' },
    PARTIALLY_PAID: { label: 'Parcialmente paga', color: '#b45309', background: 'rgba(245,158,11,.12)' },
    PAID: { label: 'Paga', color: '#047857', background: 'rgba(16,185,129,.12)' },
    CLOSED: { label: 'Fechada', color: '#047857', background: 'rgba(16,185,129,.12)' },
  };
  return map[String(status || '').toUpperCase()] || { label: status || 'Sem status', color: '#475569', background: 'rgba(71,85,105,.10)' };
}

function consultaModeLabel(mode) {
  return String(mode || '').toUpperCase() === 'SEM_MESA' ? 'Sem mesa' : 'Com mesa';
}

function renderConsultaMetric(label, value, helper, color = 'var(--text)') {
  return `
    <div class="consulta-metric-card">
      <div class="consulta-metric-label">${escapeHTML(label)}</div>
      <div class="consulta-metric-value" style="color:${color};">${escapeHTML(value)}</div>
      <div class="consulta-metric-helper">${escapeHTML(helper)}</div>
    </div>
  `;
}

function renderConsultaResult(detail) {
  const financial = detail?.financial || {};
  const status = consultaStatusMeta(detail?.status);
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const payments = Array.isArray(detail?.payments) ? detail.payments : [];
  const exitValidated = !!detail?.exitValidatedAt;
  const tableLabel = detail?.tableNumber ? `Mesa ${detail.tableNumber}` : 'Sem mesa';
  const pendingAmount = Number(financial.amountDue || 0);
  const publicCode = String(detail?.publicCode || detail?.id || '').trim();

  return `
    <section class="consulta-result-card">
      <div class="consulta-result-head">
        <div>
          <div class="consulta-result-eyebrow">Comanda consultada</div>
          <div class="consulta-result-code">
            <span>Código da comanda</span>
            <strong class="mono">${escapeHTML(publicCode)}</strong>
          </div>
          <div class="consulta-result-meta">${escapeHTML(tableLabel)} · ${escapeHTML(consultaModeLabel(detail.serviceMode))} · aberta em ${escapeHTML(formatDateTime(detail.openedAt))}</div>
        </div>
        <div class="consulta-status" style="background:${status.background}; color:${status.color};">${escapeHTML(status.label)}</div>
      </div>

      <div class="consulta-metrics-grid">
        ${renderConsultaMetric('Total', formatCurrency(financial.total || 0), 'valor da comanda')}
        ${renderConsultaMetric('Pago', formatCurrency(financial.paidAmount || 0), 'pagamentos confirmados', '#047857')}
        ${renderConsultaMetric('Saldo', formatCurrency(pendingAmount), pendingAmount > 0 ? 'a regularizar' : 'sem saldo pendente', pendingAmount > 0 ? '#b91c1c' : '#047857')}
        ${renderConsultaMetric('Itens', String(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)), `${items.length} linha(s) de pedido`)}
      </div>

      ${exitValidated
        ? '<div class="consulta-notice consulta-notice--ok"><strong>Saída já validada.</strong> Este QR Code não possui pendência financeira registrada.</div>'
        : pendingAmount > 0
          ? '<div class="consulta-notice consulta-notice--alert"><strong>Saída não liberada.</strong> Existe saldo ou pendência que precisa ser resolvida.</div>'
          : '<div class="consulta-notice consulta-notice--ok"><strong>Financeiro regularizado.</strong> Confira também se não há pedido em preparo antes de liberar a saída.</div>'}

      <div class="consulta-detail-grid">
        <div class="consulta-detail-section">
          <div class="consulta-detail-title">Pedidos e itens</div>
          ${items.length ? items.map((item) => `
            <div class="consulta-detail-line">
              <div>
                <strong>${escapeHTML(`${item.quantity}x ${item.name || 'Item'}`)}</strong>
                <span>Pedido ${escapeHTML(item.orderId || '-')} · ${escapeHTML(statusLabel(item.orderStatus))}</span>
              </div>
              <div class="mono">${escapeHTML(formatCurrency(Number(item.lineSubtotal || 0)))}</div>
            </div>
          `).join('') : '<div class="consulta-detail-empty">Nenhum item encontrado.</div>'}
        </div>
        <div class="consulta-detail-section">
          <div class="consulta-detail-title">Pagamentos</div>
          ${payments.length ? payments.map((payment) => `
            <div class="consulta-detail-line">
              <div>
                <strong>${escapeHTML(payment.method || payment.paymentType || 'Pagamento')}</strong>
                <span>${escapeHTML(payment.status || 'PENDING')} · ${escapeHTML(formatDateTime(payment.createdAt))}</span>
              </div>
              <div class="mono">${escapeHTML(formatCurrency(payment.amount || 0))}</div>
            </div>
          `).join('') : '<div class="consulta-detail-empty">Nenhum pagamento registrado.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderConsultaDialog() {
  return `
    <div class="modal-header">
      <div>
        <h3>Consulta rápida de comanda</h3>
        <div class="modal-header-subtitle">Leia o QR Code ou informe o código para conferir pedidos, pagamentos e saída.</div>
      </div>
      <button class="modal-close" type="button" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body consulta-dialog-body">
      <div class="consulta-dialog-search">
        <input id="consulta-comanda-input" class="input" type="text" inputmode="text" autocomplete="off" placeholder="Ex.: A39F2, código antigo ou URL do QR Code">
        <button id="consulta-comanda-submit" class="btn-sm btn-primary" type="button">Consultar</button>
      </div>
      <div class="consulta-dialog-actions">
        <button id="consulta-scanner-start" class="btn-sm btn-outline" type="button">📷 Ler QR Code pela câmera</button>
        <button id="consulta-scanner-stop" class="btn-sm btn-outline" type="button" disabled>Parar câmera</button>
      </div>
      <div id="consulta-qr-reader-wrap" class="consulta-scanner-wrap" hidden>
        <div id="consulta-qr-reader"></div>
      </div>
      <div id="consulta-comanda-feedback" class="consulta-feedback"></div>
      <div id="consulta-comanda-result"></div>
    </div>
  `;
}

function bindConsultaDialog(rawValue) {
  const input = document.getElementById('consulta-comanda-input');
  const submit = document.getElementById('consulta-comanda-submit');
  const start = document.getElementById('consulta-scanner-start');
  const stop = document.getElementById('consulta-scanner-stop');

  submit?.addEventListener('click', () => consultarComanda(input?.value));
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') consultarComanda(input.value);
  });
  start?.addEventListener('click', startConsultaScanner);
  stop?.addEventListener('click', stopConsultaScanner);

  const normalizedValue = String(rawValue || '').trim();
  if (normalizedValue) {
    input.value = normalizedValue;
    consultarComanda(normalizedValue);
  } else {
    input?.focus();
  }
}

function openComandaConsultation(rawValue = '') {
  stopConsultaScanner().catch(() => {});
  openModal(renderConsultaDialog(), { size: 'lg' });
  bindConsultaDialog(rawValue);
}

async function consultarComanda(rawValue) {
  const input = document.getElementById('consulta-comanda-input');
  const feedback = document.getElementById('consulta-comanda-feedback');
  const result = document.getElementById('consulta-comanda-result');
  const submit = document.getElementById('consulta-comanda-submit');
  const value = String(rawValue || '').trim();
  if (!input || !feedback || !result || !submit) {
    openComandaConsultation(value);
    return;
  }
  if (!value) {
    feedback.textContent = 'Informe um código ou escaneie um QR Code.';
    return;
  }

  submit.disabled = true;
  feedback.textContent = 'Consultando comanda...';
  try {
    const detail = await api.get('/tables/tabs/lookup', { value });
    input.value = detail.publicCode || value;
    result.innerHTML = renderConsultaResult(detail);
    feedback.textContent = `Consulta realizada em ${formatDateTime(new Date().toISOString())}.`;
  } catch (error) {
    result.innerHTML = '';
    feedback.textContent = error.message || 'Não foi possível consultar a comanda.';
  } finally {
    submit.disabled = false;
  }
}

async function startConsultaScanner() {
  const start = document.getElementById('consulta-scanner-start');
  const stop = document.getElementById('consulta-scanner-stop');
  const scannerWrap = document.getElementById('consulta-qr-reader-wrap');
  if (consultaScannerRunning) return;
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Scanner indisponível neste navegador. Digite o código manualmente.', 'error');
    return;
  }

  try {
    scannerWrap.hidden = false;
    consultaScanner = new Html5Qrcode('consulta-qr-reader');
    const cameras = await Html5Qrcode.getCameras();
    const camera = cameras.find((item) => /back|rear|environment|traseira/i.test(item.label)) || cameras[0];
    if (!camera) throw new Error('Nenhuma câmera disponível.');

    await consultaScanner.start(
      camera.id,
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async (decodedText) => {
        const input = document.getElementById('consulta-comanda-input');
        if (input) input.value = decodedText;
        await stopConsultaScanner();
        await consultarComanda(decodedText);
      },
      () => {},
    );
    consultaScannerRunning = true;
    start.disabled = true;
    stop.disabled = false;
  } catch (error) {
    consultaScanner = null;
    consultaScannerRunning = false;
    if (scannerWrap) scannerWrap.hidden = true;
    showToast(error.message || 'Não foi possível abrir a câmera.', 'error');
  }
}

async function stopConsultaScanner() {
  const start = document.getElementById('consulta-scanner-start');
  const stop = document.getElementById('consulta-scanner-stop');
  const scannerWrap = document.getElementById('consulta-qr-reader-wrap');
  if (consultaScanner && consultaScannerRunning) {
    await consultaScanner.stop().catch(() => {});
    consultaScanner.clear().catch(() => {});
  }
  consultaScanner = null;
  consultaScannerRunning = false;
  if (scannerWrap) scannerWrap.hidden = true;
  if (start) start.disabled = false;
  if (stop) stop.disabled = true;
}

function loadConsultaComanda() {
  openComandaConsultation();
}

window.openComandaConsultation = openComandaConsultation;
window.stopConsultaScanner = stopConsultaScanner;
