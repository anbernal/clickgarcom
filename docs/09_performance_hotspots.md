# Mapeamento Inicial de Performance

Este documento registra os hotspots já tratados no `tenant-admin/api` e os candidatos mais óbvios a `materialized views` antes de crescer volume.

## Hotspots Tratados

### Categorias
- Antes: `categories.findAll()` fazia `count()` por categoria.
- Agora: a contagem de itens por categoria sai em uma agregação única com `GROUP BY category_id`.

### Mesas / Comandas
- Antes: `tables.findAll()` carregava tabs abertas por mesa em loop.
- Agora: as tabs abertas são carregadas em lote e agrupadas em memória por `table_id`.

### Relatórios
- Antes: `getDashboardStats()` e `getWeeklySales()` carregavam pedidos completos e somavam no Node.
- Agora: o dashboard e a série semanal usam agregações SQL com `order_totals`.

## Candidatos a Materialized Views

### `mv_order_totals_daily`
Uso:
- `reports.weekly`
- `reports.management`
- comparativos de período

Chave sugerida:
- `tenant_id`
- `report_date`
- `order_status`

Medidas úteis:
- `orders_count`
- `canceled_orders_count`
- `revenue`
- `lost_revenue`
- `avg_acceptance_minutes`
- `avg_preparation_minutes`
- `avg_delivery_minutes`

### `mv_menu_item_sales_daily`
Uso:
- ranking por item
- itens de baixa conversão
- margem por item

Chave sugerida:
- `tenant_id`
- `report_date`
- `menu_item_id`

Medidas úteis:
- `quantity_sold`
- `orders_count`
- `revenue`
- `estimated_cost`

### `mv_category_sales_daily`
Uso:
- ranking por categoria
- margem por categoria
- dashboards resumidos

Chave sugerida:
- `tenant_id`
- `report_date`
- `category_id`

Medidas úteis:
- `quantity_sold`
- `orders_count`
- `revenue`
- `estimated_cost`

### `mv_table_open_tabs_snapshot`
Uso:
- cards de mesas
- visão rápida de comandas abertas
- stats operacionais

Observação:
- aqui pode ser melhor uma tabela de snapshot assíncrona do que uma materialized view clássica, porque o dado é altamente volátil.

## Benchmark Simples

Foi adicionado o script:

```bash
cd apps/tenant-admin/api
npm run benchmark:critical
```

Ele mede consultas representativas de:
- `categories.findAll`
- `tables.findAll`
- `reports.dashboard`
- `reports.weekly`

Parâmetros opcionais:
- `BENCHMARK_TENANT_ID`
- `BENCHMARK_ITERATIONS`

Exemplo:

```bash
cd apps/tenant-admin/api
BENCHMARK_ITERATIONS=10 npm run benchmark:critical
```
