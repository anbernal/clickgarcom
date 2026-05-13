DROP INDEX IF EXISTS idx_tabs_source_request;
DROP INDEX IF EXISTS idx_tabs_opened_by_user;

ALTER TABLE tabs
    DROP COLUMN IF EXISTS source_request_id,
    DROP COLUMN IF EXISTS opened_by_user_name,
    DROP COLUMN IF EXISTS opened_by_user_id;

DROP INDEX IF EXISTS idx_table_requests_approved_by_user;

ALTER TABLE table_requests
    DROP COLUMN IF EXISTS approved_by_user_name,
    DROP COLUMN IF EXISTS approved_by_user_id;

DROP INDEX IF EXISTS idx_tab_join_requests_opener_phone;
DROP INDEX IF EXISTS idx_tab_join_requests_tenant_id;
DROP TABLE IF EXISTS tab_join_requests;
