CREATE TABLE delivery_checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    checkout_key VARCHAR(255) NOT NULL,
    fulfillment_mode VARCHAR(20) NOT NULL,
    customer_id UUID NOT NULL,
    customer_address_id UUID NOT NULL,
    quote_id UUID,
    order_total NUMERIC(10, 2) NOT NULL,
    customer_delivery_fee NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
    confirmation_token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    payment_reference VARCHAR(255),
    delivery_id UUID,
    address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    financial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_checkouts_tenant_key UNIQUE (tenant_id, checkout_key),
    CONSTRAINT delivery_checkouts_token_key UNIQUE (confirmation_token_hash),
    CONSTRAINT delivery_checkouts_mode_check CHECK (fulfillment_mode IN ('OWN', 'EXTERNAL')),
    CONSTRAINT delivery_checkouts_status_check CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELED', 'EXPIRED')),
    CONSTRAINT delivery_checkouts_amount_check CHECK (order_total >= 0 AND customer_delivery_fee >= 0 AND total_amount >= 0),
    CONSTRAINT delivery_checkouts_customer_tenant_fkey
        FOREIGN KEY (customer_id, tenant_id) REFERENCES customers(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_checkouts_address_tenant_fkey
        FOREIGN KEY (customer_address_id, tenant_id) REFERENCES customer_addresses(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_checkouts_quote_tenant_fkey
        FOREIGN KEY (quote_id, tenant_id) REFERENCES delivery_quotes(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_checkouts_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX idx_delivery_checkouts_expiry
    ON delivery_checkouts (expires_at)
    WHERE status = 'PENDING_PAYMENT';

CREATE INDEX idx_delivery_checkouts_tenant_status
    ON delivery_checkouts (tenant_id, status, created_at DESC);
