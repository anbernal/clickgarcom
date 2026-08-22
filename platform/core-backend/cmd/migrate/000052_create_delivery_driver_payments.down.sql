DROP TABLE IF EXISTS delivery_driver_payment_items;
DROP TABLE IF EXISTS delivery_driver_payment_batches;
ALTER TABLE delivery_driver_profiles
    DROP CONSTRAINT IF EXISTS delivery_driver_profiles_per_delivery_rate_check;
ALTER TABLE delivery_driver_profiles
    DROP COLUMN IF EXISTS per_delivery_rate;
