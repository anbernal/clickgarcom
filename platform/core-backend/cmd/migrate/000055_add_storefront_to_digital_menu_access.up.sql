-- A WhatsApp capability is bound to the storefront selected by the customer.
-- MENU means prepared food/cardápio; STORE means products/retail catalog.
ALTER TABLE digital_menu_access_credentials
    ADD COLUMN IF NOT EXISTS storefront VARCHAR(12) NOT NULL DEFAULT 'MENU';

ALTER TABLE digital_menu_access_credentials
    DROP CONSTRAINT IF EXISTS digital_menu_access_storefront_check;

ALTER TABLE digital_menu_access_credentials
    ADD CONSTRAINT digital_menu_access_storefront_check
    CHECK (storefront IN ('MENU', 'STORE'));

