CREATE TABLE IF NOT EXISTS user_access_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    actor_role VARCHAR(20),
    target_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    target_user_name VARCHAR(255),
    event_type VARCHAR(60) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_access_audit_logs_tenant_created_at
    ON user_access_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_access_audit_logs_actor
    ON user_access_audit_logs (tenant_id, actor_user_id)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_access_audit_logs_target
    ON user_access_audit_logs (tenant_id, target_user_id)
    WHERE target_user_id IS NOT NULL;
