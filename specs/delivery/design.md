# Design Técnico — Delivery V2

## 1. Objetivo

Definir componentes, ownership, contratos, dados, estados e segurança para implementar o [Delivery V2](../../docs/especificacao_tecnica_logistica_delivery.md).

## 2. Arquitetura atual aproveitada

| Componente | Responsabilidade existente/V2 |
|---|---|
| NestJS/TypeORM | Dono das mutações Delivery, clientes, endereços, settings, quotes, fulfillments, estado e auditoria. |
| Core Go | WhatsApp, pagamento/outbox, comandos internos, consumo de eventos e integração de canal. |
| PostgreSQL | Fonte persistente de negócio e snapshots. |
| Redis | Cache, locks/holds temporários e projeções efêmeras quando necessário. |
| RabbitMQ | Eventos/outbox assíncronos e relay. |
| Tenant Admin Web | Configuração e operação. |
| KDS Mobile | Cozinha/bar/salão; não é dependência do Delivery V2. |
| Provider CEP | Preenchimento de endereço. |
| Maps Provider | Geocode e rota. |
| Delivery Provider | Cotação, contratação, tracking/código e webhooks externos. |

## 3. Ownership

O NestJS é a única fonte de escrita do domínio Delivery.

O Core Go não atualiza tabelas Delivery diretamente. Ele chama endpoints internos idempotentes e publica eventos de produção/pagamento por contratos definidos.

O Core Go não escolhe operador, não calcula taxa, não reserva capacidade e não interpreta payload iFood.

## 4. Componentes

```text
WhatsApp/Core Go
    |
    | internal API / events
    v
NestJS Delivery Module
    |-- CustomerService
    |-- CustomerAddressService
    |-- PostalCodeProvider
    |-- MapsProvider
    |-- DeliverySettingsService
    |-- OwnPricingService
    |-- OwnCapacityService
    |-- CheckoutService
    |-- DeliveryProviderRegistry
    |-- FulfillmentOrchestrator
    |-- ProviderAttemptScheduler
    |-- WebhookInboxService
    |-- ReconciliationService
    |-- Audit/Outbox
    |
    +-- PostgreSQL
    +-- Redis (TTL/lock/cache opcional)
    +-- RabbitMQ
    +-- iFood Adapter
    +-- Maps/CEP Adapters
    |
    v
Tenant Admin Web
```

## 5. Decisões arquiteturais

### DA-V2-001 — Delivery e Fulfillment são agregados relacionados

`Delivery` representa a obrigação logística do lote. `DeliveryFulfillment` representa a forma/operador escolhido. Um Delivery pode possuir histórico de fulfillments, mas somente um atual.

### DA-V2-002 — Quote não é contratação

Quote representa preço/disponibilidade antes do pagamento. Contratação cria ou atualiza fulfillment ao iniciar preparo. Quote expirada exige recotação.

### DA-V2-003 — Preço do cliente é imutável

`customer_delivery_fee` é congelado após pagamento. Custo externo posterior fica em `provider_actual_cost` e `restaurant_adjustment`.

### DA-V2-004 — Fallback é manual

Não há comparação nem troca automática. O operador selecionado possui cinco tentativas em 15 minutos. Admin/Manager/Dispatcher inicia novo ciclo ou converte para própria.

### DA-V2-005 — Própria não tem identidade de courier

O MVP controla capacidade numérica e reserva de vaga. Não há driver ID, GPS, PIN ou tracking do ClickGarçom.

### DA-V2-006 — Cadastro e snapshot são separados

`customer_addresses` serve para reutilização. `address_snapshot` serve para histórico e integração. Alterar/excluir cadastro nunca altera Delivery.

### DA-V2-007 — Providers são adapters

Tipos, URLs, autenticação, eventos e códigos do iFood ficam dentro do adapter. O domínio usa contrato neutro.

### DA-V2-008 — Eventos são transacionais; chamadas externas não

Transição, evento e outbox são gravados em uma transação. Chamada externa ocorre em worker após commit e é reconciliável.

## 6. Modelo de dados

### 6.1 Clientes

`customers`:

- `id`, `tenant_id`, `phone_normalized`, `active`, timestamps;
- unique `(tenant_id, phone_normalized)`;
- nenhum nome persistente.

### 6.2 Endereços

`customer_addresses`:

- customer/tenant IDs;
- label e campos normalizados;
- CEP/provider/status;
- coordenadas/geocode quality;
- confirmed/last used/default;
- soft delete/timestamps.

FK composta e unique parcial garantem isolamento e um default ativo. Limite de cinco ativos é aplicado na transação do serviço.

### 6.3 Delivery

Preservar `deliveries`, `delivery_events` e `order_batches`. Adicionar customer/address IDs, modalidade snapshot, fulfillment atual e campos financeiros. O snapshot segue sendo a fonte histórica.

### 6.4 Quotes

`delivery_quotes` possui checkout key, endereço, provider, quote ID, custo, customer fee, validade, status e vínculo posterior ao Delivery.

### 6.5 Fulfillments

`delivery_fulfillments` possui modo, provider, status, quote, IDs externos, tracking URL, ciclo e custos. Histórico não é sobrescrito.

### 6.6 Attempts

`delivery_provider_attempts` possui fulfillment, ciclo, tentativa 1–5, chave idempotente, estado, horários e erro normalizado.

### 6.7 Capacidade

`delivery_own_capacity_reservations` implementa hold/confirmed/released/expired. Capacidade declarada fica em settings; reservas ficam persistidas.

### 6.8 Segurança de provider

`delivery_provider_configs` guarda IDs/estado/referência. Segredo fica no secret manager ou em payload criptografado versionado.

### 6.9 Webhook inbox

Raw body é validado e armazenado como referência/payload retido com política curta. Deduplicação usa provider+event ID ou hash.

## 7. Fluxo de endereço e checkout

```text
WhatsApp recebe pedido Delivery
  -> resolve customer por tenant + telefone
  -> seleciona/cadastra endereço
  -> CEP lookup (ou entrada manual)
  -> geocode e confirmação
  -> quote OWN ou EXTERNAL
  -> hold OWN ou quote persistida
  -> cliente confirma frete/total
  -> pagamento
  -> confirm checkout/lote/Delivery
  -> endereço/valor/configuração snapshotados
```

O endereço novo só pode ser usado após salvamento confirmado. Endereço salvo é confirmado novamente em cada pedido.

## 8. Fluxo de execução

### Própria

```text
checkout -> CAPACITY_HELD -> pagamento -> CAPACITY_RESERVED
-> PREPARING/READY_FOR_DISPATCH -> saída manual -> IN_TRANSIT -> DELIVERED
```

### Externa

```text
quote -> pagamento -> WAITING_PREPARATION
-> PREPARING -> ciclo 1/5 -> courier/tracking
-> READY_FOR_DISPATCH/ASSIGNED -> IN_TRANSIT -> DELIVERED
```

Depois de cinco falhas em 15 minutos, fica `CYCLE_EXHAUSTED`. Nenhum provider novo entra sem comando autorizado.

## 9. Contrato de provider

```typescript
interface DeliveryProvider {
  code(): DeliveryProviderCode;
  checkConnection(ctx: ProviderTenantContext): Promise<ConnectionResult>;
  quote(request: ProviderQuoteRequest): Promise<ProviderQuoteResult>;
  requestCourier(request: ProviderCreateRequest): Promise<ProviderCreateResult>;
  reconcile(request: ProviderReconcileRequest): Promise<ProviderDeliveryDetails>;
  cancel(request: ProviderCancelRequest): Promise<ProviderCancelResult>;
  parseAndVerifyWebhook(headers: Record<string, string>, rawBody: Buffer): Promise<NormalizedProviderEvent>;
}
```

O contrato normaliza quote, tentativa, tracking, código, erro e expiração. O domínio não conhece `merchantId`, `quotationId`, HMAC ou OAuth específicos.

## 10. Scheduler de tentativas

- ciclo persistido antes do worker;
- tentativas T+0/T+3/T+6/T+9/T+12;
- janela termina T+15;
- attempt key determinística;
- lock/CAS impede workers concorrentes;
- sucesso cancela pendências;
- timeout após envio reconcilia antes de retry;
- nenhum HTTP aberto durante a janela.

## 11. Estados e transições

O Delivery preserva estados legados necessários à compatibilidade, mas o fluxo V2 próprio pode ir de `READY_FOR_DISPATCH` para `IN_TRANSIT` sem driver individual.

Estados do fulfillment:

```text
OWN: CAPACITY_HELD -> CAPACITY_RESERVED -> WAITING_DISPATCH -> IN_TRANSIT -> DELIVERED

EXTERNAL: QUOTED -> WAITING_PREPARATION -> ALLOCATION_PENDING
          -> REQUESTING -> COURIER_ASSIGNED -> IN_TRANSIT -> DELIVERED
          -> CYCLE_EXHAUSTED/FAILED/CANCELED
```

Estado terminal nunca regride por webhook ou polling antigo.

## 12. APIs

Rotas administrativas seguem o padrão `/admin/api`, com versão conforme o contrato atual do serviço. Rotas internas exigem `X-Internal-Token` e não são expostas ao cliente.

Principais grupos:

- settings/provider/credentials;
- customers/addresses/CEP/geocode;
- checkout quote/confirm;
- deliveries/detail/timeline;
- own start/complete;
- provider cycle/restart/change;
- webhook e maintenance.

Todas as mutações usam `Idempotency-Key`; ações concorrentes usam `expected_version`.

## 13. Segurança

- JWT/RBAC para Admin;
- tenant derivado da credencial;
- credenciais criptografadas/write-only;
- webhook assinado sobre raw body;
- rate limit em CEP, quote, connection test, webhook e comandos;
- logs sem PII/segredo;
- endereço e telefone mascarados em projeções;
- consentimento para salvar endereço;
- soft delete e retenção documentada;
- tracking/código externo somente ao cliente correto.

## 14. Eventos e outbox

Eventos V2 incluem address created/updated/deleted, quote created/replaced, capacity held/reserved/released, fulfillment created/changed, cycle started, attempt failed, provider assigned, cycle exhausted, tracking available e status changed.

Cada evento possui ID, tipo versionado, horário, tenant, aggregate, correlation ID e dados sanitizados.

## 15. Testes

- unitários para telefone, endereço, preço, faixas, arredondamento, capacidade e transições;
- integração para migrations, FKs, unique, outbox e jobs;
- contrato para Core/Frontend/provider fake;
- E2E para WhatsApp, checkout, própria, externa e fallback;
- carga para 100 entregas ativas, workers concorrentes e webhooks;
- segurança para tenant/RBAC/segredos/replay.

## 16. Rollout

1. contracts/migrations atrás de flag;
2. clientes/endereço;
3. própria/checkout;
4. fake provider;
5. iFood sandbox;
6. fallback e hardening;
7. um tenant piloto;
8. expansão somente após relatório de operação.
