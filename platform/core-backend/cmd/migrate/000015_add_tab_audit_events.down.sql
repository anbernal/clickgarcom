DROP INDEX IF EXISTS idx_tab_events_tab_created;
DROP TABLE IF EXISTS tab_events;

DROP INDEX IF EXISTS idx_tabs_reopened_by_user;
DROP INDEX IF EXISTS idx_tabs_closed_by_user;

ALTER TABLE tabs
DROP COLUMN IF EXISTS reopened_by_user_name,
DROP COLUMN IF EXISTS reopened_by_user_id,
DROP COLUMN IF EXISTS reopened_at,
DROP COLUMN IF EXISTS closed_by_user_name,
DROP COLUMN IF EXISTS closed_by_user_id;
