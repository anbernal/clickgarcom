ALTER TABLE tables DROP COLUMN IF EXISTS capacity;

DROP INDEX IF EXISTS idx_table_requests_status;
DROP INDEX IF EXISTS idx_table_requests_table_id;
DROP INDEX IF EXISTS idx_table_requests_tenant_id;

DROP TABLE IF EXISTS table_requests;
