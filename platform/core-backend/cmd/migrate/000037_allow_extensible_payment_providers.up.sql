ALTER TABLE payment_attempts
    DROP CONSTRAINT IF EXISTS valid_payment_attempt_provider;

ALTER TABLE payment_attempts
    ADD CONSTRAINT valid_payment_attempt_provider
    CHECK (provider ~ '^[A-Z][A-Z0-9_]{1,39}$');
