ALTER TABLE delivery_checkouts
    ADD COLUMN IF NOT EXISTS order_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_delivery_checkouts_order_batch
    ON delivery_checkouts (tenant_id, order_batch_id);

ALTER TABLE delivery_checkouts
    DROP CONSTRAINT IF EXISTS delivery_checkouts_order_batch_tenant_fkey;

ALTER TABLE delivery_checkouts
    ADD CONSTRAINT delivery_checkouts_order_batch_tenant_fkey
    FOREIGN KEY (order_batch_id, tenant_id) REFERENCES order_batches(id, tenant_id) ON DELETE RESTRICT;
