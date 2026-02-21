const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres123',
  database: 'clickgarcom_db',
});

async function seed() {
  await client.connect();
  const tenantId = '550e8400-e29b-41d4-a716-446655440000'; // Default Tenant

  try {
    console.log('Clearing old data...');
    await client.query('DELETE FROM order_items; DELETE FROM orders; DELETE FROM tabs; DELETE FROM table_requests; DELETE FROM tables; DELETE FROM menu_items; DELETE FROM menu_categories; DELETE FROM tenants;');

    console.log('Inserting Tenant...');
    await client.query('INSERT INTO tenants (id, name, slug, whatsapp_number, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())', [tenantId, 'Restaurante Teste QA', 'restaurante-teste-qa', '5511999999999']);

    console.log('Inserting Tables...');
    for (let i = 1; i <= 10; i++) {
      const status = i <= 3 ? 'OCCUPIED' : 'AVAILABLE';
      await client.query('INSERT INTO tables (id, tenant_id, number, status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())', [uuidv4(), tenantId, i.toString(), status]);
    }

    console.log('Inserting Categories e Items...');
    const catLanchesId = uuidv4();
    const catBebidasId = uuidv4();
    await client.query('INSERT INTO menu_categories (id, tenant_id, name, active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW()), ($4, $5, $6, true, NOW(), NOW())', [catLanchesId, tenantId, 'Lanches', catBebidasId, tenantId, 'Bebidas']);

    const miBurgerId = uuidv4();
    const miRefriId = uuidv4();

    await client.query('INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, available, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW()), ($7, $8, $9, $10, $11, $12, true, NOW(), NOW())', [
      miBurgerId, tenantId, catLanchesId, 'Hambúrguer QA', 'Pão brioche, carne de 180g, queijo', 35.00,
      miRefriId, tenantId, catBebidasId, 'Refrigerante 350ml', 'Lata gelada', 6.50
    ]);

    console.log('Inserting sample Tabs and Orders...');
    const tableResult = await client.query("SELECT id FROM tables WHERE status = 'OCCUPIED' LIMIT 1");
    if (tableResult.rows.length > 0) {
      const occupiedTableId = tableResult.rows[0].id;
      const tabId = uuidv4();

      await client.query("INSERT INTO tabs (id, tenant_id, table_id, status, subtotal, service_fee, total, paid_amount, opened_at) VALUES ($1, $2, $3, 'OPEN', 41.50, 4.15, 45.65, 0, NOW())", [tabId, tenantId, occupiedTableId]);

      const orderId = uuidv4();
      await client.query("INSERT INTO orders (id, tab_id, tenant_id, status, destination, created_at) VALUES ($1, $2, $3, 'PENDING', 'KITCHEN', NOW())", [orderId, tabId, tenantId]);

      console.log('Inserting Order Items...');
      await client.query("INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, created_at) VALUES ($1, $2, $3, $4, $5, NOW()), ($6, $7, $8, $9, $10, NOW())", [
        uuidv4(), orderId, miBurgerId, 1, 35.00,
        uuidv4(), orderId, miRefriId, 1, 6.50
      ]);

      console.log('Orders created perfectly!');
    }

    console.log('Seed completed successfully!');
  } catch (err) {
    console.error('Seed Error:', err);
  } finally {
    await client.end();
  }
}

seed();
