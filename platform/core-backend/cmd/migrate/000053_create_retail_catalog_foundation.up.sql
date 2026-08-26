-- RETAIL foundation: establishment type, neutral catalog details and
-- tenant-scoped inventory balances. Existing RESTAURANT tenants remain the
-- default and existing menu tables continue to be the shared catalog source.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS establishment_type VARCHAR(30) NOT NULL DEFAULT 'RESTAURANT';

ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_establishment_type_check;

ALTER TABLE tenants
    ADD CONSTRAINT tenants_establishment_type_check
    CHECK (establishment_type IN ('RESTAURANT', 'MARKET', 'PHARMACY'));

CREATE INDEX IF NOT EXISTS idx_tenants_establishment_type
    ON tenants (establishment_type);

-- A retail item is routed to the picking operation, never to kitchen/bar.
ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS valid_destination;

ALTER TABLE menu_items
    ADD CONSTRAINT valid_destination
    CHECK (destination IN ('KITCHEN', 'BAR', 'PICKING')) NOT VALID;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS valid_order_destination;

ALTER TABLE orders
    ADD CONSTRAINT valid_order_destination
    CHECK (destination IN ('KITCHEN', 'BAR', 'PICKING')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_items_id_tenant
    ON menu_items (id, tenant_id);

CREATE TABLE retail_product_details (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL,
    sku VARCHAR(80),
    barcode VARCHAR(80),
    brand VARCHAR(120),
    manufacturer VARCHAR(160),
    package_label VARCHAR(160),
    min_order_quantity INTEGER NOT NULL DEFAULT 1,
    max_order_quantity INTEGER,
    requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, menu_item_id),
    CONSTRAINT retail_product_details_item_tenant_fkey
        FOREIGN KEY (menu_item_id, tenant_id)
        REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT retail_product_details_min_quantity_check
        CHECK (min_order_quantity > 0),
    CONSTRAINT retail_product_details_max_quantity_check
        CHECK (max_order_quantity IS NULL OR max_order_quantity >= min_order_quantity),
    CONSTRAINT retail_product_details_no_prescription_mvp_check
        CHECK (requires_prescription = FALSE)
);

CREATE UNIQUE INDEX uq_retail_product_details_tenant_sku
    ON retail_product_details (tenant_id, sku)
    WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE UNIQUE INDEX uq_retail_product_details_tenant_barcode
    ON retail_product_details (tenant_id, barcode)
    WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE INDEX idx_retail_product_details_tenant_brand
    ON retail_product_details (tenant_id, brand);

CREATE TABLE pharmacy_product_details (
    tenant_id UUID NOT NULL,
    menu_item_id UUID NOT NULL,
    anvisa_registration VARCHAR(40),
    active_ingredient VARCHAR(160),
    dosage VARCHAR(120),
    presentation VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, menu_item_id),
    CONSTRAINT pharmacy_product_details_retail_product_fkey
        FOREIGN KEY (tenant_id, menu_item_id)
        REFERENCES retail_product_details(tenant_id, menu_item_id) ON DELETE CASCADE
);

CREATE TABLE inventory_balances (
    tenant_id UUID NOT NULL,
    menu_item_id UUID NOT NULL,
    on_hand INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, menu_item_id),
    CONSTRAINT inventory_balances_item_tenant_fkey
        FOREIGN KEY (menu_item_id, tenant_id)
        REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT inventory_balances_non_negative_check
        CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand),
    CONSTRAINT inventory_balances_version_check CHECK (version > 0)
);

CREATE TABLE inventory_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    menu_item_id UUID NOT NULL,
    lot_code VARCHAR(80) NOT NULL,
    expires_at DATE,
    on_hand INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inventory_lots_item_tenant_fkey
        FOREIGN KEY (menu_item_id, tenant_id)
        REFERENCES menu_items(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT inventory_lots_quantity_check
        CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand),
    CONSTRAINT inventory_lots_tenant_item_code_key
        UNIQUE (tenant_id, menu_item_id, lot_code)
);

CREATE INDEX idx_inventory_lots_expiry
    ON inventory_lots (tenant_id, expires_at)
    WHERE expires_at IS NOT NULL;
