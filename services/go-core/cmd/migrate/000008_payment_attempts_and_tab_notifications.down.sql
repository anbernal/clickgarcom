DROP INDEX IF EXISTS idx_payment_attempts_tenant_status;
DROP INDEX IF EXISTS idx_payment_attempts_payment;
DROP INDEX IF EXISTS idx_payment_attempts_provider_payment;
DROP INDEX IF EXISTS idx_payment_attempts_idempotency;
DROP TABLE IF EXISTS payment_attempts;

ALTER TABLE tabs
    DROP COLUMN IF EXISTS closed_notified_at;

DROP INDEX IF EXISTS idx_payments_external_reference;
DROP INDEX IF EXISTS idx_payments_order;

ALTER TABLE payments
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS external_reference,
    DROP COLUMN IF EXISTS method,
    DROP COLUMN IF EXISTS order_id;

ALTER TABLE payments
    ALTER COLUMN tab_id SET NOT NULL;
