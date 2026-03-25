DROP INDEX IF EXISTS idx_super_admin_access_logs_success;
DROP INDEX IF EXISTS idx_super_admin_access_logs_event;
DROP INDEX IF EXISTS idx_super_admin_access_logs_created;
DROP TABLE IF EXISTS super_admin_access_logs;

DROP INDEX IF EXISTS idx_super_admin_sessions_active;
DROP INDEX IF EXISTS idx_super_admin_sessions_expires;
DROP TABLE IF EXISTS super_admin_sessions;
