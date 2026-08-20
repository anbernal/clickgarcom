const { test, expect } = require('@playwright/test');

const publicMenu = {
  restaurant: {
    name: 'Anderson Restaurant', slug: 'anderson-restaurant-qa', is_open: true,
    logo_url: null, cover_url: null, description: 'Sabores feitos na casa para compartilhar.',
  },
  theme: { primary_color: '#153f34', accent_color: '#ef6a45' },
  item_count: 3,
  categories: [
    {
      id: '681373f4-61a4-524b-b7a0-4227ef200a7e', name: 'Burgers & Combos', description: 'Smash burgers.', image_url: '/assets/demo-menu/burgers.jpg',
      items: [
        { id: '47bdc1b1-055f-5a3e-b1b6-59d8f1d07d03', category_id: '681373f4-61a4-524b-b7a0-4227ef200a7e', name: 'Smash Clássico', description: 'Pão brioche, carne 120g, queijo e molho da casa.', price: 29.9, image_url: '/assets/demo-menu/burgers.jpg', prep_time_minutes: 14, has_options: false },
        { id: '7af359ca-ea33-59b0-816a-23aa75cfca9a', category_id: '681373f4-61a4-524b-b7a0-4227ef200a7e', name: 'Bacon Duplo', description: 'Dois smash burgers e bacon crocante.', price: 36.9, image_url: '/assets/demo-menu/burgers.jpg', prep_time_minutes: 18, has_options: true, option_groups: [{ name: 'Molho extra', required: true, min_select: 1, max_select: 1, options: [{ name: 'Barbecue', price_delta: 3, available: true }, { name: 'Picante', price_delta: 2, available: true }] }] },
      ],
    },
    {
      id: '63f15e33-7d41-561b-807c-830ee4e13300', name: 'Bebidas', description: 'Bebidas geladas.', image_url: '/assets/demo-menu/bebidas.jpg',
      items: [{ id: 'ddf4365f-77ff-53eb-90ec-73a281d7596a', category_id: '63f15e33-7d41-561b-807c-830ee4e13300', name: 'Limonada da Casa', description: 'Limão fresco, gelo e hortelã.', price: 12, image_url: '/assets/demo-menu/bebidas.jpg', prep_time_minutes: 4, has_options: false }],
    },
  ],
};

async function prepareMenu(page) {
  await page.route('**/admin/api/public/menu/anderson-restaurant-qa', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(publicMenu),
  }));
}

async function prepareAuthenticatedMenu(page, orderResponse = null) {
  await prepareMenu(page);
  const profile = {
    customer: { id: 'c335650a-38df-4ec1-a1dc-e4e66d174f6d', name: 'Mariana Silva', phone_masked: '5511*****99' },
    addresses: [{
      id: '6a0c48dc-3a8a-4bc5-b327-fb46a57c7328', label: 'Casa', postal_code: '01311000',
      street: 'Avenida Paulista', address_number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
      formatted_address: 'Avenida Paulista, 1000, Bela Vista, São Paulo, SP, 01311000', is_default: true,
    }],
  };
  await page.route('**/admin/api/public/menu/anderson-restaurant-qa/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(profile),
  }));
  await page.route('**/admin/api/public/menu/anderson-restaurant-qa/orders', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(typeof orderResponse === 'function' ? orderResponse() : (orderResponse || [{
      checkout_key: 'menu-test', payment_status: 'PAID', delivery_status: 'IN_TRANSIT', delivery_code: 'ENT-123',
      subtotal: 29.9, delivery_fee: 7, total: 36.9, created_at: '2026-08-17T15:00:00Z',
      items: [{ name: 'Smash Clássico', quantity: 1, unit_price: 29.9 }],
    }])),
  }));
  await page.route('**/admin/api/public/menu/anderson-restaurant-qa/checkout', (route) => route.fulfill({
    status: 201, contentType: 'application/json', body: JSON.stringify({
      tab_id: '99cc06dd-b752-4427-aa09-2618548bbd11', checkout_key: 'menu-checkout', checkout_capability: 'capability',
      subtotal: 29.9, delivery_fee: 7, total: 36.9, expires_at: '2026-08-17T16:00:00Z',
    }),
  }));
}

test('page1 usa dados do tenant, pesquisa e mantém sacola local', async ({ page }) => {
  await prepareMenu(page);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await expect(page.getByRole('heading', { name: 'Anderson Restaurant' })).toBeVisible();
  await expect(page.locator('.menu-item')).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText(/cost_price|stock_quantity|tenant_id/i);

  await page.getByPlaceholder('Buscar prato, bebida ou ingrediente').fill('limonada');
  await expect(page.locator('.menu-item')).toHaveCount(1);
  await expect(page.locator('.menu-item')).toContainText('Limonada da Casa');
  await page.getByRole('button', { name: 'Limpar busca' }).click();

  await page.getByRole('button', { name: 'Adicionar Smash Clássico à sacola' }).click();
  await expect(page.locator('#menu-bag-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  await expect(page.getByRole('dialog')).toContainText('R$ 29,90');
  await expect(page.getByRole('dialog')).toContainText('Nada será enviado à cozinha antes da confirmação do pagamento');
});

test('page1 permanece usável em celular sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await prepareMenu(page);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await expect(page.locator('.menu-bottom-nav')).toBeVisible();
  await expect(page.locator('.menu-item').first()).toBeVisible();
  await expect(page.locator('.menu-add').first()).toHaveCSS('width', '44px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('conta autenticada reutiliza endereço e mostra histórico de delivery', async ({ page }) => {
  await prepareAuthenticatedMenu(page);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await expect(page.locator('#menu-account-label')).toHaveText('Conta');
  await page.locator('#menu-account-nav').click();
  await expect(page.getByRole('dialog')).toContainText('Mariana Silva');
  await page.getByRole('button', { name: /Histórico de pedidos/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Pedido ENT-123');
  await expect(page.getByRole('dialog')).toContainText('A caminho');
  await expect(page.getByRole('dialog')).toContainText('R$ 36,90');
});

test('histórico permite repetir pedido com os complementos ainda disponíveis', async ({ page }) => {
  await prepareAuthenticatedMenu(page, [{
    checkout_key: 'menu-repeat', payment_status: 'PAID', delivery_status: 'DELIVERED', delivery_code: 'ENT-789',
    subtotal: 79.8, delivery_fee: 7, total: 86.8, created_at: '2026-08-18T15:00:00Z',
    items: [{
      menu_item_id: '7af359ca-ea33-59b0-816a-23aa75cfca9a', name: 'Bacon Duplo', quantity: 2, unit_price: 39.9,
      selected_options: [{ group_name: 'Molho extra', option_name: 'Barbecue', price_delta: 3 }],
    }],
  }]);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await page.locator('#menu-account-nav').click();
  await page.getByRole('button', { name: /Histórico de pedidos/ }).click();
  await page.getByRole('button', { name: /Repetir pedido/ }).click();

  await expect(page.getByRole('dialog')).toContainText('Sua sacola');
  await expect(page.getByRole('dialog')).toContainText('Bacon Duplo');
  await expect(page.getByRole('dialog')).toContainText('Barbecue');
  await expect(page.getByRole('dialog')).toContainText('R$ 79,80');
  await expect(page.getByRole('button', { name: 'Continuar para entrega' })).toBeVisible();
});

test('sino acompanha a quantidade de pedidos ativos e some após a conclusão no KDS', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let orders = [{
    checkout_key: 'menu-active', payment_status: 'PAID', delivery_status: 'PREPARING', delivery_code: 'ENT-456',
    subtotal: 42, delivery_fee: 8, total: 50, created_at: '2026-08-18T15:00:00Z',
    items: [{ name: 'Bacon Duplo', quantity: 1, unit_price: 42 }],
  }];
  await prepareAuthenticatedMenu(page, () => orders);
  await page.goto('/cardapio/anderson-restaurant-qa');

  const alert = page.locator('#menu-order-alert');
  await expect(alert).toBeVisible();
  await expect(page.locator('#menu-order-alert-count')).toHaveText('1');
  await expect(alert).toHaveAttribute('aria-label', 'Acompanhar 1 pedido em andamento');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await alert.click();
  await expect(page.getByRole('dialog')).toContainText('Pedido ENT-456');
  await expect(page.getByRole('dialog')).toContainText('Em preparo');

  await page.getByRole('button', { name: 'Fechar' }).click();
  orders = [{ ...orders[0], delivery_status: 'DELIVERED' }];
  await page.evaluate(() => refreshMenuActiveOrders());
  await expect(alert).toBeHidden();
});

test('item personalizável permite escolher complemento e leva a seleção para a sacola', async ({ page }) => {
  await prepareMenu(page);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await page.getByRole('button', { name: 'Ver personalização' }).click();
  await expect(page.getByRole('dialog')).toContainText('Molho extra');
  await page.getByRole('radio', { name: /Barbecue/ }).check();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  await expect(page.getByRole('dialog')).toContainText('Barbecue');
  await expect(page.getByRole('dialog')).toContainText('R$ 39,90');
});

test('checkout calcula frete no servidor antes de oferecer o PIX', async ({ page }) => {
  await prepareAuthenticatedMenu(page);
  await page.goto('/cardapio/anderson-restaurant-qa');
  await page.getByRole('button', { name: 'Adicionar Smash Clássico à sacola' }).click();
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  await page.getByRole('button', { name: 'Continuar para entrega' }).click();
  await expect(page.getByRole('dialog')).toContainText('Avenida Paulista, 1000');
  await page.getByRole('button', { name: 'Calcular frete e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Pagamento via PIX' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('R$ 7,00');
  await expect(page.getByRole('dialog')).toContainText('R$ 36,90');
  await expect(page.getByRole('button', { name: 'Gerar QR Code PIX' })).toBeVisible();
});

test('PIX reutiliza o checkout público e respeita o ambiente de teste do tenant', async ({ page }) => {
  await prepareAuthenticatedMenu(page);
  let pixPayload = null;
  await page.route('**/admin/api/public/tables/delivery-checkouts/capability/access', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ tab_id: '99cc06dd-b752-4427-aa09-2618548bbd11', access_token: 'signed-access' }),
  }));
  await page.route('**/admin/api/public/tables/tabs/99cc06dd-b752-4427-aa09-2618548bbd11?delivery_checkout_key=menu-checkout', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mpEnvironment: 'TEST', mpPublicKey: 'TEST-public' }),
  }));
  await page.route('**/admin/api/public/tables/tabs/99cc06dd-b752-4427-aa09-2618548bbd11/payments/pix', async (route) => {
    pixPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ payment_id: 'pay-1', qr_code: '000201PIXTESTE' }) });
  });

  await page.goto('/cardapio/anderson-restaurant-qa');
  await page.getByRole('button', { name: 'Adicionar Smash Clássico à sacola' }).click();
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  await page.getByRole('button', { name: 'Continuar para entrega' }).click();
  await page.getByRole('button', { name: 'Calcular frete e continuar' }).click();
  await page.getByRole('button', { name: 'Gerar QR Code PIX' }).click();
  await expect(page.getByRole('button', { name: 'Copiar código PIX' })).toBeVisible();
  expect(pixPayload).toMatchObject({ payer_name: 'APRO', payer_email: 'test_user_br@testuser.com', delivery_checkout_key: 'menu-checkout' });
});
