DROP INDEX IF EXISTS idx_message_logs_tenant_created;

ALTER TABLE message_logs
DROP COLUMN IF EXISTS message_preview,
DROP COLUMN IF EXISTS user_phone;
