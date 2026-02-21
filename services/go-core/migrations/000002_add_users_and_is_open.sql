-- +goose Up
-- sql up
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'COLLABORATOR')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE tenants ADD COLUMN is_open BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
-- sql down
DROP TABLE IF EXISTS users;
ALTER TABLE tenants DROP COLUMN IF EXISTS is_open;
