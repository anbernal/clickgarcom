ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS selected_options JSONB;
