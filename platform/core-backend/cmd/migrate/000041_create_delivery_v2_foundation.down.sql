ALTER TABLE deliveries
    DROP CONSTRAINT IF EXISTS deliveries_current_fulfillment_tenant_fkey,
    DROP CONSTRAINT IF EXISTS deliveries_customer_fee_check,
    DROP CONSTRAINT IF EXISTS deliveries_provider_quoted_cost_check,
    DROP CONSTRAINT IF EXISTS deliveries_provider_actual_cost_check,
    DROP CONSTRAINT IF EXISTS deliveries_mode_snapshot_check;

ALTER TABLE deliveries
    DROP COLUMN IF EXISTS customer_id,
    DROP COLUMN IF EXISTS customer_address_id,
    DROP COLUMN IF EXISTS default_fulfillment_mode_snapshot,
    DROP COLUMN IF EXISTS current_fulfillment_id,
    DROP COLUMN IF EXISTS customer_delivery_fee,
    DROP COLUMN IF EXISTS provider_quoted_cost,
    DROP COLUMN IF EXISTS provider_actual_cost,
    DROP COLUMN IF EXISTS restaurant_adjustment,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS no_courier_at,
    DROP COLUMN IF EXISTS fulfillment_override_at,
    DROP COLUMN IF EXISTS fulfillment_override_by,
    DROP COLUMN IF EXISTS fulfillment_override_reason;

-- The reservation table owns its delivery FK; dropping the table below
-- removes it before the remaining V2 tables are dismantled.

DROP TABLE IF EXISTS delivery_provider_webhook_inbox;
DROP TABLE IF EXISTS delivery_own_capacity_reservations;
DROP TABLE IF EXISTS delivery_provider_attempts;
DROP TABLE IF EXISTS delivery_fulfillments;
DROP TABLE IF EXISTS delivery_quotes;
DROP TABLE IF EXISTS delivery_provider_credentials;
DROP TABLE IF EXISTS delivery_provider_configs;
DROP TABLE IF EXISTS customer_addresses;
DROP TABLE IF EXISTS customers;
