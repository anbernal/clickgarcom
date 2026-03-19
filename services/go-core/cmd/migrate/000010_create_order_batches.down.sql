DROP INDEX IF EXISTS idx_orders_batch;

ALTER TABLE orders
    DROP COLUMN IF EXISTS batch_id;

DROP INDEX IF EXISTS idx_order_batches_created_at;
DROP INDEX IF EXISTS idx_order_batches_tab;
DROP INDEX IF EXISTS idx_order_batches_tenant_status;

DROP TABLE IF EXISTS order_batches;
