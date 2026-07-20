-- Older fresh installs do not have table_requests in the initial schema. Keep
-- this migration self-contained because the runtime image only ships cmd/migrate.
CREATE TABLE IF NOT EXISTS table_requests (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    table_id UUID NOT NULL,
    user_phone VARCHAR(50) NOT NULL,
    pax_count INT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_table_requests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_requests_table FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_table_requests_tenant_id ON table_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_table_id ON table_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_status ON table_requests(status);

-- This column was created by a legacy migration path that is not part of the
-- cmd/migrate sequence used by the container image.
ALTER TABLE tables ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 4;

ALTER TABLE table_requests
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_table_requests_approved_by_user
    ON table_requests (tenant_id, approved_by_user_id)
    WHERE approved_by_user_id IS NOT NULL;

ALTER TABLE tabs
ADD COLUMN IF NOT EXISTS opened_by_user_id UUID,
ADD COLUMN IF NOT EXISTS opened_by_user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS source_request_id UUID REFERENCES table_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_opened_by_user
    ON tabs (tenant_id, opened_by_user_id)
    WHERE opened_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_source_request
    ON tabs (tenant_id, source_request_id)
    WHERE source_request_id IS NOT NULL;
