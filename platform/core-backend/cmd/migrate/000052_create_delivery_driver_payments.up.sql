-- Financial ledger for deliveries completed by identified own-fleet drivers.
-- Amounts are copied into immutable items when the restaurant records payment,
-- preventing future rate changes from altering a past settlement.
ALTER TABLE delivery_driver_profiles
    ADD COLUMN IF NOT EXISTS per_delivery_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE delivery_driver_profiles
    DROP CONSTRAINT IF EXISTS delivery_driver_profiles_per_delivery_rate_check;
ALTER TABLE delivery_driver_profiles
    ADD CONSTRAINT delivery_driver_profiles_per_delivery_rate_check
    CHECK (per_delivery_rate >= 0);

CREATE TABLE IF NOT EXISTS delivery_driver_payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_profile_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    delivery_count INTEGER NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    payment_method VARCHAR(20) NOT NULL,
    payment_reference VARCHAR(120),
    notes TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    paid_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_payment_batches_tenant_id_key UNIQUE (id, tenant_id),
    CONSTRAINT delivery_driver_payment_batches_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id)
        REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_payment_batches_created_by_tenant_fkey FOREIGN KEY (created_by, tenant_id)
        REFERENCES users(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT delivery_driver_payment_batches_paid_by_tenant_fkey FOREIGN KEY (paid_by, tenant_id)
        REFERENCES users(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT delivery_driver_payment_batches_period_check CHECK (period_end >= period_start),
    CONSTRAINT delivery_driver_payment_batches_status_check CHECK (status IN ('PAID')),
    CONSTRAINT delivery_driver_payment_batches_count_check CHECK (delivery_count > 0),
    CONSTRAINT delivery_driver_payment_batches_total_check CHECK (total_amount >= 0),
    CONSTRAINT delivery_driver_payment_batches_method_check CHECK (payment_method IN ('PIX','CASH','BANK_TRANSFER','OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_payment_batches_tenant_paid
    ON delivery_driver_payment_batches (tenant_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_payment_batches_driver_period
    ON delivery_driver_payment_batches (tenant_id, driver_profile_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS delivery_driver_payment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL,
    delivery_id UUID NOT NULL,
    driver_profile_id UUID NOT NULL,
    delivery_code VARCHAR(20) NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_driver_payment_items_batch_tenant_fkey FOREIGN KEY (batch_id, tenant_id)
        REFERENCES delivery_driver_payment_batches(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_payment_items_delivery_tenant_fkey FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_payment_items_driver_tenant_fkey FOREIGN KEY (driver_profile_id, tenant_id)
        REFERENCES delivery_driver_profiles(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_driver_payment_items_amount_check CHECK (amount >= 0),
    CONSTRAINT uq_delivery_driver_payment_items_delivery UNIQUE (tenant_id, delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_payment_items_batch
    ON delivery_driver_payment_items (tenant_id, batch_id);
