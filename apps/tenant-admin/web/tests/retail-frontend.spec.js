const { test, expect } = require('@playwright/test');

function adminSession() {
  return {
    token: 'header.e30.signature',
    user: {
      id: 'user-retail-preview',
      name: 'Amanda Gestora',
      role: 'ADMIN',
      tenant_name: 'Mercado Modelo',
      attendance_enabled: false,
      delivery_enabled: true,
      retail_enabled: true,
    },
  };
}

async function prepareAdmin(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify(session));
  }, adminSession());
  await page.route('**/admin/api/auth/me**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(adminSession().user),
  }));
}

test('Admin RETAIL exibe navegação própria e mantém módulos de restaurante ocultos', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?retail-preview=market&retail-reset=1');

  await expect(page.getByRole('button', { name: /Visão da loja/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Produtos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Estoque/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Controle de separação/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Compras online/ })).toBeVisible();
  await expect(page.locator('#nav-kds-link')).toBeHidden();
  await expect(page.locator('#sidebar-module-status')).toContainText('Venda de produtos');
  await expect(page.locator('#sidebar-module-status')).toContainText('Delivery');
  await expect(page.locator('#sidebar-module-status')).not.toContainText('Desativado');
  await expect(page.locator('#dashboard-module-status')).toBeHidden();
  await expect(page.getByRole('button', { name: /^Dashboard$/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Pedidos/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Cardápio/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Mesas/ })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Da prateleira até a entrega, sem perder o controle.' })).toBeVisible();
  expect(await page.evaluate(() => window.canAccessPage('comandas'))).toBe(false);
  await page.evaluate(() => window.navigate('comandas', { silent: true }));
  await expect(page.locator('#page-title')).toHaveText('Painel da loja');
});

test('Tenant híbrido mantém Atendimento e RETAIL ativos sem misturar as operações', async ({ page }) => {
  const hybridSession = adminSession();
  hybridSession.user.attendance_enabled = true;
  hybridSession.user.retail_enabled = true;

  await page.addInitScript((session) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify(session));
  }, hybridSession);
  await page.route('**/admin/api/**', (route) => {
    const isCurrentUser = new URL(route.request().url()).pathname.endsWith('/auth/me');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isCurrentUser ? hybridSession.user : {}),
    });
  });
  // index.html evita a regra de redirecionamento da raiz durante o bootstrap
  // isolado do Playwright, mantendo este caso focado na navegação híbrida.
  await page.goto('/index.html?retail-reset=1');

  await expect(page.getByRole('button', { name: /Dashboard/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pedidos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cardápio/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Visão da loja/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Produtos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Controle de separação/ })).toBeVisible();
});

test('Compras online reúne operação e histórico sem usar a fila da cozinha', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?retail-preview=market&retail-reset=1');

  await page.getByRole('button', { name: /Compras online/ }).click();
  await expect(page.getByRole('heading', { name: 'Compras online' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atuais e concluídas' })).toBeVisible();
  await expect(page.locator('.retail-orders-history tbody tr')).toHaveCount(8);
  await expect(page.locator('.retail-orders-history')).toContainText('Concluída');
});

test('Produtos e estoque funcionam no protótipo sem depender do backend', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?retail-preview=market&retail-reset=1');

  await page.getByRole('button', { name: /Produtos/ }).click();
  await expect(page.locator('.retail-admin-product')).toHaveCount(8);
  await page.getByRole('button', { name: 'Organizar categorias' }).click();
  await expect(page.getByRole('heading', { name: 'Categorias da loja' })).toBeVisible();
  await page.getByPlaceholder('Ex.: Hortifruti').fill('Hortifruti');
  await page.getByRole('button', { name: 'Adicionar categoria' }).click();
  await page.getByPlaceholder('Buscar nome, marca, SKU ou código').fill('café');
  await expect(page.locator('.retail-admin-product')).toHaveCount(1);
  await expect(page.locator('.retail-admin-product')).toContainText('Café Torrado e Moído');

  await page.getByRole('button', { name: /Estoque/ }).click();
  await expect(page.getByRole('heading', { name: 'Saldo por produto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lotes e validade' })).toBeVisible();
  await expect(page.locator('.retail-lot-card')).toHaveCount(3);
  const shampooRow = page.locator('.retail-table tbody tr').filter({ hasText: 'Shampoo Nutritivo' });
  await expect(shampooRow).toContainText('Estoque baixo');
  await shampooRow.getByRole('button', { name: 'Ajustar' }).click();
  await page.getByPlaceholder('Ex.: 10 ou -2').fill('5');
  await page.getByPlaceholder('Descreva a entrada, perda ou correção').fill('Entrada para teste visual');
  await page.getByRole('button', { name: 'Confirmar ajuste' }).click();
  await expect(page.locator('.retail-table tbody tr').filter({ hasText: 'Shampoo Nutritivo' })).toContainText('Saudável');
});

test('Central de Separação avança somente compras pagas entre etapas', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?retail-preview=market&retail-reset=1');
  await page.getByRole('button', { name: /Controle de separação/ }).click();

  const newColumn = page.locator('.retail-board-column').filter({ hasText: 'Novos' });
  await expect(newColumn.locator('.retail-order-card')).toHaveCount(2);
  await newColumn.locator('.retail-order-card').first().getByRole('button', { name: 'Iniciar separação' }).click();
  const pickingColumn = page.locator('.retail-board-column').filter({ hasText: 'Em separação' });
  await expect(pickingColumn.locator('.retail-order-card')).toHaveCount(2);
});

test('Loja RETAIL mobile oferece categorias, recompra, ofertas e checkout completo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/loja/mercado-modelo?preview=market');

  await expect(page.getByRole('heading', { name: 'O que você precisa, sem complicação.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categorias' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compre de novo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ofertas do dia' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.getByRole('button', { name: 'Adicionar Biscoito de Polvilho Tradicional' }).first().click();
  await expect(page.locator('#store-floating-cart')).toBeVisible();
  await page.locator('#store-floating-cart').click();
  await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar para entrega' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega ou retirada' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar para pagamento' }).click();
  await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible();
  await expect(page.locator('.store-secure-copy')).toContainText('Nenhum pedido entra em separação antes da confirmação do pagamento');
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(page.getByText('PAGAMENTO CONFIRMADO')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Compra #[0-9]{4} recebida!/ })).toBeVisible();
});

test('Sacola e compras permanecem ações separadas na loja mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/loja/mercado-modelo?preview=market');

  await page.locator('.store-product-card__main').first().click();
  await expect(page.getByRole('button', { name: 'Adicionar à sacola' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
  await expect(page.locator('.store-cart-list')).toContainText('Biscoito de Polvilho Tradicional');

  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Compras', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suas compras' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suas compras' })).not.toHaveText('Sua sacola');
});

test('Preview de farmácia usa o mesmo RETAIL com identidade própria', async ({ page }) => {
  await page.goto('/loja/farmacia-modelo?preview=pharmacy');
  await expect(page.getByText('Farmácia Modelo')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cuidado e bem-estar perto de você.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Higiene pessoal/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/receita|controlado|SNGPC/i);
});
