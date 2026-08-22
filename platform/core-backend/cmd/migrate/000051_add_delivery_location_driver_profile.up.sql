-- A location can be reported by either a legacy DRIVER user or by an
-- operational fleet profile. The latter is deliberately not a users row.
ALTER TABLE delivery_location_samples
    ADD COLUMN IF NOT EXISTS driver_profile_id UUID;

ALTER TABLE delivery_location_samples
    ALTER COLUMN driver_id DROP NOT NULL;

ALTER TABLE delivery_location_samples
    DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_tenant_fkey;

ALTER TABLE delivery_location_samples
    DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_profile_tenant_fkey;

ALTER TABLE delivery_location_samples
    ADD CONSTRAINT delivery_location_samples_driver_tenant_fkey
        FOREIGN KEY (driver_id, tenant_id)
        REFERENCES users (id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE delivery_location_samples
    ADD CONSTRAINT delivery_location_samples_driver_profile_tenant_fkey
        FOREIGN KEY (driver_profile_id, tenant_id)
        REFERENCES delivery_driver_profiles (id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE delivery_location_samples
    DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_actor_check;

ALTER TABLE delivery_location_samples
    ADD CONSTRAINT delivery_location_samples_driver_actor_check
        CHECK (
            (driver_id IS NOT NULL AND driver_profile_id IS NULL)
            OR (driver_id IS NULL AND driver_profile_id IS NOT NULL)
        );

CREATE INDEX IF NOT EXISTS idx_delivery_location_samples_driver_profile_recorded
    ON delivery_location_samples (tenant_id, driver_profile_id, device_recorded_at DESC)
    WHERE driver_profile_id IS NOT NULL;
