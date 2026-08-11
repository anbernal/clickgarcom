DROP TABLE IF EXISTS domain_outbox_events;
DROP TABLE IF EXISTS delivery_command_idempotency;
DROP TABLE IF EXISTS delivery_pin_challenges;
DROP TABLE IF EXISTS delivery_location_samples;
DROP TABLE IF EXISTS delivery_tracking_credentials;
DROP TABLE IF EXISTS delivery_events;
DROP TABLE IF EXISTS deliveries;

ALTER TABLE order_batches
    DROP CONSTRAINT IF EXISTS order_batches_service_type_check;

ALTER TABLE order_batches
    DROP COLUMN IF EXISTS delivery_address_snapshot,
    DROP COLUMN IF EXISTS service_type;

ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_user_role;

ALTER TABLE users
    ADD CONSTRAINT valid_user_role
    CHECK (role IN ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR', 'CASHIER'));

DROP INDEX IF EXISTS uq_users_id_tenant;
DROP INDEX IF EXISTS uq_order_batches_id_tenant;
