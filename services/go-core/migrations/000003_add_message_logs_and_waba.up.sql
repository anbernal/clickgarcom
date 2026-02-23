-- Adiciona credenciais do WhatsApp Cloud API por Inquilino (FASE 11)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS waba_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS meta_token TEXT;

-- Cria a tabela de Bilhetagem / Métricas de Mensagens do WhatsApp
CREATE TABLE IF NOT EXISTS message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    direction VARCHAR(10) NOT NULL, -- 'IN' ou 'OUT'
    status VARCHAR(50),
    message_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_message_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Índices de performance cruciais para a query analítica (IN / OUT Count) do Super Admin
CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_dir ON message_logs(tenant_id, direction);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON message_logs(created_at);
