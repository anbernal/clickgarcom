DROP INDEX IF EXISTS uq_domain_outbox_events_tenant_event_id;
ALTER TABLE domain_outbox_events DROP COLUMN IF EXISTS event_id;
