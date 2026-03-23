DROP INDEX IF EXISTS idx_bot_flow_definitions_source_flow;

ALTER TABLE bot_flow_definitions
    DROP COLUMN IF EXISTS source_flow_id,
    DROP COLUMN IF EXISTS change_reason;
