# ClickGarçom - Arquitetura Completa 🍽️

> **Sistema de pedidos para restaurantes via WhatsApp com KDS em tempo real**

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Estrutura de Diretórios](#estrutura-de-diretórios)
5. [Componentes Principais](#componentes-principais)
6. [Padrões de Design](#padrões-de-design)
7. [Fluxo de Dados](#fluxo-de-dados)

---

## Visão Geral

O **ClickGarçom** é um sistema completo de gestão de pedidos para restaurantes que utiliza WhatsApp como interface principal para clientes, com um KDS (Kitchen Display System) em tempo real para a cozinha/bar.

### Características Principais

- ✅ **Multi-tenancy**: Suporte para múltiplos restaurantes
- ✅ **WhatsApp Integration**: Recebimento de pedidos via WhatsApp
- ✅ **Real-time KDS**: Display de cozinha em tempo real via WebSocket
- ✅ **Event-Driven**: Arquitetura orientada a eventos com RabbitMQ
- ✅ **Clean Architecture**: Separação clara de responsabilidades
- ✅ **Idempotência**: Inbox/Outbox patterns para confiabilidade
- ✅ **Observabilidade**: Prometheus + Grafana integrados

---

## Stack Tecnológica

### Backend Core (Go)
- **Framework**: [Fiber](https://gofiber.io/) - Web framework de alta performance
- **ORM**: [GORM](https://gorm.io/) - Object-Relational Mapping
- **Migrations**: golang-migrate
- **Logger**: Estruturado com níveis configuráveis

### Infraestrutura
- **Database**: PostgreSQL 17 (Alpine)
- **Cache/Sessions**: Redis 7 (Alpine)
- **Message Broker**: RabbitMQ 3.13 (Management)
- **Containerization**: Docker Compose

### Observabilidade
- **Metrics**: Prometheus
- **Dashboards**: Grafana
- **Logs**: Structured logging

### Integrações
- **WhatsApp**: Meta Business API
- **Payments**: PIX (via PSP)

---

## Arquitetura do Sistema

### Diagrama de Alto Nível

```mermaid
graph TB
    subgraph "Cliente"
        WA[WhatsApp]
    end
    
    subgraph "Entrada"
        WH[Webhook Handler]
        INBOX[Inbox Pattern]
    end
    
    subgraph "Processamento"
        RMQ[RabbitMQ]
        WORKER[Worker]
        SM[State Machine]
    end
    
    subgraph "Persistência"
        PG[(PostgreSQL)]
        REDIS[(Redis Sessions)]
    end
    
    subgraph "Saída"
        OUTBOX[Outbox Pattern]
        OUTWORKER[Outbox Worker]
        META[Meta API Client]
    end
    
    subgraph "Real-time"
        WS[WebSocket Server]
        KDS[KDS Display]
    end
    
    WA -->|Mensagem| WH
    WH -->|Salva| INBOX
    INBOX -->|Publica| RMQ
    RMQ -->|Consome| WORKER
    WORKER -->|Consulta/Atualiza| PG
    WORKER -->|Sessão| REDIS
    WORKER -->|State Machine| SM
    WORKER -->|Cria mensagem| OUTBOX
    OUTBOX -->|Processa| OUTWORKER
    OUTWORKER -->|Envia| META
    META -->|Resposta| WA
    WORKER -->|Evento| WS
    WS -->|Push| KDS
```

### Fluxo de Requisição

```mermaid
sequenceDiagram
    participant C as Cliente WhatsApp
    participant W as Webhook
    participant I as Inbox
    participant R as RabbitMQ
    participant WK as Worker
    participant DB as PostgreSQL
    participant RD as Redis
    participant O as Outbox
    participant M as Meta API
    
    C->>W: Envia mensagem
    W->>I: Salva evento (idempotente)
    I->>R: Publica na fila
    R->>WK: Consome evento
    WK->>DB: Busca sessão/contexto
    WK->>RD: Valida estado
    WK->>DB: Processa lógica de negócio
    WK->>O: Cria mensagem de resposta
    O->>M: Envia via API
    M->>C: Entrega mensagem
```

---

## Estrutura de Diretórios

```
clickgarcom/
├── docker-compose.yml          # Orquestração de containers
├── Makefile                    # Comandos de desenvolvimento
├── README.md                   # Documentação principal
│
├── infra/                      # Configurações de infraestrutura
│   ├── docker/
│   │   └── postgres/
│   │       └── init.sql
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── rabbitmq/
│       └── rabbitmq.conf
│
└── services/
    └── go-core/                # Serviço principal em Go
        ├── cmd/                # Entry points
        │   ├── api/           # HTTP API (webhooks)
        │   ├── worker/        # RabbitMQ consumer
        │   ├── outbox-worker/ # Outbox processor
        │   ├── realtime/      # WebSocket server
        │   ├── migrate/       # Database migrations
        │   └── setup-rabbitmq/# RabbitMQ setup
        │
        ├── internal/           # Código privado
        │   ├── config/        # Configurações
        │   ├── domain/        # Entidades de domínio
        │   │   ├── inbox/
        │   │   ├── order/
        │   │   ├── tab/
        │   │   ├── table/
        │   │   ├── tenant/
        │   │   └── whatsapp/
        │   │
        │   ├── application/   # Casos de uso
        │   │
        │   ├── infrastructure/# Implementações
        │   │   ├── persistence/
        │   │   │   └── postgres/
        │   │   ├── queue/
        │   │   │   └── rabbitmq/
        │   │   └── whatsapp/
        │   │       ├── meta_client.go
        │   │       ├── outbox_processor.go
        │   │       └── session_manager.go
        │   │
        │   └── interfaces/    # Controllers/Handlers
        │       ├── http/
        │       └── queue/
        │
        └── pkg/               # Código público/compartilhado
            └── logger/
```

---

## Componentes Principais

### 1. **API Server** (`cmd/api`)

**Responsabilidade**: Receber webhooks do WhatsApp

```go
// Endpoints principais:
POST /webhook/whatsapp  // Recebe mensagens do WhatsApp
GET  /webhook/whatsapp  // Verificação do Meta
GET  /health            // Health check
```

**Características**:
- Validação de assinatura Meta
- Salvamento idempotente no Inbox
- Publicação assíncrona no RabbitMQ
- Resposta rápida (< 5s)

### 2. **Worker** (`cmd/worker`)

**Responsabilidade**: Processar mensagens do WhatsApp

**Fluxo**:
1. Consome mensagem da fila `whatsapp.messages`
2. Busca sessão do usuário no Redis
3. Executa State Machine baseado no contexto
4. Atualiza banco de dados
5. Cria mensagem de resposta no Outbox
6. Emite eventos para WebSocket (se aplicável)

**State Machine**:
```
INITIAL → MENU_BROWSING → ITEM_SELECTED → QUANTITY_INPUT → 
CONFIRM_ORDER → ORDER_PLACED → PAYMENT_FLOW → COMPLETED
```

### 3. **Outbox Worker** (`cmd/outbox-worker`)

**Responsabilidade**: Enviar mensagens para WhatsApp de forma confiável

**Características**:
- Polling do banco a cada 5 segundos
- Retry exponencial (max 3 tentativas)
- Marca mensagens como enviadas
- Registra erros para análise

### 4. **Realtime Server** (`cmd/realtime`)

**Responsabilidade**: WebSocket para KDS em tempo real

**Eventos**:
- `order.created` - Novo pedido
- `order.accepted` - Pedido aceito
- `order.ready` - Pedido pronto
- `order.delivered` - Pedido entregue
- `order.canceled` - Pedido cancelado

### 5. **Migrations** (`cmd/migrate`)

**Migrations disponíveis**:
- [000001_initial_schema.up.sql](file:///Users/macbook/projects/clickgarcom/services/go-core/cmd/migrate/000001_initial_schema.up.sql) - Schema completo
- `000002_fix_outbox_payload.up.sql` - Ajuste no Outbox

---

## Padrões de Design

### 1. **Clean Architecture**

```
┌─────────────────────────────────────┐
│         Interfaces (HTTP/Queue)      │
├─────────────────────────────────────┤
│         Application (Use Cases)      │
├─────────────────────────────────────┤
│         Domain (Entities)            │
├─────────────────────────────────────┤
│    Infrastructure (DB/Queue/APIs)    │
└─────────────────────────────────────┘
```

**Benefícios**:
- Testabilidade
- Independência de frameworks
- Separação de responsabilidades

### 2. **Inbox Pattern** (Idempotência)

**Problema**: Webhooks podem ser enviados múltiplas vezes

**Solução**:
```sql
CREATE TABLE inbox_events (
    id UUID PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    UNIQUE(source, provider_message_id)  -- Garante idempotência
);
```

**Fluxo**:
1. Webhook chega
2. Tenta inserir no `inbox_events`
3. Se já existe (UNIQUE constraint), ignora
4. Se novo, salva e publica no RabbitMQ

### 3. **Outbox Pattern** (Confiabilidade)

**Problema**: Garantir que mensagens sejam enviadas mesmo se o serviço cair

**Solução**:
```sql
CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY,
    destination VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    next_retry_at TIMESTAMP
);
```

**Fluxo**:
1. Worker cria mensagem no Outbox (mesma transação do pedido)
2. Outbox Worker processa periodicamente
3. Marca como `sent = true` após sucesso
4. Retry exponencial em caso de falha

### 4. **State Machine** (Conversação)

**Gerenciamento de contexto conversacional**:

```go
type ConversationState string

const (
    StateInitial        ConversationState = "INITIAL"
    StateMenuBrowsing   ConversationState = "MENU_BROWSING"
    StateItemSelected   ConversationState = "ITEM_SELECTED"
    StateQuantityInput  ConversationState = "QUANTITY_INPUT"
    StateConfirmOrder   ConversationState = "CONFIRM_ORDER"
    // ...
)
```

**Armazenamento**: Redis com TTL de 30 minutos

### 5. **Repository Pattern**

**Interface**:
```go
type TabRepository interface {
    Create(ctx context.Context, tab *domain.Tab) error
    FindByID(ctx context.Context, id uuid.UUID) (*domain.Tab, error)
    Update(ctx context.Context, tab *domain.Tab) error
    // ...
}
```

**Implementação**: PostgreSQL com GORM

---

## Fluxo de Dados

### Exemplo: Cliente faz um pedido

```mermaid
sequenceDiagram
    participant C as Cliente
    participant W as WhatsApp
    participant API as API Server
    participant I as Inbox
    participant R as RabbitMQ
    participant WK as Worker
    participant SM as State Machine
    participant DB as PostgreSQL
    participant RD as Redis
    participant O as Outbox
    participant OW as Outbox Worker
    participant M as Meta API
    
    C->>W: "Olá"
    W->>API: POST /webhook (message)
    API->>I: Salva no inbox
    API->>R: Publica evento
    API-->>W: 200 OK
    
    R->>WK: Consome evento
    WK->>RD: Busca sessão
    RD-->>WK: Estado: INITIAL
    WK->>SM: Processa(INITIAL, "Olá")
    SM-->>WK: Próximo: MENU_BROWSING
    WK->>DB: Busca cardápio
    DB-->>WK: Lista de itens
    WK->>O: Cria mensagem com menu
    WK->>RD: Atualiza estado
    
    OW->>O: Polling
    O-->>OW: Mensagem pendente
    OW->>M: Envia mensagem
    M-->>OW: 200 OK
    OW->>O: Marca como enviada
    
    M->>W: Entrega mensagem
    W->>C: Mostra menu
```

---

## Database Schema

### Principais Tabelas

#### **tenants**
Multi-tenancy - cada restaurante é um tenant
```sql
- id (UUID)
- name, slug
- whatsapp_number (UNIQUE)
- settings (JSONB)
- active (BOOLEAN)
```

#### **tables**
Mesas do restaurante
```sql
- id (UUID)
- tenant_id (FK)
- number (VARCHAR)
- qr_token (JWT rotacionável)
- status (AVAILABLE, OCCUPIED, RESERVED, CLEANING)
```

#### **tabs**
Comandas abertas
```sql
- id (UUID)
- tenant_id, table_id (FK)
- subtotal, service_fee, total, paid_amount
- status (OPEN, WAITING_PAYMENT, PAID, CLOSED)
```

#### **orders**
Pedidos
```sql
- id (UUID)
- tenant_id, tab_id (FK)
- destination (KITCHEN, BAR)
- status (PENDING, ACCEPTED, READY, DELIVERED, CANCELED)
- created_at, accepted_at, ready_at, delivered_at
```

#### **inbox_events**
Idempotência de webhooks
```sql
- id (UUID)
- source, provider_message_id (UNIQUE)
- payload (JSONB)
- processed (BOOLEAN)
```

#### **outbox_messages**
Envio confiável
```sql
- id (UUID)
- destination, recipient
- payload (TEXT)
- sent (BOOLEAN)
- attempts, max_attempts
- next_retry_at
```

---

## Configuração

### Variáveis de Ambiente ([.env](file:///Users/macbook/projects/clickgarcom/services/go-core/.env))

```bash
# Database
DATABASE_URL=postgres://postgres:postgres123@localhost:5432/clickgarcom_db

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://clickgarcom:clickgarcom123@localhost:5672/

# WhatsApp Meta API
META_VERIFY_TOKEN=seu_token_secreto
META_ACCESS_TOKEN=seu_access_token
META_PHONE_NUMBER_ID=seu_phone_id

# Server
PORT=3000
ENV=development
LOG_LEVEL=debug
```

---

## Comandos Úteis

Ver [quick_reference.md](file:///Users/macbook/.gemini/antigravity/brain/ff2e4978-1ec1-4f5f-8784-1e7c7c54809b/quick_reference.md) para lista completa de comandos do Makefile.

---

## Próximos Passos

Consulte [implementation_phases.md](file:///Users/macbook/.gemini/antigravity/brain/ff2e4978-1ec1-4f5f-8784-1e7c7c54809b/implementation_phases.md) para ver o que foi construído e o que vem a seguir.
