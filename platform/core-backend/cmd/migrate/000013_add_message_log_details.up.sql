ALTER TABLE message_logs
ADD COLUMN IF NOT EXISTS user_phone VARCHAR(30),
ADD COLUMN IF NOT EXISTS message_preview VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_created
    ON message_logs (tenant_id, created_at DESC);
