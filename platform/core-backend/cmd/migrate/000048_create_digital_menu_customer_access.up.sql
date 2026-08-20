-- Customer access for the public digital menu.
-- Login challenges keep only an HMAC of the WhatsApp code; order requests
-- provide a durable idempotency boundary around the Delivery checkout.
CREATE TABLE IF NOT EXISTS digital_menu_login_challenges (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_normalized VARCHAR(20) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_menu_login_attempts_check CHECK (attempts BETWEEN 0 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_digital_menu_login_phone
    ON digital_menu_login_challenges (tenant_id, phone_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_digital_menu_login_expiry
    ON digital_menu_login_challenges (expires_at)
    WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS digital_menu_order_requests (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    tab_id UUID,
    order_batch_id UUID,
    checkout_key VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'CREATING',
    failure_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_menu_order_status_check
        CHECK (status IN ('CREATING', 'PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED')),
    CONSTRAINT digital_menu_order_customer_fkey
        FOREIGN KEY (customer_id, tenant_id)
        REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT digital_menu_order_tab_fkey
        FOREIGN KEY (tab_id, tenant_id)
        REFERENCES tabs (id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT digital_menu_order_batch_fkey
        FOREIGN KEY (order_batch_id, tenant_id)
        REFERENCES order_batches (id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT digital_menu_order_idempotency_unique
        UNIQUE (tenant_id, customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_digital_menu_orders_customer
    ON digital_menu_order_requests (tenant_id, customer_id, created_at DESC);
