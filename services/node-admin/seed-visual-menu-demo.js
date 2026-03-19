const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }
    const idx = line.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }

  return env;
}

const repoRoot = path.resolve(__dirname, '..', '..');
const adminEnv = loadEnvFile(path.join(__dirname, '.env'));
const coreEnv = loadEnvFile(path.join(repoRoot, 'services', 'go-core', '.env'));

const env = {
  ...coreEnv,
  ...adminEnv,
};

const tenantId = process.env.TENANT_ID || env.DEFAULT_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000';

const client = new Client({
  host: env.DATABASE_HOST || 'localhost',
  port: Number(env.DATABASE_PORT || 5432),
  user: env.DATABASE_USER || 'postgres',
  password: env.DATABASE_PASSWORD || 'postgres123',
  database: env.DATABASE_NAME || 'clickgarcom_db',
  ssl: env.DATABASE_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
});

const categories = [
  {
    name: 'Lanches',
    description: 'Burgers artesanais, combos e lanches quentes da casa.',
    imageURL:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 1,
  },
  {
    name: 'Pizzas',
    description: 'Pizzas assadas na hora, massa leve e borda crocante.',
    imageURL:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 2,
  },
  {
    name: 'Bebidas',
    description: 'Bebidas geladas para acompanhar o pedido no salão.',
    imageURL:
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 3,
  },
];

const items = [
  {
    name: 'Hambúrguer Grande',
    categoryName: 'Lanches',
    description: 'Pão brioche, carne de 180g, queijo prato, cebola caramelizada e molho da casa.',
    whatsappShortName: 'Burger 180g',
    whatsappShortDescription: 'Pão brioche, carne 180g, queijo e cebola',
    price: 35.0,
    destination: 'KITCHEN',
    prepTimeMinutes: 18,
    imageURL:
      'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 1,
  },
  {
    name: 'Smash Bacon',
    categoryName: 'Lanches',
    description: 'Dois smash burgers, cheddar cremoso, bacon crocante e maionese defumada.',
    whatsappShortName: 'Smash Bacon',
    whatsappShortDescription: '2 smash, cheddar, bacon e maionese',
    price: 32.0,
    destination: 'KITCHEN',
    prepTimeMinutes: 16,
    imageURL:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 2,
  },
  {
    name: 'Combo Crispy Chicken',
    categoryName: 'Lanches',
    description: 'Sanduíche de frango crocante com batata frita e molho especial.',
    whatsappShortName: 'Combo Chicken',
    whatsappShortDescription: 'Frango crocante, fritas e molho especial',
    price: 34.0,
    destination: 'KITCHEN',
    prepTimeMinutes: 18,
    imageURL:
      'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 3,
  },
  {
    name: 'Pizza calabresa',
    categoryName: 'Pizzas',
    description: 'Molho artesanal, muçarela, calabresa fatiada e cebola roxa.',
    whatsappShortName: 'Pizza Calabresa',
    whatsappShortDescription: 'Muçarela, calabresa e cebola roxa',
    price: 45.0,
    destination: 'KITCHEN',
    prepTimeMinutes: 25,
    imageURL:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 1,
  },
  {
    name: 'Pizza Margherita',
    categoryName: 'Pizzas',
    description: 'Molho de tomate, muçarela, tomate fresco e manjericão.',
    whatsappShortName: 'Pizza Marguerita',
    whatsappShortDescription: 'Muçarela, tomate fresco e manjericão',
    price: 43.0,
    destination: 'KITCHEN',
    prepTimeMinutes: 24,
    imageURL:
      'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 2,
  },
  {
    name: 'Coca Cola 500ml',
    categoryName: 'Bebidas',
    description: 'Garrafa 500ml servida bem gelada.',
    whatsappShortName: 'Coca 500ml',
    whatsappShortDescription: 'Garrafa 500ml gelada',
    price: 15.0,
    destination: 'BAR',
    prepTimeMinutes: 2,
    imageURL:
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 1,
  },
  {
    name: 'Guaraná 500ml',
    categoryName: 'Bebidas',
    description: 'Garrafa 500ml gelada para acompanhar seu pedido.',
    whatsappShortName: 'Guaraná 500ml',
    whatsappShortDescription: 'Garrafa 500ml gelada',
    price: 8.5,
    destination: 'BAR',
    prepTimeMinutes: 2,
    imageURL:
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 2,
  },
  {
    name: 'Água Mineral (com/sem gás)',
    categoryName: 'Bebidas',
    description: 'Garrafa 500ml, escolha com ou sem gás.',
    whatsappShortName: 'Água mineral',
    whatsappShortDescription: 'Garrafa 500ml com ou sem gás',
    price: 5.0,
    destination: 'BAR',
    prepTimeMinutes: 1,
    imageURL:
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 3,
  },
  {
    name: 'Energético (Red Bull)',
    categoryName: 'Bebidas',
    description: 'Lata 250ml servida gelada.',
    whatsappShortName: 'Red Bull',
    whatsappShortDescription: 'Lata 250ml gelada',
    price: 15.5,
    destination: 'BAR',
    prepTimeMinutes: 1,
    imageURL:
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 4,
  },
  {
    name: 'Limonada da Casa',
    categoryName: 'Bebidas',
    description: 'Limonada fresca com toque de hortelã.',
    whatsappShortName: 'Limonada',
    whatsappShortDescription: 'Limonada fresca com hortelã',
    price: 12.0,
    destination: 'BAR',
    prepTimeMinutes: 4,
    imageURL:
      'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
    displayOrder: 5,
  },
];

async function ensureTenantExists() {
  const result = await client.query('SELECT id, name FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
  if (result.rows.length === 0) {
    throw new Error(`Tenant ${tenantId} não encontrado. Crie o tenant antes de rodar o seed.`);
  }
  return result.rows[0];
}

async function upsertCategory(category) {
  const existing = await client.query(
    `SELECT id
       FROM menu_categories
      WHERE tenant_id = $1
        AND lower(name) = lower($2)
      LIMIT 1`,
    [tenantId, category.name],
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE menu_categories
          SET description = $3,
              image_url = $4,
              display_order = $5,
              active = true,
              updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2`,
      [tenantId, existing.rows[0].id, category.description, category.imageURL, category.displayOrder],
    );
    return existing.rows[0].id;
  }

  const id = uuidv4();
  await client.query(
    `INSERT INTO menu_categories (
       id, tenant_id, name, description, image_url, display_order, active, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, true, NOW(), NOW()
     )`,
    [id, tenantId, category.name, category.description, category.imageURL, category.displayOrder],
  );
  return id;
}

async function upsertItem(item, categoryId) {
  const existing = await client.query(
    `SELECT id
       FROM menu_items
      WHERE tenant_id = $1
        AND lower(name) = lower($2)
      LIMIT 1`,
    [tenantId, item.name],
  );

  const params = [
    tenantId,
    existing.rows[0]?.id || uuidv4(),
    categoryId,
    item.name,
    item.description,
    item.price,
    item.destination,
    item.prepTimeMinutes,
    item.imageURL,
    item.whatsappShortName,
    item.whatsappShortDescription,
    item.displayOrder,
  ];

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE menu_items
          SET category_id = $3,
              name = $4,
              description = $5,
              price = $6,
              destination = $7,
              prep_time_minutes = $8,
              image_url = $9,
              whatsapp_short_name = $10,
              whatsapp_short_description = $11,
              display_order = $12,
              available = true,
              updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2`,
      params,
    );
    return existing.rows[0].id;
  }

  await client.query(
    `INSERT INTO menu_items (
       tenant_id,
       id,
       category_id,
       name,
       description,
       price,
       destination,
       prep_time_minutes,
       image_url,
       whatsapp_short_name,
       whatsapp_short_description,
       display_order,
       available,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW()
     )`,
    params,
  );

  return params[1];
}

async function seedVisualMenu() {
  await client.connect();

  try {
    const tenant = await ensureTenantExists();
    console.log(`Populando cardápio visual para tenant ${tenant.name} (${tenant.id})`);

    await client.query('BEGIN');

    const categoryIDs = new Map();
    for (const category of categories) {
      const id = await upsertCategory(category);
      categoryIDs.set(category.name, id);
    }

    for (const item of items) {
      const categoryId = categoryIDs.get(item.categoryName);
      if (!categoryId) {
        throw new Error(`Categoria não resolvida para o item ${item.name}: ${item.categoryName}`);
      }
      await upsertItem(item, categoryId);
    }

    await client.query('COMMIT');

    const summary = await client.query(
      `SELECT
         (SELECT count(*)::int FROM menu_categories WHERE tenant_id = $1) AS categories_total,
         (SELECT count(*)::int FROM menu_items WHERE tenant_id = $1) AS items_total,
         (SELECT count(*)::int FROM menu_items WHERE tenant_id = $1 AND image_url IS NOT NULL) AS items_with_image,
         (SELECT count(*)::int FROM menu_items WHERE tenant_id = $1 AND whatsapp_short_name IS NOT NULL) AS items_with_short_name`,
      [tenantId],
    );

    console.log('Seed concluído com sucesso.');
    console.log(summary.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Falha ao popular cardápio visual:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seedVisualMenu();
