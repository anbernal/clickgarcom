-- A WhatsApp phone_number_id must resolve to exactly one restaurant.
-- Empty values remain allowed for tenants still in onboarding.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_waba_id_unique
    ON tenants (waba_id)
    WHERE waba_id IS NOT NULL AND BTRIM(waba_id) <> '';
