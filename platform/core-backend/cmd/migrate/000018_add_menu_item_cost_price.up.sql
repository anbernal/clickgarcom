ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_cost_price_non_negative;

ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_cost_price_non_negative CHECK (cost_price IS NULL OR cost_price >= 0);
