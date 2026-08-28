const { test, expect } = require('@playwright/test');

function appointmentsSession(overrides = {}) {
  return {
    token: 'header.e30.signature',
    user: {
      id: 'user-appointments-preview',
      name: 'Amanda Gestora',
      role: 'ADMIN',
      tenant_name: 'Studio Aurora',
      attendance_enabled: false,
      delivery_enabled: false,
      retail_enabled: false,
      food_store_enabled: false,
      appointments_enabled: true,
      ...overrides,
    },
  };
}

async function prepareAdmin(page, overrides = {}) {
  const session = appointmentsSession(overrides);
  await page.addInitScript((value) => {
    localStorage.setItem('clickgarcom_auth', JSON.stringify(value));
  }, session);
  await page.route('**/admin/api/auth/me**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(session.user),
  }));
}

test('módulo Agenda abre como operação principal e oculta operações não contratadas', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?appointments-preview=salon&appointments-reset=1');

  await expect(page.getByRole('button', { name: /Agenda & Serviços/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sua agenda, leve e organizada' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pedidos/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Produtos/ })).toBeHidden();
  await expect(page.locator('.appointments-metric')).toHaveCount(4);
  await expect(page.locator('.appointments-day')).toHaveCount(7);
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.locator('.appointments-list > button')).toHaveCount(8);
  await page.locator('.appointments-list > button').first().click();
  await expect(page.getByRole('button', { name: 'Reagendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  expect(await page.evaluate(() => window.canAccessPage('appointments'))).toBe(true);
});

test('catálogo e equipe permitem configuração completa no preview', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?appointments-preview=salon&appointments-reset=1');

  await page.getByRole('button', { name: /^Serviços/ }).click();
  await expect(page.locator('.appointment-service-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Organizar categorias' }).click();
  await expect(page.getByRole('heading', { name: 'Categorias de serviços' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('button', { name: '+ Novo serviço' }).click();
  await page.locator('#appointment-service-name').fill('Penteado para evento');
  await page.locator('#appointment-service-category').fill('Penteados');
  await page.locator('#appointment-service-price').fill('159');
  await page.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect(page.getByRole('heading', { name: 'Penteado para evento' })).toBeVisible();

  await page.getByRole('button', { name: /^Profissionais/ }).click();
  await expect(page.locator('.appointment-professional-card')).toHaveCount(4);
  await page.locator('.appointment-professional-card').first().getByRole('button', { name: 'Disponibilidade' }).click();
  await expect(page.getByRole('heading', { name: /Disponibilidade de Ana Martins/ })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar disponibilidade' }).click();
  await expect(page.getByText('Equipe & disponibilidade')).toBeVisible();
});

test('editor visual organiza mensagens, espera e mostra prévia do WhatsApp', async ({ page }) => {
  await prepareAdmin(page);
  await page.goto('/?appointments-preview=spa&appointments-reset=1');
  await page.getByRole('button', { name: /^Automações/ }).click();

  await expect(page.locator('.appointments-phone-preview')).toBeVisible();
  await page.getByRole('button', { name: /Espera/ }).click();
  await expect(page.getByRole('heading', { name: 'Momento do envio' })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar fluxo' }).click();
  await expect(page.getByText(/Versão 4 publicada/)).toBeVisible();
  await page.getByRole('button', { name: 'Histórico' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico de publicações' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usar como rascunho' })).toBeVisible();
});

test('cliente conclui agendamento inteiro em uma página mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agendar/studio-aurora?preview=salon');

  await expect(page.getByRole('heading', { name: 'Escolha seu momento' })).toBeVisible();
  await page.getByRole('button', { name: /Corte feminino/ }).click();
  await page.getByRole('button', { name: 'Escolher profissional' }).click();
  await page.getByRole('button', { name: /Primeiro horário disponível/ }).click();
  await page.getByRole('button', { name: 'Escolher data e hora' }).click();
  await page.locator('.booking-slot:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Revisar agendamento' }).click();
  await page.locator('#booking-customer').fill('Mariana Silva');
  await page.locator('#booking-phone').fill('11975062841');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();

  await expect(page.getByRole('heading', { name: 'Horário confirmado!' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerenciar horário' }).click();
  await expect(page.getByRole('heading', { name: 'Meus horários' })).toBeVisible();
  await expect(page.locator('.booking-manage-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('perfil clínica usa aceite manual e não solicita dados clínicos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agendar/clinica-aurora?preview=clinic');
  await expect(page.getByText('Dados clínicos não são solicitados aqui.')).toBeVisible();
  await page.getByRole('button', { name: /Consulta inicial/ }).click();
  await page.getByRole('button', { name: 'Escolher profissional' }).click();
  await page.getByRole('button', { name: 'Escolher data e hora' }).click();
  await page.locator('.booking-slot:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Revisar agendamento' }).click();
  await page.locator('#booking-customer').fill('Paciente Teste');
  await page.locator('#booking-phone').fill('11999998888');
  await expect(page.locator('input')).toHaveCount(3);
  await page.getByRole('button', { name: 'Solicitar horário' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido de horário enviado' })).toBeVisible();
});
