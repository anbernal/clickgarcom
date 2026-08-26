# Design Técnico — MVP RETAIL

## 1. Princípio arquitetural

RETAIL é um perfil operacional novo sobre a plataforma existente, não uma cópia
do sistema de restaurante.

```text
Plataforma compartilhada
  |-- tenant, autenticação e RBAC
  |-- cliente, telefone e endereços
  |-- WhatsApp e notificações
  |-- pagamentos
  |-- Delivery, frota e tracking
  |-- auditoria/outbox
  |
  +-- FOOD_SERVICE: cardápio, mesas, cozinha/bar e KDS
  +-- RETAIL: catálogo, estoque e Central de Separação
```

## 2. Decisões

### RET-DA-001 — Um campo de estabelecimento, perfil derivado

Adicionar `tenants.establishment_type` com default `RESTAURANT`.

No MVP:

| Estabelecimento | Perfil derivado |
|---|---|
| `RESTAURANT` | `FOOD_SERVICE` |
| `MARKET` | `RETAIL` |
| `PHARMACY` | `RETAIL` |

Não persistir duas fontes de verdade para tipo e perfil. Um registry tipado
resolve perfil, terminologia, defaults e capacidades permitidas.

### RET-DA-002 — Catálogo é uma fachada compatível

`menu_categories` e `menu_items` continuam sendo a persistência inicial. Uma
fachada `CatalogService` e contratos `/catalog` apresentam nomes neutros sem
remover as APIs atuais de `/menu`.

### RET-DA-003 — Extensões em tabelas próprias

Campos de varejo e farmácia ficam em tabelas 1:1, evitando preencher
`menu_items` com atributos que não pertencem a restaurante.

### RET-DA-004 — Destino operacional novo

Adicionar `PICKING` às constraints e contratos de destino. Consumers de
cozinha/bar continuam filtrando somente seus destinos. A Central de Separação
consome exclusivamente `PICKING`/fulfillment RETAIL.

### RET-DA-005 — Estoque é um agregado próprio

`menu_items.stock_quantity` deixa de ser a fonte transacional de RETAIL e passa
a ser uma projeção compatível. Saldo, reservas e movimentos ficam em tabelas
próprias com lock/versionamento.

### RET-DA-006 — Pagamento confirmado é gate

A criação administrativa inicial pode persistir uma intenção de compra, mas o
fulfillment visível na separação nasce somente após confirmação reconciliada do
pagamento. A transação grava mudança e outbox antes de qualquer efeito assíncrono.

### RET-DA-007 — Separação não reutiliza estado visual da cozinha

O shell, WebSocket, componentes e padrões visuais do KDS podem ser reutilizados.
O agregado operacional e a semântica dos estados são próprios de RETAIL.

### RET-DA-008 — Delivery continua independente

`service_type` continua descrevendo fulfillment (`TAKEOUT`/`DELIVERY`), não o
tipo do estabelecimento. RETAIL entrega ao domínio Delivery somente quando a
compra estiver pronta para expedição.

## 3. Modelo de dados

### 3.1 Tenant

Adicionar em `tenants`:

- `establishment_type VARCHAR(30) NOT NULL DEFAULT 'RESTAURANT'`;
- constraint inicial `RESTAURANT`, `MARKET`, `PHARMACY`;
- índice somente se consultas administrativas demonstrarem necessidade.

Ao ativar RETAIL, o Super Admin grava explicitamente
`settings.attendance.enabled=false`, evitando o default legado de Atendimento.
Delivery permanece configurável separadamente.

### 3.2 Produto RETAIL

`retail_product_details`:

- `tenant_id`, `menu_item_id`;
- `sku`, `barcode`, `brand`, `manufacturer`;
- `package_label`;
- `min_order_quantity`, `max_order_quantity`;
- `requires_prescription` default `false`;
- timestamps/version;
- unique tenant+SKU quando SKU não for nulo;
- unique tenant+barcode quando barcode não for nulo.

`pharmacy_product_details` opcional:

- `tenant_id`, `menu_item_id`;
- `anvisa_registration`, `active_ingredient`, `dosage`, `presentation`;
- sem receita, arquivo clínico ou dispensação no MVP.

### 3.3 Estoque

`inventory_balances`:

- `tenant_id`, `menu_item_id`;
- `on_hand`, `reserved`;
- `version`, timestamps;
- unique tenant+item;
- checks não negativos e `reserved <= on_hand`.

`inventory_reservations`:

- tenant, customer, checkout/idempotency key;
- item, quantidade, status;
- `expires_at`, `committed_at`, `released_at`;
- estados `HELD`, `COMMITTED`, `RELEASED`, `EXPIRED`;
- chave única por checkout+item.

`inventory_movements`:

- tenant, item e lote opcional;
- tipo, quantidade assinada;
- saldo anterior/posterior;
- referência de negócio;
- ator, motivo, idempotency key e timestamps;
- append-only.

`inventory_lots` opcional:

- tenant, item;
- lote, validade;
- quantidade física/reservada;
- timestamps;
- sem temperatura/local de armazenamento no MVP.

### 3.4 Fulfillment RETAIL

`retail_fulfillments`:

- tenant, order batch e tab;
- modo `TAKEOUT`/`DELIVERY`;
- status `NEW`, `PICKING`, `PACKING`, `READY`, `COMPLETED`, `CANCELED`;
- versão, timestamps operacionais e responsável atual;
- unique tenant+order_batch.

`retail_fulfillment_events`:

- fulfillment, tipo, estado anterior/novo;
- ator, payload seguro, correlation/idempotency key;
- timestamps;
- append-only.

O snapshot de item continua em `order_items`, incluindo nome e preço confirmados.
Campos adicionais de produto necessários ao histórico entram em snapshot JSONB,
nunca por leitura retroativa do catálogo atual.

## 4. Transações de estoque

### 4.1 Reserva

```text
BEGIN
  lock inventory_balance tenant+item
  validate available >= requested
  increment reserved
  create HELD reservation with TTL
  create/refresh checkout intention idempotently
COMMIT
```

Todos os itens do carrinho são ordenados por ID antes do lock para evitar
deadlocks.

### 4.2 Pagamento confirmado

```text
BEGIN
  lock checkout/order and reservations
  if already committed: return success
  decrement on_hand
  decrement reserved
  mark reservations COMMITTED
  append SALE movements
  persist retail fulfillment NEW
  persist outbox events
COMMIT
```

### 4.3 Expiração/cancelamento pré-pagamento

Worker idempotente seleciona holds vencidos com `SKIP LOCKED`, reduz `reserved`
e marca `EXPIRED`. Cancelamento explícito usa a mesma primitiva de liberação.

### 4.4 Cancelamento pós-pagamento

Somente fluxo autorizado decide se a mercadoria retorna ao estoque. Quando
retorna, cria movimento `CANCEL_RETURN`; nunca apaga `SALE`.

## 5. Fluxo de pedido e pagamento

```text
Digital Store
  -> Catalog API
  -> server-side cart validation
  -> inventory hold
  -> Delivery quote/capacity when applicable
  -> existing payment checkout
  -> payment webhook/poll/reconciliation
  -> RetailPaymentConfirmed use case
  -> inventory commit + retail fulfillment + outbox
  -> Central de Separação via realtime
```

O fluxo deve preservar o tratamento atual de idempotência e a regra Delivery de
pagamento confirmado. Nenhum consumer pode inferir pagamento apenas pela
existência de `tabs`, `orders` ou `order_batches`.

## 6. APIs propostas

Rotas públicas autenticadas:

- `GET /public/stores/:slug/catalog`;
- `GET /public/stores/:slug/catalog/search`;
- `POST /public/stores/:slug/cart/quote`;
- `POST /public/stores/:slug/checkout`;
- `GET /public/stores/:slug/orders`;
- `POST /public/stores/:slug/orders/:id/repeat`.

Rotas administrativas:

- CRUD `/admin/api/catalog/categories` e `/catalog/products`;
- `/admin/api/inventory/balances`;
- `/admin/api/inventory/entries`;
- `/admin/api/inventory/adjustments`;
- `/admin/api/inventory/movements`;
- `/admin/api/inventory/lots`;
- `/admin/api/retail/fulfillments` e comandos de transição.

As rotas públicas atuais do cardápio continuam operando para restaurante. Uma
camada adaptadora pode compartilhar implementação interna durante a migração.

## 7. Frontend

### 7.1 Super Admin

- selecionar tipo do estabelecimento;
- mostrar perfil derivado e módulos compatíveis;
- ativar/desativar RETAIL com auditoria;
- impedir combinação inválida de RETAIL com mesas/KDS de alimentação no MVP.

### 7.2 Admin do tenant

Para RETAIL:

- Dashboard de vendas;
- Produtos e categorias;
- Estoque, entradas, ajustes, lotes e validade;
- Pedidos;
- Central de Separação;
- Clientes;
- Pagamentos;
- Delivery e motoboys quando habilitados;
- relatórios.

Mesas, comandas, cozinha, bar e cardápio com vocabulário de restaurante ficam
ocultos ou indisponíveis conforme o resolver de capacidades.

### 7.3 Loja do cliente

Reutiliza design, autenticação, endereços, checkout e histórico atuais. Busca
passa a ser ação principal. Os textos vêm do registry de terminologia.

### 7.4 Central de Separação

Reutiliza infraestrutura realtime e shell visual, mas usa rota, estado, filtros,
cards e comandos próprios. Nenhum polling agressivo ou cópia da fila da cozinha.

## 8. WhatsApp

O Core Go resolve o tenant e suas capacidades antes de renderizar o menu.

Para RETAIL:

- ação estável `open_store`;
- label `Comprar produtos`, `Comprar no mercado` ou `Comprar na farmácia`;
- envia link autenticado;
- preserva mensagens de pagamento e Delivery;
- adiciona marcos de separação com templates próprios;
- nunca decide fluxo por comparação do texto exibido.

## 9. Eventos mínimos

- `retail.checkout.stock_held.v1`;
- `retail.checkout.stock_released.v1`;
- `retail.order.payment_confirmed.v1`;
- `retail.inventory.committed.v1`;
- `retail.fulfillment.created.v1`;
- `retail.fulfillment.status_changed.v1`;
- `retail.fulfillment.ready.v1`;
- `retail.fulfillment.completed.v1`;
- `retail.order.canceled.v1`.

Eventos carregam IDs, versões e correlation ID; não carregam dados sensíveis ou
o catálogo completo.

## 10. Compatibilidade e rollout

1. Migration adiciona `RESTAURANT` como default e novos dados sem alterar rows.
2. Registry retorna comportamento legado para tipo ausente/desconhecido.
3. Novos endpoints ficam atrás do perfil RETAIL.
4. `PICKING` é adicionado sem mudar filtros `KITCHEN/BAR`.
5. Primeiro piloto usa tenant novo, produtos simples e provider de pagamento já
   homologado.
6. Rollback desabilita entrada de novas compras, mas mantém pedidos ativos
   operáveis e histórico consultável.

## 11. Observabilidade e segurança

- métricas de holds ativos/expirados e divergência de saldo;
- alerta para pagamento confirmado sem commit de estoque;
- alerta para fulfillment pago não criado;
- reconciliação periódica de pagamentos, reservas, movimentos e fulfillments;
- tenant scope obrigatório;
- RBAC para ajuste, cancelamento e devolução;
- idempotência em toda mutação financeira/estoque;
- logs sem telefone, endereço ou itens sensíveis em texto livre;
- auditoria de alteração de preço e estoque.

