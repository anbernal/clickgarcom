-- ============================================
-- ORDER BATCHES
-- ============================================

CREATE TABLE order_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    customer_phone VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    ready_at TIMESTAMP,
    delivered_at TIMESTAMP,
    canceled_at TIMESTAMP,
    cancel_reason TEXT,

    CONSTRAINT valid_order_batch_status
        CHECK (status IN ('PENDING', 'ACCEPTED', 'READY_PARTIAL', 'READY', 'DELIVERED', 'CANCELED'))
);

CREATE INDEX idx_order_batches_tenant_status
    ON order_batches(tenant_id, status);

CREATE INDEX idx_order_batches_tab
    ON order_batches(tab_id);

CREATE INDEX idx_order_batches_created_at
    ON order_batches(created_at DESC);

ALTER TABLE orders
    ADD COLUMN batch_id UUID NULL REFERENCES order_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_batch
    ON orders(batch_id)
    WHERE batch_id IS NOT NULL;
