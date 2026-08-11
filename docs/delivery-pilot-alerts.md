# Alertas do piloto de Delivery

Painel mínimo para o Core Go (Prometheus) e para o endpoint agregado do Admin.
As consultas não usam tenant, telefone, endereço, pedido ou entrega como
label, evitando cardinalidade e exposição de dados.

## Séries principais

- `clickgarcom_outbox_pending_messages`: backlog do outbox WhatsApp;
- `clickgarcom_consumer_messages_processed_total{queue,status}`: falhas por fila;
- `delivery_fulfillment_events_processed_total{event_type,outcome}`: projeção de
  eventos de fulfillment;
- `delivery_fulfillment_event_processing_duration_seconds`: latência do
  consumer de fulfillment.

## Regras iniciais

```promql
clickgarcom_outbox_pending_messages > 100
```

Alerta quando persistir por 10 minutos.

```promql
sum(rate(clickgarcom_consumer_messages_processed_total{status="error"}[5m])) > 0
```

Alerta quando houver falhas contínuas por 5 minutos.

```promql
sum(rate(delivery_fulfillment_events_processed_total{outcome="error"}[5m])) > 0
```

Alerta quando a projeção Core falhar; reprocessamento depende do ack/retry da
fila.

## Indicadores agregados do Admin

Consultar:

`GET /admin/api/internal/deliveries/maintenance/metrics`

Alertar quando:

- `outbox.pending` permanecer positivo por 10 minutos;
- `webhooks.exhausted` for maior que zero;
- `fulfillment.stale_external` permanecer maior que zero em duas execuções;
- `own_capacity.active_reservations` exceder a capacidade operacional
  declarada pelo tenant.

Os limiares são valores iniciais do piloto e devem ser recalibrados depois da
primeira semana de operação observada.
