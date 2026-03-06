-- ============================================
-- WAITER CHATS (Atendimento do garçom via WhatsApp)
-- ============================================
CREATE TABLE waiter_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_phone VARCHAR(30) NOT NULL,
    tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP,
    last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_by VARCHAR(20),

    CONSTRAINT valid_waiter_chat_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT valid_waiter_chat_closed_by CHECK (closed_by IS NULL OR closed_by IN ('CUSTOMER', 'STAFF'))
);

CREATE UNIQUE INDEX uq_waiter_chats_open_phone
    ON waiter_chats (tenant_id, user_phone)
    WHERE status = 'OPEN';

CREATE INDEX idx_waiter_chats_tenant_status
    ON waiter_chats (tenant_id, status, last_message_at DESC);

CREATE TABLE waiter_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES waiter_chats(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,
    sender_name VARCHAR(100),
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_waiter_chat_sender_type CHECK (sender_type IN ('CUSTOMER', 'STAFF', 'SYSTEM'))
);

CREATE INDEX idx_waiter_chat_messages_chat_created
    ON waiter_chat_messages (chat_id, created_at ASC);

CREATE INDEX idx_waiter_chat_messages_tenant_created
    ON waiter_chat_messages (tenant_id, created_at DESC);
