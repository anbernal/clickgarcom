-- Alterar payload de JSONB para TEXT
ALTER TABLE outbox_messages ALTER COLUMN payload TYPE TEXT;