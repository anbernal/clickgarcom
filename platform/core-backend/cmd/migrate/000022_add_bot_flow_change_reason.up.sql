ALTER TABLE bot_flow_definitions
    ADD COLUMN IF NOT EXISTS change_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS source_flow_id UUID NULL REFERENCES bot_flow_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bot_flow_definitions_source_flow
    ON bot_flow_definitions(source_flow_id);
