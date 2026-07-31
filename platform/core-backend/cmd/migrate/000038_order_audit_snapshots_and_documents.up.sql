-- Manual order traceability and immutable operational documents.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS item_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS voided_quantity INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS voided_reason TEXT,
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS voided_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS voided_by_user_name VARCHAR(255);

ALTER TABLE order_items
    DROP CONSTRAINT IF EXISTS order_items_voided_quantity_check;

ALTER TABLE order_items
    ADD CONSTRAINT order_items_voided_quantity_check
    CHECK (voided_quantity >= 0 AND voided_quantity <= quantity);

UPDATE order_items oi
   SET item_name_snapshot = mi.name
  FROM menu_items mi
 WHERE oi.menu_item_id = mi.id
   AND oi.item_name_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_voided
    ON order_items (order_id, voided_quantity)
    WHERE voided_quantity > 0;

CREATE TABLE IF NOT EXISTS tab_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    document_type VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    document_number VARCHAR(80),
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    issued_by_user_id UUID,
    issued_by_user_name VARCHAR(255),
    source VARCHAR(30) NOT NULL DEFAULT 'KDS',
    original_document_id UUID REFERENCES tab_documents(id) ON DELETE SET NULL,
    print_count INT NOT NULL DEFAULT 1 CHECK (print_count > 0),
    content_hash VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_documents_tab_issued
    ON tab_documents (tenant_id, tab_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_tab_documents_type
    ON tab_documents (tenant_id, document_type, issued_at DESC);
