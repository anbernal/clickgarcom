ALTER TABLE tabs
ADD COLUMN IF NOT EXISTS closed_by_user_id UUID,
ADD COLUMN IF NOT EXISTS closed_by_user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reopened_by_user_id UUID,
ADD COLUMN IF NOT EXISTS reopened_by_user_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tabs_closed_by_user
    ON tabs (tenant_id, closed_by_user_id)
    WHERE closed_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_reopened_by_user
    ON tabs (tenant_id, reopened_by_user_id)
    WHERE reopened_by_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tab_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    actor_user_id UUID,
    actor_name VARCHAR(255),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_events_tab_created
    ON tab_events (tenant_id, tab_id, created_at DESC);
