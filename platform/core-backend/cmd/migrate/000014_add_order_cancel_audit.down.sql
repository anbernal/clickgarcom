DROP INDEX IF EXISTS idx_orders_canceled_by_user;
DROP INDEX IF EXISTS idx_orders_cancel_category;

ALTER TABLE order_batches
DROP COLUMN IF EXISTS canceled_by_user_name,
DROP COLUMN IF EXISTS canceled_by_user_id,
DROP COLUMN IF EXISTS cancel_category,
DROP COLUMN IF EXISTS cancel_reason_code;

ALTER TABLE orders
DROP COLUMN IF EXISTS canceled_by_user_name,
DROP COLUMN IF EXISTS canceled_by_user_id,
DROP COLUMN IF EXISTS cancel_category,
DROP COLUMN IF EXISTS cancel_reason_code;
