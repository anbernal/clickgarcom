const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { v5: uuidv5 } = require('uuid');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const UUID_NAMESPACE = '279f0d73-7e3d-4f6a-88c6-3da0d8ef5166';
const QA_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const QA_TENANT_SLUG = 'anderson-restaurant-qa';
const QA_PASSWORD = 'Teste@123';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((result, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return result;
    const separator = trimmed.indexOf('=');
    if (separator < 0) return result;
    result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    return result;
  }, {});
}

const fileEnv = {
  ...loadEnvFile(path.join(REPO_ROOT, '.env')),
  ...loadEnvFile(path.join(REPO_ROOT, 'platform', 'core-backend', '.env')),
  ...loadEnvFile(path.join(__dirname, '.env')),
};

const env = (key, fallback = '') => process.env[key] || fileEnv[key] || fallback;
const tenantId = env('QA_TENANT_ID', env('DEFAULT_TENANT_ID', QA_TENANT_ID));
const now = new Date();

const client = new Client({
  host: env('DATABASE_HOST', 'localhost'),
  port: Number(env('DATABASE_PORT', '5432')),
  user: env('DATABASE_USER', 'postgres'),
  password: env('DATABASE_PASSWORD', 'postgres123'),
  database: env('DATABASE_NAME', 'clickgarcom_db'),
  ssl: env('DATABASE_SSL_MODE') === 'require' ? { rejectUnauthorized: false } : false,
});

const id = (type, key) => uuidv5(`${type}:${key}`, UUID_NAMESPACE);
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60 * 1000);
const daysAgo = (days, hour = 12) => {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  value.setHours(hour, 0, 0, 0);
  return value;
};
const monthReference = (offset) => {
  const value = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
};

function sqlValue(value) {
  if (value === null || value === undefined || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function insertRow(table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = columns.map((column) => sqlValue(row[column]));
  await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  );
}

async function resetQATenant() {
  const result = await client.query(
    'SELECT id FROM tenants WHERE id = $1 OR slug = $2',
    [tenantId, QA_TENANT_SLUG],
  );
  const ids = result.rows.map((row) => row.id);
  if (ids.length === 0) return;

  await client.query(
    `DELETE FROM payment_item_allocations
      WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id = ANY($1::uuid[]))`,
    [ids],
  );
  await client.query('DELETE FROM payment_attempts WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM payments WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query(
    `DELETE FROM order_items
      WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ANY($1::uuid[]))`,
    [ids],
  );
  await client.query('DELETE FROM orders WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM order_batches WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM nps_responses WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM tab_events WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query(
    `DELETE FROM waiter_chat_messages
      WHERE tenant_id = ANY($1::uuid[])`,
    [ids],
  );
  await client.query('DELETE FROM waiter_chats WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM service_requests WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM tabs WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM table_requests WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM menu_items WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM menu_categories WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM super_admin_audit_logs WHERE tenant_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
}

function buildMenu() {
  // Keep browser assets portable; the WhatsApp flow makes them public only when sending.
  const image = (filename) => `/assets/demo-menu/${filename}`;
  const categories = [
    ['burgers', 'Burgers & Combos', 'Smash burgers, acompanhamentos e combos da casa.', 'burgers.jpg'],
    ['pizzas', 'Pizzas Artesanais', 'Massa de longa fermentação e borda assada na hora.', 'pizzas.jpg'],
    ['brasileiros', 'Pratos Brasileiros', 'Almoço completo com sabores clássicos do Brasil.', 'pratos-brasileiros.jpg'],
    ['vegetarianos', 'Leves & Vegetarianos', 'Opções frescas, coloridas e sem carne.', 'vegetarianos.jpg'],
    ['bebidas', 'Bebidas', 'Sucos, refrescos e bebidas geladas.', 'bebidas.jpg'],
    ['sobremesas', 'Sobremesas', 'Doces clássicos para fechar o pedido.', 'sobremesas.jpg'],
  ].map(([key, name, description, filename], index) => ({
    key,
    id: id('category', key),
    tenant_id: tenantId,
    name,
    description,
    image_url: image(filename),
    display_order: index + 1,
    active: true,
    created_at: now,
    updated_at: now,
  }));

  const item = (key, categoryKey, data) => ({
    key,
    id: id('item', key),
    tenant_id: tenantId,
    category_id: id('category', categoryKey),
    name: data.name,
    description: data.description,
    price: data.price,
    cost_price: data.costPrice ?? null,
    image_url: data.noImage ? null : image(data.image || `${categoryKey}.jpg`),
    whatsapp_short_name: data.shortName || data.name.slice(0, 80),
    whatsapp_short_description: data.shortDescription || data.description.slice(0, 160),
    destination: data.destination || 'KITCHEN',
    prep_time_minutes: data.prepTime || 15,
    available: data.available !== false,
    display_order: data.order || 0,
    track_stock: data.trackStock === true,
    stock_quantity: data.trackStock ? data.stock ?? 0 : null,
    low_stock_threshold: data.trackStock ? data.lowStock ?? null : null,
    availability_windows: data.windows || null,
    item_type: data.itemType || 'STANDARD',
    option_groups: data.optionGroups || null,
    combo_components: data.comboComponents || null,
    created_at: now,
    updated_at: now,
  });

  const meatOptions = [
    {
      name: 'Ponto da carne',
      description: 'Escolha obrigatória para o burger.',
      required: true,
      min_select: 1,
      max_select: 1,
      display_order: 0,
      options: ['Mal passada', 'Ao ponto', 'Bem passada'].map((name, index) => ({
        name,
        description: null,
        price_delta: 0,
        available: true,
        display_order: index,
      })),
    },
    {
      name: 'Adicionais',
      description: 'Até dois adicionais.',
      required: false,
      min_select: 0,
      max_select: 2,
      display_order: 1,
      options: [
        { name: 'Bacon extra', description: null, price_delta: 5, available: true, display_order: 0 },
        { name: 'Queijo extra', description: null, price_delta: 4, available: true, display_order: 1 },
        { name: 'Cebola caramelizada', description: null, price_delta: 3, available: false, display_order: 2 },
      ],
    },
  ];

  const items = [
    item('smash-classico', 'burgers', { name: 'Smash Clássico', description: 'Pão brioche, carne 120g, queijo, salada e molho da casa.', price: 29.9, costPrice: 11.5, prepTime: 14, order: 1, trackStock: true, stock: 18, lowStock: 5, image: 'burgers.jpg' }),
    item('bacon-duplo', 'burgers', { name: 'Bacon Duplo', description: 'Dois smash burgers, cheddar cremoso, bacon crocante e maionese defumada.', price: 36.9, costPrice: 15.2, prepTime: 18, order: 2, trackStock: true, stock: 4, lowStock: 5, optionGroups: meatOptions, image: 'burgers.jpg' }),
    item('costela-bbq', 'burgers', { name: 'Costela BBQ - estoque zerado', description: 'Burger de costela com barbecue. Cenário QA de item sem estoque.', price: 39.9, costPrice: 17.8, prepTime: 20, order: 3, trackStock: true, stock: 0, lowStock: 3, image: 'burgers.jpg' }),
    item('batata-rustica', 'burgers', { name: 'Batata Rústica', description: 'Batatas crocantes com páprica e maionese verde.', price: 16, costPrice: 5.1, prepTime: 10, order: 4, image: 'burgers.jpg' }),
    item('combo-casa', 'burgers', { name: 'Combo da Casa', description: 'Smash Clássico, batata rústica e limonada em um único combo.', price: 49.9, costPrice: 19.5, prepTime: 18, order: 5, itemType: 'COMBO', comboComponents: [
      { menu_item_id: id('item', 'smash-classico'), quantity: 1, display_order: 0 },
      { menu_item_id: id('item', 'batata-rustica'), quantity: 1, display_order: 1 },
      { menu_item_id: id('item', 'limonada'), quantity: 1, display_order: 2 },
    ], image: 'burgers.jpg' }),
    item('pizza-calabresa', 'pizzas', { name: 'Pizza Calabresa', description: 'Muçarela, calabresa artesanal, cebola roxa e orégano.', price: 52, costPrice: 20.4, prepTime: 25, order: 1, image: 'pizzas.jpg' }),
    item('pizza-margherita', 'pizzas', { name: 'Pizza Margherita', description: 'Molho de tomate, muçarela, tomate fresco e manjericão.', price: 49, costPrice: 17.5, prepTime: 24, order: 2, image: 'pizzas.jpg' }),
    item('pizza-quatro-queijos', 'pizzas', { name: 'Quatro Queijos - indisponível', description: 'Cenário QA desativado manualmente no cardápio.', price: 58, costPrice: 24, prepTime: 26, order: 3, available: false, image: 'pizzas.jpg' }),
    item('pizza-meio-a-meio', 'pizzas', { name: 'Pizza Meio a Meio', description: 'Escolha dois sabores para compartilhar.', price: 56, costPrice: 22, prepTime: 27, order: 4, optionGroups: [{
      name: 'Segundo sabor', required: true, min_select: 1, max_select: 1, display_order: 0,
      options: ['Calabresa', 'Margherita', 'Quatro queijos'].map((name, index) => ({ name, price_delta: name === 'Quatro queijos' ? 3 : 0, available: name !== 'Quatro queijos', display_order: index })),
    }], image: 'pizzas.jpg' }),
    item('picanha-completa', 'brasileiros', { name: 'Picanha Completa', description: 'Picanha grelhada, arroz, feijão, mandioca, farofa e vinagrete.', price: 69.9, costPrice: 31.4, prepTime: 28, order: 1, image: 'pratos-brasileiros.jpg' }),
    item('feijoada-sabado', 'brasileiros', { name: 'Feijoada de Sábado', description: 'Cenário QA disponível somente aos sábados, das 11h às 15h.', price: 42.9, costPrice: 18.6, prepTime: 25, order: 2, windows: [{ dayOfWeek: 6, startTime: '11:00', endTime: '15:00' }], image: 'pratos-brasileiros.jpg' }),
    item('frango-grelhado', 'brasileiros', { name: 'Frango Grelhado - sem custo', description: 'Prato executivo sem custo cadastrado para testar cobertura de margem.', price: 35.9, prepTime: 20, order: 3, image: 'pratos-brasileiros.jpg' }),
    item('bowl-falafel', 'vegetarianos', { name: 'Bowl de Falafel', description: 'Falafel, quinoa, legumes grelhados, avocado e molho tahine.', price: 37.9, costPrice: 14.8, prepTime: 16, order: 1, optionGroups: [{
      name: 'Molho', required: true, min_select: 1, max_select: 1, display_order: 0,
      options: [
        { name: 'Tahine', price_delta: 0, available: true, display_order: 0 },
        { name: 'Iogurte com ervas', price_delta: 2, available: true, display_order: 1 },
        { name: 'Sem molho', price_delta: 0, available: true, display_order: 2 },
      ],
    }], image: 'vegetarianos.jpg' }),
    item('burger-vegano', 'vegetarianos', { name: 'Burger Vegano', description: 'Burger de grão-de-bico, salada crocante e maionese vegetal.', price: 34.9, costPrice: 13.2, prepTime: 17, order: 2, image: 'vegetarianos.jpg' }),
    item('salada-horta', 'vegetarianos', { name: 'Salada da Horta', description: 'Folhas, tomate, avocado, cenoura e sementes tostadas.', price: 28, costPrice: 9.4, prepTime: 8, order: 3, image: 'vegetarianos.jpg' }),
    item('limonada', 'bebidas', { name: 'Limonada da Casa', description: 'Limão fresco, gelo e hortelã.', price: 12, costPrice: 2.8, prepTime: 4, order: 1, destination: 'BAR', image: 'bebidas.jpg' }),
    item('suco-maracuja', 'bebidas', { name: 'Suco de Maracujá', description: 'Polpa natural batida na hora.', price: 14, costPrice: 3.6, prepTime: 4, order: 2, destination: 'BAR', image: 'bebidas.jpg' }),
    item('agua-gas', 'bebidas', { name: 'Água com Gás', description: 'Garrafa 500ml servida gelada.', price: 6.5, costPrice: 2.1, prepTime: 1, order: 3, destination: 'BAR', image: 'bebidas.jpg' }),
    item('cortesia-sem-foto', 'bebidas', { name: 'Água da Casa - sem foto', description: 'Item gratuito e sem imagem para validar estados vazios.', price: 0, costPrice: 0, prepTime: 1, order: 4, destination: 'BAR', noImage: true }),
    item('pudim', 'sobremesas', { name: 'Pudim da Casa - estoque baixo', description: 'Pudim cremoso com calda de caramelo.', price: 14.9, costPrice: 4.2, prepTime: 3, order: 1, trackStock: true, stock: 2, lowStock: 3, image: 'sobremesas.jpg' }),
    item('petit-gateau', 'sobremesas', { name: 'Petit Gâteau', description: 'Bolinho quente de chocolate com sorvete de baunilha.', price: 24.9, costPrice: 8.6, prepTime: 9, order: 2, image: 'sobremesas.jpg' }),
  ];

  return { categories, items };
}

async function seedUsers(passwordHash) {
  const users = [
    ['admin', 'Ana Administradora', 'admin.qa@clickgarcom.local', '11990000001', 'ADMIN', true],
    ['manager', 'Marcos Gerente', 'gerente.qa@clickgarcom.local', '11990000002', 'MANAGER', true],
    ['waiter', 'Gabi Garçonete', 'garcom.qa@clickgarcom.local', '11990000003', 'WAITER', true],
    ['kitchen', 'Caio Cozinha', 'cozinha.qa@clickgarcom.local', '11990000004', 'KITCHEN', true],
    ['bar', 'Beto Bar', 'bar.qa@clickgarcom.local', '11990000005', 'BAR', true],
    ['cashier', 'Clara Caixa', 'caixa.qa@clickgarcom.local', '11990000006', 'CASHIER', true],
    ['inactive', 'Usuário Inativo QA', 'inativo.qa@clickgarcom.local', '11990000007', 'WAITER', false],
  ];

  for (const [key, name, email, phone, role, active] of users) {
    await insertRow('users', {
      id: id('user', key), tenant_id: tenantId, name, email, phone,
      password_hash: passwordHash, role, active, created_at: daysAgo(30), updated_at: now,
      last_login_at: key === 'admin' ? minutesAgo(90) : null,
    });
  }
}

async function seedTablesAndRequests() {
  const tables = [
    ['01', 4, 'OCCUPIED'], ['02', 2, 'OCCUPIED'], ['03', 6, 'OCCUPIED'],
    ['04', 4, 'AVAILABLE'], ['05', 4, 'RESERVED'], ['06', 4, 'CLEANING'],
    ['07', 8, 'AVAILABLE'], ['08', 2, 'OCCUPIED'], ['09', 4, 'AVAILABLE'],
    ['10', 6, 'AVAILABLE'], ['B1', 1, 'AVAILABLE'],
  ];

  for (const [number, capacity, status] of tables) {
    await insertRow('tables', {
      id: id('table', number), tenant_id: tenantId, number, capacity, status,
      qr_token: `qa-table-${number.toLowerCase()}`, qr_expires_at: daysAgo(-30),
      created_at: daysAgo(60), updated_at: now,
    });
  }

  const requests = [
    ['approved', '01', '5511988800011', 4, 'APPROVED', id('user', 'waiter'), 'Gabi Garçonete', minutesAgo(150)],
    ['pending', null, '5511988800022', 2, 'PENDING', null, null, minutesAgo(9)],
    ['rejected', null, '5511988800033', 12, 'REJECTED', id('user', 'manager'), 'Marcos Gerente', minutesAgo(70)],
  ];

  for (const [key, table, phone, pax, status, approvedBy, approvedName, createdAt] of requests) {
    await insertRow('table_requests', {
      id: id('table-request', key), tenant_id: tenantId,
      table_id: table ? id('table', table) : null, user_phone: phone, pax_count: pax,
      status, approved_by_user_id: approvedBy, approved_by_user_name: approvedName,
      created_at: createdAt, updated_at: status === 'PENDING' ? createdAt : new Date(createdAt.getTime() + 5 * 60 * 1000),
    });
  }
}

async function seedTabs() {
  const tabs = [
    ['open-01', '01', '5511988800011', 'OPEN', minutesAgo(145), 'approved'],
    ['waiting-02', '02', '5511988800044', 'WAITING_PAYMENT', minutesAgo(95), null],
    ['partial-03', '03', '5511988800055', 'PARTIALLY_PAID', minutesAgo(80), null],
    ['open-08', '08', '5511988800066', 'OPEN', minutesAgo(22), null],
    ['paid-today', '04', '5511988800077', 'PAID', minutesAgo(210), null],
    ['closed-d1', '04', '5511988800101', 'CLOSED', daysAgo(1, 13), null],
    ['closed-d2', '07', '5511988800102', 'CLOSED', daysAgo(2, 20), null],
    ['closed-d3', '09', '5511988800103', 'CLOSED', daysAgo(3, 12), null],
    ['closed-d4', '10', '5511988800104', 'CLOSED', daysAgo(4, 19), null],
    ['closed-d5', '05', '5511988800105', 'CLOSED', daysAgo(5, 14), null],
    ['closed-d6', '06', '5511988800106', 'CLOSED', daysAgo(6, 13), null],
  ];

  for (const [key, table, phone, status, openedAt, requestKey] of tabs) {
    await insertRow('tabs', {
      id: id('tab', key), tenant_id: tenantId, table_id: id('table', table),
      user_phone: phone, payment_notifier_phone: phone,
      source_request_id: requestKey ? id('table-request', requestKey) : null,
      opened_by_user_id: id('user', 'waiter'), opened_by_user_name: 'Gabi Garçonete',
      subtotal: 0, service_fee: 0, total: 0, paid_amount: 0, status,
      opened_at: openedAt,
      closed_at: status === 'CLOSED' ? new Date(openedAt.getTime() + 75 * 60 * 1000) : null,
      closed_by_user_id: status === 'CLOSED' ? id('user', 'cashier') : null,
      closed_by_user_name: status === 'CLOSED' ? 'Clara Caixa' : null,
    });
  }
}

async function seedOrders() {
  const batches = [
    ['open-01', 'open-01', 'PENDING', minutesAgo(44)],
    ['waiting-02', 'waiting-02', 'ACCEPTED', minutesAgo(31)],
    ['partial-03', 'partial-03', 'READY', minutesAgo(38)],
    ['open-08', 'open-08', 'PENDING', minutesAgo(7)],
    ['paid-today', 'paid-today', 'DELIVERED', minutesAgo(190)],
    ['closed-d1', 'closed-d1', 'DELIVERED', daysAgo(1, 13)],
    ['closed-d2', 'closed-d2', 'DELIVERED', daysAgo(2, 20)],
    ['closed-d3', 'closed-d3', 'DELIVERED', daysAgo(3, 12)],
    ['closed-d4', 'closed-d4', 'DELIVERED', daysAgo(4, 19)],
    ['closed-d5', 'closed-d5', 'DELIVERED', daysAgo(5, 14)],
    ['closed-d6', 'closed-d6', 'DELIVERED', daysAgo(6, 13)],
  ];

  for (const [key, tabKey, status, createdAt] of batches) {
    await insertRow('order_batches', {
      id: id('batch', key), tenant_id: tenantId, tab_id: id('tab', tabKey),
      customer_phone: `5511977${String(key.length).padStart(6, '0')}`, status,
      created_at: createdAt, updated_at: now,
      accepted_at: ['ACCEPTED', 'READY', 'DELIVERED'].includes(status) ? new Date(createdAt.getTime() + 8 * 60 * 1000) : null,
      ready_at: ['READY', 'DELIVERED'].includes(status) ? new Date(createdAt.getTime() + 25 * 60 * 1000) : null,
      delivered_at: status === 'DELIVERED' ? new Date(createdAt.getTime() + 35 * 60 * 1000) : null,
    });
  }

  const orders = [
    { key: 'open01-kitchen', tab: 'open-01', batch: 'open-01', destination: 'KITCHEN', status: 'PENDING', created: minutesAgo(44), notes: 'QA: pedido atrasado no KDS', items: [['picanha-completa', 1, 69.9, 'Carne ao ponto', null]] },
    { key: 'open01-bar', tab: 'open-01', batch: 'open-01', destination: 'BAR', status: 'PENDING', created: minutesAgo(5), items: [['limonada', 2, 12, 'Pouco açúcar', null]] },
    { key: 'waiting02-kitchen', tab: 'waiting-02', batch: 'waiting-02', destination: 'KITCHEN', status: 'ACCEPTED', created: minutesAgo(31), accepted: minutesAgo(27), items: [
      ['bacon-duplo', 1, 41.9, 'Sem picles', [{ group_name: 'Ponto da carne', option_name: 'Ao ponto', price_delta: 0 }, { group_name: 'Adicionais', option_name: 'Bacon extra', price_delta: 5 }]],
      ['batata-rustica', 1, 16, null, null],
    ] },
    { key: 'waiting02-bar', tab: 'waiting-02', batch: 'waiting-02', destination: 'BAR', status: 'ACCEPTED', created: minutesAgo(18), accepted: minutesAgo(16), items: [['suco-maracuja', 1, 14, 'Sem açúcar', null]] },
    { key: 'partial03-kitchen', tab: 'partial-03', batch: 'partial-03', destination: 'KITCHEN', status: 'READY', created: minutesAgo(38), accepted: minutesAgo(32), ready: minutesAgo(4), items: [['pizza-calabresa', 1, 52, 'Cebola à parte', null]] },
    { key: 'open08-kitchen', tab: 'open-08', batch: 'open-08', destination: 'KITCHEN', status: 'PENDING', created: minutesAgo(7), items: [['burger-vegano', 2, 34.9, null, null]] },
    { key: 'paid-combo', tab: 'paid-today', batch: 'paid-today', destination: 'KITCHEN', status: 'DELIVERED', created: minutesAgo(190), accepted: minutesAgo(184), ready: minutesAgo(165), delivered: minutesAgo(157), items: [['combo-casa', 2, 49.9, null, null]] },
    { key: 'paid-bar', tab: 'paid-today', batch: 'paid-today', destination: 'BAR', status: 'DELIVERED', created: minutesAgo(188), accepted: minutesAgo(185), ready: minutesAgo(180), delivered: minutesAgo(178), items: [['agua-gas', 2, 6.5, null, null]] },
    { key: 'd1-picanha', tab: 'closed-d1', batch: 'closed-d1', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(1, 13), items: [['picanha-completa', 2, 69.9, null, null]] },
    { key: 'd2-pizza', tab: 'closed-d2', batch: 'closed-d2', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(2, 20), items: [['pizza-margherita', 1, 49, null, null], ['pizza-calabresa', 1, 52, null, null]] },
    { key: 'd3-bowl', tab: 'closed-d3', batch: 'closed-d3', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(3, 12), items: [['bowl-falafel', 2, 39.9, null, [{ group_name: 'Molho', option_name: 'Iogurte com ervas', price_delta: 2 }]]] },
    { key: 'd4-canceled', tab: 'closed-d4', batch: 'closed-d4', destination: 'KITCHEN', status: 'CANCELED', created: daysAgo(4, 18), canceled: daysAgo(4, 18), notes: 'Cenário QA de cancelamento', items: [['costela-bbq', 1, 39.9, null, null]] },
    { key: 'd4-smash', tab: 'closed-d4', batch: 'closed-d4', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(4, 19), items: [['smash-classico', 3, 29.9, null, null], ['batata-rustica', 2, 16, null, null]] },
    { key: 'd5-dessert', tab: 'closed-d5', batch: 'closed-d5', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(5, 14), items: [['pudim', 2, 14.9, null, null], ['petit-gateau', 1, 24.9, null, null]] },
    { key: 'd6-feijoada', tab: 'closed-d6', batch: 'closed-d6', destination: 'KITCHEN', status: 'DELIVERED', created: daysAgo(6, 13), items: [['feijoada-sabado', 4, 42.9, null, null]] },
  ];

  for (const order of orders) {
    const orderId = id('order', order.key);
    const isDelivered = order.status === 'DELIVERED';
    await insertRow('orders', {
      id: orderId, tenant_id: tenantId, tab_id: id('tab', order.tab), batch_id: id('batch', order.batch),
      destination: order.destination, status: order.status, notes: order.notes || null,
      created_at: order.created,
      accepted_at: order.accepted || (isDelivered ? new Date(order.created.getTime() + 7 * 60 * 1000) : null),
      ready_at: order.ready || (isDelivered ? new Date(order.created.getTime() + 24 * 60 * 1000) : null),
      delivered_at: order.delivered || (isDelivered ? new Date(order.created.getTime() + 32 * 60 * 1000) : null),
      canceled_at: order.canceled || null,
      cancel_reason: order.status === 'CANCELED' ? 'Item indisponível após confirmação' : null,
      cancel_reason_code: order.status === 'CANCELED' ? 'ITEM_FORA_CARDAPIO' : null,
      cancel_category: order.status === 'CANCELED' ? 'stock' : null,
      canceled_by_user_id: order.status === 'CANCELED' ? id('user', 'manager') : null,
      canceled_by_user_name: order.status === 'CANCELED' ? 'Marcos Gerente' : null,
    });

    for (let index = 0; index < order.items.length; index += 1) {
      const [itemKey, quantity, unitPrice, observations, selectedOptions] = order.items[index];
      await insertRow('order_items', {
        id: id('order-item', `${order.key}-${index}`), order_id: orderId,
        menu_item_id: id('item', itemKey), quantity, unit_price: unitPrice,
        observations, selected_options: selectedOptions, created_at: order.created,
      });
    }
  }

  await client.query(
    `WITH totals AS (
       SELECT o.tab_id, COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS subtotal
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = $1 AND o.status <> 'CANCELED'
        GROUP BY o.tab_id
     )
     UPDATE tabs t
        SET subtotal = totals.subtotal,
            service_fee = ROUND(totals.subtotal * 0.10, 2),
            total = ROUND(totals.subtotal * 1.10, 2)
       FROM totals
      WHERE t.id = totals.tab_id`,
    [tenantId],
  );
  await client.query(
    `UPDATE tabs SET paid_amount = CASE
       WHEN status IN ('PAID', 'CLOSED') THEN total
       WHEN status = 'PARTIALLY_PAID' THEN ROUND(total / 2, 2)
       ELSE 0 END
     WHERE tenant_id = $1`,
    [tenantId],
  );
}

async function seedPaymentsAndOperations() {
  const tabTotals = await client.query(
    'SELECT id, total, paid_amount FROM tabs WHERE tenant_id = $1',
    [tenantId],
  );
  const totals = new Map(tabTotals.rows.map((row) => [row.id, row]));
  const tabTotal = (key) => Number(totals.get(id('tab', key))?.total || 1);
  const tabPaid = (key) => Number(totals.get(id('tab', key))?.paid_amount || 1);

  const payments = [
    ['pending-pix', 'waiting-02', 'FULL', tabTotal('waiting-02'), 'PENDING', null, minutesAgo(12)],
    ['partial-card', 'partial-03', 'SPLIT_EQUAL', tabPaid('partial-03'), 'CONFIRMED', 'CREDIT_CARD', minutesAgo(20)],
    ['paid-pix', 'paid-today', 'FULL', tabTotal('paid-today'), 'CONFIRMED', 'PIX', minutesAgo(145)],
    ['expired-pix', 'closed-d1', 'FULL', tabTotal('closed-d1'), 'EXPIRED', 'PIX', daysAgo(1, 14)],
    ['canceled-pix', 'closed-d2', 'SPLIT_ITEMS', 49, 'CANCELED', 'PIX', daysAgo(2, 20)],
  ];

  for (const [key, tabKey, paymentType, amount, status, method, createdAt] of payments) {
    const paymentId = id('payment', key);
    await insertRow('payments', {
      id: paymentId, tenant_id: tenantId, tab_id: id('tab', tabKey),
      payment_type: paymentType, amount: Math.max(amount, 0.01), status,
      pix_txid: method === 'PIX' || !method ? `QA-${key}-${now.getTime()}` : null,
      pix_qr_code: status === 'PENDING' ? '00020126-QA-PIX-CODE' : null,
      pix_qr_code_image: null,
      metadata: { qa_scenario: key, seeded: true },
      created_at: createdAt, updated_at: createdAt,
      paid_at: status === 'CONFIRMED' ? new Date(createdAt.getTime() + 4 * 60 * 1000) : null,
      expired_at: status === 'EXPIRED' ? new Date(createdAt.getTime() + 30 * 60 * 1000) : null,
      method, external_reference: `qa-${key}`,
    });

    const attemptStatus = { PENDING: 'PENDING', CONFIRMED: 'APPROVED', EXPIRED: 'EXPIRED', CANCELED: 'CANCELED' }[status];
    await insertRow('payment_attempts', {
      id: id('payment-attempt', key), payment_id: paymentId, tenant_id: tenantId,
      tab_id: id('tab', tabKey), provider: 'MERCADO_PAGO',
      payment_method: method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX',
      requested_amount: Math.max(amount, 0.01), idempotency_key: `qa-idempotency-${key}`,
      external_reference: `qa-${key}`, provider_payment_id: `MP-QA-${key}`,
      status: attemptStatus, provider_status: status.toLowerCase(),
      provider_status_detail: status === 'CANCELED' ? 'cancelled_by_test_user' : null,
      request_payload: { qa: true, scenario: key }, response_payload: { status: status.toLowerCase() },
      reconciled_at: status !== 'PENDING' ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null,
      settled_at: status === 'CONFIRMED' ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null,
      created_at: createdAt, updated_at: createdAt,
    });
  }

  await insertRow('payment_item_allocations', {
    id: id('payment-allocation', 'canceled-pix'), payment_id: id('payment', 'canceled-pix'),
    order_item_id: id('order-item', 'd2-pizza-0'), allocated_quantity: 1, created_at: daysAgo(2, 20),
  });

  const requests = [
    ['urgent', '01', 'open-01', 'ISSUE', 'Pedido atrasado; cliente solicitou gerente.', 'PENDING', 5, minutesAgo(4)],
    ['waiter', '02', 'waiting-02', 'CALL_WAITER', 'Cliente quer tirar uma dúvida sobre a conta.', 'IN_PROGRESS', 4, minutesAgo(11)],
    ['bill', '03', 'partial-03', 'CLOSE_BILL', 'Solicitação de fechamento da comanda.', 'PENDING', 4, minutesAgo(6)],
    ['ice', '08', 'open-08', 'ICE', 'Mais gelo para a mesa.', 'PENDING', 2, minutesAgo(2)],
    ['napkin', '01', 'open-01', 'NAPKIN', 'Guardanapos extras.', 'RESOLVED', 2, minutesAgo(35)],
    ['canceled', '02', 'waiting-02', 'OTHER', 'Solicitação cancelada pelo cliente.', 'CANCELED', 1, minutesAgo(50)],
  ];
  for (const [key, table, tab, type, description, status, priority, createdAt] of requests) {
    await insertRow('service_requests', {
      id: id('service-request', key), tenant_id: tenantId, table_id: id('table', table),
      tab_id: id('tab', tab), request_type: type, description, status, priority, created_at: createdAt,
      resolved_at: status === 'RESOLVED' ? new Date(createdAt.getTime() + 8 * 60 * 1000) : null,
      resolved_by: status === 'RESOLVED' ? id('user', 'waiter') : null,
    });
  }

  const nps = [
    ['promoter', 'closed-d1', '5511988800101', 10, 'Comida excelente e atendimento rápido.', true],
    ['passive', 'closed-d2', '5511988800102', 8, 'Gostei, mas a bebida demorou.', false],
    ['detractor', 'closed-d3', '5511988800103', 4, 'Pedido chegou frio. Cenário QA pendente.', false],
    ['critical', 'closed-d4', '5511988800104', 1, 'Item cancelado sem aviso prévio.', false],
  ];
  for (let index = 0; index < nps.length; index += 1) {
    const [key, tab, phone, score, feedback, handled] = nps[index];
    await insertRow('nps_responses', {
      id: id('nps', key), tenant_id: tenantId, tab_id: id('tab', tab), customer_phone: phone,
      score, feedback, handled, handled_at: handled ? daysAgo(index + 1, 16) : null,
      handled_by: handled ? id('user', 'manager') : null, created_at: daysAgo(index + 1, 15),
    });
  }
}

async function seedCommunicationAndAudit() {
  const messageScenarios = [
    ['IN', 'RECEIVED', 'Quero ver o cardápio'], ['OUT', 'SENT', 'Escolha uma categoria para continuar'],
    ['IN', 'RECEIVED', '2'], ['OUT', 'DELIVERED', 'Aqui estão os burgers disponíveis'],
    ['IN', 'RECEIVED', 'Quero o Bacon Duplo'], ['OUT', 'READ', 'Escolha o ponto da carne'],
    ['OUT', 'FAILED', 'Falha simulada: token expirado'], ['IN', 'RECEIVED', 'Chamar garçom'],
  ];
  for (let day = 0; day < 6; day += 1) {
    for (let index = 0; index < messageScenarios.length; index += 1) {
      const [direction, status, preview] = messageScenarios[index];
      await insertRow('message_logs', {
        id: id('message-log', `${day}-${index}`), tenant_id: tenantId, direction,
        message_id: `wamid.qa.${day}.${index}`, status,
        user_phone: `5511988800${String(day + 11).padStart(2, '0')}`,
        message_preview: preview, created_at: daysAgo(day, 10 + (index % 8)),
      });
    }
  }

  const cycles = [
    [monthReference(-3), 'received', 420, 8.4, 8.4, 420, 0, 0, 72, 63.6, 'Ciclo encerrado sem divergências.'],
    [monthReference(-2), 'covered_by_balance', 610, 12.2, 0, 0, 12.2, 0, 63.6, 51.4, 'Coberto integralmente pelo saldo.'],
    [monthReference(-1), 'attention', 840, 16.8, 8, 400, 6.8, 2, 51.4, 42.6, 'Cenário QA com divergência para revisão.'],
    [monthReference(0), 'open', 48, 0.96, 0, 0, 0.96, 0, 42.6, 41.64, 'Ciclo corrente alimentado pelos logs QA.'],
  ];
  for (const [reference, status, chargedMessages, chargedAmount, receivedAmount, receivedCount, covered, outstanding, opening, closing, note] of cycles) {
    await insertRow('wallet_billing_cycles', {
      id: id('wallet-cycle', reference), tenant_id: tenantId, reference_month: reference,
      billing_mode: 'pre_paid', status, charged_messages: chargedMessages, charged_amount: chargedAmount,
      received_amount: receivedAmount, received_count: receivedCount,
      amount_covered_by_balance: covered, outstanding_amount: outstanding,
      opening_balance: opening, closing_balance: closing, note, synced_at: minutesAgo(15),
      created_at: daysAgo(90), updated_at: now,
    });
  }

  const chats = [
    ['open', '5511988800011', 'open-01', '01', 'OPEN', minutesAgo(16), null, null],
    ['closed', '5511988800102', 'closed-d2', '07', 'CLOSED', daysAgo(2, 20), daysAgo(2, 21), 'STAFF'],
  ];
  for (const [key, phone, tab, table, status, openedAt, closedAt, closedBy] of chats) {
    await insertRow('waiter_chats', {
      id: id('waiter-chat', key), tenant_id: tenantId, user_phone: phone,
      tab_id: id('tab', tab), table_id: id('table', table), status,
      opened_at: openedAt, closed_at: closedAt, last_message_at: closedAt || minutesAgo(2), closed_by: closedBy,
    });
  }
  const chatMessages = [
    ['open-1', 'open', 'CUSTOMER', null, 'Meu pedido está demorando, consegue verificar?', minutesAgo(16)],
    ['open-2', 'open', 'STAFF', 'Gabi Garçonete', 'Vou conferir com a cozinha agora.', minutesAgo(13)],
    ['open-3', 'open', 'CUSTOMER', null, 'Obrigado, fico aguardando.', minutesAgo(11)],
    ['closed-1', 'closed', 'CUSTOMER', null, 'Pode trazer a conta?', daysAgo(2, 20)],
    ['closed-2', 'closed', 'STAFF', 'Clara Caixa', 'Conta enviada. Atendimento encerrado.', daysAgo(2, 21)],
  ];
  for (const [key, chat, senderType, senderName, message, createdAt] of chatMessages) {
    await insertRow('waiter_chat_messages', {
      id: id('waiter-chat-message', key), chat_id: id('waiter-chat', chat), tenant_id: tenantId,
      sender_type: senderType, sender_name: senderName, message, created_at: createdAt,
    });
  }

  const tabEvents = [
    ['opened', 'open-01', 'TAB_OPENED', 'Gabi Garçonete', { source: 'TABLE_REQUEST', pax_count: 4 }, minutesAgo(145)],
    ['item-added', 'open-01', 'ORDER_CREATED', 'Cliente WhatsApp', { destination: 'KITCHEN' }, minutesAgo(44)],
    ['payment-requested', 'waiting-02', 'PAYMENT_REQUESTED', 'Clara Caixa', { method: 'PIX' }, minutesAgo(12)],
    ['partial-payment', 'partial-03', 'PAYMENT_CONFIRMED', 'Clara Caixa', { split: true }, minutesAgo(16)],
    ['closed', 'closed-d1', 'TAB_CLOSED', 'Clara Caixa', { reason: 'Pagamento confirmado' }, daysAgo(1, 14)],
  ];
  for (const [key, tab, eventType, actorName, details, createdAt] of tabEvents) {
    await insertRow('tab_events', {
      id: id('tab-event', key), tenant_id: tenantId, tab_id: id('tab', tab), event_type: eventType,
      actor_user_id: actorName === 'Cliente WhatsApp' ? null : id('user', actorName === 'Gabi Garçonete' ? 'waiter' : 'cashier'),
      actor_name: actorName, details, created_at: createdAt,
    });
  }

  const auditEvents = [
    ['login', 'LOGIN_SUCCESS', 'Login efetuado no tenant admin.', 'admin', 'admin', minutesAgo(90)],
    ['user-created', 'USER_CREATED', 'Usuário operacional criado para homologação.', 'admin', 'waiter', daysAgo(10)],
    ['password-reset', 'USER_PASSWORD_RESET', 'Senha redefinida pelo administrador.', 'admin', 'waiter', daysAgo(4)],
    ['user-disabled', 'USER_STATUS_CHANGED', 'Usuário de cenário negativo desativado.', 'manager', 'inactive', daysAgo(2)],
  ];
  for (const [key, eventType, description, actor, target, createdAt] of auditEvents) {
    await insertRow('user_access_audit_logs', {
      id: id('user-audit', key), tenant_id: tenantId,
      actor_user_id: id('user', actor), actor_name: actor === 'admin' ? 'Ana Administradora' : 'Marcos Gerente',
      actor_role: actor === 'admin' ? 'ADMIN' : 'MANAGER', target_user_id: id('user', target),
      target_user_name: target === 'inactive' ? 'Usuário Inativo QA' : target === 'waiter' ? 'Gabi Garçonete' : 'Ana Administradora',
      event_type: eventType, description, metadata: { seeded: true, qa_scenario: key }, created_at: createdAt,
    });
  }

  const flowV1 = {
    type: 'menu', key: 'welcome_menu', channel: 'whatsapp', title: 'Boas-vindas',
    presentation: 'reply_buttons', use_welcome_template: true, body: '', placeholders: [],
    actions: [{ id: 'request_table', label: 'Solicitar mesa', accepted_inputs: ['1', 'solicitar mesa'] }],
    fallback: { invalid_message_key: 'msg_invalid_option' },
  };
  const flowV2 = JSON.parse(JSON.stringify(flowV1));
  flowV2.actions[0].accepted_inputs.push('quero uma mesa', 'mesa para dois');

  await insertRow('bot_flow_definitions', {
    id: id('bot-flow', 'welcome-v1'), tenant_id: tenantId, flow_key: 'welcome_menu', channel: 'whatsapp',
    status: 'ARCHIVED', version: 1, definition: flowV1, created_by: id('user', 'admin'), updated_by: id('user', 'admin'),
    published_at: daysAgo(20), change_reason: 'Versão inicial QA', created_at: daysAgo(20), updated_at: daysAgo(10),
  });
  await insertRow('bot_flow_definitions', {
    id: id('bot-flow', 'welcome-v2'), tenant_id: tenantId, flow_key: 'welcome_menu', channel: 'whatsapp',
    status: 'PUBLISHED', version: 2, definition: flowV2, created_by: id('user', 'manager'), updated_by: id('user', 'manager'),
    source_flow_id: id('bot-flow', 'welcome-v1'), published_at: daysAgo(10),
    change_reason: 'Ampliação das entradas aceitas para homologação', created_at: daysAgo(10), updated_at: daysAgo(10),
  });
}

async function printSummary() {
  const summary = await client.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE tenant_id = $1) AS users,
       (SELECT count(*)::int FROM tables WHERE tenant_id = $1) AS tables,
       (SELECT count(*)::int FROM menu_categories WHERE tenant_id = $1) AS categories,
       (SELECT count(*)::int FROM menu_items WHERE tenant_id = $1) AS menu_items,
       (SELECT count(*)::int FROM tabs WHERE tenant_id = $1) AS tabs,
       (SELECT count(*)::int FROM orders WHERE tenant_id = $1) AS orders,
       (SELECT count(*)::int FROM payments WHERE tenant_id = $1) AS payments,
       (SELECT count(*)::int FROM service_requests WHERE tenant_id = $1) AS service_requests,
       (SELECT count(*)::int FROM message_logs WHERE tenant_id = $1) AS message_logs`,
    [tenantId],
  );

  console.log('\nBase QA criada com sucesso.');
  console.table(summary.rows[0]);
  console.log(`Tenant: Anderson Restaurant (${tenantId})`);
  console.log('Login: admin.qa@clickgarcom.local');
  console.log(`Senha: ${QA_PASSWORD}`);
  console.log('Imagens: /assets/demo-menu/ (caminho local do projeto)');
}

async function seed() {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  const menu = buildMenu();

  await client.connect();
  try {
    await client.query('BEGIN');
    await resetQATenant();
    await insertRow('tenants', {
      id: tenantId,
      name: 'Anderson Restaurant',
      slug: QA_TENANT_SLUG,
      whatsapp_number: env('WHATSAPP_DISPLAY_PHONE_NUMBER', '5511952139635'),
      waba_id: env('WHATSAPP_PHONE_NUMBER_ID', '1031010400090177'),
      meta_token: null,
      settings: {
        service_fee_percent: 10,
        split_enabled: true,
        auto_accept_orders: false,
        nps_enabled: true,
        voucher_enabled: true,
        document: '12.345.678/0001-90',
        address: 'Rua dos Testes, 123 - São Paulo/SP',
        messages: {
          msg_welcome: 'Bem-vindo ao Anderson Restaurant!',
          msg_invalid_option: 'Opção inválida. Tente novamente.',
          msg_order_confirmed: 'Pedido confirmado e enviado para preparo.',
        },
      },
      active: true,
      is_open: true,
      wallet_balance: 41.64,
      billing_plan: 'pre_paid',
      message_price: 0.02,
      created_at: daysAgo(120),
      updated_at: now,
    });
    await seedUsers(passwordHash);
    await seedTablesAndRequests();
    for (const category of menu.categories) {
      const { key, ...row } = category;
      await insertRow('menu_categories', row);
    }
    for (const menuItem of menu.items) {
      const { key, ...row } = menuItem;
      await insertRow('menu_items', row);
    }
    await seedTabs();
    await seedOrders();
    await seedPaymentsAndOperations();
    await seedCommunicationAndAudit();
    await client.query('COMMIT');
    await printSummary();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Falha ao criar a base QA:', error);
  process.exitCode = 1;
});
