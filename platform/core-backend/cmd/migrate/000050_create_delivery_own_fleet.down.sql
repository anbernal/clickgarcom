DROP TABLE IF EXISTS delivery_driver_events;
DROP TABLE IF EXISTS delivery_driver_incidents;
DROP TABLE IF EXISTS delivery_driver_sessions;
DROP TABLE IF EXISTS delivery_driver_access_links;
DROP TABLE IF EXISTS delivery_driver_assignments;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_driver_profile_tenant_fkey;
DROP INDEX IF EXISTS idx_deliveries_tenant_driver_profile_active;
ALTER TABLE deliveries DROP COLUMN IF EXISTS assigned_driver_profile_id;
DROP TABLE IF EXISTS delivery_driver_profiles;
