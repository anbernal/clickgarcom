-- Remove artifacts created when a nil Go interface was formatted as text.

UPDATE order_items
   SET observations = NULL
 WHERE LOWER(BTRIM(observations)) IN ('<nil>', 'nil', 'null', '<null>', 'undefined');

UPDATE orders
   SET notes = NULL
 WHERE LOWER(BTRIM(notes)) IN ('<nil>', 'nil', 'null', '<null>', 'undefined');

ALTER TABLE order_items
    DROP CONSTRAINT IF EXISTS order_items_observations_not_null_like;

ALTER TABLE order_items
    ADD CONSTRAINT order_items_observations_not_null_like
    CHECK (observations IS NULL OR LOWER(BTRIM(observations)) NOT IN ('<nil>', 'nil', 'null', '<null>', 'undefined'));

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_notes_not_null_like;

ALTER TABLE orders
    ADD CONSTRAINT orders_notes_not_null_like
    CHECK (notes IS NULL OR LOWER(BTRIM(notes)) NOT IN ('<nil>', 'nil', 'null', '<null>', 'undefined'));
