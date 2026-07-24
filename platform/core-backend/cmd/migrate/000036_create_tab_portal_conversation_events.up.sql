-- Eventos estruturados do Portal da Comanda.
-- Mantem texto, botoes e listas sem alterar o historico legado do KDS.
CREATE TABLE tab_portal_conversation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL,
    direction VARCHAR(12) NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    event_type VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tab_portal_conversation_events_tab
        FOREIGN KEY (tab_id, tenant_id)
        REFERENCES tabs (id, tenant_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_tab_portal_conversation_events_tab_created
    ON tab_portal_conversation_events (tenant_id, tab_id, created_at);
