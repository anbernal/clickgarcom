ALTER TABLE delivery_checkouts
    DROP CONSTRAINT IF EXISTS delivery_checkouts_order_batch_tenant_fkey;

DROP INDEX IF EXISTS idx_delivery_checkouts_order_batch;

ALTER TABLE delivery_checkouts
    DROP COLUMN IF EXISTS order_batch_id;
