-- A Delivery customer is identified by phone within the tenant, while the
-- name is collected on the first Delivery journey and reused afterwards.
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS name VARCHAR(120);
