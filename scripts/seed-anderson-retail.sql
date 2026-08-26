-- Copies the isolated Mercado Modelo QA retail catalog into Anderson's
-- already-enabled Loja module. Existing FOOD SERVICE rows are untouched.
BEGIN;
CREATE TEMP TABLE retail_category_map (source_id uuid PRIMARY KEY, target_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO retail_category_map (source_id, target_id)
SELECT source.id, COALESCE(target.id, gen_random_uuid())
  FROM menu_categories source
  LEFT JOIN menu_categories target
    ON target.tenant_id = '550e8400-e29b-41d4-a716-446655440000'
   AND lower(target.name) = lower(source.name)
 WHERE source.tenant_id = 'ac3b6e1f-83d2-46e5-a2f7-24144e5bb0b1';
INSERT INTO menu_categories (id, tenant_id, name, description, image_url, display_order, active)
SELECT map.target_id, '550e8400-e29b-41d4-a716-446655440000', source.name, source.description, source.image_url, source.display_order, source.active
  FROM retail_category_map map
  JOIN menu_categories source ON source.id = map.source_id
 WHERE NOT EXISTS (SELECT 1 FROM menu_categories existing WHERE existing.id = map.target_id);

CREATE TEMP TABLE retail_product_map (source_id uuid PRIMARY KEY, target_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO retail_product_map (source_id, target_id)
SELECT source.id, gen_random_uuid()
  FROM menu_items source
 WHERE source.tenant_id = 'ac3b6e1f-83d2-46e5-a2f7-24144e5bb0b1'
   AND source.destination = 'PICKING';
INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, cost_price, image_url, whatsapp_short_name, whatsapp_short_description, destination, prep_time_minutes, available, item_type, track_stock, stock_quantity, low_stock_threshold, display_order)
SELECT map.target_id, '550e8400-e29b-41d4-a716-446655440000', categories.target_id, source.name, source.description, source.price, source.cost_price, source.image_url, source.whatsapp_short_name, source.whatsapp_short_description, 'PICKING', 0, source.available, 'STANDARD', TRUE, source.stock_quantity, source.low_stock_threshold, source.display_order
  FROM retail_product_map map
  JOIN menu_items source ON source.id = map.source_id
  JOIN retail_category_map categories ON categories.source_id = source.category_id;
INSERT INTO retail_product_details (tenant_id, menu_item_id, sku, barcode, brand, manufacturer, package_label, min_order_quantity, max_order_quantity)
SELECT '550e8400-e29b-41d4-a716-446655440000', products.target_id, details.sku, details.barcode, details.brand, details.manufacturer, details.package_label, details.min_order_quantity, details.max_order_quantity
  FROM retail_product_map products
  JOIN retail_product_details details ON details.tenant_id = 'ac3b6e1f-83d2-46e5-a2f7-24144e5bb0b1' AND details.menu_item_id = products.source_id;
INSERT INTO inventory_balances (tenant_id, menu_item_id, on_hand, reserved, version)
SELECT '550e8400-e29b-41d4-a716-446655440000', products.target_id, balances.on_hand, 0, 1
  FROM retail_product_map products
  JOIN inventory_balances balances ON balances.tenant_id = 'ac3b6e1f-83d2-46e5-a2f7-24144e5bb0b1' AND balances.menu_item_id = products.source_id;
COMMIT;

SELECT count(*) AS retail_products
  FROM menu_items
 WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000'
   AND destination = 'PICKING';
SELECT count(*) AS retail_categories
  FROM menu_categories c
 WHERE c.tenant_id = '550e8400-e29b-41d4-a716-446655440000'
   AND EXISTS (SELECT 1 FROM menu_items i WHERE i.tenant_id = c.tenant_id AND i.category_id = c.id AND i.destination = 'PICKING');
