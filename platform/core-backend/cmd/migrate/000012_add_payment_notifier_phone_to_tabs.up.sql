ALTER TABLE tabs
    ADD COLUMN IF NOT EXISTS payment_notifier_phone VARCHAR(30);
