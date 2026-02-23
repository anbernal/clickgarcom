DROP TABLE IF EXISTS billing_statements;
ALTER TABLE tenants DROP COLUMN IF EXISTS wallet_balance;
ALTER TABLE tenants DROP COLUMN IF EXISTS billing_plan;
