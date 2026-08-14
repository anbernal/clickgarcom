-- Credential profiles are owned by Super Admin. A tenant may keep multiple
-- Mercado Pago accounts but exactly one may be active at a time.
CREATE TABLE tenant_payment_gateway_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT 'MERCADO_PAGO',
    environment VARCHAR(20) NOT NULL,
    public_key TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenant_payment_gateway_profiles_provider_check
        CHECK (provider = 'MERCADO_PAGO'),
    CONSTRAINT tenant_payment_gateway_profiles_environment_check
        CHECK (environment IN ('TEST', 'PRODUCTION')),
    CONSTRAINT tenant_payment_gateway_profiles_tenant_name_key
        UNIQUE (tenant_id, name)
);

-- Preserve the encrypted configuration already in use before profiles existed.
-- Plain legacy fields are deliberately not copied: they must be registered again
-- through Super Admin so they are encrypted with the application key.
INSERT INTO tenant_payment_gateway_profiles
    (tenant_id, name, provider, environment, public_key, access_token_encrypted, is_active)
SELECT
    t.id,
    'Credencial migrada',
    'MERCADO_PAGO',
    COALESCE(NULLIF(t.settings->'payment_gateway'->>'environment', ''), 'TEST'),
    t.settings->'payment_gateway'->>'public_key',
    t.settings->'payment_gateway'->>'access_token_encrypted',
    COALESCE((t.settings->'payment_gateway'->>'enabled')::BOOLEAN, FALSE)
FROM tenants t
WHERE t.settings->'payment_gateway'->>'provider' = 'MERCADO_PAGO'
  AND COALESCE(t.settings->'payment_gateway'->>'public_key', '') <> ''
  AND COALESCE(t.settings->'payment_gateway'->>'access_token_encrypted', '') <> '';

CREATE UNIQUE INDEX uq_tenant_payment_gateway_profiles_one_active
    ON tenant_payment_gateway_profiles (tenant_id)
    WHERE is_active = TRUE;

CREATE INDEX idx_tenant_payment_gateway_profiles_tenant
    ON tenant_payment_gateway_profiles (tenant_id, created_at DESC);
