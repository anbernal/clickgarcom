const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

loadEnvFile(path.resolve(__dirname, '..', '.env'));

const tenantId = String(
  process.env.BENCHMARK_TENANT_ID ||
  process.env.DEFAULT_TENANT_ID ||
  '550e8400-e29b-41d4-a716-446655440000',
).trim();
const iterations = Math.max(1, Number.parseInt(process.env.BENCHMARK_ITERATIONS || '5', 10) || 5);

const queries = [
  {
    name: 'categories.findAll',
    sql: `
      SELECT
          mc.id,
          mc.name,
          mc.display_order,
          COALESCE(item_counts.item_count, 0)::int AS item_count
      FROM menu_categories mc
      LEFT JOIN (
          SELECT mi.category_id, COUNT(*) AS item_count
          FROM menu_items mi
          WHERE mi.tenant_id = $1
          GROUP BY mi.category_id
      ) item_counts
        ON item_counts.category_id = mc.id
      WHERE mc.tenant_id = $1
      ORDER BY mc.display_order ASC, mc.name ASC
    `,
    params: () => [tenantId],
  },
  {
    name: 'tables.findAll',
    sql: `
      SELECT
          t.id,
          t.number,
          t.status,
          COUNT(tb.id)::int AS open_tabs,
          COALESCE(SUM(tb.total), 0) AS open_tabs_total
      FROM tables t
      LEFT JOIN tabs tb
        ON tb.table_id = t.id
       AND tb.tenant_id = t.tenant_id
       AND tb.status = 'OPEN'
      WHERE t.tenant_id = $1
      GROUP BY t.id, t.number, t.status
      ORDER BY t.number ASC
    `,
    params: () => [tenantId],
  },
  {
    name: 'reports.dashboard',
    sql: `
      WITH order_totals AS (
          SELECT
              o.id,
              COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
          FROM orders o
          LEFT JOIN order_items oi
            ON oi.order_id = o.id
          WHERE o.tenant_id = $1
            AND o.created_at >= $2
            AND o.created_at < $3
            AND o.status <> 'CANCELED'
          GROUP BY o.id
      )
      SELECT
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(order_total), 0) AS revenue,
          COALESCE(AVG(order_total), 0) AS avg_ticket
      FROM order_totals
    `,
    params: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return [tenantId, today.toISOString(), tomorrow.toISOString()];
    },
  },
  {
    name: 'reports.weekly',
    sql: `
      WITH order_totals AS (
          SELECT
              o.id,
              DATE(o.created_at) AS report_date,
              COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
          FROM orders o
          LEFT JOIN order_items oi
            ON oi.order_id = o.id
          WHERE o.tenant_id = $1
            AND o.created_at >= $2
            AND o.created_at < $3
            AND o.status <> 'CANCELED'
          GROUP BY o.id, DATE(o.created_at)
      )
      SELECT
          report_date::text AS report_date,
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(order_total), 0) AS revenue
      FROM order_totals
      GROUP BY report_date
      ORDER BY report_date ASC
    `,
    params: () => {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - 6);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      return [tenantId, startDate.toISOString(), endDate.toISOString()];
    },
  },
];

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'postgres',
  });

  await client.connect();
  console.log(`Benchmark tenant=${tenantId} iterations=${iterations}`);

  try {
    for (const query of queries) {
      const timings = [];
      let rowsCount = 0;

      for (let index = 0; index < iterations; index += 1) {
        const startedAt = process.hrtime.bigint();
        const result = await client.query(query.sql, query.params());
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        timings.push(elapsedMs);
        rowsCount = result.rows.length;
      }

      const summary = summarize(timings);
      console.log(
        `${query.name.padEnd(20)} rows=${String(rowsCount).padStart(3, ' ')} avg=${summary.avg.toFixed(2)}ms min=${summary.min.toFixed(2)}ms max=${summary.max.toFixed(2)}ms`,
      );
    }
  } finally {
    await client.end();
  }
}

function summarize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, avg };
}

function loadEnvFile(filename) {
  if (!fs.existsSync(filename)) {
    return;
  }

  const content = fs.readFileSync(filename, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error.message);
  process.exitCode = 1;
});
