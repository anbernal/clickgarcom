const { test, expect } = require('@playwright/test');

async function prepareFleetAdmin(page) {
  const tenantId = 'tenant-fleet-test';
  const payload = Buffer.from(JSON.stringify({ tenant_id: tenantId, role: 'ADMIN' })).toString('base64url');
  await page.addInitScript(({ payloadValue, tenant }) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify({
      token: `x.${payloadValue}.x`,
      user: { id: 'admin-fleet', name: 'Ana Admin', role: 'ADMIN', tenant_name: 'Restaurante Frota', delivery_enabled: true },
    }));
    localStorage.setItem(`clickgarcom_fleet_preview_v1_${tenant}`, JSON.stringify({
      config: { mode: 'IDENTIFIED_DRIVERS', version: 2, updated_at: new Date().toISOString(), updated_by: 'Ana Admin' },
      drivers: [
        { id: 'driver-1', name: 'Rafael Souza', cpf_masked: '***.***.***-42', plate: 'FRT4A21', phone: '5511987654321', active: true, availability: 'AVAILABLE', active_deliveries: 0, delivery_limit: 2, access_status: 'ACTIVE', last_access_at: new Date().toISOString(), version: 1 },
        { id: 'driver-2', name: 'Luana Martins', cpf_masked: '***.***.***-08', plate: 'GDX8C90', phone: '5511976543210', active: true, availability: 'ON_ROUTE', active_deliveries: 1, delivery_limit: 2, access_status: 'ACTIVE', last_access_at: new Date().toISOString(), version: 1 },
      ],
      assignments: [{ id: 'assignment-1', delivery_id: 'delivery-1', delivery_code: '600364', driver_id: 'driver-2', customer_name: 'Mariana', neighborhood: 'Vila Yara', status: 'IN_TRANSIT', position: 1, eta_minutes: 16, version: 1 }],
    }));
  }, { payloadValue: payload, tenant: tenantId });
  await page.route('**/admin/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? { id: 'admin-fleet', name: 'Ana Admin', role: 'ADMIN', tenant_name: 'Restaurante Frota', delivery_enabled: true, attendance_enabled: true, isOpen: true }
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('central da frota cadastra, mascara e gerencia acesso sem reter token', async ({ page }) => {
  await prepareFleetAdmin(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Frota própria/ }).click();
  await expect(page.getByRole('heading', { name: /Quem entrega/ })).toBeVisible();
  await expect(page.locator('.fleet-driver-card')).toHaveCount(2);
  await expect(page.locator('.fleet-driver-card').first()).toContainText('***.***.***-42');
  await expect(page.locator('.fleet-driver-card').first()).not.toContainText('52998224725');

  await page.getByRole('button', { name: /Cadastrar motoboy/ }).click();
  await page.locator('#fleet-driver-name').fill('João da Silva');
  await page.locator('#fleet-driver-cpf').fill('52998224725');
  await page.locator('#fleet-driver-plate').fill('ABC1D23');
  await page.getByRole('button', { name: 'Salvar motoboy' }).click();
  await expect(page.locator('.fleet-driver-card')).toHaveCount(3);
  await expect(page.locator('.fleet-driver-card').first()).toContainText('João da Silva');
  await expect(page.locator('.fleet-driver-card').first()).toContainText('***.***.*47-25');

  await page.locator('.fleet-driver-card').first().getByRole('button', { name: /Gerar acesso/ }).click();
  await page.getByRole('button', { name: 'Gerar novo acesso' }).click();
  await expect(page.locator('#fleet-one-time-link')).toHaveValue(/entregador\/restaurante-frota#activate=/);
  await page.locator('.modal-footer').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('#fleet-one-time-link')).toHaveCount(0);
});

test('portal do motoboy percorre retirada, rota e conclusão por código', async ({ page }) => {
  await page.goto('/entregador/restaurante-frota');
  await page.getByRole('button', { name: /Entrar na prévia/ }).click();
  await expect(page.getByRole('heading', { name: /Olá, Luana/ })).toBeVisible();
  await expect(page.locator('.driver-stop')).toHaveCount(2);
  await page.getByRole('button', { name: 'Confirmar retirada' }).first().click();
  await expect(page.getByRole('button', { name: 'Iniciar rota' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar rota' }).first().click();
  await page.getByRole('button', { name: 'Informar chegada' }).first().click();
  await page.getByRole('button', { name: 'Finalizar com código' }).first().click();
  await page.locator('#driver-delivery-code').fill('a3f9');
  await expect(page.locator('#driver-delivery-code')).toHaveValue('A3F9');
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.locator('.driver-stop')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
