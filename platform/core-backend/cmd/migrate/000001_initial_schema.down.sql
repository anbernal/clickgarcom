-- Rollback da migration inicial
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
DROP TRIGGER IF EXISTS update_menu_categories_updated_at ON menu_categories;
DROP TRIGGER IF EXISTS update_tables_updated_at ON tables;
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;

DROP FUNCTION IF EXISTS update_updated_at_column();

DROP TABLE IF EXISTS nps_responses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS outbox_messages CASCADE;
DROP TABLE IF EXISTS inbox_events CASCADE;
DROP TABLE IF EXISTS service_requests CASCADE;
DROP TABLE IF EXISTS payment_item_allocations CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS tabs CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "uuid-ossp";