const { test, expect } = require('@playwright/test');

function deliveryFixture(overrides = {}) {
  return {
    id: overrides.id || '7bc632f0-1641-43f4-b830-6e01dfe37be8', tenant_id: 'tenant-delivery-test',
    batch_id: '981251d2-21b7-4006-acaa-d4d0d4e3a8ae', tab_id: 'a3f681a2-b8df-4fc6-99f1-752943393767',
    display_code: overrides.display_code || '482193', status: overrides.status || 'PENDING_RESTAURANT_ACCEPTANCE',
    version: overrides.version || 1, service_type: 'DELIVERY', customer_name: 'Mariana de Oliveira Santos',
    formatted_address: 'Rua das Flores, 120, Vila Madalena, São Paulo, SP', destination_lat: -23.5565,
    destination_lng: -46.692, delivery_fee: 8.5, assigned_driver_id: overrides.assigned_driver_id || null,
    eta_seconds: 1320, accepted_at: null, ready_for_dispatch_at: null, picked_up_at: null,
    in_transit_at: null, arrived_at: null, delivered_at: null,
    created_at: new Date(Date.now() - 13 * 60000).toISOString(), updated_at: new Date(Date.now() - 70000).toISOString(),
    ...overrides,
  };
}

async function prepareAdmin(page, deliveries = [deliveryFixture()], role = 'ADMIN', capacityPayload = null) {
  const payload = Buffer.from(JSON.stringify({ tenant_id: 'tenant-delivery-test', role })).toString('base64url');
  await page.addInitScript(({ payloadValue, roleValue }) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify({
      token: `x.${payloadValue}.x`, user: { id: 'admin-1', name: 'Ana Admin', role: roleValue, tenant_name: 'Restaurante UX', delivery_enabled: true },
    }));
  }, { payloadValue: payload, roleValue: role });
  await page.route('**/admin/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    let body = {};
    if (path.endsWith('/auth/me')) body = { id: 'admin-1', name: 'Ana Admin', role, tenant_name: 'Restaurante UX', isOpen: true, delivery_enabled: true };
    else if (path.endsWith('/auth/users')) body = { users: [{ id: 'e822ee57-2261-44d8-866d-280e695080de', name: 'Rafael Entregador', role: 'DRIVER', active: true }] };
    else if (path.endsWith('/deliveries/drivers/eligible')) body = { drivers: [{ id: 'e822ee57-2261-44d8-866d-280e695080de', name: 'Rafael Entregador', availability: 'AVAILABLE', active_deliveries: 0 }] };
    else if (path.endsWith('/delivery/settings') && request.method() === 'GET') body = { settings: { enabled: true, timezone: 'America/Sao_Paulo', origin: { lat: -23.55, lng: -46.63 }, origin_address: { postal_code: '01311-000', street: 'Rua Augusta', address_number: '120', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', confirmed: true, geocode_provider: 'FAKE', geocode_quality: 'ROOFTOP' }, service_area: { mode: 'RADIUS', radius_km: 8 }, auto_accept: { enabled: true, require_confirmed_payment: true, max_active_deliveries: 8, windows: [{ days: ['MON','TUE'], start: '18:00', end: '23:30' }] }, fees: { mode: 'FIXED', fixed_fee: 8.5, bands: [] } } };
    else if (path.endsWith('/delivery/settings') && request.method() === 'PUT') body = { status: 'updated', settings: JSON.parse(request.postData() || '{}') };
    else if (path.endsWith('/delivery/providers/IFOOD/test-connection')) body = { ok: true, connection_status: 'CONNECTED', adapter: 'FAKE' };
    else if (path.endsWith('/delivery/capacity/reservations')) body = { tenant_id: 'tenant-delivery-test', declared_capacity: 8, reservations: [] };
    else if (path.endsWith('/delivery/capacity')) body = capacityPayload || { tenant_id: 'tenant-delivery-test', declared_capacity: 8, reserved: 0, available: 8, hold_minutes: 15 };
    else if (path.endsWith('/delivery/addresses/postal-code-lookup')) body = { postal_code: '01311000', street: 'Rua Augusta', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', provider: 'FAKE', status: 'FOUND' };
    else if (path.endsWith('/delivery/addresses/geocode')) body = { latitude: -23.55, longitude: -46.63, geocode_provider: 'FAKE', geocode_quality: 'ROOFTOP' };
    else if (path.endsWith('/delivery/addresses/reverse-geocode')) body = { latitude: -23.55052, longitude: -46.633308, formatted_address: 'Rua Augusta, 120, Consolação, São Paulo - SP, 01311-000', street: 'Rua Augusta', address_number: '120', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', postal_code: '01311-000', geocode_provider: 'FAKE', geocode_quality: 'APPROXIMATE', requires_confirmation: true };
    else if (path.endsWith('/delivery/customers/resolve')) body = { id: 'customer-1', phone_masked: '+55 11 *****-9999' };
    else if (/\/delivery\/customers\/[^/]+\/addresses$/.test(path)) body = request.method() === 'GET' ? [] : { id: 'address-1', label: 'Casa' };
    else if (path.endsWith('/deliveries/operations/summary')) body = { counts: { PENDING_RESTAURANT_ACCEPTANCE: 1, READY_FOR_DISPATCH: 1 }, active_total: deliveries.length };
    else if (path.endsWith('/deliveries/reports/summary.csv')) body = 'metric,value\ntotal,1\n';
    else if (path.endsWith('/deliveries/reports/summary')) body = { kpis: { total: 1, delivered: 1, failed_or_returned: 0, canceled: 0, override: 0, without_eta: 0 }, financial: { customer_delivery_fee: 8.5, quoted_cost: 7, actual_cost: 7.5, restaurant_adjustment: 0, provider_variance: 0.5 }, by_status: [{ status: 'DELIVERED', count: 1 }] };
    else if (/\/deliveries\/[0-9a-f-]+\/(accept|reject|cancel|assign|start-return|complete-return|override-delivery|tracking-link)$/.test(path)) body = path.endsWith('/tracking-link') ? { tracking_url: '/tracking.html#token=test', expires_at: new Date(Date.now() + 86400000).toISOString() } : deliveryFixture({ status: 'ACCEPTED', version: 2 });
    else if (/\/deliveries\/[0-9a-f-]+\/own\/(start|ready|complete)$/.test(path)) body = deliveryFixture({ status: path.endsWith('/complete') ? 'DELIVERED' : 'IN_TRANSIT', version: 8 });
    else if (/\/deliveries\/[0-9a-f-]+\/timeline$/.test(path)) body = { delivery: deliveries.find((item) => path.includes(item.id)) || deliveries[0], events: [], fulfillment: { mode: 'EXTERNAL', provider: 'IFOOD', status: 'COURIER_ASSIGNED', quoted_cost: 9.25, actual_cost: null, tracking_url: 'https://tracking.invalid/demo', cycle_number: 1 }, attempts: [{ attempt_number: 1, status: 'SUCCEEDED', scheduled_at: new Date().toISOString(), finished_at: new Date().toISOString(), error_code: null }] };
    else if (/\/deliveries\/[0-9a-f-]+$/.test(path)) body = deliveries.find((item) => path.endsWith(item.id)) || deliveries[0];
    else if (path.endsWith('/deliveries')) body = { data: deliveries, page: 1, limit: 60, total: deliveries.length, has_more: false };
    else if (path.endsWith('/deliveries/quote')) body = { delivery_fee: 8.5, fee_rule: { mode: 'FIXED' }, distance_meters: 4000 };
    else body = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('painel apresenta prioridade, privacidade e ações idempotentes', async ({ page }) => {
  await prepareAdmin(page, [deliveryFixture(), deliveryFixture({ id: 'ada778e2-18a4-47ec-a535-102ace7bdb74', display_code: '774201', status: 'READY_FOR_DISPATCH' })]);
  const commandRequests = [];
  page.on('request', (request) => { if (request.url().endsWith('/accept')) commandRequests.push(request); });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await expect(page.locator('.delivery-column')).toHaveCount(5);
  await expect(page.locator('.delivery-card')).toHaveCount(2);
  await expect(page.locator('.delivery-card--urgent')).toHaveCount(1);
  await expect(page.locator('.delivery-card').first()).toContainText('Mariana d. O. S.');
  await expect(page.locator('.delivery-card').first()).not.toContainText('Rua das Flores');
  await page.getByRole('button', { name: /Abrir entrega 482193/ }).click();
  await expect(page.locator('#modal-content')).toContainText('Rua das Flores, 120');
  await expect(page.locator('#modal-content')).toContainText('Histórico de tentativas');
  await expect(page.locator('#modal-content')).toContainText('R$9,25');
  await page.getByRole('button', { name: /Aceitar entrega/ }).click();
  await expect.poll(() => commandRequests.length).toBe(1);
  expect(commandRequests[0].headers()['idempotency-key']).toBeTruthy();
});

test('configuração preserva janelas e valida ativação', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await expect(page.locator('#delivery-windows .delivery-window')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Janela' }).click();
  await expect(page.locator('#delivery-windows .delivery-window')).toHaveCount(2);
  await page.locator('#delivery-setting-capacity').fill('12');
  await expect(page.locator('#delivery-windows .delivery-window')).toHaveCount(2);
  await expect(page.locator('#delivery-save-settings')).toHaveCSS('min-height', '48px');
});

test('configuração deixa o estado explícito, marca campos obrigatórios e preenche a localização', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success) => success({ coords: { latitude: -23.55052, longitude: -46.633308 } }) },
    });
  });
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await expect(page.locator('.delivery-config-status')).toContainText('Delivery configurado e ativo');
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await expect(page.locator('#modal-content .delivery-config-status')).toContainText('Delivery configurado e ativo');
  await expect(page.locator('#delivery-setting-lat')).toHaveAttribute('required', '');
  await expect(page.locator('#delivery-setting-lng')).toHaveAttribute('required', '');
  await expect(page.locator('#delivery-setting-radius')).toHaveAttribute('required', '');
  await expect(page.locator('#delivery-setting-origin-number')).toHaveValue('120');
  await page.getByRole('button', { name: /Usar minha localização/ }).click();
  await expect(page.locator('#delivery-setting-lat')).toHaveValue('-23.55052');
  await expect(page.locator('#delivery-setting-lng')).toHaveValue('-46.633308');
  await expect(page.locator('#delivery-location-status')).toContainText('Endereço encontrado');
  await expect(page.locator('#delivery-setting-origin-number')).toHaveValue('120');
  await expect(page.locator('#delivery-origin-address-confirmed')).not.toBeChecked();
});

test('tenant Admin não exibe o controle de ativação do módulo', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await expect(page.locator('#delivery-setting-enabled')).toHaveCount(0);
  await expect(page.locator('.delivery-form-section').first()).toContainText('Módulo e capacidade');
});

test('frota identificada permite iniciar a operação sem atribuir motoboy', async ({ page }) => {
  const ready = deliveryFixture({ status: 'READY_FOR_DISPATCH', version: 3, default_fulfillment_mode: 'OWN' });
  await prepareAdmin(page, [ready]);
  const commandRequests = [];
  page.on('request', (request) => { if (request.url().endsWith('/own/start')) commandRequests.push(request); });
  await page.goto('/');
  await page.evaluate(() => { window.deliveryUsesIdentifiedFleet = () => true; });
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Abrir entrega 482193/ }).click();
  await expect(page.getByRole('button', { name: 'Continuar sem motoboy' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar sem motoboy' }).click();
  await expect(page.getByRole('heading', { name: 'Continuar sem motoboy?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar sem motoboy' }).click();
  await expect.poll(() => commandRequests.length).toBe(1);
  expect(commandRequests[0].postDataJSON()).toMatchObject({ expected_version: 3 });
});

test('tracking troca o fragmento, permite confirmação autenticada e não revela o código', async ({ page }) => {
  const snapshot = { display_code: '482193', status: 'IN_TRANSIT', version: 4, destination: { city: 'São Paulo', state: 'SP', lat: -23.5565, lng: -46.692 }, tracking_active: true, receipt_confirmation_available: true, eta_seconds: 840, eta_updated_at: new Date().toISOString(), driver_location: { lat: -23.55, lng: -46.68, accuracy_m: 12, recorded_at: new Date().toISOString() }, updated_at: new Date().toISOString() };
  let exchangedToken = '';
  let confirmationPayload = null;
  await page.route('https://unpkg.com/**', (route) => route.abort());
  await page.route('**/admin/api/public/deliveries/track**', async (route) => {
    if (route.request().url().endsWith('/track/confirm')) {
      confirmationPayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...snapshot, status: 'DELIVERED', version: 5, tracking_active: false, receipt_confirmation_available: false }) });
      return;
    }
    if (route.request().method() === 'POST') exchangedToken = route.request().postDataJSON().token;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
  });
  await page.goto('/tracking.html#token=' + 'a'.repeat(48), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tracking\.html$/);
  await expect.poll(() => exchangedToken).toBe('a'.repeat(48));
  await expect(page.getByRole('heading', { name: /a caminho/i })).toBeVisible();
  await expect(page.locator('.tracking-steps')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\b\d{4}\b.*código/i);
  await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await page.locator('#tracking-confirm-pin').fill('a3f9');
  await expect(page.locator('#tracking-confirm-pin')).toHaveValue('A3F9');
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect.poll(() => confirmationPayload).toEqual({ pin: 'A3F9' });
  await expect(page.getByRole('heading', { name: 'Entrega concluída' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('admin exige o código do cliente para finalizar entrega própria', async ({ page }) => {
  const inTransit = deliveryFixture({ status: 'IN_TRANSIT', version: 7, default_fulfillment_mode: 'OWN' });
  await prepareAdmin(page, [inTransit]);
  let completionRequest = null;
  page.on('request', (request) => {
    if (request.url().endsWith('/own/complete')) completionRequest = request;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Abrir entrega 482193/ }).click();
  await page.locator('#modal-content').getByRole('button', { name: 'Finalizar entrega' }).click();
  await expect(page.locator('#delivery-completion-pin')).toBeFocused();
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  expect(completionRequest).toBeNull();
  await page.locator('#delivery-completion-pin').fill('b70e');
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect.poll(() => completionRequest?.postDataJSON()).toEqual({ tenant_id: 'tenant-delivery-test', expected_version: 7, pin: 'B70E' });
  expect(completionRequest.headers()['idempotency-key']).toBeTruthy();
});

test('painel mantém operação usável em tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await prepareAdmin(page, [deliveryFixture()]);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await expect(page.locator('.delivery-card')).toBeVisible();
  await expect(page.locator('.delivery-btn').first()).toHaveCSS('min-height', '48px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('entregador não acessa a central administrativa', async ({ page }) => {
  await prepareAdmin(page, [deliveryFixture()], 'DRIVER');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Entregas/ })).toBeHidden();
  await page.evaluate(() => navigate('delivery'));
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
});

test('falha oferece nova tentativa e inicia retorno com versão e auditoria', async ({ page }) => {
  const failed = deliveryFixture({ status: 'DELIVERY_FAILED', version: 7, assigned_driver_id: 'e822ee57-2261-44d8-866d-280e695080de' });
  await prepareAdmin(page, [failed]);
  const returnRequests = [];
  page.on('request', (request) => { if (request.url().endsWith('/start-return')) returnRequests.push(request); });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Abrir entrega 482193/ }).click();
  await expect(page.locator('#modal-content')).toContainText('Ocorrência aberta');
  await expect(page.locator('#modal-content').getByRole('button', { name: /Nova tentativa/ })).toBeVisible();
  await page.locator('#modal-content').getByRole('button', { name: /Iniciar retorno/ }).click();
  await page.locator('#delivery-return-reason').selectOption('CUSTOMER_ABSENT');
  await page.locator('#delivery-return-notes').fill('Cliente não respondeu ao contato.');
  await page.locator('#modal-content').getByRole('button', { name: 'Iniciar retorno', exact: true }).click();
  await expect.poll(() => returnRequests.length).toBe(1);
  expect(returnRequests[0].postDataJSON()).toMatchObject({ expected_version: 7, reason_code: 'CUSTOMER_ABSENT', notes: 'Cliente não respondeu ao contato.' });
  expect(returnRequests[0].headers()['idempotency-key']).toBeTruthy();
});

test('devolução exige confirmação forte antes de encerrar retorno', async ({ page }) => {
  const returning = deliveryFixture({ status: 'RETURNING', version: 9, assigned_driver_id: 'e822ee57-2261-44d8-866d-280e695080de' });
  await prepareAdmin(page, [returning]);
  const completeRequests = [];
  page.on('request', (request) => { if (request.url().endsWith('/complete-return')) completeRequests.push(request); });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Abrir entrega 482193/ }).click();
  await page.locator('#modal-content').getByRole('button', { name: /Confirmar devolução/ }).click();
  await page.locator('#modal-content').getByRole('button', { name: 'Confirmar devolução', exact: true }).click();
  await expect.poll(() => completeRequests.length).toBe(0);
  await page.locator('#delivery-return-confirm').check();
  await page.locator('#delivery-return-notes').fill('Recebido pelo balcão.');
  await page.locator('#modal-content').getByRole('button', { name: 'Confirmar devolução', exact: true }).click();
  await expect.poll(() => completeRequests.length).toBe(1);
  expect(completeRequests[0].postDataJSON()).toMatchObject({ expected_version: 9, notes: 'Recebido pelo balcão.' });
  expect(completeRequests[0].headers()['idempotency-key']).toBeTruthy();
});

test('hardening não deixa credenciais no DOM após salvar operador', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await page.getByRole('button', { name: /Gerenciar credenciais/ }).click();
  await page.locator('#delivery-provider-client-id').fill('client-demo');
  await page.locator('#delivery-provider-client-secret').fill('secret-demo');
  await page.locator('#delivery-provider-access-token').fill('token-demo');
  await page.getByRole('button', { name: /Salvar operador/ }).click();
  await expect(page.locator('#modal-content')).toBeHidden();
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('secret-demo');
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('token-demo');
});

test('operador exibe teste fake sem realizar chamada externa', async ({ page }) => {
  await prepareAdmin(page);
  const connectionRequests = [];
  page.on('request', (request) => { if (request.url().endsWith('/delivery/providers/IFOOD/test-connection')) connectionRequests.push(request); });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await page.getByRole('button', { name: /Gerenciar credenciais/ }).click();
  await page.getByRole('button', { name: 'Testar conexão fake', exact: true }).click();
  await expect.poll(() => connectionRequests.length).toBe(1);
  await expect(page.locator('#delivery-provider-status')).toContainText('CONNECTED');
  await expect(page.locator('#modal-content')).not.toContainText('secret');
});

test('centro de exceções funciona em viewport estreito', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareAdmin(page, [deliveryFixture({ status: 'DELIVERY_FAILED' })]);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Exceções/ }).click();
  await expect(page.locator('#delivery-exceptions-result')).toBeVisible();
  await page.getByRole('button', { name: 'Reconhecer' }).click();
  await expect(page.locator('#delivery-exceptions-result')).toContainText('Reconhecida neste navegador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('gestão administrativa facilita CEP e permite endereço manual', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Clientes e endereços/ }).click();
  await page.locator('#delivery-customer-phone').fill('5511999999999');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: /Novo endereço/ }).click();
  await page.locator('#delivery-address-postal').fill('01311-000');
  await page.getByRole('button', { name: /Buscar CEP/ }).click();
  await expect(page.locator('#delivery-address-street')).toHaveValue('Rua Augusta');
  await expect(page.locator('#delivery-address-city')).toHaveValue('São Paulo');
});

test('admin consegue consultar reservas sem expor checkout', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await page.getByRole('button', { name: /Ver reservas/ }).click();
  await expect(page.locator('#delivery-capacity-reservations-result')).toContainText('Nenhuma reserva ativa');
  await expect(page.locator('#modal-content')).not.toContainText('checkout_key');
});

test('configuração mantém alerta quando capacidade declarada fica abaixo das reservas', async ({ page }) => {
  await prepareAdmin(page, [deliveryFixture()], 'ADMIN', { tenant_id: 'tenant-delivery-test', declared_capacity: 1, reserved: 2, available: 0, hold_minutes: 15 });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Configurar operação/ }).click();
  await expect(page.locator('#modal-content')).toContainText('Capacidade abaixo das reservas atuais');
});

test('painel sinaliza perda de conexão sem ocultar a fila já carregada', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareAdmin(page, [deliveryFixture()]);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await expect(page.locator('.delivery-card')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.delivery-alert--offline')).toContainText('Sem conexão com a operação');
  await expect(page.locator('.delivery-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('modais de Delivery expõem diálogo acessível e devolvem foco ao acionador', async ({ page }) => {
  await prepareAdmin(page, [deliveryFixture()]);
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  const opener = page.getByRole('button', { name: /Abrir entrega 482193/ });
  await opener.click();
  const modal = page.locator('#modal-content');
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal).toHaveAttribute('aria-label', /.+/);
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(opener).toBeFocused();
});

test('relatório filtra modalidade, operador e status e oferece CSV', async ({ page }) => {
  await prepareAdmin(page);
  const reportRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/deliveries/reports/summary')) reportRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Entregas/ }).click();
  await page.getByRole('button', { name: /Relatório/ }).click();
  await page.locator('#delivery-report-mode').selectOption('EXTERNAL');
  await page.locator('#delivery-report-provider').selectOption('IFOOD');
  await page.locator('#delivery-report-status').selectOption('DELIVERED');
  await page.getByRole('button', { name: 'Carregar relatório', exact: true }).click();
  await expect.poll(() => reportRequests.some((url) => url.includes('mode=EXTERNAL') && url.includes('provider=IFOOD') && url.includes('status=DELIVERED'))).toBe(true);
  await expect(page.locator('#delivery-report-result')).toContainText('Variação do operador');
  await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click();
  await expect.poll(() => reportRequests.some((url) => url.includes('/summary.csv') && url.includes('mode=EXTERNAL'))).toBe(true);
});
