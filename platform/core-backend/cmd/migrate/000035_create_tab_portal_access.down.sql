DROP INDEX IF EXISTS idx_tab_portal_access_active_hash;
DROP INDEX IF EXISTS uq_tab_portal_access_active_tab;
DROP TABLE IF EXISTS tab_portal_access_credentials;

ALTER TABLE tabs
    DROP CONSTRAINT IF EXISTS uq_tabs_id_tenant;
