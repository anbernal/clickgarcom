DROP INDEX IF EXISTS idx_tabs_tenant_open_code;
DROP INDEX IF EXISTS idx_tabs_tenant_customer_instagram;
DROP INDEX IF EXISTS idx_tabs_tenant_customer_phone;
DROP INDEX IF EXISTS idx_tabs_tenant_opened_at;

ALTER TABLE tabs
    DROP COLUMN IF EXISTS opening_channel,
    DROP COLUMN IF EXISTS customer_instagram;
