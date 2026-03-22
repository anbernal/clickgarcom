-- ============================================
-- ClickGarçom - Schema Inicial
-- ============================================

-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- TENANTS (Multi-tenancy)
-- ============================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    whatsapp_number VARCHAR(20) NOT NULL UNIQUE,
    
    -- Configurações (JSON)
    settings JSONB DEFAULT '{
        "service_fee_percent": 10,
        "split_enabled": true,
        "auto_accept_orders": false,
        "nps_enabled": true,
        "voucher_enabled": true
    }'::jsonb,
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_whatsapp ON tenants(whatsapp_number);
CREATE INDEX idx_tenants_active ON tenants(active);

-- ============================================
-- TABLES (Mesas)
-- ============================================
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identificação
    number VARCHAR(10) NOT NULL,
    qr_token TEXT, -- JWT rotacionável
    qr_expires_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_table_status CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING')),
    UNIQUE(tenant_id, number)
);

CREATE INDEX idx_tables_tenant ON tables(tenant_id);
CREATE INDEX idx_tables_status ON tables(status);

-- ============================================
-- TABS (Comandas)
-- ============================================
CREATE TABLE tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    
    -- Valores
    subtotal DECIMAL(10,2) DEFAULT 0 CHECK (subtotal >= 0),
    service_fee DECIMAL(10,2) DEFAULT 0 CHECK (service_fee >= 0),
    total DECIMAL(10,2) DEFAULT 0 CHECK (total >= 0),
    paid_amount DECIMAL(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    
    -- Timestamps
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    
    CONSTRAINT valid_tab_status CHECK (status IN ('OPEN', 'WAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CLOSED'))
);

CREATE INDEX idx_tabs_tenant_status ON tabs(tenant_id, status);
CREATE INDEX idx_tabs_table ON tabs(table_id) WHERE status = 'OPEN';
CREATE INDEX idx_tabs_opened_at ON tabs(opened_at DESC);

-- ============================================
-- MENU (Cardápio)
-- ============================================
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_menu_categories_tenant ON menu_categories(tenant_id);
CREATE INDEX idx_menu_categories_order ON menu_categories(display_order);

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    
    -- Info básica
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    
    -- Imagem
    image_url TEXT,
    
    -- Roteamento (KDS)
    destination VARCHAR(20) NOT NULL DEFAULT 'KITCHEN',
    
    -- Tempo estimado de preparo (minutos)
    prep_time_minutes INT DEFAULT 15,
    
    -- Status
    available BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_destination CHECK (destination IN ('KITCHEN', 'BAR'))
);

CREATE INDEX idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_available ON menu_items(available);
CREATE INDEX idx_menu_items_destination ON menu_items(destination);

-- ============================================
-- ORDERS (Pedidos)
-- ============================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    
    -- Roteamento
    destination VARCHAR(20) NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    
    -- Observações gerais
    notes TEXT,
    
    -- Timestamps do ciclo de vida
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    ready_at TIMESTAMP,
    delivered_at TIMESTAMP,
    canceled_at TIMESTAMP,
    
    -- Motivo do cancelamento
    cancel_reason TEXT,
    
    CONSTRAINT valid_order_status CHECK (status IN ('PENDING', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELED')),
    CONSTRAINT valid_order_destination CHECK (destination IN ('KITCHEN', 'BAR'))
);

CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_tab ON orders(tab_id);
CREATE INDEX idx_orders_destination_status ON orders(destination, status) WHERE status IN ('PENDING', 'ACCEPTED', 'READY');
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    
    -- Quantidade e preço no momento do pedido
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    
    -- Observações específicas do item
    observations TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON order_items(menu_item_id);

-- ============================================
-- PAYMENTS (Pagamentos)
-- ============================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    
    -- Tipo de pagamento
    payment_type VARCHAR(20) NOT NULL,
    
    -- Valores
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',
    
    -- Pix
    pix_txid VARCHAR(255) UNIQUE,
    pix_qr_code TEXT,
    pix_qr_code_image TEXT,
    
    -- Metadados
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP,
    expired_at TIMESTAMP,
    
    CONSTRAINT valid_payment_type CHECK (payment_type IN ('FULL', 'SPLIT_EQUAL', 'SPLIT_ITEMS')),
    CONSTRAINT valid_payment_status CHECK (status IN ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELED'))
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_tab ON payments(tab_id);
CREATE INDEX idx_payments_txid ON payments(pix_txid) WHERE pix_txid IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);

-- Allocation de itens para split payments
CREATE TABLE payment_item_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    
    -- Quantidade alocada deste item para este pagamento
    allocated_quantity INT NOT NULL CHECK (allocated_quantity > 0),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(payment_id, order_item_id)
);

CREATE INDEX idx_payment_allocations_payment ON payment_item_allocations(payment_id);
CREATE INDEX idx_payment_allocations_item ON payment_item_allocations(order_item_id);

-- ============================================
-- SERVICE REQUESTS (Solicitações da mesa)
-- ============================================
CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL,
    
    -- Tipo de solicitação
    request_type VARCHAR(50) NOT NULL,
    
    -- Descrição adicional
    description TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',
    
    -- Prioridade (1-5, sendo 5 mais urgente)
    priority INT DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    resolved_by UUID, -- ID do usuário que resolveu
    
    CONSTRAINT valid_request_type CHECK (request_type IN ('ICE', 'CUTLERY', 'NAPKIN', 'CALL_WAITER', 'ISSUE', 'OTHER')),
    CONSTRAINT valid_request_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELED'))
);

CREATE INDEX idx_service_requests_tenant_status ON service_requests(tenant_id, status);
CREATE INDEX idx_service_requests_table ON service_requests(table_id);
CREATE INDEX idx_service_requests_priority ON service_requests(priority DESC, created_at);

-- ============================================
-- INBOX PATTERN (Idempotência de webhooks)
-- ============================================
CREATE TABLE inbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Origem do evento
    source VARCHAR(50) NOT NULL,
    
    -- ID único do provider (ex: wamid do WhatsApp)
    provider_message_id VARCHAR(255) NOT NULL,
    
    -- Tenant relacionado (pode ser null se ainda não identificado)
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Payload completo (RAW)
    payload JSONB NOT NULL,
    
    -- Processamento
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    
    -- Timestamps
    received_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    
    -- Garantia de idempotência
    UNIQUE(source, provider_message_id)
);

CREATE INDEX idx_inbox_unprocessed ON inbox_events(processed, received_at) WHERE processed = FALSE;
CREATE INDEX idx_inbox_source ON inbox_events(source);
CREATE INDEX idx_inbox_tenant ON inbox_events(tenant_id);

-- ============================================
-- OUTBOX PATTERN (Envio confiável de mensagens)
-- ============================================
CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Destino
    destination VARCHAR(50) NOT NULL, -- 'whatsapp', 'email', 'sms'
    recipient VARCHAR(255) NOT NULL,
    
    -- Payload
    payload TEXT NOT NULL,
    
    -- Template ID (se aplicável)
    template_id VARCHAR(100),
    
    -- Status
    sent BOOLEAN DEFAULT FALSE,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    next_retry_at TIMESTAMP
);

CREATE INDEX idx_outbox_pending ON outbox_messages(sent, next_retry_at) WHERE sent = FALSE;
CREATE INDEX idx_outbox_tenant ON outbox_messages(tenant_id);

-- ============================================
-- NPS & FEEDBACK
-- ============================================
CREATE TABLE nps_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    
    -- Cliente (telefone WhatsApp)
    customer_phone VARCHAR(20) NOT NULL,
    
    -- Score NPS (0-10)
    score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
    
    -- Feedback opcional
    feedback TEXT,
    
    -- Se foi tratado pelo gerente
    handled BOOLEAN DEFAULT FALSE,
    handled_at TIMESTAMP,
    handled_by UUID,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nps_tenant ON nps_responses(tenant_id);
CREATE INDEX idx_nps_score ON nps_responses(score);
CREATE INDEX idx_nps_unhandled ON nps_responses(handled, score) WHERE handled = FALSE AND score < 7;

-- ============================================
-- USERS (Garçons, Cozinheiros, Gerentes)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Dados pessoais
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    
    -- Autenticação
    password_hash TEXT NOT NULL,
    
    -- Roles
    role VARCHAR(20) NOT NULL,
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    
    CONSTRAINT valid_user_role CHECK (role IN ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR')),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- TRIGGERS (Updated_at automático)
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON menu_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA (Tenant de exemplo)
-- ============================================
INSERT INTO tenants (id, name, slug, whatsapp_number, active)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Restaurante Demo',
    'demo',
    '5511999999999',
    true
);