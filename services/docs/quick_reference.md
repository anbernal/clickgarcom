# ClickGarçom - Guia de Referência Rápida 🚀

## 📋 Comandos do Makefile

### 🐳 Docker

```bash
# Subir todos os containers
make up

# Parar todos os containers
make down

# Ver logs de todos os serviços
make logs

# Ver logs apenas da API
make logs-api

# Ver logs apenas do Worker
make logs-worker

# Ver logs do RabbitMQ
make logs-rabbitmq

# Listar containers rodando
make ps

# Rebuildar e subir containers
make rebuild

# Reiniciar containers
make restart
```

### 💾 Database

```bash
# Executar migrations
make migrate-up

# Reverter última migration
make migrate-down

# Criar nova migration
make migrate-create name=add_users

# Resetar database (CUIDADO! Apaga tudo)
make db-reset

# Abrir shell do PostgreSQL
make db-shell

# Abrir Redis CLI
make redis-cli
```

### 🐰 RabbitMQ

```bash
# Abrir RabbitMQ Management UI
make rabbitmq-ui
# Acessa: http://localhost:15672
# User: clickgarcom | Pass: clickgarcom123

# Listar filas e mensagens
make rabbitmq-queues

# Limpar todas as filas (CUIDADO!)
make rabbitmq-reset
```

### 🔧 Go Commands

```bash
# Rodar API localmente
make run-api

# Rodar Worker localmente
make run-worker

# Rodar Outbox Worker localmente
make run-outbox

# Rodar servidor WebSocket
make run-realtime

# Rodar testes
make test

# Testes com coverage
make test-coverage

# Rodar linter
make lint

# Formatar código
make fmt

# Limpar dependências
make tidy
```

### 🛠️ Development

```bash
# Modo desenvolvimento com hot-reload (precisa air instalado)
make dev

# Instalar ferramentas de desenvolvimento
make install-tools

# Limpar banco + filas
make clean-all

# Limpar arquivos buildados
make clean
```

### 📊 Monitoring

```bash
# Abrir Grafana
make grafana
# Acessa: http://localhost:3001
# User: admin | Pass: admin123

# Abrir Prometheus
make prometheus
# Acessa: http://localhost:9090
```

### 🏗️ Production

```bash
# Buildar API para produção
make build-api

# Buildar Worker para produção
make build-worker
```

---

## 🚀 Workflows Comuns

### Iniciar o projeto do zero

```bash
# 1. Subir infraestrutura
make up

# 2. Aguardar containers ficarem healthy (5-10s)
sleep 10

# 3. Executar migrations
make migrate-up

# 4. Rodar API
make run-api

# 5. Em outro terminal, rodar Worker
make run-worker

# 6. Em outro terminal, rodar Outbox Worker
make run-outbox
```

### Resetar ambiente de desenvolvimento

```bash
# Limpar tudo
make clean-all

# Resetar database
make db-reset

# Reiniciar containers
make restart
```

### Criar nova migration

```bash
# Criar migration
make migrate-create name=add_vouchers_table

# Editar arquivos gerados em:
# services/go-core/cmd/migrate/000003_add_vouchers_table.up.sql
# services/go-core/cmd/migrate/000003_add_vouchers_table.down.sql

# Executar migration
make migrate-up
```

### Testar fluxo completo

```bash
# 1. Garantir que tudo está rodando
make ps

# 2. Abrir RabbitMQ UI para monitorar filas
make rabbitmq-ui

# 3. Enviar webhook de teste (via Postman/curl)
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{...}'

# 4. Verificar logs
make logs-api
make logs-worker

# 5. Verificar banco de dados
make db-shell
# SELECT * FROM inbox_events ORDER BY received_at DESC LIMIT 5;
# SELECT * FROM outbox_messages ORDER BY created_at DESC LIMIT 5;
```

---

## 🔍 Troubleshooting

### Container não sobe

```bash
# Ver logs do container específico
docker-compose logs postgres
docker-compose logs redis
docker-compose logs rabbitmq

# Verificar se portas estão em uso
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :5672  # RabbitMQ
lsof -i :15672 # RabbitMQ Management

# Forçar rebuild
make down
docker-compose up -d --build --force-recreate
```

### Migration falha

```bash
# Verificar qual migration está aplicada
make db-shell
# SELECT * FROM schema_migrations;

# Reverter migration problemática
make migrate-down

# Corrigir SQL e tentar novamente
make migrate-up
```

### Worker não processa mensagens

```bash
# Verificar se RabbitMQ está rodando
make rabbitmq-queues

# Verificar logs do worker
make logs-worker

# Verificar se há mensagens na fila
make rabbitmq-ui
# Acessar Queues → whatsapp.messages

# Limpar fila e tentar novamente
make rabbitmq-reset
```

### Outbox não envia mensagens

```bash
# Verificar mensagens pendentes no banco
make db-shell
# SELECT * FROM outbox_messages WHERE sent = false;

# Verificar logs do outbox worker
docker-compose logs -f outbox-worker

# Verificar credenciais Meta API no .env
cat services/go-core/.env | grep META
```

### Redis não conecta

```bash
# Testar conexão
make redis-cli
# > PING
# Deve retornar: PONG

# Verificar se está rodando
docker ps | grep redis

# Reiniciar Redis
docker-compose restart redis
```

---

## 📊 Queries SQL Úteis

### Verificar eventos recebidos

```sql
-- Últimos 10 eventos recebidos
SELECT 
    id, 
    source, 
    provider_message_id, 
    processed, 
    received_at 
FROM inbox_events 
ORDER BY received_at DESC 
LIMIT 10;

-- Eventos não processados
SELECT COUNT(*) FROM inbox_events WHERE processed = false;
```

### Verificar mensagens do Outbox

```sql
-- Mensagens pendentes
SELECT 
    id, 
    destination, 
    recipient, 
    attempts, 
    last_error, 
    created_at 
FROM outbox_messages 
WHERE sent = false 
ORDER BY created_at DESC;

-- Taxa de sucesso
SELECT 
    sent,
    COUNT(*) as total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM outbox_messages
GROUP BY sent;
```

### Verificar pedidos

```sql
-- Pedidos por status
SELECT 
    status, 
    COUNT(*) as total 
FROM orders 
GROUP BY status;

-- Últimos pedidos criados
SELECT 
    o.id,
    o.status,
    o.destination,
    o.created_at,
    COUNT(oi.id) as items_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 10;
```

### Verificar comandas

```sql
-- Comandas abertas
SELECT 
    t.id,
    t.status,
    t.total,
    tb.number as table_number,
    t.opened_at
FROM tabs t
LEFT JOIN tables tb ON tb.id = t.table_id
WHERE t.status = 'OPEN'
ORDER BY t.opened_at DESC;
```

---

## 🌐 URLs Úteis

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **RabbitMQ Management** | http://localhost:15672 | clickgarcom / clickgarcom123 |
| **Grafana** | http://localhost:3001 | admin / admin123 |
| **Prometheus** | http://localhost:9090 | - |
| **API Health** | http://localhost:3000/health | - |
| **API Webhook** | http://localhost:3000/webhook/whatsapp | - |

---

## 📁 Estrutura de Arquivos Importantes

```
clickgarcom/
├── docker-compose.yml           # Configuração dos containers
├── Makefile                     # Comandos úteis
├── README.md                    # Documentação principal
│
├── services/go-core/
│   ├── .env                     # Variáveis de ambiente
│   ├── cmd/
│   │   ├── api/main.go         # Entry point da API
│   │   ├── worker/main.go      # Entry point do Worker
│   │   ├── outbox-worker/main.go # Entry point do Outbox Worker
│   │   └── migrate/            # Migrations SQL
│   │
│   └── internal/
│       ├── config/             # Configurações
│       ├── domain/             # Entidades de domínio
│       ├── infrastructure/     # Implementações (DB, Queue, APIs)
│       └── interfaces/         # Controllers/Handlers
```

---

## 🔑 Variáveis de Ambiente (.env)

```bash
# Database
DATABASE_URL=postgres://postgres:postgres123@localhost:5432/clickgarcom_db

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://clickgarcom:clickgarcom123@localhost:5672/

# WhatsApp Meta API
META_VERIFY_TOKEN=seu_token_secreto_aqui
META_ACCESS_TOKEN=seu_access_token_aqui
META_PHONE_NUMBER_ID=seu_phone_number_id_aqui

# Server
PORT=3000
ENV=development
LOG_LEVEL=debug
```

---

## 🎯 Próximos Passos

Para continuar o desenvolvimento, consulte:

- **[Fases Implementadas](file:///Users/macbook/.gemini/antigravity/brain/ff2e4978-1ec1-4f5f-8784-1e7c7c54809b/implementation_phases.md)** - O que já foi feito
- **[Arquitetura](file:///Users/macbook/.gemini/antigravity/brain/ff2e4978-1ec1-4f5f-8784-1e7c7c54809b/project_architecture.md)** - Visão completa do sistema
- **[README](file:///Users/macbook/projects/clickgarcom/README.md)** - Documentação principal do projeto

---

## 💡 Dicas

1. **Sempre rode os 3 workers juntos**: API + Worker + Outbox Worker
2. **Use `make clean-all`** quando quiser começar do zero
3. **Monitore o RabbitMQ UI** para ver o fluxo de mensagens
4. **Verifique os logs** quando algo não funcionar
5. **Use o db-shell** para debugar dados no PostgreSQL
