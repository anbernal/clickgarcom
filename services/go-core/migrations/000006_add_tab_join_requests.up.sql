CREATE TABLE IF NOT EXISTS tab_join_requests (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    table_id UUID NOT NULL,
    main_tab_id UUID,
    requestor_phone VARCHAR(30) NOT NULL,
    opener_phone VARCHAR(30) NOT NULL,
    join_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tab_join_requests_tenant_id ON tab_join_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tab_join_requests_opener_phone ON tab_join_requests(opener_phone);

ALTER TABLE tabs ADD COLUMN IF NOT EXISTS user_phone VARCHAR(30);
