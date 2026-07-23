-- Comandas podem ser abertas pela equipe sem depender de uma mesa.
ALTER TABLE tabs
    ADD COLUMN IF NOT EXISTS customer_instagram VARCHAR(80),
    ADD COLUMN IF NOT EXISTS opening_channel VARCHAR(30) NOT NULL DEFAULT 'LEGACY';

UPDATE tabs
   SET opening_channel = CASE
       WHEN opened_by_user_id IS NOT NULL THEN 'STAFF'
       WHEN table_id IS NULL THEN 'WHATSAPP'
       ELSE 'LEGACY'
   END
 WHERE opening_channel = 'LEGACY';

CREATE INDEX IF NOT EXISTS idx_tabs_tenant_opened_at
    ON tabs (tenant_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_tabs_tenant_customer_phone
    ON tabs (tenant_id, user_phone)
    WHERE user_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_tenant_customer_instagram
    ON tabs (tenant_id, customer_instagram)
    WHERE customer_instagram IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_tenant_open_code
    ON tabs (tenant_id, public_code)
    WHERE status = 'OPEN' AND public_code IS NOT NULL;
