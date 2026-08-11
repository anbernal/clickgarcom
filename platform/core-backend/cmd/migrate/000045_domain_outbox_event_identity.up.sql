-- Every domain event needs a stable identity independent from the delivery
-- attempt. This allows relays and consumers to retry safely.
ALTER TABLE domain_outbox_events
    ADD COLUMN event_id UUID;

UPDATE domain_outbox_events
SET event_id = id
WHERE event_id IS NULL;

ALTER TABLE domain_outbox_events
    ALTER COLUMN event_id SET NOT NULL,
    ALTER COLUMN event_id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX uq_domain_outbox_events_tenant_event_id
    ON domain_outbox_events (tenant_id, event_id);

COMMENT ON COLUMN domain_outbox_events.event_id IS
    'Stable V2 event identity used for idempotent relay and consumer deduplication';
