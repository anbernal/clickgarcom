DROP INDEX IF EXISTS idx_tenants_waba_id;

ALTER TABLE tenants
    DROP COLUMN IF EXISTS is_open,
    DROP COLUMN IF EXISTS billing_plan,
    DROP COLUMN IF EXISTS wallet_balance,
    DROP COLUMN IF EXISTS meta_token,
    DROP COLUMN IF EXISTS waba_id;
