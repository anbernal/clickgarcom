ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_notes_not_null_like;

ALTER TABLE order_items
    DROP CONSTRAINT IF EXISTS order_items_observations_not_null_like;
