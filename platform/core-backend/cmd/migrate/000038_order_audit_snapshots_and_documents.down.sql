DROP INDEX IF EXISTS idx_tab_documents_type;
DROP INDEX IF EXISTS idx_tab_documents_tab_issued;
DROP TABLE IF EXISTS tab_documents;
DROP INDEX IF EXISTS idx_order_items_voided;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_voided_quantity_check;
ALTER TABLE order_items
    DROP COLUMN IF EXISTS voided_by_user_name,
    DROP COLUMN IF EXISTS voided_by_user_id,
    DROP COLUMN IF EXISTS voided_at,
    DROP COLUMN IF EXISTS voided_reason,
    DROP COLUMN IF EXISTS voided_quantity,
    DROP COLUMN IF EXISTS item_name_snapshot;
