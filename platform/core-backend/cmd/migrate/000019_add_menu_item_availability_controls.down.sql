ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_low_stock_threshold_non_negative;

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_stock_quantity_non_negative;

ALTER TABLE menu_items
    DROP COLUMN IF EXISTS availability_windows,
    DROP COLUMN IF EXISTS low_stock_threshold,
    DROP COLUMN IF EXISTS stock_quantity,
    DROP COLUMN IF EXISTS track_stock;
