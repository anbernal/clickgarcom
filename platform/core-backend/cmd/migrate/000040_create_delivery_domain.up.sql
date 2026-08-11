-- Delivery domain persistence.
--
-- Delivery owns logistics state independently from orders/order_batches.  The
-- tenant columns are repeated on every table so composite foreign keys can
-- enforce tenant isolation at the database boundary.

-- Existing aggregates need composite keys before Delivery can reference them
-- without permitting a cross-tenant association.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_batches_id_tenant
    ON order_batches (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_id_tenant
    ON users (id, tenant_id);

ALTER TABLE order_batches
    ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) NOT NULL DEFAULT 'DINE_IN',
    ADD COLUMN IF NOT EXISTS delivery_address_snapshot JSONB;

ALTER TABLE order_batches
    DROP CONSTRAINT IF EXISTS order_batches_service_type_check;

ALTER TABLE order_batches
    ADD CONSTRAINT order_batches_service_type_check
    CHECK (service_type IN ('DINE_IN', 'TAKEOUT', 'DELIVERY'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_user_role;

ALTER TABLE users
    ADD CONSTRAINT valid_user_role
    CHECK (role IN ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR', 'CASHIER', 'DRIVER'));

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    display_code VARCHAR(20) NOT NULL,
    service_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_RESTAURANT_ACCEPTANCE',
    version INTEGER NOT NULL DEFAULT 1,

    customer_name VARCHAR(255),
    customer_phone VARCHAR(30),
    postal_code VARCHAR(20),
    street VARCHAR(255),
    address_number VARCHAR(30),
    address_complement VARCHAR(255),
    neighborhood VARCHAR(255),
    city VARCHAR(255),
    state VARCHAR(2),
    address_reference TEXT,
    formatted_address TEXT,
    address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    destination_lat NUMERIC(9, 6),
    destination_lng NUMERIC(9, 6),
    geocode_provider VARCHAR(40),
    geocode_provider_id VARCHAR(255),
    geocode_quality VARCHAR(30),
    origin_lat NUMERIC(9, 6),
    origin_lng NUMERIC(9, 6),
    distance_meters INTEGER,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
    fee_rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    acceptance_mode VARCHAR(20),

    assigned_driver_id UUID,
    eta_seconds INTEGER,
    eta_updated_at TIMESTAMPTZ,
    route_polyline TEXT,

    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    preparing_at TIMESTAMPTZ,
    ready_for_dispatch_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    in_transit_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_failed_at TIMESTAMPTZ,
    returning_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT deliveries_id_tenant_key UNIQUE (id, tenant_id),
    CONSTRAINT deliveries_batch_key UNIQUE (tenant_id, batch_id),
    CONSTRAINT deliveries_display_code_key UNIQUE (tenant_id, display_code),
    CONSTRAINT deliveries_service_type_check
        CHECK (service_type = 'DELIVERY'),
    CONSTRAINT deliveries_status_check
        CHECK (status IN (
            'PENDING_RESTAURANT_ACCEPTANCE', 'ACCEPTED', 'PREPARING',
            'READY_FOR_DISPATCH', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT',
            'ARRIVED', 'DELIVERED', 'REJECTED', 'CANCELED',
            'DELIVERY_FAILED', 'RETURNING', 'RETURNED'
        )),
    CONSTRAINT deliveries_version_check CHECK (version > 0),
    CONSTRAINT deliveries_coordinates_check CHECK (
        (destination_lat IS NULL OR destination_lat BETWEEN -90 AND 90)
        AND (destination_lng IS NULL OR destination_lng BETWEEN -180 AND 180)
        AND (origin_lat IS NULL OR origin_lat BETWEEN -90 AND 90)
        AND (origin_lng IS NULL OR origin_lng BETWEEN -180 AND 180)
    ),
    CONSTRAINT deliveries_distance_check
        CHECK (distance_meters IS NULL OR distance_meters >= 0),
    CONSTRAINT deliveries_fee_check CHECK (delivery_fee >= 0),
    CONSTRAINT deliveries_eta_check
        CHECK (eta_seconds IS NULL OR eta_seconds >= 0),
    CONSTRAINT deliveries_acceptance_mode_check
        CHECK (acceptance_mode IS NULL OR acceptance_mode IN ('AUTO', 'MANUAL', 'OVERRIDE')),
    CONSTRAINT deliveries_tab_tenant_fkey
        FOREIGN KEY (tab_id, tenant_id)
        REFERENCES tabs (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT deliveries_batch_tenant_fkey
        FOREIGN KEY (batch_id, tenant_id)
        REFERENCES order_batches (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT deliveries_driver_tenant_fkey
        FOREIGN KEY (assigned_driver_id, tenant_id)
        REFERENCES users (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX idx_deliveries_tenant_status_created
    ON deliveries (tenant_id, status, created_at DESC);

CREATE INDEX idx_deliveries_tenant_driver_active
    ON deliveries (tenant_id, assigned_driver_id, status)
    WHERE assigned_driver_id IS NOT NULL
      AND status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED');

CREATE INDEX idx_deliveries_ready_for_dispatch
    ON deliveries (tenant_id, ready_for_dispatch_at)
    WHERE ready_for_dispatch_at IS NOT NULL
      AND status = 'READY_FOR_DISPATCH';

CREATE INDEX idx_deliveries_updated_at
    ON deliveries (updated_at);

CREATE TABLE delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    previous_status VARCHAR(40),
    current_status VARCHAR(40),
    actor_type VARCHAR(30) NOT NULL,
    actor_user_id UUID,
    actor_name VARCHAR(255),
    source VARCHAR(30) NOT NULL,
    correlation_id UUID,
    idempotency_key VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT delivery_events_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_events_actor_tenant_fkey
        FOREIGN KEY (actor_user_id, tenant_id)
        REFERENCES users(id, tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_delivery_events_idempotency
    ON delivery_events (tenant_id, delivery_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_delivery_events_delivery_created
    ON delivery_events (tenant_id, delivery_id, created_at);

CREATE TABLE delivery_tracking_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,

    CONSTRAINT delivery_tracking_credentials_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_tracking_credentials_created_by_tenant_fkey
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users(id, tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_delivery_tracking_credentials_active
    ON delivery_tracking_credentials (tenant_id, delivery_id)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_delivery_tracking_credentials_active_hash
    ON delivery_tracking_credentials (token_hash)
    WHERE revoked_at IS NULL;

CREATE TABLE delivery_location_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    accuracy_m NUMERIC(8, 2),
    speed_mps NUMERIC(8, 2),
    heading_deg NUMERIC(6, 2),
    device_recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_event_id UUID NOT NULL,
    sample_reason VARCHAR(20) NOT NULL DEFAULT 'INTERVAL',

    CONSTRAINT delivery_location_samples_source_event_key UNIQUE (source_event_id),
    CONSTRAINT delivery_location_samples_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_location_samples_driver_tenant_fkey
        FOREIGN KEY (driver_id, tenant_id)
        REFERENCES users (id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_location_samples_coordinates_check
        CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180),
    CONSTRAINT delivery_location_samples_accuracy_check
        CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
    CONSTRAINT delivery_location_samples_speed_check
        CHECK (speed_mps IS NULL OR speed_mps >= 0),
    CONSTRAINT delivery_location_samples_heading_check
        CHECK (heading_deg IS NULL OR heading_deg >= 0 AND heading_deg < 360),
    CONSTRAINT delivery_location_samples_reason_check
        CHECK (sample_reason IN ('INTERVAL', 'DISTANCE', 'STATUS', 'FINAL'))
);

CREATE INDEX idx_delivery_location_samples_delivery_recorded
    ON delivery_location_samples (tenant_id, delivery_id, device_recorded_at DESC);

CREATE TABLE delivery_pin_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL,
    pin_digest VARCHAR(128) NOT NULL,
    secret_version VARCHAR(32) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    locked_until TIMESTAMPTZ,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ,

    CONSTRAINT delivery_pin_challenges_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_pin_challenges_attempt_count_check
        CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts)
);

CREATE UNIQUE INDEX uq_delivery_pin_challenges_active
    ON delivery_pin_challenges (tenant_id, delivery_id)
    WHERE replaced_at IS NULL AND verified_at IS NULL;

CREATE INDEX idx_delivery_pin_challenges_expiration
    ON delivery_pin_challenges (expires_at)
    WHERE replaced_at IS NULL AND verified_at IS NULL;

CREATE TABLE delivery_command_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id UUID,
    scope VARCHAR(80) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    actor_type VARCHAR(30) NOT NULL,
    actor_user_id UUID,
    request_hash CHAR(64) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT delivery_command_idempotency_scope_key
        UNIQUE (tenant_id, scope, idempotency_key),
    CONSTRAINT delivery_command_idempotency_delivery_tenant_fkey
        FOREIGN KEY (delivery_id, tenant_id)
        REFERENCES deliveries (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT delivery_command_idempotency_actor_tenant_fkey
        FOREIGN KEY (actor_user_id, tenant_id)
        REFERENCES users(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT delivery_command_idempotency_response_status_check
        CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
);

CREATE INDEX idx_delivery_command_idempotency_expiration
    ON delivery_command_idempotency (expires_at);

CREATE TABLE domain_outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT domain_outbox_events_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX idx_domain_outbox_events_pending
    ON domain_outbox_events (next_retry_at, occurred_at)
    WHERE published_at IS NULL;

CREATE INDEX idx_domain_outbox_events_aggregate
    ON domain_outbox_events (tenant_id, aggregate_type, aggregate_id, occurred_at);
