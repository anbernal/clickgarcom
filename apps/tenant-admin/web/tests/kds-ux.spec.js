const { test, expect } = require('@playwright/test');

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

async function prepareKds(page, options = {}) {
  const role = options.role || 'KITCHEN';
  const orders = options.orders || [];
  const deliveries = options.deliveries || [];
  const tables = options.tables || [];
  const payload = Buffer.from(JSON.stringify({ tenant_id: 'tenant-ux-test', role })).toString('base64url');
  await page.addInitScript(({ payloadValue, roleValue }) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify({
      token: `x.${payloadValue}.x`,
      user: { role: roleValue, tenant_name: 'Restaurante UX', delivery_enabled: true },
    }));
    localStorage.removeItem('clickgarcom_kds_density');
  }, { payloadValue: payload, roleValue: role });

  await page.route('**/admin/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response = [];
    if (path.endsWith('/auth/me')) response = { role, tenant_name: 'Restaurante UX', delivery_enabled: true };
    else if (path.endsWith('/orders/operations/summary')) response = options.operationsSummary || { stations: [], stationSla: {} };
    else if (path.endsWith('/deliveries')) response = { data: deliveries, page: 1, limit: 100, total: deliveries.length, has_more: false };
    else if (path.endsWith('/orders')) response = orders;
    else if (path.endsWith('/tables/requests/pending')) response = options.pendingRequests || [];
    else if (path.endsWith('/tables/waiter/chats/open')) response = options.chats || [];
    else if (path.endsWith('/tables/waiter/close-requests')) response = options.closeRequests || [];
    else if (path.endsWith('/tables/tabs/open') && route.request().method() === 'POST') response = options.openTabResponse || { id: 'new-tab', publicCode: 'NEW01' };
    else if (path.endsWith('/portal-access') && route.request().method() === 'POST') response = options.portalAccessResponse || {
      portalPath: '/portal.html#access_token=test-token',
      portalUrl: 'https://clickgarcom.test/portal.html#access_token=test-token',
      qrImagePath: '/api/portal/qr.png?access_token=test-token',
    };
    else if (path.endsWith('/tables/tabs/open')) response = options.tabs || [];
    else if (path.endsWith('/tables')) response = tables;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

test('Delivery recarrega pelo websocket e usa os itens da própria projeção', async ({ page }) => {
  const delivery = {
    id: '485971f1-e914-4de3-9d34-c4d69ca42470', batch_id: '1a876ad4-9f6b-4d11-8ea4-04fd2c4cda31',
    display_code: '482193', status: 'PENDING_RESTAURANT_ACCEPTANCE', version: 1,
    customer_name: 'Mariana', customer_phone: '5511999999999', formatted_address: 'Rua das Flores, 120, São Paulo/SP',
    customer_delivery_fee: 8.5, default_fulfillment_mode: 'OWN', created_at: minutesAgo(4), orders: [{
      id: '2f6f4d95-1869-4377-9183-9813697c4f7d', batch_id: '1a876ad4-9f6b-4d11-8ea4-04fd2c4cda31', status: 'PENDING',
      notes: 'Separar os molhos em potes',
      items: [{
        id: 'e8a6f4bf-1d7d-4f47-a0c2-3bf579aac468', quantity: 2, unit_price: 29.9,
        item_name_snapshot: 'Smash Clássico', menu_item_id: 'menu-1', observations: 'Sem cebola',
        selected_options: [{ groupName: 'Adicionais', optionName: 'Bacon extra', priceDelta: 5 }],
      }],
    }],
  };
  await prepareKds(page, { role: 'DISPATCHER', deliveries: [delivery] });
  await page.goto('/kds.html?panel=delivery');

  await expect(page.locator('#panel-delivery')).toHaveClass(/active/);
  await expect(page.locator('.delivery-card')).toContainText('2x Smash Clássico');
  await expect(page.locator('.delivery-card')).toContainText('R$ 59,80');
  await expect(page.locator('#topbar-title')).toHaveText('Fila operacional de Delivery');

  delivery.status = 'PREPARING';
  delivery.version = 2;
  delivery.preparing_at = minutesAgo(2);
  delivery.eta_seconds = 900;
  await page.evaluate(() => handleWSEvent({
    type: 'delivery.updated', timestamp: new Date().toISOString(), tenant_id: 'tenant-ux-test',
    data: { id: '485971f1-e914-4de3-9d34-c4d69ca42470', status: 'PREPARING', version: 2 },
  }));
  const preparingCard = page.locator('#col-d-preparing .delivery-card');
  await expect(preparingCard).toHaveCount(1);
  await expect(preparingCard).toContainText('Bacon extra');
  await expect(preparingCard).toContainText('Sem cebola');
  await expect(preparingCard).toContainText('Separar os molhos em potes');
  await expect(preparingCard).toContainText('Preparar estes itens');
  await expect(preparingCard).not.toContainText('Rua das Flores');
  await expect(preparingCard).not.toContainText('5511999999999');
});

test('Delivery reconcilia mudanças mesmo com websocket conectado', async ({ page }) => {
  const delivery = {
    id: 'delivery-reconcile', batch_id: 'batch-reconcile', display_code: '900101',
    status: 'PENDING_RESTAURANT_ACCEPTANCE', version: 1, created_at: minutesAgo(1),
    customer_name: 'Carlos', formatted_address: 'Rua Um, 10', default_fulfillment_mode: 'OWN',
    orders: [{ id: 'order-reconcile', batch_id: 'batch-reconcile', status: 'PENDING', items: [] }],
  };
  await prepareKds(page, { role: 'DISPATCHER', deliveries: [delivery] });
  await page.goto('/kds.html?panel=delivery');
  await expect(page.locator('#col-d-waiting .delivery-card')).toHaveCount(1);

  delivery.status = 'PREPARING';
  delivery.version = 2;
  delivery.updated_at = new Date().toISOString();
  delivery.preparing_at = new Date().toISOString();
  await expect(page.locator('#col-d-preparing .delivery-card')).toHaveCount(1, { timeout: 6500 });
});

test('Delivery aceito automaticamente entra em preparo e alerta apenas uma vez', async ({ page }) => {
  const delivery = {
    id: 'delivery-auto-accepted', batch_id: 'batch-auto', display_code: '900202',
    status: 'PREPARING', acceptance_mode: 'AUTO', version: 2,
    created_at: minutesAgo(1), accepted_at: minutesAgo(1), preparing_at: minutesAgo(1), eta_seconds: 1800,
    customer_name: 'Bianca', formatted_address: 'Rua Dois, 20', default_fulfillment_mode: 'OWN',
    orders: [{ id: 'order-auto', batch_id: 'batch-auto', status: 'PENDING', items: [{
      id: 'item-auto', quantity: 1, unit_price: 24.9, item_name_snapshot: 'Pizza da casa', menu_item_id: 'menu-auto',
    }] }],
  };
  await prepareKds(page, { role: 'DISPATCHER', deliveries: [delivery] });
  await page.goto('/kds.html?panel=delivery');

  const card = page.locator('#col-d-preparing .delivery-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveClass(/delivery-card--auto-accepted/);
  await expect(card).toContainText('Preparo iniciado automaticamente');
  await expect(page.locator('.toast-title')).toContainText('Pedido aceito automaticamente');
  const columnColors = await page.locator('#panel-delivery .delivery-grid .order-column').evaluateAll((columns) => columns.map((column) => getComputedStyle(column).backgroundColor));
  expect(columnColors[0]).not.toBe(columnColors[1]);

  await page.reload();
  await expect(page.locator('#col-d-preparing .delivery-card')).toHaveCount(1);
  await expect(page.locator('.toast-title')).toHaveCount(0);
});

test('modo estação respeita perfil, métricas e hierarquia touch', async ({ page }) => {
  const orders = [
    {
      id: 'pending-critical', status: 'PENDING', destination: 'KITCHEN', created_at: minutesAgo(9),
      batch_display_code: '1042', items: [
        { id: 'item-1', quantity: 3, menu_item_name: 'Filé à parmegiana', observations: 'SEM CEBOLA — alergia' },
        { id: 'item-2', quantity: 1, menu_item_name: 'Arroz branco', observations: '<nil>' },
      ],
    },
  ];
  await prepareKds(page, { role: 'KITCHEN', orders });
  await page.goto('/kds.html');
  await expect(page.locator('.order-card')).toHaveCount(1);

  await expect(page.locator('body')).toHaveClass(/station-mode/);
  await expect(page.locator('#kds-sidebar')).toBeHidden();
  await expect(page.locator('#stats-kitchen .stat-card')).toHaveCount(4);
  await expect(page.locator('.item-qty').first()).toHaveCSS('font-size', '30px');
  await expect(page.locator('.item-name').first()).toHaveCSS('font-size', '20px');
  await expect(page.locator('.action-primary')).toHaveCSS('height', '48px');
  await expect(page.locator('.item-observation')).toContainText('alergia');
  await expect(page.locator('.item-observation')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('<nil>');
  await expect(page.locator('#exit-station-mode')).toBeHidden();
});

test('matriz de acesso cobre Bar, Garçom, Gerente e Admin', async ({ browser }) => {
  const scenarios = [
    { role: 'BAR', path: '/kds.html?panel=salao', panel: 'bar', station: true, exitVisible: false },
    { role: 'WAITER', path: '/kds.html', panel: 'salao', station: false, exitVisible: false },
    { role: 'MANAGER', path: '/kds.html?panel=bar&mode=station', panel: 'bar', station: true, exitVisible: true },
    { role: 'ADMIN', path: '/kds.html?panel=kitchen', panel: 'kitchen', station: false, exitVisible: false },
  ];

  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await prepareKds(page, { role: scenario.role });
    await page.goto(scenario.path);
    await expect(page.locator(`#panel-${scenario.panel}`)).toHaveClass(/active/);
    if (scenario.station) await expect(page.locator('body')).toHaveClass(/station-mode/);
    else await expect(page.locator('body')).not.toHaveClass(/station-mode/);
    if (scenario.exitVisible) await expect(page.locator('#exit-station-mode')).toBeVisible();
    else await expect(page.locator('#exit-station-mode')).toBeHidden();
    await context.close();
  }
});

test('salão separa responsabilidades, preserva aba e prioriza pendências', async ({ page }) => {
  const tables = [
    { id: 'table-1', number: '12', capacity: 4, status: 'OCCUPIED', activeTabs: [{ id: 'tab-1' }] },
    { id: 'table-2', number: '07', capacity: 2, status: 'AVAILABLE', activeTabs: [] },
    { id: 'table-3', number: '18', capacity: 8, status: 'CLEANING', activeTabs: [] },
  ];
  await prepareKds(page, {
    role: 'WAITER',
    tables,
    orders: [{
      id: 'ready-1', tab_id: 'tab-1', status: 'READY', destination: 'KITCHEN', created_at: minutesAgo(20),
      ready_at: minutesAgo(9), batch_display_code: '2014', items: [{ id: 'dish-1', quantity: 2, menu_item_name: 'Risoto' }],
    }],
    pendingRequests: [{ id: 'request-1', userPhone: '5511999987654', paxCount: 4, createdAt: minutesAgo(6) }],
    closeRequests: [{ id: 'close-1', tableNumber: '12', amountDue: 100, createdAt: minutesAgo(2) }],
    chats: [
      { id: 'answered', status: 'OPEN', userPhone: '1111', lastSenderType: 'STAFF', lastMessageAt: minutesAgo(1) },
      { id: 'waiting', status: 'OPEN', userPhone: '2222', lastSenderType: 'CUSTOMER', unreadCount: 1, lastMessageAt: minutesAgo(4) },
    ],
    tabs: [{ id: 'tab-1', publicCode: 'CMD-12', tableNumber: '12', total: 100 }],
  });
  await page.goto('/kds.html');
  await expect(page.locator('#panel-salao')).toHaveClass(/active/);
  await expect(page.locator('#panel-salao > .stats-row')).toHaveCount(0);
  await expect(page.locator('#salao-now-list .salao-now-card')).toHaveCount(3);
  await expect(page.locator('#salao-now-list .salao-now-location').first()).toContainText('Mesa 12');

  await page.getByRole('tab', { name: /Comandas/ }).click();
  await page.evaluate(() => renderSalao());
  await expect(page.getByRole('tab', { name: /Comandas/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Mesas/ }).click();
  await expect(page.locator('.table-status-badge')).toHaveText(['Livre', 'Ocupada', 'Em limpeza']);
  await page.getByRole('tab', { name: /Conversas/ }).click();
  await expect(page.locator('#salao-chat-list .ready-item-title').first()).toContainText('2222');
});

test('comandas mantém somente a página visível com 300 registros e campos padronizados', async ({ page }) => {
  const tabs = Array.from({ length: 300 }, (_, index) => ({
    id: `tab-${index + 1}`,
    publicCode: `CMD-${String(index + 1).padStart(4, '0')}`,
    tableNumber: index % 2 === 0 ? String((index % 40) + 1) : null,
    total: (index + 1) * 3.5,
    userPhone: `551199${String(index).padStart(6, '0')}`,
    customerName: `Cliente ${index + 1}`,
    customerInstagram: `cliente${index + 1}`,
    openedAt: minutesAgo(index + 1),
  }));
  await prepareKds(page, { role: 'WAITER', tabs });
  await page.goto('/kds.html');
  await page.getByRole('tab', { name: /Comandas/ }).click();

  await expect(page.locator('.kds-comandas-table-row')).toHaveCount(25);
  await expect(page.locator('#kds-comandas-results-summary')).toContainText('1–25');
  await expect(page.locator('.kds-comandas-page-status')).toContainText('1 de 12');
  await expect(page.locator('#kds-comandas-search')).toHaveCSS('font-family', /Sora/);
  await expect(page.locator('#kds-comandas-search')).toHaveCSS('min-height', '40px');

  await page.locator('#kds-comandas-search').fill('CMD-0150');
  await expect(page.locator('.kds-comandas-table-row')).toHaveCount(1);
  await expect(page.locator('.kds-comandas-code')).toContainText('CMD-0150');

  await page.locator('#kds-comandas-search').fill('');
  await page.locator('#kds-comandas-location-filter').selectOption('counter');
  await expect(page.locator('#kds-comandas-results-summary')).toContainText('150 de 300');
  await expect(page.locator('.kds-comandas-table-row')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.setViewportSize({ width: 720, height: 900 });
  await expect(page.locator('.kds-comandas-table-head')).toBeHidden();
  await expect(page.locator('.kds-comandas-btn.primary').first()).toHaveCSS('min-height', '44px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('salão permite abrir uma nova comanda com mesa e registra os dados do atendimento', async ({ page }) => {
  const requests = [];
  await prepareKds(page, {
    role: 'WAITER',
    tables: [{ id: 'table-12', number: '12', capacity: 4, status: 'AVAILABLE', activeTabs: [] }],
    tabs: [],
    openTabResponse: { id: 'tab-new', publicCode: 'A1B2C' },
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/tables/tabs/open') && request.method() === 'POST') requests.push(request.postDataJSON());
  });
  await page.goto('/kds.html?panel=salao');
  await page.getByRole('tab', { name: /Comandas/ }).click();
  await page.getByRole('button', { name: /Nova comanda/ }).click();
  await expect(page.locator('#newSalaoTabModal')).toHaveClass(/open/);
  await expect(page.locator('#new-salao-tab-table option')).toHaveText(['Sem mesa', 'Mesa 12 · 4 lugares']);
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  const phoneBox = await page.locator('#new-salao-tab-phone').boundingBox();
  const instagramBox = await page.locator('#new-salao-tab-instagram').boundingBox();
  expect(Math.abs(phoneBox.width - instagramBox.width)).toBeLessThan(1);
  await page.locator('#new-salao-tab-table').selectOption('table-12');
  await page.locator('#new-salao-tab-phone').fill('11999999999');
  await expect(page.locator('#new-salao-tab-phone')).toHaveValue('(11) 99999-9999');
  await page.locator('#new-salao-tab-instagram').fill('@cliente.teste');
  await page.getByRole('button', { name: /Abrir comanda/ }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    table_id: 'table-12',
    user_phone: '(11) 99999-9999',
    customer_instagram: '@cliente.teste',
  });
  await expect(page.locator('#newSalaoTabModal')).not.toHaveClass(/open/);
});

test('salão disponibiliza QR e link seguro do portal nas ações da comanda', async ({ page }) => {
  const portalRequests = [];
  await prepareKds(page, {
    role: 'WAITER',
    tabs: [{ id: 'tab-portal', publicCode: 'CMD-PORTAL', total: 20 }],
    portalAccessResponse: {
      portalPath: '/portal.html#access_token=portal-token',
      portalUrl: 'https://clickgarcom.test/portal.html#access_token=portal-token',
      qrImagePath: '/api/portal/qr.png?access_token=portal-token',
    },
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/tables/tabs/tab-portal/portal-access') && request.method() === 'POST') {
      portalRequests.push(request.postDataJSON());
    }
  });

  await page.goto('/kds.html?panel=salao');
  await page.getByRole('tab', { name: /Comandas/ }).click();
  await page.locator('summary[aria-label="Mais ações da comanda CMD-PORTAL"]').click();
  await page.getByRole('button', { name: 'QR do portal' }).click();
  await expect.poll(() => portalRequests.length).toBe(1);
  await expect(page.locator('#manualTabPortalModal')).toBeVisible();
  await expect(page.locator('#manual-tab-portal-link')).toHaveValue('https://clickgarcom.test/portal.html#access_token=portal-token');
  await expect(page.locator('.manual-tab-portal-qr')).toHaveAttribute('src', '/api/portal/qr.png?access_token=portal-token');
  await expect(page.getByRole('link', { name: 'Testar portal' })).toHaveAttribute('href', '/portal.html#access_token=portal-token');
});

test('salão permite editar os dados e finalizar uma comanda com baixa manual rastreável', async ({ page }) => {
  const mutations = [];
  await prepareKds(page, {
    role: 'WAITER',
    tables: [
      { id: 'table-current', number: '12', capacity: 4, status: 'OCCUPIED', activeTabs: [{ id: 'tab-managed' }] },
      { id: 'table-target', number: '18', capacity: 6, status: 'AVAILABLE', activeTabs: [] },
    ],
    tabs: [{
      id: 'tab-managed', publicCode: 'CMD-42', tableId: 'table-current', tableNumber: '12',
      userPhone: '5511988887777', customerInstagram: '@cliente.antigo', total: 52, paidAmount: 0,
    }],
  });
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/tables/tabs/tab-managed/') && ['PATCH', 'POST'].includes(request.method())) {
      mutations.push({ method: request.method(), path, body: request.postDataJSON() });
    }
  });

  await page.goto('/kds.html?panel=salao');
  await page.getByRole('tab', { name: /Comandas/ }).click();
  await page.locator('summary[aria-label="Mais ações da comanda CMD-42"]').click();
  await page.getByRole('button', { name: 'Editar dados' }).click();
  await expect(page.locator('#manualTabDataModal')).toBeVisible();
  await expect(page.locator('#manualTabDataModal .modal-actions')).toHaveCSS('margin-top', '22px');
  await expect(page.locator('#manual-tab-data-phone')).toHaveValue('+55 (11) 98888-7777');
  await page.locator('#manual-tab-data-phone').fill('11977776666');
  await expect(page.locator('#manual-tab-data-phone')).toHaveValue('(11) 97777-6666');
  await page.locator('#manual-tab-data-instagram').fill('@cliente.novo');
  await page.locator('#manual-tab-data-table').selectOption('table-target');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect.poll(() => mutations.filter((mutation) => mutation.method === 'PATCH').length).toBe(2);
  expect(mutations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      method: 'PATCH', path: '/admin/api/tables/tabs/tab-managed/customer',
      body: { user_phone: '(11) 97777-6666', customer_instagram: '@cliente.novo' },
    }),
    expect.objectContaining({
      method: 'PATCH', path: '/admin/api/tables/tabs/tab-managed/table',
      body: { table_id: 'table-target' },
    }),
  ]));
  await expect(page.locator('#manualTabDataModal')).toBeHidden();

  await page.locator('summary[aria-label="Mais ações da comanda CMD-42"]').click();
  await page.getByRole('button', { name: 'Finalizar comanda' }).click();
  await expect(page.locator('#manualTabFinalizeModal')).toBeVisible();
  await expect(page.locator('#manualTabFinalizeModal .modal-actions')).toHaveCSS('margin-top', '22px');
  await expect(page.locator('#manual-tab-finalize-error')).toBeHidden();
  await page.getByRole('button', { name: 'Registrar baixa e finalizar' }).click();
  await expect(page.locator('#manual-tab-finalize-error')).toContainText('Informe a forma de pagamento');
  await page.locator('#manual-tab-finalize-method').selectOption('CASH');
  await page.getByRole('button', { name: 'Registrar baixa e finalizar' }).click();
  await expect.poll(() => mutations.filter((mutation) => mutation.path.endsWith('/finalize')).length).toBe(1);
  expect(mutations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      method: 'POST', path: '/admin/api/tables/tabs/tab-managed/finalize',
      body: { manual_payment_method: 'CASH' },
    }),
  ]));
  await expect(page.locator('#manualTabFinalizeModal')).toBeHidden();
});

test('comprovante não fiscal usa o snapshot cadastral completo do restaurante', async ({ page }) => {
  await prepareKds(page, { role: 'WAITER' });
  await page.goto('/kds.html');

  const html = await page.evaluate(() => window.ClickGarcomReceipt.buildHtml({
    documentNumber: 'OP-20260802-CMD42-A1B2',
    issuedAt: '2026-08-02T18:30:00.000Z',
    issuedByUserName: 'Maria Garçonete',
    contentHash: 'abcdef0123456789abcdef0123456789',
    snapshot: {
      publicCode: 'CMD-42',
      tableNumber: '12',
      restaurant: {
        name: 'Restaurante Teste & Filhos',
        document: '24.696.391/0001-99',
        address: 'Rua Jacarandá, 70 — Monte Verde, Santa Cruz do Sul/RS',
        phone: '(51) 99999-0000',
      },
      customer: { phone: '(51) 98888-0000' },
      items: [{
        quantity: 2,
        name: 'Coca-Cola 2L',
        unitPrice: 8,
        lineSubtotal: 16,
        observations: 'Sem gelo',
      }, {
        quantity: 1,
        name: 'Guardanapo',
        unitPrice: 0,
        lineSubtotal: 0,
        observations: '<nil>',
      }],
      financial: { subtotal: 16, serviceFee: 1.6, total: 17.6, paidAmount: 17.6, amountDue: 0 },
      payments: [{ status: 'CONFIRMED', methodLabel: 'Cartão de crédito', amount: 17.6 }],
    },
  }));

  expect(html).toContain('Restaurante Teste &amp; Filhos');
  expect(html).toContain('CPF/CNPJ: 24.696.391/0001-99');
  expect(html).toContain('Rua Jacarandá, 70 — Monte Verde, Santa Cruz do Sul/RS');
  expect(html).toContain('COMPROVANTE OPERACIONAL DE CONSUMO');
  expect(html).toContain('DOCUMENTO NÃO FISCAL');
  expect(html).toContain('Coca-Cola 2L');
  expect(html).toContain('Cartão de crédito');
  expect(html).toContain('Emitido por: Maria Garçonete');
  expect(html).toContain('Este documento não possui validade fiscal.');
  expect(html).not.toContain('Obs.: &lt;nil&gt;');
  expect(html).not.toContain('NFC-e');
});

test('resumo local mantém opções separadas, ignora anulação e suporta 60 pedidos', async ({ page }) => {
  const orders = Array.from({ length: 60 }, (_, index) => ({
    id: `order-${index}`,
    status: 'ACCEPTED',
    destination: 'KITCHEN',
    created_at: minutesAgo(index + 1),
    accepted_at: minutesAgo(index + 1),
    batch_display_code: String(3000 + index),
    items: [
      { id: `cheddar-${index}`, quantity: 2, menu_item_name: 'Hambúrguer', selected_options: [{ group_name: 'Queijo', option_name: 'Cheddar' }] },
      { id: `bacon-${index}`, quantity: 1, menu_item_name: 'Hambúrguer', selected_options: [{ group_name: 'Adicional', option_name: 'Bacon' }] },
      { id: `void-${index}`, quantity: 9, menu_item_name: 'Hambúrguer', selected_options: [{ group_name: 'Queijo', option_name: 'Cheddar' }], status: 'VOIDED' },
    ],
  }));
  await prepareKds(page, { role: 'KITCHEN', orders });
  await page.goto('/kds.html');
  await expect(page.locator('.order-card')).toHaveCount(60);
  await page.getByRole('button', { name: 'Resumo da bancada' }).click();

  await expect(page.locator('.production-summary-qty')).toHaveText(['120x', '60x']);
  await expect(page.locator('.production-summary-total')).toHaveText('180 unidade(s)');
  expect(await page.locator('.order-card').evaluateAll((cards) => new Set(cards.map((card) => card.dataset.id)).size)).toBe(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
