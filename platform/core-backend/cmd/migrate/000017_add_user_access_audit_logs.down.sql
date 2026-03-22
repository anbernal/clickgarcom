DROP INDEX IF EXISTS idx_user_access_audit_logs_target;
DROP INDEX IF EXISTS idx_user_access_audit_logs_actor;
DROP INDEX IF EXISTS idx_user_access_audit_logs_tenant_created_at;

DROP TABLE IF EXISTS user_access_audit_logs;
