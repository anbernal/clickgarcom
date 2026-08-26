/*
 * Idempotent RETAIL test data. It only creates/updates Mercado Modelo QA and
 * never deletes or updates data from other tenants.
 *
 * Prerequisite: core migration 000053_create_retail_catalog_foundation.
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { v5: uuidv5 } = require('uuid');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const UUID_NAMESPACE = 'f77fe010-b54b-4bc4-a3a7-4af2785d502f';
const TENANT_ID = 'ac3b6e1f-83d2-46e5-a2f7-24144e5bb0b1';
const TENANT_SLUG = 'mercado-modelo-qa';
const TENANT_PHONE = '5511999004321';
const ADMIN_EMAIL = 'admin.mercado.qa@clickgarcom.local';
const ADMIN_PASSWORD = 'Teste@123';

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
const client = new Client({
  host: env('DATABASE_HOST', 'localhost'),
  port: Number(env('DATABASE_PORT', '5432')),
  user: env('DATABASE_USER', 'postgres'),
  password: env('DATABASE_PASSWORD', 'postgres123'),
  database: env('DATABASE_NAME', 'clickgarcom_db'),
  ssl: env('DATABASE_SSL_MODE') === 'require' ? { rejectUnauthorized: false } : false,
});
const id = (kind, key) => uuidv5(`retail-demo:${kind}:${key}`, UUID_NAMESPACE);

const image = (idValue) => `https://images.unsplash.com/${idValue}?auto=format&fit=crop&w=900&q=82`;
const categories = [
  ['offers', 'Ofertas do dia', 'Produtos com preço especial para a próxima compra.', image('photo-1542838132-92c53300491e')],
  ['basics', 'Alimentos básicos', 'Despensa para o dia a dia.', image('photo-1547592180-85f173990554')],
  ['dairy', 'Frios e laticínios', 'Leites, queijos e itens refrigerados.', image('photo-1628088062854-d1870b4553da')],
  ['drinks', 'Bebidas', 'Águas, refrigerantes e sucos.', image('photo-1564419320461-6870880221ad')],
  ['cleaning', 'Limpeza', 'Cuidados para a casa.', image('photo-1585421514738-01798e348b17')],
  ['care', 'Higiene e beleza', 'Cuidados pessoais.', image('photo-1556228578-0d85b1a4d571')],
].map(([key, name, description, imageUrl], index) => ({ key, name, description, imageUrl, displayOrder: index + 1 }));

const products = [
  ['biscoito-polvilho', 'offers', 'Biscoito de Polvilho Tradicional', 'Casa Leve', 'Pacote 100 g', 6.92, 4.2, 27, 6, 'OFE-003', '7891000001073', 'Leve, crocante e pronto para o lanche.', image('photo-1621939514649-280e2ee25f60'), true],
  ['agua-gas', 'offers', 'Água Mineral com Gás', 'Cristalina', 'Garrafa 500 ml', 2.48, 1.35, 60, 12, 'BEB-006', '7891000001066', 'Água mineral com gás, bem gelada.', image('photo-1560023907-5f339617ea30'), true],
  ['arroz', 'basics', 'Arroz Tipo 1', 'Boa Mesa', 'Pacote 5 kg', 27.9, 22.4, 48, 8, 'ALI-001', '7891000001011', 'Arroz branco tipo 1, grãos selecionados.', image('photo-1586208958839-06c17cacdf08'), true],
  ['feijao', 'basics', 'Feijão Carioca', 'Boa Mesa', 'Pacote 1 kg', 8.99, 6.1, 34, 8, 'ALI-005', '7891000001110', 'Feijão carioca selecionado para o dia a dia.', image('photo-1585996741707-7b4f9e8e4b9f'), true],
  ['cafe', 'basics', 'Café Torrado e Moído', 'Serra Alta', 'Pacote 500 g', 18.9, 14.6, 9, 8, 'ALI-033', '7891000001042', 'Café de torra média, aroma intenso.', image('photo-1495474472287-4d71bcdd2085'), true],
  ['acucar', 'basics', 'Açúcar Refinado', 'Doce Dia', 'Pacote 1 kg', 5.49, 3.65, 41, 10, 'ALI-012', '7891000001127', 'Açúcar refinado para receitas e bebidas.', image('photo-1581441363689-1f3c3c414b11'), true],
  ['leite', 'dairy', 'Leite Integral', 'Fazenda Clara', 'Caixa 1 L', 5.79, 4.31, 18, 10, 'LAT-014', '7891000001028', 'Leite UHT integral, fonte de cálcio.', image('photo-1550583724-b2692b85b150'), true],
  ['mucarela', 'dairy', 'Queijo Muçarela Fatiado', 'Laticínios Serra', 'Bandeja 500 g', 24.9, 18.2, 14, 6, 'LAT-022', '7891000001134', 'Queijo muçarela fatiado e refrigerado.', image('photo-1486297678162-eb2a19b0a32d'), true],
  ['iogurte', 'dairy', 'Iogurte Natural', 'Vida Leve', 'Pote 170 g', 4.49, 2.85, 22, 8, 'LAT-028', '7891000001141', 'Iogurte natural integral sem açúcar.', image('photo-1571212515416-fca88c0d86a5'), true],
  ['coca', 'drinks', 'Refrigerante Cola', 'Cola Brasil', 'Garrafa 2 L', 10.99, 7.25, 25, 8, 'BEB-018', '7891000001158', 'Refrigerante sabor cola em garrafa retornável.', image('photo-1629203851122-3726ecdf080e'), true],
  ['suco', 'drinks', 'Suco de Laranja Integral', 'Pomaro', 'Garrafa 1 L', 13.9, 9.4, 11, 5, 'BEB-021', '7891000001165', 'Suco integral de laranja pasteurizado.', image('photo-1600271886742-f049cd451bba'), true],
  ['detergente', 'cleaning', 'Detergente Neutro', 'Brilho', 'Frasco 500 ml', 2.89, 1.72, 42, 10, 'LIM-021', '7891000001035', 'Detergente neutro para louças e utensílios.', image('photo-1585421514284-efb74c2b69a5'), true],
  ['desinfetante', 'cleaning', 'Desinfetante Floral', 'Casa Limpa', 'Frasco 2 L', 12.5, 8.35, 19, 7, 'LIM-034', '7891000001172', 'Limpeza perfumada para pisos e superfícies.', image('photo-1563453392212-326f5e854473'), true],
  ['papel', 'cleaning', 'Papel Higiênico Folha Dupla', 'Conforto', 'Pacote 12 rolos', 18.99, 13.2, 16, 6, 'LIM-041', '7891000001189', 'Papel higiênico macio, folha dupla.', image('photo-1589558928675-8d4c13d6b67c'), true],
  ['shampoo', 'care', 'Shampoo Nutritivo', 'Vitta', 'Frasco 350 ml', 22.5, 16.9, 5, 6, 'HIG-008', '7891000001059', 'Shampoo nutritivo para uso diário.', image('photo-1527799820374-dcf8d9d4a388'), true],
  ['sabonete', 'care', 'Sabonete Líquido Suave', 'Vitta', 'Frasco 250 ml', 12.9, 8.75, 0, 5, 'HIG-019', '7891000001080', 'Sabonete líquido com toque suave.', image('photo-1608248543803-ba4f8c70ae0b'), false],
  ['protetor', 'care', 'Protetor Solar FPS 50', 'Solaris', 'Bisnaga 120 ml', 49.9, 35.4, 12, 4, 'HIG-031', '7891000001196', 'Proteção solar diária FPS 50.', image('photo-1556229010-6c3f2c9ca5f8'), true],
].map(([key, categoryKey, name, brand, packageLabel, price, costPrice, stock, lowStock, sku, barcode, description, imageUrl, available], index) => ({
  key, categoryKey, name, brand, packageLabel, price, costPrice, stock, lowStock, sku, barcode, description, imageUrl, available, displayOrder: index + 1,
}));

async function assertRetailFoundation() {
  const result = await client.query(`SELECT to_regclass('public.retail_product_details') AS retail_details, to_regclass('public.inventory_balances') AS inventory`);
  if (!result.rows[0]?.retail_details || !result.rows[0]?.inventory) {
    throw new Error('A migration 000053_create_retail_catalog_foundation ainda não foi aplicada.');
  }
}

async function seedTenant(passwordHash) {
  const settings = {
    attendance: { enabled: false },
    retail: { enabled: true, enabled_at: new Date().toISOString() },
    delivery: { enabled: true, permanent: true, enabled_at: new Date().toISOString(), whatsapp_order_enabled: true, whatsapp_order_mode: 'DELIVERY_ONLY' },
    digital_menu: { description: 'Mercado de demonstração para testes RETAIL.', primary_color: '#123f35', accent_color: '#1aa382' },
  };
  await client.query(
    `INSERT INTO tenants (id, name, slug, whatsapp_number, waba_id, meta_token, wallet_balance, billing_plan, message_price, settings, active, is_open, establishment_type)
     VALUES ($1, 'Mercado Modelo QA', $2, $3, NULL, NULL, 0, 'pre_paid', 0.02, $4::jsonb, TRUE, TRUE, 'MARKET')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, slug = EXCLUDED.slug, whatsapp_number = EXCLUDED.whatsapp_number,
       settings = EXCLUDED.settings, active = TRUE, is_open = TRUE, establishment_type = 'MARKET', updated_at = NOW()`,
    [TENANT_ID, TENANT_SLUG, TENANT_PHONE, JSON.stringify(settings)],
  );
  await client.query(
    `INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, active)
     VALUES ($1, $2, 'Amanda Gestora', $3, $4, $5, 'ADMIN', TRUE)
     ON CONFLICT (tenant_id, email) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone, password_hash = EXCLUDED.password_hash, role = 'ADMIN', active = TRUE, updated_at = NOW()`,
    [id('user', 'admin'), TENANT_ID, ADMIN_EMAIL, TENANT_PHONE, passwordHash],
  );
}

async function seedCatalog() {
  for (const category of categories) {
    await client.query(
      `INSERT INTO menu_categories (id, tenant_id, name, description, image_url, display_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (tenant_id, name) DO UPDATE SET
         description = EXCLUDED.description, image_url = EXCLUDED.image_url,
         display_order = EXCLUDED.display_order, active = TRUE, updated_at = NOW()`,
      [id('category', category.key), TENANT_ID, category.name, category.description, category.imageUrl, category.displayOrder],
    );
  }

  for (const product of products) {
    const category = categories.find((item) => item.key === product.categoryKey);
    const productId = id('product', product.key);
    await client.query(
      `INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, cost_price, image_url, whatsapp_short_name, whatsapp_short_description, destination, prep_time_minutes, available, display_order, track_stock, stock_quantity, low_stock_threshold, item_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PICKING', 0, $11, $12, TRUE, $13, $14, 'STANDARD')
       ON CONFLICT (id) DO UPDATE SET
         category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
         price = EXCLUDED.price, cost_price = EXCLUDED.cost_price, image_url = EXCLUDED.image_url,
         whatsapp_short_name = EXCLUDED.whatsapp_short_name, whatsapp_short_description = EXCLUDED.whatsapp_short_description,
         destination = 'PICKING', prep_time_minutes = 0, available = EXCLUDED.available,
         display_order = EXCLUDED.display_order, track_stock = TRUE, stock_quantity = EXCLUDED.stock_quantity,
         low_stock_threshold = EXCLUDED.low_stock_threshold, updated_at = NOW()`,
      [productId, TENANT_ID, id('category', category.key), product.name, product.description, product.price, product.costPrice, product.imageUrl, product.name, product.description, product.available, product.displayOrder, product.stock, product.lowStock],
    );
    await client.query(
      `INSERT INTO retail_product_details (tenant_id, menu_item_id, sku, barcode, brand, manufacturer, package_label, min_order_quantity, max_order_quantity)
       VALUES ($1, $2, $3, $4, $5, $5, $6, 1, 12)
       ON CONFLICT (tenant_id, menu_item_id) DO UPDATE SET
         sku = EXCLUDED.sku, barcode = EXCLUDED.barcode, brand = EXCLUDED.brand,
         manufacturer = EXCLUDED.manufacturer, package_label = EXCLUDED.package_label,
         min_order_quantity = 1, max_order_quantity = 12, updated_at = NOW()`,
      [TENANT_ID, productId, product.sku, product.barcode, product.brand, product.packageLabel],
    );
    await client.query(
      `INSERT INTO inventory_balances (tenant_id, menu_item_id, on_hand, reserved, version)
       VALUES ($1, $2, $3, 0, 1)
       ON CONFLICT (tenant_id, menu_item_id) DO UPDATE SET
         on_hand = EXCLUDED.on_hand, reserved = 0, version = inventory_balances.version + 1, updated_at = NOW()`,
      [TENANT_ID, productId, product.stock],
    );
  }

  const lots = [
    ['leite', 'LT-2408A', '2026-09-12', 18],
    ['cafe', 'CAF-0819', '2027-02-18', 9],
    ['shampoo', 'VIT-8821', '2026-11-30', 5],
  ];
  for (const [productKey, lotCode, expiresAt, quantity] of lots) {
    await client.query(
      `INSERT INTO inventory_lots (tenant_id, menu_item_id, lot_code, expires_at, on_hand, reserved)
       VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT (tenant_id, menu_item_id, lot_code) DO UPDATE SET
         expires_at = EXCLUDED.expires_at, on_hand = EXCLUDED.on_hand, reserved = 0, updated_at = NOW()`,
      [TENANT_ID, id('product', productKey), lotCode, expiresAt, quantity],
    );
  }
}

async function printSummary() {
  const result = await client.query(
    `SELECT t.name, t.slug, t.establishment_type,
            (SELECT count(*)::int FROM menu_categories WHERE tenant_id = t.id) AS categories,
            (SELECT count(*)::int FROM menu_items WHERE tenant_id = t.id) AS products,
            (SELECT count(*)::int FROM inventory_balances WHERE tenant_id = t.id) AS balances,
            (SELECT count(*)::int FROM inventory_lots WHERE tenant_id = t.id) AS lots
       FROM tenants t WHERE t.id = $1`,
    [TENANT_ID],
  );
  console.table(result.rows);
  console.log(`Tenant: ${TENANT_SLUG}`);
  console.log(`Login: ${ADMIN_EMAIL}`);
  console.log(`Senha QA: ${ADMIN_PASSWORD}`);
}

async function seedRetailDemo() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await client.connect();
  try {
    await client.query('BEGIN');
    await assertRetailFoundation();
    await seedTenant(passwordHash);
    await seedCatalog();
    await client.query('COMMIT');
    await printSummary();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

seedRetailDemo().catch((error) => {
  console.error(`Falha ao criar dados RETAIL QA: ${error.message}`);
  if (error.position && error.query) console.error(error.query);
  process.exitCode = 1;
});
