ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_cost_price_non_negative;

ALTER TABLE menu_items
    DROP COLUMN IF EXISTS cost_price;
