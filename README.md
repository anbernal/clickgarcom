# ClickGarçom 🍽️

Sistema de pedidos para restaurantes via WhatsApp com KDS em tempo real.

## Stack

- **Backend Core**: Go (Fiber) - Webhooks e Workers
- **Backend Admin**: Node.js (NestJS) - Painel administrativo
- **Database**: PostgreSQL 17
- **Cache/Queue**: Redis + Asynq
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

## Serviços

- **PostgreSQL 17**: Banco de dados principal
- **Redis 7**: Cache e sessões
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

# 3. Suba os containers
docker-compose up -d

# 4. Acesse RabbitMQ Management
http://localhost:15672
# User: clickgarcom / Pass: clickgarcom123

# 5. Execute as migrations
make migrate-up

# 6. Rode a API
make run-api
```

## Desenvolvimento
```bash
# Rodar API localmente
make run-api

# Rodar Worker
make run-worker

# Rodar testes
make test

# Ver logs
make logs

# Acessar RabbitMQ UI
http://localhost:15672
```

## Filas RabbitMQ

- `whatsapp.messages` - Mensagens do WhatsApp para processar
- `payment.webhooks` - Webhooks de pagamento
- `notifications.send` - Notificações para enviar
- `orders.dlq` - Dead Letter Queue para pedidos com erro

## Roadmap

- [x] Fase 0: Setup inicial
- [ ] Fase 1: Webhook WhatsApp
- [ ] Fase 2: Domain - Pedidos
- [ ] Fase 3: KDS Real-time
- [ ] Fase 4: Pagamentos
- [ ] Fase 5: Admin Panel

## Licença

MIT