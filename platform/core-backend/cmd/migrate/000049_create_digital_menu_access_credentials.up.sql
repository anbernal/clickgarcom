-- One-time capabilities minted by Core WhatsApp for the authenticated digital menu.
-- Only the digest is persisted; the bearer value is returned once to Core.
CREATE TABLE IF NOT EXISTS digital_menu_access_credentials (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    phone_normalized VARCHAR(20) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    purpose VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP_MENU',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_menu_access_customer_fkey
        FOREIGN KEY (customer_id, tenant_id)
        REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT digital_menu_access_purpose_check
        CHECK (purpose = 'WHATSAPP_MENU')
);

CREATE INDEX IF NOT EXISTS idx_digital_menu_access_lookup
    ON digital_menu_access_credentials (tenant_id, phone_normalized, created_at DESC)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_digital_menu_access_expiry
    ON digital_menu_access_credentials (expires_at)
    WHERE used_at IS NULL;
