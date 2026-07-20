-- Login uses email without a tenant selector, so the identity must be globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global_unique
    ON users (LOWER(BTRIM(email)))
    WHERE email IS NOT NULL AND BTRIM(email) <> '';
