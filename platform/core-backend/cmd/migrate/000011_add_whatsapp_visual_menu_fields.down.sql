ALTER TABLE menu_items
    DROP COLUMN IF EXISTS whatsapp_short_description,
    DROP COLUMN IF EXISTS whatsapp_short_name;

ALTER TABLE menu_categories
    DROP COLUMN IF EXISTS image_url;
