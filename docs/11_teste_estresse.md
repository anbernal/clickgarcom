# Teste de Estresse da Aplicacao

## Objetivo

Estressar os fluxos mais sensiveis da plataforma sem reduzir o teste a uma unica rota HTTP.

Nesta aplicacao, o caminho critico e:

`webhook -> inbox_events -> RabbitMQ -> worker/outbox -> KDS websocket -> tenant-admin/super-admin`

Por isso o pacote de carga foi dividido em trilhas independentes e uma trilha combinada.

## Arquivos

Os scripts ficam em:

- [tests/load/README.md](/Users/macbook/projects/clickgarcom/tests/load/README.md)
- [tests/load/.env.example](/Users/macbook/projects/clickgarcom/tests/load/.env.example)
- [tests/load/k6/tenant-admin-read.js](/Users/macbook/projects/clickgarcom/tests/load/k6/tenant-admin-read.js)
- [tests/load/k6/webhook-ingest.js](/Users/macbook/projects/clickgarcom/tests/load/k6/webhook-ingest.js)
- [tests/load/k6/kds-websocket.js](/Users/macbook/projects/clickgarcom/tests/load/k6/kds-websocket.js)
- [tests/load/k6/super-admin-read.js](/Users/macbook/projects/clickgarcom/tests/load/k6/super-admin-read.js)
- [tests/load/k6/platform-combined.js](/Users/macbook/projects/clickgarcom/tests/load/k6/platform-combined.js)

## Preparacao

1. Copiar o arquivo de ambiente:

```bash
cp tests/load/.env.example tests/load/.env
```

2. Preencher:

- `TENANT_EMAIL`
- `TENANT_PASSWORD`
- `TENANT_ID`
- `SUPER_ADMIN_PASSWORD`

3. Subir a stack:

```bash
make rebuild
```

## Como Rodar

### Trilha isolada

```bash
make stress-tenant-read
make stress-webhook
make stress-kds
make stress-super-admin
```

### Teste combinado

```bash
make stress-combined
```

## Ordem Recomendada

1. `stress-tenant-read`
2. `stress-webhook`
3. `stress-kds`
4. `stress-super-admin`
5. `stress-combined`

Essa ordem ajuda a identificar o gargalo antes de misturar tudo.

## O Que Fica Gravado

Cada execucao exporta um resumo JSON em:

- `tests/load/results/tenant-admin-read-summary.json`
- `tests/load/results/webhook-ingest-summary.json`
- `tests/load/results/kds-websocket-summary.json`
- `tests/load/results/super-admin-read-summary.json`
- `tests/load/results/platform-combined-summary.json`

## Como Ficar De Olho Nos Resultados

### 1. Resultado do proprio k6

Olhe principalmente:

- `http_req_failed`
- `http_req_duration`
- `checks`
- `vus` e `vus_max`
- `iterations`

Leitura pratica:

- `http_req_failed` alto: a aplicacao esta devolvendo erro ou timeout
- `p95` subindo muito: a aplicacao ainda responde, mas esta degradando
- `vus_max` batendo no teto: a carga pediu mais concorrencia do que o script conseguiu sustentar

### 2. Grafana

Abrir:

- `http://localhost:3001`

Dashboards uteis descritos em [README.md](/Users/macbook/projects/clickgarcom/README.md).

Foque em:

- CPU e memoria de `go-api`, `go-worker`, `go-outbox`, `node-admin`, `super-admin-api`
- goroutines do `go-api`
- uso de heap
- backlog de mensageria

### 3. Prometheus

Abrir:

- `http://localhost:9090`

Consultas uteis:

```promql
up
go_goroutines{job="go-api"}
go_memstats_heap_alloc_bytes{job="go-api"}
sum by (tenant_id) (kds_active_connections)
sum by (event_type) (rate(kds_events_published_total[5m]))
clickgarcom_outbox_pending_messages
rate(clickgarcom_outbox_messages_processed_total[1m])
rabbitmq_queue_messages
```

Como ler:

- `kds_active_connections` deve subir no teste de websocket
- `kds_events_published_total` deve subir quando houver fluxo de pedido
- `clickgarcom_outbox_pending_messages` nao deve crescer sem voltar
- `rate(clickgarcom_outbox_messages_processed_total[1m])` precisa acompanhar o backlog

### 4. RabbitMQ Management

Abrir:

- `http://localhost:15672`

Observar filas:

- `whatsapp.messages`
- `kds.events`
- `notifications.send`
- `payment.webhooks`
- `orders.dlq`

Sinais ruins:

- mensagens crescendo e nao drenando
- fila sem consumidor
- `orders.dlq` com crescimento

Tambem da para olhar via terminal:

```bash
make rabbitmq-queues
```

### 5. Logs em tempo real

Durante o teste, deixar estes logs abertos em terminais separados:

```bash
make logs-api
make logs-worker
make logs-super-admin-api
docker compose logs -f go-outbox
```

O que procurar:

- erros repetidos
- reconexao de RabbitMQ
- falhas de websocket
- falhas de envio na outbox
- erros SQL ou timeout

### 6. Banco de dados

Verifique backlog e volume:

```bash
docker exec -it clickgarcom-postgres psql -U postgres -d clickgarcom_db
```

Consultas uteis:

```sql
SELECT COUNT(*) FROM inbox_events WHERE processed = false;
SELECT COUNT(*) FROM outbox_messages WHERE sent = false;
SELECT COUNT(*) FROM outbox_messages WHERE sent = false AND next_retry_at <= NOW();
SELECT COUNT(*) FROM message_logs WHERE created_at >= NOW() - INTERVAL '15 minutes';
SELECT COUNT(*) FROM payment_attempts WHERE created_at >= NOW() - INTERVAL '15 minutes';
```

## Sinais de Saude por Trilha

### `stress-tenant-read`

Esperado:

- `p95` abaixo de 1.5s a 2s
- sem 5xx relevante
- `node-admin` sem crescimento anormal de memoria

### `stress-webhook`

Esperado:

- webhook continua respondendo rapido
- `inbox_events` cresce e depois drena
- `whatsapp.messages` nao fica represada por muito tempo

### `stress-kds`

Esperado:

- conexoes websocket sobem sem erro em massa
- `kds_active_connections` acompanha
- KDS nao entra em loop de reconexao

### `stress-super-admin`

Esperado:

- leituras pesadas nao derrubam a API
- consultas de `operations` e `reliability` seguem estaveis

### `stress-combined`

Esperado:

- sistema degrada de forma controlada
- backlog sobe e desce
- nao ha crash
- DLQ nao dispara sem controle

## Critero Inicial de Aprovacao

Pode usar esta referencia inicial:

- `http_req_failed < 5%`
- `p95` webhook `< 500ms` a `700ms`
- `p95` tenant reads `< 1500ms` a `1800ms`
- `p95` super-admin reads `< 2000ms` a `2500ms`
- websocket conecta com taxa de sucesso `> 95%`
- filas voltam para patamar normal apos o teste

## Se Der Ruim, Como Interpretar

- `latencia alta + filas normais`: gargalo mais provavel na API ou banco
- `latencia alta + filas subindo`: worker/outbox nao esta drenando
- `webhook ok + KDS ruim`: problema provavel em `kds.events` ou websocket
- `super-admin piora muito`: consultas operacionais pesadas podem precisar de agregacoes/materialized views
- `DLQ sobe`: erro funcional, nao apenas de performance

## Proximo Nivel

Depois de estabilizar o pacote atual, os proximos refinamentos naturais sao:

- cenarios com massa mais realista de pedidos completos
- soak test de 1h a 4h
- teste com degradacao controlada de worker
- exportacao automatica de evidencias e graficos por rodada
