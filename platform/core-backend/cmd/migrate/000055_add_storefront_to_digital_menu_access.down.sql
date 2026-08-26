ALTER TABLE digital_menu_access_credentials
    DROP CONSTRAINT IF EXISTS digital_menu_access_storefront_check;

ALTER TABLE digital_menu_access_credentials
    DROP COLUMN IF EXISTS storefront;
