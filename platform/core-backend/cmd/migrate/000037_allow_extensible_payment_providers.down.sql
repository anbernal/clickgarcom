ALTER TABLE payment_attempts
    DROP CONSTRAINT IF EXISTS valid_payment_attempt_provider;

ALTER TABLE payment_attempts
    ADD CONSTRAINT valid_payment_attempt_provider
    CHECK (provider IN ('MERCADO_PAGO')) NOT VALID;
