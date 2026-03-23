ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN IF NOT EXISTS option_groups JSONB,
    ADD COLUMN IF NOT EXISTS combo_components JSONB;

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_item_type_valid;

ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_item_type_valid
        CHECK (item_type IN ('STANDARD', 'COMBO'));
