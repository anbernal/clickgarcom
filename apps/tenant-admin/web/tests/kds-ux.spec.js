const { test, expect } = require('@playwright/test');

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

async function prepareKds(page, options = {}) {
  const role = options.role || 'KITCHEN';
  const orders = options.orders || [];
  const tables = options.tables || [];
  const payload = Buffer.from(JSON.stringify({ tenant_id: 'tenant-ux-test', role })).toString('base64url');
  await page.addInitScript(({ payloadValue, roleValue }) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify({
      token: `x.${payloadValue}.x`,
      user: { role: roleValue, tenant_name: 'Restaurante UX' },
    }));
    localStorage.removeItem('clickgarcom_kds_density');
  }, { payloadValue: payload, roleValue: role });

  await page.route('**/admin/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response = [];
    if (path.endsWith('/orders/operations/summary')) response = options.operationsSummary || { stations: [], stationSla: {} };
    else if (path.endsWith('/orders')) response = orders;
    else if (path.endsWith('/tables/requests/pending')) response = options.pendingRequests || [];
    else if (path.endsWith('/tables/waiter/chats/open')) response = options.chats || [];
    else if (path.endsWith('/tables/waiter/close-requests')) response = options.closeRequests || [];
    else if (path.endsWith('/tables/tabs/open')) response = options.tabs || [];
    else if (path.endsWith('/tables')) response = tables;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

test('modo estação respeita perfil, métricas e hierarquia touch', async ({ page }) => {
  const orders = [
    {
      id: 'pending-critical', status: 'PENDING', destination: 'KITCHEN', created_at: minutesAgo(9),
      batch_display_code: '1042', items: [
        { id: 'item-1', quantity: 3, menu_item_name: 'Filé à parmegiana', observations: 'SEM CEBOLA — alergia' },
      ],
    },
  ];
  await prepareKds(page, { role: 'KITCHEN', orders });
  await page.goto('/kds.html');
  await expect(page.locator('.order-card')).toHaveCount(1);

  await expect(page.locator('body')).toHaveClass(/station-mode/);
  await expect(page.locator('#kds-sidebar')).toBeHidden();
  await expect(page.locator('#stats-kitchen .stat-card')).toHaveCount(4);
  await expect(page.locator('.item-qty')).toHaveCSS('font-size', '30px');
  await expect(page.locator('.item-name')).toHaveCSS('font-size', '20px');
  await expect(page.locator('.action-primary')).toHaveCSS('height', '48px');
  await expect(page.locator('.item-observation')).toContainText('alergia');
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
