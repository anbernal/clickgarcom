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
    <div style="border:1px solid var(--border); border-radius:14px; padding:16px; background:var(--card-bg);">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.6px; font-weight:800; color:var(--muted);">${escapeHTML(label)}</div>
      <div style="font-size:23px; font-weight:800; color:${color}; margin-top:7px;">${escapeHTML(value)}</div>
      <div style="font-size:12px; color:var(--muted); margin-top:5px;">${escapeHTML(helper)}</div>
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
    <div class="full-card" style="margin-top:20px; padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
        <div>
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; font-weight:800;">Comanda consultada</div>
          <div style="display:inline-flex; flex-direction:column; gap:3px; margin-top:8px; padding:10px 14px; border-radius:10px; background:rgba(15,118,110,.10); border:2px solid rgba(15,118,110,.25);">
            <span style="font-size:11px; color:#0f766e; font-weight:900; letter-spacing:1px;">CÓDIGO DA COMANDA</span>
            <strong class="mono" style="font-size:32px; line-height:1; letter-spacing:1.5px; color:#0f766e;">${escapeHTML(publicCode)}</strong>
          </div>
          <div style="font-size:13px; color:var(--muted); margin-top:7px;">${escapeHTML(tableLabel)} · ${escapeHTML(consultaModeLabel(detail.serviceMode))} · aberta em ${escapeHTML(formatDateTime(detail.openedAt))}</div>
        </div>
        <div style="padding:9px 13px; border-radius:999px; background:${status.background}; color:${status.color}; font-size:12px; font-weight:800;">${escapeHTML(status.label)}</div>
      </div>

      <div class="consulta-metrics-grid" style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-top:22px;">
        ${renderConsultaMetric('Total', formatCurrency(financial.total || 0), 'valor da comanda')}
        ${renderConsultaMetric('Pago', formatCurrency(financial.paidAmount || 0), 'pagamentos confirmados', '#047857')}
        ${renderConsultaMetric('Saldo', formatCurrency(pendingAmount), pendingAmount > 0 ? 'a regularizar' : 'sem saldo pendente', pendingAmount > 0 ? '#b91c1c' : '#047857')}
        ${renderConsultaMetric('Itens', String(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)), `${items.length} linha(s) de pedido`)}
      </div>

      ${exitValidated
        ? '<div style="margin-top:16px; padding:13px 15px; border-radius:12px; background:rgba(16,185,129,.10); border:1px solid rgba(16,185,129,.18); color:#047857; font-size:13px;"><strong>Saída já validada.</strong> Este QR Code não possui pendência financeira registrada.</div>'
        : pendingAmount > 0
          ? '<div style="margin-top:16px; padding:13px 15px; border-radius:12px; background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.16); color:#b91c1c; font-size:13px;"><strong>Saída não liberada.</strong> Existe saldo ou pendência que precisa ser resolvida.</div>'
          : '<div style="margin-top:16px; padding:13px 15px; border-radius:12px; background:rgba(16,185,129,.08); border:1px solid rgba(16,185,129,.14); color:#047857; font-size:13px;"><strong>Financeiro regularizado.</strong> Confira também se não há pedido em preparo antes de liberar a saída.</div>'}

      <div class="consulta-detail-grid" style="display:grid; grid-template-columns:1.1fr .9fr; gap:16px; margin-top:18px;">
        <div style="border:1px solid var(--border); border-radius:14px; padding:16px; background:var(--bg);">
          <div style="font-weight:800; font-size:14px; margin-bottom:12px;">Pedidos e itens</div>
          ${items.length ? items.map((item) => `
            <div style="display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--border);">
              <div style="min-width:0;">
                <div style="font-size:13px; font-weight:700;">${escapeHTML(`${item.quantity}x ${item.name || 'Item'}`)}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">Pedido ${escapeHTML(item.orderId || '-')} · ${escapeHTML(statusLabel(item.orderStatus))}</div>
              </div>
              <div class="mono" style="font-size:13px; white-space:nowrap;">${escapeHTML(formatCurrency(Number(item.lineSubtotal || 0)))}</div>
            </div>
          `).join('') : '<div style="font-size:12px; color:var(--muted);">Nenhum item encontrado.</div>'}
        </div>
        <div style="border:1px solid var(--border); border-radius:14px; padding:16px; background:var(--bg);">
          <div style="font-weight:800; font-size:14px; margin-bottom:12px;">Pagamentos</div>
          ${payments.length ? payments.map((payment) => `
            <div style="display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:13px; font-weight:700;">${escapeHTML(payment.method || payment.paymentType || 'Pagamento')}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">${escapeHTML(payment.status || 'PENDING')} · ${escapeHTML(formatDateTime(payment.createdAt))}</div>
              </div>
              <div class="mono" style="font-size:13px; white-space:nowrap;">${escapeHTML(formatCurrency(payment.amount || 0))}</div>
            </div>
          `).join('') : '<div style="font-size:12px; color:var(--muted);">Nenhum pagamento registrado.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderConsultaPage() {
  const container = document.getElementById('page-consultaComanda');
  if (!container) return;

  container.innerHTML = `
    <div class="layout-content">
      <main class="main-body">
        <div class="consulta-layout-grid" style="display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(280px, .75fr); gap:18px; align-items:stretch;">
          <section class="full-card" style="padding:24px; background:linear-gradient(135deg, #0f766e, #155e75); color:#fff; border:none; overflow:hidden; position:relative;">
            <div style="position:absolute; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.08); right:-45px; top:-55px;"></div>
            <div style="position:relative; z-index:1;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.3px; font-weight:800; color:rgba(255,255,255,.68);">Operação de salão</div>
              <h2 style="margin:8px 0 8px; font-size:25px; letter-spacing:-.7px;">Consultar uma comanda</h2>
              <p style="margin:0; max-width:560px; color:rgba(255,255,255,.78); font-size:13px; line-height:1.55;">Escaneie o QR Code apresentado pelo cliente ou digite o código público da comanda para conferir conta, pedidos e situação da saída.</p>
              <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
                <input id="consulta-comanda-input" type="text" inputmode="text" autocomplete="off" placeholder="Ex.: 7AF80ACC ou URL do QR Code" style="flex:1; min-width:230px; height:44px; border:0; border-radius:10px; padding:0 14px; color:#0f172a; font-weight:700;">
                <button id="consulta-comanda-submit" class="btn btn-primary" type="button" style="height:44px; background:#fff; color:#0f766e; border:0;">Consultar</button>
              </div>
              <div id="consulta-comanda-feedback" style="font-size:12px; min-height:18px; margin-top:10px; color:rgba(255,255,255,.82);"></div>
            </div>
          </section>
          <section class="full-card" style="padding:24px;">
            <div style="font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; font-weight:800;">Leitura rápida</div>
            <h3 style="margin:8px 0 6px; font-size:17px;">Ler QR Code com a câmera</h3>
            <p style="font-size:12px; color:var(--muted); line-height:1.5;">Use a câmera traseira do celular. O scanner apenas consulta a comanda; ele não libera a saída automaticamente.</p>
            <div id="consulta-qr-reader" style="width:100%; margin-top:14px; border-radius:12px; overflow:hidden;"></div>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button id="consulta-scanner-start" class="btn-sm btn-primary" type="button" style="flex:1;">Abrir câmera</button>
              <button id="consulta-scanner-stop" class="btn-sm btn-outline" type="button" style="flex:1;" disabled>Parar</button>
            </div>
            <div style="font-size:11px; color:var(--muted); margin-top:10px;">Se o navegador não liberar a câmera, digite o código manualmente.</div>
          </section>
        </div>
        <div id="consulta-comanda-result"></div>
      </main>
    </div>
  `;

  const input = document.getElementById('consulta-comanda-input');
  const submit = document.getElementById('consulta-comanda-submit');
  submit.addEventListener('click', () => consultarComanda(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') consultarComanda(input.value);
  });
  document.getElementById('consulta-scanner-start').addEventListener('click', startConsultaScanner);
  document.getElementById('consulta-scanner-stop').addEventListener('click', stopConsultaScanner);
}

async function consultarComanda(rawValue) {
  const input = document.getElementById('consulta-comanda-input');
  const feedback = document.getElementById('consulta-comanda-feedback');
  const result = document.getElementById('consulta-comanda-result');
  const submit = document.getElementById('consulta-comanda-submit');
  const value = String(rawValue || '').trim();
  if (!value) {
    feedback.textContent = 'Informe um código ou escaneie um QR Code.';
    return;
  }

  submit.disabled = true;
  feedback.textContent = 'Consultando comanda...';
  try {
    const detail = await api.get('/tables/tabs/lookup', { value });
    if (input) input.value = detail.publicCode || value;
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
  if (consultaScannerRunning) return;
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Scanner indisponível neste navegador. Digite o código manualmente.', 'error');
    return;
  }

  try {
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
    showToast(error.message || 'Não foi possível abrir a câmera.', 'error');
  }
}

async function stopConsultaScanner() {
  const start = document.getElementById('consulta-scanner-start');
  const stop = document.getElementById('consulta-scanner-stop');
  if (consultaScanner && consultaScannerRunning) {
    await consultaScanner.stop().catch(() => {});
    consultaScanner.clear().catch(() => {});
  }
  consultaScanner = null;
  consultaScannerRunning = false;
  if (start) start.disabled = false;
  if (stop) stop.disabled = true;
}

window.stopConsultaScanner = stopConsultaScanner;

function loadConsultaComanda() {
  stopConsultaScanner().catch(() => {});
  renderConsultaPage();
}
