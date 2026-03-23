ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER,
    ADD COLUMN IF NOT EXISTS availability_windows JSONB;

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_stock_quantity_non_negative;

ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_stock_quantity_non_negative
        CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_low_stock_threshold_non_negative;

ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_low_stock_threshold_non_negative
        CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);
