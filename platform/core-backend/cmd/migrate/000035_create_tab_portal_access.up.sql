-- Credenciais revogáveis para o Portal da Comanda.
-- O token bruto nunca é armazenado; apenas seu SHA-256.
ALTER TABLE tabs
    ADD CONSTRAINT uq_tabs_id_tenant UNIQUE (id, tenant_id);

CREATE TABLE tab_portal_access_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    CONSTRAINT fk_tab_portal_access_tenant_tab
        FOREIGN KEY (tab_id, tenant_id)
        REFERENCES tabs (id, tenant_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_tab_portal_access_active_tab
    ON tab_portal_access_credentials (tenant_id, tab_id)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_tab_portal_access_active_hash
    ON tab_portal_access_credentials (token_hash)
    WHERE revoked_at IS NULL;
