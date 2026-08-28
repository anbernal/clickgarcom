-- Agenda & Serviços. The module is tenant-scoped and can be enabled independently.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS appointment_service_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_service_categories_tenant_name
    ON appointment_service_categories (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS appointment_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id uuid NULL REFERENCES appointment_service_categories(id) ON DELETE SET NULL,
    name varchar(140) NOT NULL,
    description text NULL,
    image_url text NULL,
    icon varchar(16) NULL,
    color varchar(16) NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
    buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 360),
    price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    confirmation_mode varchar(30) NOT NULL DEFAULT 'AUTO_CONFIRM' CHECK (confirmation_mode IN ('AUTO_CONFIRM','MANUAL_APPROVAL')),
    min_notice_minutes integer NOT NULL DEFAULT 120 CHECK (min_notice_minutes >= 0),
    max_advance_days integer NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 730),
    daily_limit integer NULL CHECK (daily_limit IS NULL OR daily_limit > 0),
    active boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_services_tenant_active ON appointment_services (tenant_id, active, display_order);

CREATE TABLE IF NOT EXISTS appointment_professionals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name varchar(140) NOT NULL,
    role_label varchar(120) NULL,
    image_url text NULL,
    initials varchar(8) NULL,
    color varchar(16) NULL,
    concurrency_limit integer NOT NULL DEFAULT 1 CHECK (concurrency_limit BETWEEN 1 AND 10),
    active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_professionals_tenant_active ON appointment_professionals (tenant_id, active);

CREATE TABLE IF NOT EXISTS appointment_service_professionals (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
    professional_id uuid NOT NULL REFERENCES appointment_professionals(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (service_id, professional_id)
);
CREATE INDEX IF NOT EXISTS idx_appointment_service_professionals_lookup ON appointment_service_professionals (tenant_id, service_id, professional_id);

CREATE TABLE IF NOT EXISTS appointment_availability_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id uuid NULL REFERENCES appointment_professionals(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time time NOT NULL,
    end_time time NOT NULL,
    timezone varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_appointment_availability_rules_lookup ON appointment_availability_rules (tenant_id, professional_id, weekday, active);

CREATE TABLE IF NOT EXISTS appointment_calendar_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id uuid NULL REFERENCES appointment_professionals(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    reason varchar(300) NULL,
    created_by uuid NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_appointment_calendar_blocks_range ON appointment_calendar_blocks (tenant_id, professional_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS appointment_slot_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL,
    service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
    professional_id uuid NOT NULL REFERENCES appointment_professionals(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    idempotency_key varchar(160) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONSUMED','EXPIRED','RELEASED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_slot_holds_idempotency ON appointment_slot_holds (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_appointment_slot_holds_active ON appointment_slot_holds (tenant_id, professional_id, start_at, end_at, expires_at) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL,
    service_id uuid NULL REFERENCES appointment_services(id) ON DELETE SET NULL,
    professional_id uuid NULL REFERENCES appointment_professionals(id) ON DELETE SET NULL,
    display_code varchar(16) NOT NULL,
    customer_name varchar(120) NOT NULL,
    customer_phone varchar(20) NOT NULL,
    service_name_snapshot varchar(140) NOT NULL,
    professional_name_snapshot varchar(140) NULL,
    duration_minutes_snapshot integer NOT NULL,
    price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
    confirmation_mode varchar(30) NOT NULL,
    source varchar(30) NOT NULL DEFAULT 'WEB',
    status varchar(40) NOT NULL DEFAULT 'CONFIRMED',
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    timezone varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    notes text NULL,
    consent_at timestamptz NULL,
    canceled_at timestamptz NULL,
    completed_at timestamptz NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CHECK (status IN ('PENDING_APPROVAL','CONFIRMED','CHECKED_IN','IN_SERVICE','COMPLETED','CANCELED_BY_CUSTOMER','CANCELED_BY_TENANT','NO_SHOW'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_tenant_display_code ON appointments (tenant_id, display_code);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_range ON appointments (tenant_id, start_at, status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments (tenant_id, customer_id, start_at DESC);
ALTER TABLE appointments ADD CONSTRAINT appointments_professional_overlap
    EXCLUDE USING gist (tenant_id WITH =, professional_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (professional_id IS NOT NULL AND status IN ('PENDING_APPROVAL','CONFIRMED','CHECKED_IN','IN_SERVICE'));

CREATE TABLE IF NOT EXISTS appointment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    event_type varchar(80) NOT NULL,
    actor_type varchar(30) NOT NULL DEFAULT 'SYSTEM',
    actor_id uuid NULL,
    reason text NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_events_timeline ON appointment_events (tenant_id, appointment_id, created_at);

CREATE TABLE IF NOT EXISTS appointment_automation_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    version integer NOT NULL,
    definition jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid NULL,
    published_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_automation_version ON appointment_automation_versions (tenant_id, version);

CREATE TABLE IF NOT EXISTS appointment_notification_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    event_type varchar(80) NOT NULL,
    destination_phone varchar(20) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    scheduled_for timestamptz NOT NULL,
    sent_at timestamptz NULL,
    canceled_at timestamptz NULL,
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_notification_jobs_pending ON appointment_notification_jobs (scheduled_for) WHERE sent_at IS NULL AND canceled_at IS NULL;

CREATE TABLE IF NOT EXISTS appointment_access_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NULL REFERENCES customers(id) ON DELETE CASCADE,
    appointment_id uuid NULL REFERENCES appointments(id) ON DELETE CASCADE,
    phone_normalized varchar(20) NOT NULL,
    purpose varchar(30) NOT NULL CHECK (purpose IN ('BOOKING','MANAGE')),
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    last_used_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_access_credentials_lookup ON appointment_access_credentials (tenant_id, token_hash, purpose, expires_at);
