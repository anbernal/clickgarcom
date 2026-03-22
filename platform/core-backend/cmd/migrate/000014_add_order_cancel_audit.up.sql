ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancel_reason_code VARCHAR(60),
ADD COLUMN IF NOT EXISTS cancel_category VARCHAR(20),
ADD COLUMN IF NOT EXISTS canceled_by_user_id UUID,
ADD COLUMN IF NOT EXISTS canceled_by_user_name VARCHAR(255);

ALTER TABLE order_batches
ADD COLUMN IF NOT EXISTS cancel_reason_code VARCHAR(60),
ADD COLUMN IF NOT EXISTS cancel_category VARCHAR(20),
ADD COLUMN IF NOT EXISTS canceled_by_user_id UUID,
ADD COLUMN IF NOT EXISTS canceled_by_user_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_orders_cancel_category
    ON orders (tenant_id, cancel_category)
    WHERE cancel_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_canceled_by_user
    ON orders (tenant_id, canceled_by_user_id)
    WHERE canceled_by_user_id IS NOT NULL;
