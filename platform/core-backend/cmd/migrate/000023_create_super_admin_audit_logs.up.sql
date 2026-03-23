CREATE TABLE IF NOT EXISTS super_admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    operator_name VARCHAR(120),
    operator_key_fingerprint VARCHAR(32),
    source_ip VARCHAR(80),
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_created
    ON super_admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_tenant
    ON super_admin_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_action
    ON super_admin_audit_logs (action, created_at DESC);
