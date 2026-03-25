CREATE TABLE IF NOT EXISTS wallet_billing_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reference_month VARCHAR(7) NOT NULL,
    billing_mode VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'idle',
    charged_messages INT NOT NULL DEFAULT 0,
    charged_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    received_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    received_count INT NOT NULL DEFAULT 0,
    amount_covered_by_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    outstanding_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    opening_balance DECIMAL(10,2),
    closing_balance DECIMAL(10,2),
    note TEXT,
    synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT wallet_billing_cycles_status_check CHECK (
        status IN ('idle', 'open', 'partial', 'received', 'covered_by_balance', 'attention')
    ),
    CONSTRAINT wallet_billing_cycles_mode_check CHECK (
        billing_mode IN ('pre_paid', 'post_paid')
    ),
    CONSTRAINT wallet_billing_cycles_reference_check CHECK (
        reference_month ~ '^[0-9]{4}-[0-9]{2}$'
    ),
    CONSTRAINT wallet_billing_cycles_unique UNIQUE (tenant_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_wallet_billing_cycles_tenant_month
    ON wallet_billing_cycles (tenant_id, reference_month DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_billing_cycles_status
    ON wallet_billing_cycles (tenant_id, status);
