ALTER TABLE payments
    ALTER COLUMN tab_id DROP NOT NULL;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS order_id UUID,
    ADD COLUMN IF NOT EXISTS method VARCHAR(20),
    ADD COLUMN IF NOT EXISTS external_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_external_reference ON payments(external_reference) WHERE external_reference IS NOT NULL;

ALTER TABLE tabs
    ADD COLUMN IF NOT EXISTS closed_notified_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES tabs(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    requested_amount DECIMAL(10,2) NOT NULL CHECK (requested_amount > 0),
    idempotency_key VARCHAR(120) NOT NULL,
    external_reference VARCHAR(120) NOT NULL,
    provider_payment_id VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    provider_status VARCHAR(80),
    provider_status_detail TEXT,
    request_payload JSONB DEFAULT '{}'::jsonb,
    response_payload JSONB DEFAULT '{}'::jsonb,
    last_error TEXT,
    reconciled_at TIMESTAMP,
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_payment_attempt_provider CHECK (provider IN ('MERCADO_PAGO')),
    CONSTRAINT valid_payment_attempt_method CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD')),
    CONSTRAINT valid_payment_attempt_status CHECK (status IN ('CREATED', 'PROCESSING', 'UNKNOWN', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'EXPIRED', 'ERROR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_idempotency ON payment_attempts(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_provider_payment ON payment_attempts(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_tenant_status ON payment_attempts(tenant_id, status, created_at DESC);
