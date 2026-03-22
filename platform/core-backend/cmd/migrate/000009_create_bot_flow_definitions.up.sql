-- ============================================
-- BOT FLOW DEFINITIONS
-- ============================================

CREATE TABLE bot_flow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    flow_key VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    version INT NOT NULL CHECK (version > 0),
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID NULL,
    updated_by UUID NULL,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_bot_flow_definition_status
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT uq_bot_flow_definition_version
        UNIQUE (tenant_id, flow_key, channel, version)
);

CREATE INDEX idx_bot_flow_definitions_tenant
    ON bot_flow_definitions(tenant_id);

CREATE INDEX idx_bot_flow_definitions_lookup
    ON bot_flow_definitions(tenant_id, flow_key, channel, status);

CREATE UNIQUE INDEX idx_bot_flow_definitions_single_published
    ON bot_flow_definitions(tenant_id, flow_key, channel)
    WHERE status = 'PUBLISHED';
