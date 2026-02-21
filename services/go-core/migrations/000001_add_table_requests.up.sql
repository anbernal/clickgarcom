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

ALTER TABLE tables ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 4;
