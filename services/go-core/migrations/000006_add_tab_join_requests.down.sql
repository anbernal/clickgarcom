ALTER TABLE tabs DROP COLUMN IF EXISTS user_phone;
DROP INDEX IF EXISTS idx_tab_join_requests_opener_phone;
DROP INDEX IF EXISTS idx_tab_join_requests_tenant_id;
DROP TABLE IF EXISTS tab_join_requests;
