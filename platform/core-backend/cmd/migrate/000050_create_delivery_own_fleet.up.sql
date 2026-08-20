-- Identified own-fleet foundation.  Sensitive identity data is kept outside
-- users: the profile is an operational identity, not an admin login.
CREATE TABLE IF NOT EXISTS delivery_driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    cpf_ciphertext BYTEA NOT NULL,
    cpf_nonce BYTEA NOT NULL,
    cpf_auth_tag BYTEA NOT NULL,
    cpf_hmac CHAR(64) NOT NULL,
    cpf_last4 CHAR(4) NOT NULL,
    plate VARCHAR(8) NOT NULL,
    pin_hash TEXT,
    phone VARCHAR(20),
    delivery_limit INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    availability VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    deactivation_reason TEXT,
    deactivated_at TIMESTAMPTZ,
    last_access_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_profiles_tenant_id_key UNIQUE (id, tenant_id),
    CONSTRAINT delivery_driver_profiles_limit_check CHECK (delivery_limit BETWEEN 1 AND 10),
    CONSTRAINT delivery_driver_profiles_availability_check CHECK (availability IN ('AVAILABLE','BUSY','ON_ROUTE','OCCURRENCE','BLOCKED','OFFLINE')),
    CONSTRAINT delivery_driver_profiles_version_check CHECK (version > 0),
    CONSTRAINT delivery_driver_profiles_created_by_fkey FOREIGN KEY (created_by, tenant_id) REFERENCES users(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT delivery_driver_profiles_updated_by_fkey FOREIGN KEY (updated_by, tenant_id) REFERENCES users(id, tenant_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_profiles_active ON delivery_driver_profiles (tenant_id, active, availability);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_driver_profiles_active_cpf ON delivery_driver_profiles (tenant_id, cpf_hmac) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_driver_profiles_active_plate ON delivery_driver_profiles (tenant_id, plate) WHERE active = TRUE;

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS assigned_driver_profile_id UUID;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_driver_profile_tenant_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deliveries_driver_profile_tenant_fkey'
          AND conrelid = 'deliveries'::regclass
    ) THEN
        ALTER TABLE deliveries ADD CONSTRAINT deliveries_driver_profile_tenant_fkey
            FOREIGN KEY (assigned_driver_profile_id, tenant_id)
            REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant_driver_profile_active
    ON deliveries (tenant_id, assigned_driver_profile_id, status)
    WHERE assigned_driver_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery_driver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    driver_profile_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    assigned_by UUID,
    reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_assignments_delivery_tenant_fkey FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_driver_assignments_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id) REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_assignments_assigned_by_tenant_fkey FOREIGN KEY (assigned_by, tenant_id) REFERENCES users(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT delivery_driver_assignments_position_check CHECK (position > 0),
    CONSTRAINT delivery_driver_assignments_status_check CHECK (status IN ('ACTIVE','RELEASED','COMPLETED','CANCELED')),
    CONSTRAINT delivery_driver_assignments_version_check CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_driver_assignments_active_delivery ON delivery_driver_assignments (tenant_id, delivery_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_driver_assignments_active_position ON delivery_driver_assignments (tenant_id, driver_profile_id, position) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_delivery_driver_assignments_driver_queue ON delivery_driver_assignments (tenant_id, driver_profile_id, status, position);

CREATE TABLE IF NOT EXISTS delivery_driver_access_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_profile_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_access_links_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id) REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_driver_access_links_created_by_tenant_fkey FOREIGN KEY (created_by, tenant_id) REFERENCES users(id, tenant_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_access_links_active ON delivery_driver_access_links (token_hash, expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS delivery_driver_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_profile_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    shift_open BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_sessions_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id) REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_sessions_active ON delivery_driver_sessions (tenant_id, driver_profile_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS delivery_driver_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    driver_profile_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT delivery_driver_incidents_delivery_tenant_fkey FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_driver_incidents_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id) REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_incidents_status_check CHECK (status IN ('OPEN','RESOLVED','CANCELED'))
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_incidents_tenant_status ON delivery_driver_incidents (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_driver_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_profile_id UUID NOT NULL,
    delivery_id UUID,
    event_type VARCHAR(60) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_events_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id) REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_driver_events_delivery_tenant_fkey FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_driver_events_actor_tenant_fkey FOREIGN KEY (actor_user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_events_driver_created ON delivery_driver_events (tenant_id, driver_profile_id, created_at DESC);
