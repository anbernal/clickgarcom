ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_item_type_valid;

ALTER TABLE menu_items
    DROP COLUMN IF EXISTS combo_components,
    DROP COLUMN IF EXISTS option_groups,
    DROP COLUMN IF EXISTS item_type;
