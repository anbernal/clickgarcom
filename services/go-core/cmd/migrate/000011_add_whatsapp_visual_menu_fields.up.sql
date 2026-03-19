-- ============================================
-- WHATSAPP VISUAL MENU FIELDS
-- ============================================

ALTER TABLE menu_categories
    ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS whatsapp_short_name VARCHAR(80),
    ADD COLUMN IF NOT EXISTS whatsapp_short_description VARCHAR(160);
