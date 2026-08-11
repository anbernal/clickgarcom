-- Delivery V2 foundation: tenant-scoped customers, reusable addresses,
-- provider configuration, quotes, fulfillments, attempts and own capacity.
-- All relationships repeat tenant_id so PostgreSQL enforces isolation.

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_normalized VARCHAR(20) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customers_id_tenant_key UNIQUE (id, tenant_id),
    CONSTRAINT customers_tenant_phone_key UNIQUE (tenant_id, phone_normalized)
);

CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone_normalized);

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    label VARCHAR(80) NOT NULL,
    postal_code VARCHAR(8) NOT NULL,
    street VARCHAR(255) NOT NULL,
    address_number VARCHAR(30) NOT NULL,
    address_complement VARCHAR(255),
    neighborhood VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(2) NOT NULL,
    address_reference TEXT,
    formatted_address TEXT NOT NULL,
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    postal_code_provider VARCHAR(80),
    postal_code_provider_ref VARCHAR(255),
    postal_code_lookup_status VARCHAR(30),
    geocode_provider VARCHAR(80),
    geocode_provider_id VARCHAR(255),
    geocode_quality VARCHAR(30),
    confirmed_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_addresses_id_tenant_key UNIQUE (id, tenant_id),
    CONSTRAINT customer_addresses_customer_tenant_fkey
        FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT customer_addresses_postal_code_check CHECK (postal_code ~ '^[0-9]{8}$'),
    CONSTRAINT customer_addresses_state_check CHECK (length(state) = 2),
    CONSTRAINT customer_addresses_coordinates_check CHECK (
        (latitude IS NULL OR latitude BETWEEN -90 AND 90)
        AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    )
);

CREATE INDEX idx_customer_addresses_active
    ON customer_addresses (tenant_id, customer_id, last_used_at DESC)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_customer_addresses_default
    ON customer_addresses (tenant_id, customer_id)
    WHERE deleted_at IS NULL AND is_default = TRUE;

CREATE TABLE delivery_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'SANDBOX',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER NOT NULL DEFAULT 1,
    external_merchant_id VARCHAR(255),
    credential_ref VARCHAR(255),
    connection_status VARCHAR(30) NOT NULL DEFAULT 'NOT_TESTED',
    last_tested_at TIMESTAMPTZ,
    last_error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_provider_configs_tenant_provider_key UNIQUE (tenant_id, provider, environment),
    CONSTRAINT delivery_provider_configs_priority_check CHECK (priority > 0)
);

CREATE UNIQUE INDEX uq_delivery_provider_configs_id_tenant
    ON delivery_provider_configs (id, tenant_id);

CREATE TABLE delivery_provider_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_config_id UUID NOT NULL,
    encrypted_payload BYTEA NOT NULL,
    key_version VARCHAR(80) NOT NULL,
    nonce BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT delivery_provider_credentials_config_tenant_fkey
        FOREIGN KEY (provider_config_id, tenant_id) REFERENCES delivery_provider_configs(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_provider_credentials_tenant_key UNIQUE (tenant_id, provider_config_id)
);

CREATE TABLE delivery_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    checkout_key VARCHAR(255) NOT NULL,
    customer_id UUID NOT NULL,
    customer_address_id UUID NOT NULL,
    delivery_id UUID,
    provider VARCHAR(40) NOT NULL,
    external_quote_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'VALID',
    quoted_cost NUMERIC(10, 2) NOT NULL,
    customer_delivery_fee NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    distance_meters INTEGER,
    estimated_minutes INTEGER,
    expires_at TIMESTAMPTZ NOT NULL,
    request_hash CHAR(64),
    provider_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ,
    CONSTRAINT delivery_quotes_customer_tenant_fkey
        FOREIGN KEY (customer_id, tenant_id) REFERENCES customers(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_quotes_address_tenant_fkey
        FOREIGN KEY (customer_address_id, tenant_id) REFERENCES customer_addresses(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_quotes_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT delivery_quotes_fee_check CHECK (quoted_cost >= 0 AND customer_delivery_fee >= 0),
    CONSTRAINT delivery_quotes_distance_check CHECK (distance_meters IS NULL OR distance_meters >= 0),
    CONSTRAINT delivery_quotes_eta_check CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0)
);

CREATE INDEX idx_delivery_quotes_checkout ON delivery_quotes (tenant_id, checkout_key, created_at DESC);
CREATE INDEX idx_delivery_quotes_expiry ON delivery_quotes (expires_at) WHERE status = 'VALID';
CREATE UNIQUE INDEX uq_delivery_quotes_id_tenant ON delivery_quotes (id, tenant_id);

ALTER TABLE deliveries
    ADD COLUMN IF NOT EXISTS customer_id UUID,
    ADD COLUMN IF NOT EXISTS customer_address_id UUID,
    ADD COLUMN IF NOT EXISTS default_fulfillment_mode_snapshot VARCHAR(20),
    ADD COLUMN IF NOT EXISTS current_fulfillment_id UUID,
    ADD COLUMN IF NOT EXISTS customer_delivery_fee NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS provider_quoted_cost NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS provider_actual_cost NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS restaurant_adjustment NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    ADD COLUMN IF NOT EXISTS no_courier_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fulfillment_override_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fulfillment_override_by UUID,
    ADD COLUMN IF NOT EXISTS fulfillment_override_reason TEXT;

UPDATE deliveries SET customer_delivery_fee = delivery_fee WHERE customer_delivery_fee IS NULL;

ALTER TABLE deliveries
    ALTER COLUMN customer_delivery_fee SET DEFAULT 0,
    ADD CONSTRAINT deliveries_customer_fee_check CHECK (customer_delivery_fee >= 0),
    ADD CONSTRAINT deliveries_provider_quoted_cost_check CHECK (provider_quoted_cost IS NULL OR provider_quoted_cost >= 0),
    ADD CONSTRAINT deliveries_provider_actual_cost_check CHECK (provider_actual_cost IS NULL OR provider_actual_cost >= 0),
    ADD CONSTRAINT deliveries_mode_snapshot_check CHECK (
        default_fulfillment_mode_snapshot IS NULL OR default_fulfillment_mode_snapshot IN ('OWN', 'EXTERNAL')
    );

CREATE TABLE delivery_fulfillments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    mode VARCHAR(20) NOT NULL,
    provider VARCHAR(40),
    status VARCHAR(40) NOT NULL,
    quote_id UUID,
    external_delivery_id VARCHAR(255),
    tracking_url TEXT,
    quoted_cost NUMERIC(10, 2),
    actual_cost NUMERIC(10, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    cycle_number INTEGER NOT NULL DEFAULT 0,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_by UUID,
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_fulfillments_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_fulfillments_quote_tenant_fkey
        FOREIGN KEY (quote_id, tenant_id) REFERENCES delivery_quotes(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_fulfillments_mode_check CHECK (mode IN ('OWN', 'EXTERNAL')),
    CONSTRAINT delivery_fulfillments_cost_check CHECK (
        (quoted_cost IS NULL OR quoted_cost >= 0) AND (actual_cost IS NULL OR actual_cost >= 0)
    ),
    CONSTRAINT delivery_fulfillments_cycle_check CHECK (cycle_number >= 0)
);

CREATE UNIQUE INDEX uq_delivery_fulfillments_current
    ON delivery_fulfillments (tenant_id, delivery_id)
    WHERE is_current = TRUE;

CREATE INDEX idx_delivery_fulfillments_active
    ON delivery_fulfillments (tenant_id, status, updated_at)
    WHERE is_current = TRUE;

-- Required before the composite FK below: PostgreSQL only permits
-- references to columns covered by a unique constraint/index.
CREATE UNIQUE INDEX uq_delivery_fulfillments_id_tenant ON delivery_fulfillments (id, tenant_id);

ALTER TABLE deliveries
    ADD CONSTRAINT deliveries_current_fulfillment_tenant_fkey
        FOREIGN KEY (current_fulfillment_id, tenant_id)
        REFERENCES delivery_fulfillments(id, tenant_id) ON DELETE SET NULL;

CREATE TABLE delivery_provider_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    fulfillment_id UUID NOT NULL,
    cycle_number INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    provider_error_code VARCHAR(80),
    retryable BOOLEAN,
    request_reference VARCHAR(255),
    response_reference VARCHAR(255),
    scheduled_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_provider_attempts_fulfillment_tenant_fkey
        FOREIGN KEY (fulfillment_id, tenant_id) REFERENCES delivery_fulfillments(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_provider_attempts_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_provider_attempts_cycle_check CHECK (cycle_number >= 1),
    CONSTRAINT delivery_provider_attempts_number_check CHECK (attempt_number BETWEEN 1 AND 5),
    CONSTRAINT delivery_provider_attempts_key UNIQUE (tenant_id, fulfillment_id, cycle_number, attempt_number),
    CONSTRAINT delivery_provider_attempts_idempotency_key UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_delivery_provider_attempts_schedule
    ON delivery_provider_attempts (scheduled_at)
    WHERE status IN ('SCHEDULED', 'REQUESTING');

CREATE TABLE delivery_own_capacity_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    checkout_key VARCHAR(255) NOT NULL,
    delivery_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'HELD',
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    release_reason VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_own_capacity_reservations_status_check
        CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED')),
    CONSTRAINT delivery_own_capacity_reservations_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id) REFERENCES deliveries(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_own_capacity_reservations_checkout_key UNIQUE (tenant_id, checkout_key)
);

CREATE UNIQUE INDEX uq_delivery_own_capacity_active_delivery
    ON delivery_own_capacity_reservations (tenant_id, delivery_id)
    WHERE delivery_id IS NOT NULL AND status IN ('HELD', 'CONFIRMED');

CREATE INDEX idx_delivery_own_capacity_expiry
    ON delivery_own_capacity_reservations (expires_at)
    WHERE status = 'HELD';

CREATE TABLE delivery_provider_webhook_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    provider VARCHAR(40) NOT NULL,
    external_event_id VARCHAR(255),
    payload_hash CHAR(64) NOT NULL,
    signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
    headers_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload BYTEA,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    last_error_code VARCHAR(80),
    CONSTRAINT delivery_provider_webhook_inbox_identity UNIQUE (provider, external_event_id, payload_hash)
);

CREATE INDEX idx_delivery_provider_webhook_pending
    ON delivery_provider_webhook_inbox (next_retry_at, received_at)
    WHERE processed_at IS NULL;

CREATE UNIQUE INDEX uq_delivery_provider_webhook_payload_hash
    ON delivery_provider_webhook_inbox (provider, payload_hash)
    WHERE external_event_id IS NULL;
