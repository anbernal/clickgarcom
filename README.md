# ClickGarçom 🍽️

Sistema de pedidos para restaurantes via WhatsApp com KDS em tempo real.

## Stack

- **Backend Core**: Go (Fiber) - Webhooks e Workers
- **Backend Admin**: Node.js (NestJS) - Painel administrativo
- **Database**: PostgreSQL 17
- **Cache/Queue**: Redis + RabbitMQ
- **Message Broker**: RabbitMQ 3.13
- **Real-time**: WebSocket

## Arquitetura
```
Cliente (WhatsApp) → Webhook (Go) → Inbox → RabbitMQ → Worker (Go)
                                                           ↓
                                                    Event Bus (RabbitMQ)
                                                           ↓
                                       ┌───────────────────┴───────────────────┐
                                       ↓                                       ↓
                               WebSocket (KDS)                        Admin Panel (Node)
```

## ✅ Funcionalidades Implementadas

### 🛒 Gestão de Pedidos via WhatsApp
- ✅ **Criação de pedidos** via conversa WhatsApp
- ✅ **Atualização automática de comandas** com cálculo de taxa de serviço (10%)
- ✅ **Gerenciamento de status** (PENDING → ACCEPTED → READY → DELIVERED)
- ✅ **Notificações WhatsApp** assíncronas via outbox pattern
- ✅ **API REST para cardápio** (3 endpoints)

### �️ Kitchen Display System (KDS)
- ✅ **Interface Real-time** conectada via WebSocket
- ✅ **Separação de ambientes** (Cozinha vs Bar)
- ✅ **Kanban de pedidos** (Novos, Preparo, Prontos)
- ✅ **Alertas sonoros** para novos pedidos
- ✅ **Métricas de performance** em tempo real

### �📋 Endpoints Disponíveis

#### Menu API
```bash
GET /menu                    # Menu completo (categorias + itens)
GET /menu/categories         # Apenas categorias
GET /menu/items             # Itens disponíveis
```

#### Order Management
```bash
PATCH /orders/:id/status?tenant_id=xxx   # Atualizar status do pedido
```

### 🔄 Fluxo de Pedido WhatsApp
1. Cliente envia mensagem → Recebe Boas Vindas e aguarda associação de mesa (se já não estiver escaneado o QR).
2. Garçom associa a mesa via Painel Admin → Cliente é notificado e recebe o Menu Principal.
3. Cliente envia "1" → Opção "Fazer pedido" → Lista de itens.
4. Cliente envia número do item → Pedido criado + Comanda atualizada.

### 💾 Modelo de Dados

**Orders** (Pedidos)
- Status tracking com timestamps
- Relacionamento com Tab (comanda)
- Items com preços e quantidades

**Tabs** (Comandas)
- Cálculo automático de subtotal
- Taxa de serviço (10%)
- Total consolidado

**Menu**
- Categorias e itens
- Controle de disponibilidade
- Preços e descrições

## Serviços

- **PostgreSQL 17**: Banco de dados principal
- **Redis 7**: Cache e sessões de conversa
- **RabbitMQ 3.13**: Mensageria e event-driven
- **Prometheus**: Métricas
- **Grafana**: Dashboards

## Quick Start
```bash
# 1. Clone o repositório
git clone <seu-repo>
cd clickgarcom

# 2. Copie o .env
cp services/go-core/.env.example services/go-core/.env

# 3. Suba toda a stack local em containers
make rebuild

# 4. (Opcional) Seed do banco
make db-seed

# 5. URLs locais
# API HTTP:            http://localhost:8080
# Admin Panel:         http://localhost:3002
# Super Admin:         http://localhost:3003
# RabbitMQ UI:         http://localhost:15672
# Grafana:             http://localhost:3001
# Prometheus:          http://localhost:9090
```

## Stack Containerizada

- `postgres`: PostgreSQL 17
- `redis`: Redis 7
- `rabbitmq`: RabbitMQ 3.13 + management UI
- `prometheus`: métricas
- `grafana`: dashboards
- `go-migrate`: aplica migrations ao subir
- `go-setup-rabbitmq`: cria exchanges/filas ao subir
- `go-api`: API HTTP / webhooks (porta `8080`)
- `go-worker`: processamento assíncrono
- `go-outbox`: envio e processamento de outbox
- `node-admin`: painel operacional (porta `3002`)
- `super-admin`: painel estático de administração global (porta `3003`)

## Desenvolvimento
```bash
# Subir tudo em Docker
make rebuild

# Rodar algum serviço fora do Docker (quando necessário)
make run-api
make run-worker
make run-outbox
make run-admin
make run-super-admin

# Limpar banco e filas
make clean-all

# Ver logs
make logs
make logs-super-admin

# Acessar RabbitMQ UI
http://localhost:15672
# User: clickgarcom / Pass: clickgarcom123
```

## Filas RabbitMQ

- `whatsapp.messages` - Mensagens do WhatsApp para processar
- `payment.webhooks` - Webhooks de pagamento
- `notifications.send` - Notificações para enviar
- `orders.dlq` - Dead Letter Queue para pedidos com erro

## 🧪 Testes

### Testar Webhook WhatsApp
```bash
# Criar pedido via webhook simulado
curl -X POST http://localhost:8080/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "metadata": {
            "business_phone_number_id": "5511999999999"
          },
          "messages": [{
            "id": "wamid.test001",
            "from": "5511999998888",
            "type": "text",
            "text": { "body": "1" }
          }]
        }
      }]
    }]
  }'
```

### Testar API de Menu
```bash
# Listar menu completo
curl http://localhost:8080/menu

# Atualizar status de pedido
curl -X PATCH 'http://localhost:8080/orders/ORDER_ID/status?tenant_id=TENANT_ID' \
  -H "Content-Type: application/json" \
  -d '{"status": "ACCEPTED"}'
```

### Monitoramento KDS
```bash
# Métricas Prometheus
curl http://localhost:8080/metrics
# Ex: kds_active_connections, kds_events_published_total
```

### Testes Automatizados
```bash
# Rodar testes de unidade e concorrência (Backend)
cd services/go-core
go test -v -race ./internal/infrastructure/websocket/...
```

## 📚 Documentação

Documentação detalhada disponível em:
- [`services/docs/walkthrough.md`](services/docs/walkthrough.md) - Guia completo das features implementadas
- [`services/docs/implementation_plan.md`](services/docs/implementation_plan.md) - Plano de implementação

## Roadmap

### ✅ Fase 1: Webhook WhatsApp & Pedidos (CONCLUÍDA)
- [x] Webhook WhatsApp com inbox pattern
- [x] Worker assíncrono com RabbitMQ
- [x] Máquina de estados para conversação
- [x] Criação de pedidos via WhatsApp
- [x] Atualização automática de comandas
- [x] Gerenciamento de status de pedidos
- [x] Notificações WhatsApp via outbox
- [x] API REST para cardápio

### ✅ Fase 2: KDS Real-time (CONCLUÍDA)
- [x] WebSocket server para KDS (Go + Fiber)
- [x] Interface KDS (Kitchen Display System) em Vanilla JS
- [x] Atualização em tempo real de pedidos (Event-driven)
- [x] Notificações sonoras e visuais
- [x] Filtros por destino (BAR/COZINHA)
- [x] Compressão Gzip para WebSockets

### ✅ Fase 3: Admin Panel (CONCLUÍDA)
- [x] Painel administrativo (NestJS)
- [x] Gestão de cardápio e categorias
- [x] Relatórios de vendas e gestão de mesas/comandas

### ✅ Fase 4: Fluxo de Reserva de Mesas (QR Code) (CONCLUÍDA)
- [x] Pedido de liberação de mesa via WhatsApp
- [x] Aprovação/Recusa em tempo real pelo Painel Admin
- [x] Integração Event-driven via RabbitMQ (Admin -> Go-Core)
- [x] Delegação manual de mesas (Walk-in)

### ✅ Fase 5: Qualidade & Observabilidade (Parcialmente Concluída)
- [x] Dashboard de métricas (Prometheus Endpoint)
- [x] Testes de Unidade e Concorrência (Go)
- [x] Logs estruturados
- [ ] Dashboards Visuais (Grafana) e Alertas Automáticos

### ✅ Fase 8: Painel Administrativo - Tela de Login (CONCLUÍDA)
- [x] Layout principal Split-Screen com background Pattern SVG customizado
- [x] Formulário de Login (E-mail/Senha com Toggle) responsivo e animado
- [x] Migração de Variáveis Globais de Design

### ✅ Fase 9: Multi-Tenancy & Autenticação JWT (CONCLUÍDA)
- [x] Separação de rotas e frontend SPA Authentication (Tela de Registro)
- [x] Criação de contas Multi-Inquilino (Restaurantes/Tenants e Usuários)
- [x] Autenticação completa de API e validação client-side via Header Bearer
- [x] Controle Ativo de Expediente das lojas (Aberto/Fechado)
- [x] Proteção das chamadas WebSocket (KDS) interceptando Sessão e Validando Origem

### ✅ Fase 10: Security Ops & Auditoria (CONCLUÍDA)
- [x] Hardening completo das APIs Node.js com guardiões JWT contextuais
- [x] Mitigação efetiva de BOLA/IDOR (Insecure Direct Object Reference)
- [x] Bloqueio de ataques e injeções Cross-Tenant nos serviços ORM do banco de dados
- [x] Sanitização Global e Defesa contra DOM-based XSS nas renderizações de Views (VanillaJS)

### ✅ Fase 11: Plataforma Super Admin & Tracking WhatsApp (CONCLUÍDA)
- [x] Remoção radical do registro Self-Service / Onboarding Público do Painel Admin
- [x] Criação da Estrutura Autônoma do Front-end Super Admin para gestão de Franquias
- [x] API WhatsApp Cloud Nível Meta: Suporte Nativo a Eventos (`typing_on`, `mark_as_read`) no Go
- [x] Bilhetagem Ativa: Injeção de Observabilidade via `MessageLogs` Database nos Padrões Inbox/Outbox
- [x] Separação Estrutural de Autenticação Webhook Metadados (`WabaID`, Token) abstraídos por Tenant

### ✅ Fase 12: Integração de Gateways de Pagamento Seguros (CONCLUÍDA)
- [x] Integração PCI Compliant via **Mercado Pago API V2 (SDK)**.
- [x] Transações Abstratas (Go-Core): Sem processamento de PANs/Cartões reais pela rede do ClickGarçom.
- [x] Worker Asíncrono de Webhooks MP (`payment.updated`) repassados via RabbitMQ.
- [x] PIX Dinâmico: Geração programada de códigos Copia-e-Cola e QR Codes associados a mesas.
- [x] Tela UI Independente e Escalável HTTP Server `checkout.js`.

### ✅ Fase 13: Order Domain (CONCLUÍDA)
- [x] Implementação integral do subdomínio de Pedidos, desvinculando Order Items da estrutura monolítica.
- [x] Adição do fluxo Kanban para Pedidos vinculados a Itens de Menu, permitindo split financeiro granular.

### ✅ Fase 14: Comandas Inteligentes e Split Checks (CONCLUÍDA)
- [x] Permite que múltiplos clientes na mesma mesa física possuam comandas diferentes abertas em simultâneo.
- [x] Clientes escolhem via WhatsApp "Entrar na Comanda" (compartilhada) ou "Comanda Individual".
- [x] O sistema rastreia comandas principais vs individuais para checkout independente.

### ✅ Fase 15: Autorização de Entrada na Mesa (Tab Join Approval) (CONCLUÍDA)
- [x] Quando o Cliente B (convidado) tenta entrar na Mesa 05 já ocupada, um request assíncrono é gerado.
- [x] Cliente A (o `user_phone` original - dono da mesa) recebe notificação no WhatsApp contendo botões interativos `Aprovar` e `Recusar`.
- [x] Ao ser aprovado, a nova `Tab` é instanciada para o Cliente B (individual) ou a sessão é embutida (compartilhada).

### ✅ Fase 16: Novo Fluxo de Onboarding e Gestão de Mesas (CONCLUÍDA)
- [x] Criação do atributo de Capacidade (Lugares) para as mesas persistido e listado no Painel Admin.
- [x] Cliente não necessita mais rastear QR Code obrigatoriamente para enviar a primeira mensagem.
- [x] Adição do conceito de requisição pendente `Unassigned` no BD para alocação manual.
- [x] Sistema de painel para o garçom visualizar pedidos de mesas e assinar logicamente de dentro da lista de mesas vagas.
- [x] Endpoint de debug para limpar sessões de teste no Redis (`/admin/api/debug/clear-sessions`).

### 💳 Próximos Passos
- [ ] Fechamento de Cestas e Split de Conta Inteligente
- [ ] Funcionalidades Avançadas de Agendamento

## 🏗️ Estrutura do Projeto

```
clickgarcom/
├── services/
│   ├── go-core/              # Backend principal (Go)
│   │   ├── cmd/
│   │   │   ├── api/          # HTTP API
│   │   │   ├── worker/       # Message worker
│   │   │   └── outbox-worker/ # Outbox processor
│   │   ├── internal/
│   │   │   ├── domain/       # Entidades e regras de negócio
│   │   │   ├── application/  # Use cases
│   │   │   ├── infrastructure/ # Repos, HTTP, RabbitMQ
│   │   │   └── interfaces/   # HTTP handlers
│   │   └── migrations/       # Database migrations
│   ├── node-admin/           # Admin Panel BFF (NestJS + HTML/JS)
│   └── docs/                 # Documentação
├── docker-compose.yml
├── Makefile
└── README.md
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

MIT
