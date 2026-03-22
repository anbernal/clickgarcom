# KDS WebSocket Contract

## Objetivo

Definir o contrato estavel que o KDS web atual e futuros clientes operacionais/mobile devem assumir ao consumir eventos em tempo real do `platform/core-backend`.

## Endpoint

- WebSocket: `/ws/kds`

Exemplo local:

```text
ws://localhost:8080/ws/kds?tenant_id=<tenant_uuid>&token=<jwt>
```

## Autenticacao

- JWT obrigatorio.
- O middleware do Go aceita:
  - `Authorization: Bearer <jwt>`
  - `?token=<jwt>` na query string
- Para browsers, o cliente atual usa `?token=<jwt>` porque o WebSocket nativo nao envia `Authorization` customizado com a mesma ergonomia do `fetch`.

## Parametros obrigatorios

- `tenant_id`: UUID do tenant autenticado

Se `tenant_id` faltar ou for invalido, o upgrade e rejeitado antes da conexao.

## Bootstrap HTTP recomendado

Para bootstrap inicial e fallback de polling:

- `GET /admin/api/v1/orders?status=PENDING,ACCEPTED,READY`
- `GET /admin/api/v1/menu`

O KDS web legado ainda usa `/admin/api`, mas novos clientes devem preferir `/admin/api/v1`.

## Eventos suportados hoje

### 1. `connected`

Mensagem inicial enviada logo apos registrar o cliente no hub:

```json
{
  "type": "connected",
  "message": "Connected to KDS WebSocket",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Uso esperado:

- confirmar conexao
- zerar estado de reconexao
- nao mutar o kanban com esse evento

### 2. `order.created`

Emitido quando um novo pedido operacional e criado.

```json
{
  "type": "order.created",
  "timestamp": "2026-03-21T18:30:00Z",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "id": "4dc781ab-b419-4d69-b4a7-6223627086e9",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "tab_id": "e7477762-1522-4673-af1d-1527790343ac",
    "batch_id": "cc9654ba-805b-47c8-831d-1f5d58d09608",
    "destination": "KITCHEN",
    "status": "PENDING",
    "notes": "",
    "items": [
      {
        "id": "91ca7c34-a1d8-4836-aed6-68b55d01c7e5",
        "order_id": "4dc781ab-b419-4d69-b4a7-6223627086e9",
        "menu_item_id": "5e4ce85b-48da-47af-83fe-79728b744ed6",
        "quantity": 2,
        "unit_price": 35,
        "observations": ""
      }
    ],
    "created_at": "2026-03-21T18:29:58Z"
  }
}
```

### 3. `order.status_changed`

Emitido quando o status operacional do pedido muda.

```json
{
  "type": "order.status_changed",
  "timestamp": "2026-03-21T18:34:10Z",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "id": "4dc781ab-b419-4d69-b4a7-6223627086e9",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "tab_id": "e7477762-1522-4673-af1d-1527790343ac",
    "batch_id": "cc9654ba-805b-47c8-831d-1f5d58d09608",
    "destination": "KITCHEN",
    "status": "READY",
    "items": [],
    "created_at": "2026-03-21T18:29:58Z",
    "accepted_at": "2026-03-21T18:31:00Z",
    "ready_at": "2026-03-21T18:34:10Z"
  }
}
```

## Campos do payload `data`

Campos relevantes para clientes KDS:

- `id`
- `tenant_id`
- `tab_id`
- `batch_id`
- `destination`: `KITCHEN` ou `BAR`
- `status`: `PENDING`, `ACCEPTED`, `READY`, `DELIVERED`, `CANCELED`
- `notes`
- `items[]`
- `created_at`
- `accepted_at`
- `ready_at`
- `delivered_at`
- `canceled_at`
- `cancel_reason`

### Observacao sobre nomes dos itens

O evento nao garante `menu_item_name` embutido no item. O cliente deve:

1. carregar `GET /admin/api/v1/menu`
2. montar lookup por `menu_item_id`
3. aplicar fallback de label local se o nome nao vier no payload

Esse e exatamente o comportamento do KDS web atual.

## Regras de cliente

- sempre filtrar por `tenant_id` do proprio token
- tratar `connected` como evento de controle, nao de dominio
- remover o pedido do quadro quando `status` virar `DELIVERED` ou `CANCELED`
- manter polling de fallback quando o WebSocket cair
- reconectar com backoff exponencial

## Eventos reservados

Os tipos abaixo existem no dominio Go, mas hoje nao sao emitidos de forma operacional pelo fluxo principal do KDS:

- `order.updated`
- `order.canceled`

Clientes nao devem depender deles por enquanto.
