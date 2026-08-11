# Runbook de manutenção do Delivery

Os jobs do módulo são executados pelo endpoint interno do Node Admin. O
endpoint exige `X-Internal-Token`, aceita escopo opcional por tenant e sempre
permite `dry_run` antes de remover dados.

## Execução segura

Para consultar indicadores sem PII antes de uma janela de manutenção:

```bash
curl -sS "$ADMIN_API_INTERNAL_URL/admin/api/internal/deliveries/maintenance/metrics?tenant_id=$TENANT_ID" \
  -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN"
```

O endpoint retorna somente contagens agregadas de entregas, fulfillment,
webhooks, outbox e reservas de capacidade.

## Indicadores do piloto

As séries Prometheus e regras iniciais estão em
[`delivery-pilot-alerts.md`](./delivery-pilot-alerts.md).
O dashboard Grafana importável está em
[`delivery-pilot-dashboard.json`](./delivery-pilot-dashboard.json).
Em Docker Compose, ele é provisionado automaticamente a partir de
`infra/grafana/dashboards/clickgarcom-delivery-pilot.json`.

Sugestão inicial de alertas (ajustar após observar o primeiro tenant):

- `outbox.pending > 0` por 10 minutos: verificar relay/RabbitMQ;
- `webhooks.exhausted > 0`: revisar credencial ou payload do operador;
- `fulfillment.stale_external > 0` por duas execuções: executar reconciliação;
- `deliveries.active` acima da capacidade operacional declarada: validar holds e
  capacidade própria;
- falhas repetidas do relay no log, sem registrar payload, exigem intervenção.

```bash
curl -sS -X POST "$ADMIN_API_INTERNAL_URL/admin/api/internal/deliveries/maintenance/run" \
  -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"dry_run":true,"limit":100}'
```

O retorno mostra candidatos e itens removidos/expirados por grupo:

- reconciliação de `ACCEPTED`/`PREPARING` com os pedidos ativos do lote;
- credenciais de tracking expiradas ou além da janela pós-terminal;
- registros de idempotência cujo `expires_at` passou;
- amostras de localização além da retenção configurada no tenant (1–90 dias);
- eventos de domínio já publicados além da retenção técnica (padrão 30 dias);
- chaves Redis terminais, quando o adaptador Redis estiver instalado.

Depois de revisar o dry-run, execute:

```bash
curl -sS -X POST "$ADMIN_API_INTERNAL_URL/admin/api/internal/deliveries/maintenance/run" \
  -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"dry_run":false,"limit":100}'
```

Para restringir a um tenant, inclua `tenant_id`. O job é idempotente: repetir
a execução não remove timeline/eventos de negócio nem eventos outbox pendentes,
e não produz transições adicionais quando o estado já foi reconciliado.

## Janela e recuperação

`DELIVERY_TRACKING_POST_DELIVERY_HOURS` controla a janela pós-terminal (padrão
2 horas, limite de 48). `settings.delivery.tracking.location_retention_days`
controla a retenção de localização (padrão 30, limitado entre 1 e 90 dias).
`DELIVERY_OUTBOX_RETENTION_DAYS` controla a retenção de eventos de domínio já
publicados (padrão 30, limitado entre 7 e 180 dias). Eventos não publicados
nunca são removidos pelo maintenance runner.

Para habilitar a limpeza das chaves Redis do realtime, configure no Admin:
`DELIVERY_REDIS_MAINTENANCE_URL=http://go-api:8080/internal/deliveries/maintenance/redis-cleanup`.
O Core Go valida o mesmo `INTERNAL_SERVICE_TOKEN` e só remove os padrões
`delivery:tracking:*`, `delivery:realtime:*` e `delivery:location:*` (ou os
prefixos explícitos em `DELIVERY_REDIS_KEY_PREFIXES`).

Se uma execução falhar, rode novamente em dry-run e depois em modo normal; as
operações usam filtros por tenant e datas. A timeline em `delivery_events` nunca
é parte da limpeza; somente eventos outbox publicados fora da retenção técnica
são removidos. Em caso de erro no Redis, o
relatório marca `deferred=true`; a limpeza PostgreSQL continua segura e o
adaptador Redis deve ser executado na próxima janela.

Não registrar tokens, PINs, coordenadas ou payloads completos em logs de
operação. O endpoint de tracking responde com `no-store` e aplica limite por
IP; webhooks também possuem limite por IP/provedor; credenciais revogadas não
autorizam novas consultas.

## Rotação e resposta a incidente

`INTERNAL_SERVICE_TOKEN` e `JWT_SECRET` devem ser trocados em duas etapas:
publique o novo segredo nos consumidores, confirme a saúde dos endpoints
internos, altere o segredo no Node Admin e reinicie os processos. Em caso de
vazamento de um link, execute a revogação por tenant/entrega e emita um novo
link; não coloque o token comprometido em tickets ou comandos shell salvos.
