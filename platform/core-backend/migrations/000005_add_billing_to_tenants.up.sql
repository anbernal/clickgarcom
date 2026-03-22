ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_plan VARCHAR(20) DEFAULT 'pre_paid';

CREATE TABLE IF NOT EXISTS billing_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    operation VARCHAR(20) NOT NULL, -- 'charge' (-), 'recharge' (+)
    description VARCHAR(255) NOT NULL,
    reference_id VARCHAR(100), -- Webhook MP ID ou Hash da Mensagem
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_statements_tenant_id ON billing_statements(tenant_id);
