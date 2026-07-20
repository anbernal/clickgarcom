-- Atendimento por mesa ou sem mesa e credenciais da comanda.
ALTER TABLE tabs
    ADD COLUMN IF NOT EXISTS service_mode VARCHAR(20) NOT NULL DEFAULT 'COM_MESA',
    ADD COLUMN IF NOT EXISTS public_code VARCHAR(12),
    ADD COLUMN IF NOT EXISTS exit_validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS exit_validated_by UUID,
    ADD COLUMN IF NOT EXISTS exit_validation_method VARCHAR(30);

UPDATE tabs
   SET public_code = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
 WHERE public_code IS NULL OR TRIM(public_code) = '';

ALTER TABLE tabs
    DROP CONSTRAINT IF EXISTS tabs_service_mode_check;

ALTER TABLE tabs
    ADD CONSTRAINT tabs_service_mode_check
    CHECK (service_mode IN ('COM_MESA', 'SEM_MESA'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_tabs_tenant_public_code
    ON tabs (tenant_id, public_code)
    WHERE public_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tabs_exit_validation
    ON tabs (tenant_id, exit_validated_at)
    WHERE exit_validated_at IS NOT NULL;
