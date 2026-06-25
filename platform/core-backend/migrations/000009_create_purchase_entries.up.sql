-- Lançamento de compras e notas de entrada
CREATE TABLE IF NOT EXISTS purchase_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    supplier_name VARCHAR(180) NOT NULL,
    supplier_document VARCHAR(40),
    invoice_number VARCHAR(80),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by_user_id UUID,
    created_by_user_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_entries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_entries_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_entries_tenant_id ON purchase_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_purchase_date ON purchase_entries(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_supplier_name ON purchase_entries(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_invoice_number ON purchase_entries(invoice_number);
