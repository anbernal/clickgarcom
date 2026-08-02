(function attachClickGarcomReceipt(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function dateTime(value) {
    if (!value) return 'Não informada';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(date);
  }

  function selectedOptionsLabel(item) {
    const options = Array.isArray(item?.selectedOptions)
      ? item.selectedOptions
      : (Array.isArray(item?.selected_options) ? item.selected_options : []);
    return options.map((option) => {
      const group = String(option?.groupName || option?.group_name || '').trim();
      const name = String(option?.optionName || option?.option_name || option?.name || '').trim();
      if (!name) return '';
      return group ? `${group}: ${name}` : name;
    }).filter(Boolean).join(' · ');
  }

  function isConfirmedPayment(payment) {
    const status = String(payment?.status || '').trim().toUpperCase();
    const attemptStatus = String(payment?.latestAttemptStatus || payment?.latest_attempt_status || '').trim().toUpperCase();
    return status === 'CONFIRMED' || attemptStatus === 'APPROVED';
  }

  function paymentLabel(payment) {
    return String(
      payment?.methodLabel ||
      payment?.method_label ||
      payment?.method ||
      payment?.paymentType ||
      'Pagamento'
    ).trim();
  }

  function buildHtml(documentData) {
    const snapshot = documentData?.snapshot || {};
    const restaurant = snapshot.restaurant || snapshot.establishment || {};
    const financial = snapshot.financial || {};
    const customer = snapshot.customer || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const payments = (Array.isArray(snapshot.payments) ? snapshot.payments : []).filter(isConfirmedPayment);
    const restaurantName = String(restaurant.name || 'Restaurante').trim() || 'Restaurante';
    const documentNumber = String(documentData?.documentNumber || snapshot.documentNumber || '').trim();
    const issuedAt = documentData?.issuedAt || snapshot.issuedAt;
    const issuedBy = String(documentData?.issuedByUserName || snapshot.issuedByUserName || '').trim();
    const tableLabel = snapshot.tableNumber ? `Mesa ${snapshot.tableNumber}` : 'Atendimento sem mesa';
    const customerLabel = String(customer.name || customer.phone || customer.instagram || '').trim();
    const hash = String(documentData?.contentHash || '').trim();

    const itemRows = items.map((item) => {
      const quantity = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unitPrice ?? item?.unit_price ?? 0);
      const lineTotal = Number(item?.lineSubtotal ?? item?.line_subtotal ?? quantity * unitPrice);
      const options = selectedOptionsLabel(item);
      const observations = String(item?.observations || '').trim();
      return `
        <div class="receipt-item">
          <div class="receipt-item-main">
            <span class="qty">${escapeHtml(quantity)}</span>
            <span class="description">${escapeHtml(item?.name || 'Item')}</span>
            <span class="unit">${escapeHtml(money(unitPrice))}</span>
            <span class="amount">${escapeHtml(money(lineTotal))}</span>
          </div>
          ${options ? `<div class="item-detail">Opções: ${escapeHtml(options)}</div>` : ''}
          ${observations ? `<div class="item-detail">Obs.: ${escapeHtml(observations)}</div>` : ''}
        </div>`;
    }).join('');

    const paymentRows = payments.map((payment) => `
      <div class="receipt-line">
        <span>${escapeHtml(paymentLabel(payment))}</span>
        <span>${escapeHtml(money(payment?.amount || 0))}</span>
      </div>`).join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Comprovante ${escapeHtml(snapshot.publicCode || documentNumber)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}
    body{width:72mm;margin:0 auto;padding:4mm 2mm;font:10.5px/1.35 Arial,sans-serif}
    .center{text-align:center}.restaurant-name{font-size:15px;font-weight:800;line-height:1.2;margin-bottom:3px}
    .restaurant-data{font-size:9.5px;overflow-wrap:anywhere}.separator{border:0;border-top:1px dashed #111;margin:7px 0}
    .document-title{font-size:12px;font-weight:800;line-height:1.3}.non-fiscal{font-size:11px;font-weight:800;margin-top:2px}
    .receipt-line{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.receipt-line span:last-child{text-align:right}
    .meta{font-size:9.5px}.items-header,.receipt-item-main{display:grid;grid-template-columns:8mm minmax(0,1fr) 17mm 17mm;gap:1mm;align-items:start}
    .items-header{font-size:8px;font-weight:800;border-bottom:1px solid #111;padding-bottom:2px}
    .receipt-item{padding:4px 0;border-bottom:1px dotted #999}.qty,.unit,.amount{text-align:right;font-variant-numeric:tabular-nums}
    .description{font-weight:700;overflow-wrap:anywhere}.item-detail{padding-left:9mm;font-size:8.5px;color:#333;overflow-wrap:anywhere}
    .total{font-size:14px;font-weight:800;border-top:1px dashed #111;padding-top:6px;margin-top:6px}
    .section-title{font-size:9px;font-weight:800;text-transform:uppercase;margin:7px 0 3px}.footer{font-size:8.5px;text-align:center;overflow-wrap:anywhere}
    @media print{@page{size:80mm auto;margin:0}body{width:76mm;padding:4mm 2mm}}
  </style>
</head>
<body>
  <header class="center">
    <div class="restaurant-name">${escapeHtml(restaurantName)}</div>
    ${restaurant.document ? `<div class="restaurant-data">CPF/CNPJ: ${escapeHtml(restaurant.document)}</div>` : ''}
    ${restaurant.address ? `<div class="restaurant-data">${escapeHtml(restaurant.address)}</div>` : ''}
    ${restaurant.phone ? `<div class="restaurant-data">Contato: ${escapeHtml(restaurant.phone)}</div>` : ''}
  </header>
  <hr class="separator">
  <section class="center">
    <div class="document-title">COMPROVANTE OPERACIONAL DE CONSUMO</div>
    <div class="non-fiscal">DOCUMENTO NÃO FISCAL</div>
  </section>
  <hr class="separator">
  ${documentNumber ? `<div class="receipt-line meta"><span>Nº do comprovante</span><strong>${escapeHtml(documentNumber)}</strong></div>` : ''}
  <div class="receipt-line meta"><span>Comanda</span><strong>${escapeHtml(snapshot.publicCode || '-')}</strong></div>
  <div class="receipt-line meta"><span>Atendimento</span><strong>${escapeHtml(tableLabel)}</strong></div>
  <div class="receipt-line meta"><span>Emissão</span><strong>${escapeHtml(dateTime(issuedAt))}</strong></div>
  ${customerLabel ? `<div class="receipt-line meta"><span>Cliente</span><strong>${escapeHtml(customerLabel)}</strong></div>` : ''}
  <hr class="separator">
  <div class="items-header"><span>QTD</span><span>DESCRIÇÃO</span><span class="unit">UNIT.</span><span class="amount">TOTAL</span></div>
  ${itemRows || '<div class="center meta" style="padding:8px 0">Nenhum item válido.</div>'}
  <div class="receipt-line"><span>Subtotal</span><span>${escapeHtml(money(financial.subtotal || 0))}</span></div>
  <div class="receipt-line"><span>Taxa de serviço</span><span>${escapeHtml(money(financial.serviceFee || 0))}</span></div>
  <div class="receipt-line total"><span>TOTAL</span><span>${escapeHtml(money(financial.total || 0))}</span></div>
  <div class="section-title">Pagamentos</div>
  ${paymentRows || '<div class="receipt-line"><span>Pagamento ainda não registrado</span><span>—</span></div>'}
  <div class="receipt-line"><span>Valor pago</span><strong>${escapeHtml(money(financial.paidAmount || 0))}</strong></div>
  <div class="receipt-line"><span>Saldo</span><strong>${escapeHtml(money(financial.amountDue || 0))}</strong></div>
  <hr class="separator">
  ${issuedBy ? `<div class="footer">Emitido por: ${escapeHtml(issuedBy)}</div>` : ''}
  ${hash ? `<div class="footer">Identificação: ${escapeHtml(hash.slice(0, 24))}</div>` : ''}
  <div class="footer"><strong>Este documento não possui validade fiscal.</strong></div>
</body>
</html>`;
  }

  function openWindow(features) {
    const win = global.open('', '_blank', features || 'width=420,height=760');
    if (!win) throw new Error('Permita pop-ups para imprimir o comprovante.');
    win.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Preparando comprovante</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparando comprovante...</body></html>');
    win.document.close();
    return win;
  }

  function print(documentData, options) {
    const settings = options || {};
    const win = settings.targetWindow || openWindow(settings.features);
    if (win.closed) throw new Error('A janela de impressão foi fechada.');
    win.document.open();
    win.document.write(buildHtml(documentData));
    win.document.close();
    win.focus();
    global.setTimeout(function openBrowserPrintDialog() { win.print(); }, settings.delay ?? 250);
  }

  global.ClickGarcomReceipt = Object.freeze({ buildHtml, openWindow, print });
})(window);
