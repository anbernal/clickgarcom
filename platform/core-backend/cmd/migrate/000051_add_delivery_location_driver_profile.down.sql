DROP INDEX IF EXISTS idx_delivery_location_samples_driver_profile_recorded;
ALTER TABLE delivery_location_samples DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_actor_check;
ALTER TABLE delivery_location_samples DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_profile_tenant_fkey;
ALTER TABLE delivery_location_samples DROP CONSTRAINT IF EXISTS delivery_location_samples_driver_tenant_fkey;
ALTER TABLE delivery_location_samples
    ADD CONSTRAINT delivery_location_samples_driver_tenant_fkey
        FOREIGN KEY (driver_id, tenant_id)
        REFERENCES users (id, tenant_id) ON DELETE RESTRICT;
ALTER TABLE delivery_location_samples ALTER COLUMN driver_id SET NOT NULL;
ALTER TABLE delivery_location_samples DROP COLUMN IF EXISTS driver_profile_id;
