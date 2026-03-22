-- Reverter se necessário
ALTER TABLE outbox_messages ALTER COLUMN payload TYPE JSONB USING payload::JSONB;