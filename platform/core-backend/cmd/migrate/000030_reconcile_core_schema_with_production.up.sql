-- Reconcile local/dev schema with production canonical shape.
-- This migration is idempotent and safe to run in production.

-- ---------------------------------------------------------------------------
-- Column defaults and nullability
-- ---------------------------------------------------------------------------
ALTER TABLE tables
    ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS waba_id TEXT,
    ADD COLUMN IF NOT EXISTS meta_token TEXT,
    ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS billing_plan VARCHAR(20) DEFAULT 'pre_paid',
    ADD COLUMN IF NOT EXISTS message_price NUMERIC(10,2) DEFAULT 0.02,
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT false;

ALTER TABLE menu_categories
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN display_order DROP NOT NULL,
    ALTER COLUMN active DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL;

ALTER TABLE menu_items
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN prep_time_minutes DROP NOT NULL,
    ALTER COLUMN available DROP NOT NULL,
    ALTER COLUMN display_order DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL;

ALTER TABLE order_items
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at DROP NOT NULL;

ALTER TABLE orders
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE table_requests
    ALTER COLUMN id DROP DEFAULT,
    ALTER COLUMN status TYPE character varying USING status::text,
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN status SET DEFAULT 'PENDING',
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL,
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'table_requests'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE 'ALTER TABLE table_requests ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE ''UTC''';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'table_requests'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE 'ALTER TABLE table_requests ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE ''UTC''';
    END IF;
END $$;

ALTER TABLE tables
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL,
    ALTER COLUMN capacity DROP NOT NULL;

ALTER TABLE tabs
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN subtotal DROP NOT NULL,
    ALTER COLUMN service_fee DROP NOT NULL,
    ALTER COLUMN total DROP NOT NULL,
    ALTER COLUMN paid_amount DROP NOT NULL,
    ALTER COLUMN opened_at DROP NOT NULL,
    ALTER COLUMN opened_at SET DEFAULT now();

ALTER TABLE tenants
    ALTER COLUMN wallet_balance SET NOT NULL,
    ALTER COLUMN billing_plan SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Replace local divergent constraints with production names/semantics
-- ---------------------------------------------------------------------------
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS "FK_20cff56c44dd4fe52d5aa2b96f8";
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS "FK_145532db85752b29c57d2b7b1f1";
ALTER TABLE table_requests DROP CONSTRAINT IF EXISTS "FK_a2bbb530ab24ccb156b874f454b";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_c8d52e8043ec65f584f42b11a53') THEN
        ALTER TABLE table_requests
            RENAME CONSTRAINT "PK_c8d52e8043ec65f584f42b11a53" TO table_requests_pkey;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_categories_tenant_id_fkey') THEN
        ALTER TABLE menu_categories
            ADD CONSTRAINT menu_categories_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_categories_tenant_id_name_key') THEN
        ALTER TABLE menu_categories
            ADD CONSTRAINT menu_categories_tenant_id_name_key
            UNIQUE (tenant_id, name);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_category_id_fkey') THEN
        ALTER TABLE menu_items
            ADD CONSTRAINT menu_items_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_tenant_id_fkey') THEN
        ALTER TABLE menu_items
            ADD CONSTRAINT menu_items_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_price_check') THEN
        ALTER TABLE menu_items
            ADD CONSTRAINT menu_items_price_check
            CHECK (price >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_destination') THEN
        ALTER TABLE menu_items
            ADD CONSTRAINT valid_destination
            CHECK (destination IN ('KITCHEN', 'BAR')) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_menu_item_id_fkey') THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_menu_item_id_fkey
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_check') THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_quantity_check
            CHECK (quantity > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unit_price_check') THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_unit_price_check
            CHECK (unit_price >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tab_id_fkey') THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_tab_id_fkey
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_id_fkey') THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_order_destination') THEN
        ALTER TABLE orders
            ADD CONSTRAINT valid_order_destination
            CHECK (destination IN ('KITCHEN', 'BAR')) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_order_status') THEN
        ALTER TABLE orders
            ADD CONSTRAINT valid_order_status
            CHECK (status IN ('PENDING', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELED')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'table_requests'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE table_requests
            ADD CONSTRAINT table_requests_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_table_requests_table') THEN
        ALTER TABLE table_requests
            ADD CONSTRAINT fk_table_requests_table
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_table_requests_tenant') THEN
        ALTER TABLE table_requests
            ADD CONSTRAINT fk_table_requests_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_tenant_id_fkey') THEN
        ALTER TABLE tables
            ADD CONSTRAINT tables_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_tenant_id_number_key') THEN
        ALTER TABLE tables
            ADD CONSTRAINT tables_tenant_id_number_key
            UNIQUE (tenant_id, number);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_table_status') THEN
        ALTER TABLE tables
            ADD CONSTRAINT valid_table_status
            CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING')) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_paid_amount_check') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_paid_amount_check
            CHECK (paid_amount >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_service_fee_check') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_service_fee_check
            CHECK (service_fee >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_subtotal_check') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_subtotal_check
            CHECK (subtotal >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_total_check') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_total_check
            CHECK (total >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_table_id_fkey') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_table_id_fkey
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tabs_tenant_id_fkey') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT tabs_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_tab_status') THEN
        ALTER TABLE tabs
            ADD CONSTRAINT valid_tab_status
            CHECK (status IN ('OPEN', 'WAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CLOSED')) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    BEGIN
        ALTER TABLE menu_categories VALIDATE CONSTRAINT menu_categories_tenant_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for menu_categories_tenant_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE menu_items VALIDATE CONSTRAINT menu_items_category_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for menu_items_category_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE menu_items VALIDATE CONSTRAINT menu_items_tenant_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for menu_items_tenant_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE menu_items VALIDATE CONSTRAINT menu_items_price_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for menu_items_price_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE menu_items VALIDATE CONSTRAINT valid_destination;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for valid_destination: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE order_items VALIDATE CONSTRAINT order_items_menu_item_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for order_items_menu_item_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE order_items VALIDATE CONSTRAINT order_items_order_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for order_items_order_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE order_items VALIDATE CONSTRAINT order_items_quantity_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for order_items_quantity_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE order_items VALIDATE CONSTRAINT order_items_unit_price_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for order_items_unit_price_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE orders VALIDATE CONSTRAINT orders_tab_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for orders_tab_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE orders VALIDATE CONSTRAINT orders_tenant_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for orders_tenant_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE orders VALIDATE CONSTRAINT valid_order_destination;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for valid_order_destination: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE orders VALIDATE CONSTRAINT valid_order_status;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for valid_order_status: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE table_requests VALIDATE CONSTRAINT fk_table_requests_table;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for fk_table_requests_table: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE table_requests VALIDATE CONSTRAINT fk_table_requests_tenant;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for fk_table_requests_tenant: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tables VALIDATE CONSTRAINT tables_tenant_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tables_tenant_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tables VALIDATE CONSTRAINT valid_table_status;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for valid_table_status: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_paid_amount_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_paid_amount_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_service_fee_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_service_fee_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_subtotal_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_subtotal_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_total_check;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_total_check: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_table_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_table_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT tabs_tenant_id_fkey;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for tabs_tenant_id_fkey: %', SQLERRM;
    END;
    BEGIN
        ALTER TABLE tabs VALIDATE CONSTRAINT valid_tab_status;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping validation for valid_tab_status: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------------
-- Missing production indexes in local/dev
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_menu_categories_order
    ON menu_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant
    ON menu_categories(tenant_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_available
    ON menu_items(available);
CREATE INDEX IF NOT EXISTS idx_menu_items_category
    ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_destination
    ON menu_items(destination);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant
    ON menu_items(tenant_id);

CREATE INDEX IF NOT EXISTS idx_order_items_menu_item
    ON order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order
    ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_destination_status
    ON orders(destination, status)
    WHERE status IN ('PENDING', 'ACCEPTED', 'READY');
CREATE INDEX IF NOT EXISTS idx_orders_tab
    ON orders(tab_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status
    ON orders(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_table_requests_status
    ON table_requests(status);
CREATE INDEX IF NOT EXISTS idx_table_requests_table_id
    ON table_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_tenant_id
    ON table_requests(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tables_status
    ON tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_tenant
    ON tables(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tabs_opened_at
    ON tabs(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_tabs_table
    ON tabs(table_id)
    WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_tabs_tenant_status
    ON tabs(tenant_id, status);
