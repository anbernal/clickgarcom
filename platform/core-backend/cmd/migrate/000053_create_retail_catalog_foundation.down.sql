-- A rollback must never silently reclassify RETAIL data as restaurant data.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM tenants WHERE establishment_type <> 'RESTAURANT')
       OR EXISTS (SELECT 1 FROM menu_items WHERE destination = 'PICKING')
       OR EXISTS (SELECT 1 FROM orders WHERE destination = 'PICKING') THEN
        RAISE EXCEPTION 'Cannot roll back RETAIL foundation while RETAIL tenants or PICKING records exist.';
    END IF;
END $$;

DROP TABLE IF EXISTS inventory_lots;
DROP TABLE IF EXISTS inventory_balances;
DROP TABLE IF EXISTS pharmacy_product_details;
DROP TABLE IF EXISTS retail_product_details;
DROP INDEX IF EXISTS uq_menu_items_id_tenant;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS valid_order_destination;
ALTER TABLE orders
    ADD CONSTRAINT valid_order_destination
    CHECK (destination IN ('KITCHEN', 'BAR'));

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS valid_destination;
ALTER TABLE menu_items
    ADD CONSTRAINT valid_destination
    CHECK (destination IN ('KITCHEN', 'BAR'));

DROP INDEX IF EXISTS idx_tenants_establishment_type;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_establishment_type_check;
ALTER TABLE tenants DROP COLUMN IF EXISTS establishment_type;
