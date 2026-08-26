-- Retail checkout is deliberately kept beside the existing Delivery checkout.
-- Products are represented by regular orders with destination PICKING, which
-- prevents a retail sale from ever entering a kitchen/bar station.
CREATE TABLE IF NOT EXISTS retail_order_requests (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    tab_id UUID,
    order_batch_id UUID,
    checkout_key VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'CREATING',
    fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'NEW',
    version INTEGER NOT NULL DEFAULT 1,
    failure_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT retail_order_request_status_check
        CHECK (status IN ('CREATING', 'PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED')),
    CONSTRAINT retail_order_request_fulfillment_check
        CHECK (fulfillment_status IN ('NEW', 'PICKING', 'PACKING', 'READY', 'COMPLETED', 'CANCELED')),
    CONSTRAINT retail_order_request_customer_fkey
        FOREIGN KEY (customer_id, tenant_id)
        REFERENCES customers(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT retail_order_request_tab_fkey
        FOREIGN KEY (tab_id, tenant_id)
        REFERENCES tabs(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT retail_order_request_batch_fkey
        FOREIGN KEY (order_batch_id, tenant_id)
        REFERENCES order_batches(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT retail_order_request_idempotency_unique
        UNIQUE (tenant_id, customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_retail_order_requests_operation
    ON retail_order_requests (tenant_id, fulfillment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retail_order_requests_checkout
    ON retail_order_requests (tenant_id, checkout_key)
    WHERE checkout_key IS NOT NULL;
