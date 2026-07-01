CREATE TABLE IF NOT EXISTS table_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    user_phone VARCHAR(30) NOT NULL,
    pax_count INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_by_user_id UUID,
    approved_by_user_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_table_request_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

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
