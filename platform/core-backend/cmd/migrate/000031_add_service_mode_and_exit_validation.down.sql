DROP INDEX IF EXISTS idx_tabs_exit_validation;
DROP INDEX IF EXISTS idx_tabs_tenant_public_code;
ALTER TABLE tabs DROP CONSTRAINT IF EXISTS tabs_service_mode_check;
ALTER TABLE tabs
    DROP COLUMN IF EXISTS exit_validation_method,
    DROP COLUMN IF EXISTS exit_validated_by,
    DROP COLUMN IF EXISTS exit_validated_at,
    DROP COLUMN IF EXISTS public_code,
    DROP COLUMN IF EXISTS service_mode;
