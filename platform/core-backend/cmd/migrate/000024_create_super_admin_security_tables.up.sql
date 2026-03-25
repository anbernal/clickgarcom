CREATE TABLE IF NOT EXISTS super_admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_name VARCHAR(120) NOT NULL,
    source_ip VARCHAR(80),
    user_agent TEXT,
    issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(80)
);

CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_expires
    ON super_admin_sessions (expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_active
    ON super_admin_sessions (revoked_at, expires_at DESC);

CREATE TABLE IF NOT EXISTS super_admin_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(80) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT false,
    operator_name VARCHAR(120),
    session_id UUID REFERENCES super_admin_sessions(id) ON DELETE SET NULL,
    source_ip VARCHAR(80),
    user_agent TEXT,
    auth_method VARCHAR(40),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_access_logs_created
    ON super_admin_access_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_access_logs_event
    ON super_admin_access_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_access_logs_success
    ON super_admin_access_logs (success, created_at DESC);
