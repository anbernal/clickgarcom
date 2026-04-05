# Mapa de Acessos do Tenant Admin

## Objetivo

Documentar quais telas e acoes cada perfil interno do tenant pode acessar no painel administrativo.

Este documento reflete as regras implementadas em:

- `apps/tenant-admin/api/src/modules/auth/roles.ts`
- `apps/tenant-admin/api/src/modules/auth/auth.service.ts`
- `apps/tenant-admin/web/public/js/api.js`

## Perfis suportados

- `ADMIN` - Administrador
- `MANAGER` - Gerente
- `WAITER` - Garcom
- `KITCHEN` - Cozinha
- `BAR` - Bar
- `CASHIER` - Caixa

## Alias aceitos

- `GERENTE` -> `MANAGER`
- `ATENDENTE` -> `WAITER`
- `SALAO` -> `WAITER`
- `GARCOM` ou `GARÇOM` -> `WAITER`
- `COZINHA` -> `KITCHEN`
- `CAIXA` -> `CASHIER`

## Mapa por tela

| Tela | ADMIN | MANAGER | WAITER | KITCHEN | BAR | CASHIER |
|---|---|---|---|---|---|---|
| Dashboard | Sim | Sim | Sim | Sim | Sim | Sim |
| Carteira & Assinatura | Sim | Sim | Nao | Nao | Nao | Sim |
| Extrato de Mensagens | Sim | Sim | Nao | Nao | Nao | Sim |
| Pedidos | Sim | Sim | Sim | Sim | Sim | Nao |
| Cardapio | Sim | Sim | Sim | Sim | Sim | Sim |
| Categorias | Sim | Sim | Sim | Sim | Sim | Sim |
| Mesas / Comandas | Sim | Sim | Sim | Nao | Nao | Sim |
| Pagamentos | Sim | Sim | Sim | Nao | Nao | Sim |
| Vendas | Sim | Sim | Nao | Nao | Nao | Sim |
| Meu Restaurante | Sim | Sim | Nao | Nao | Nao | Nao |
| Equipe & Acessos | Sim | Sim | Nao | Nao | Nao | Nao |
| Configuracoes | Sim | Sim | Nao | Nao | Nao | Nao |
| Atendimento (KDS) | Sim | Sim | Sim | Nao | Nao | Nao |
| KDS (Cozinha) | Sim | Sim | Sim | Sim | Sim | Nao |

## Mapa por acao

| Acao | ADMIN | MANAGER | WAITER | KITCHEN | BAR | CASHIER |
|---|---|---|---|---|---|---|
| Gerenciar usuarios | Sim | Sim | Nao | Nao | Nao | Nao |
| Gerenciar configuracoes do tenant | Sim | Sim | Nao | Nao | Nao | Nao |
| Abrir/fechar expediente do tenant | Sim | Sim | Nao | Nao | Nao | Nao |
| Gerenciar cardapio e categorias | Sim | Sim | Nao | Nao | Nao | Nao |
| Operar pedidos | Sim | Sim | Sim | Sim | Sim | Nao |
| Cancelar pedidos | Sim | Sim | Sim | Nao | Nao | Nao |
| Gerenciar mesas | Sim | Sim | Nao | Nao | Nao | Nao |
| Operacoes de salao | Sim | Sim | Sim | Nao | Nao | Nao |
| Conciliacao e pagamentos | Sim | Sim | Sim | Nao | Nao | Sim |
| Ver relatorios | Sim | Sim | Nao | Nao | Nao | Sim |
| Ver carteira e consumo de mensagens | Sim | Sim | Nao | Nao | Nao | Sim |

## Regras de gestao de usuarios

### ADMIN

- pode criar usuarios de qualquer papel
- pode editar qualquer usuario do tenant
- pode resetar senha de qualquer usuario
- pode ativar ou desativar qualquer usuario

### MANAGER

- pode criar `MANAGER`, `WAITER`, `KITCHEN`, `BAR` e `CASHIER`
- nao pode criar `ADMIN`
- nao pode editar, resetar senha ou desativar um `ADMIN`
- pode gerenciar usuarios de todos os demais papeis

### WAITER, KITCHEN, BAR e CASHIER

- nao possuem acesso a `Equipe & Acessos`
- nao podem criar, editar ou desativar usuarios

## Grupos de permissao usados no sistema

| Grupo | Perfis |
|---|---|
| `full_access` | `ADMIN`, `MANAGER` |
| `menu_read` | `ADMIN`, `MANAGER`, `WAITER`, `KITCHEN`, `BAR`, `CASHIER` |
| `menu_write` | `ADMIN`, `MANAGER` |
| `order_read_write` | `ADMIN`, `MANAGER`, `WAITER`, `KITCHEN`, `BAR` |
| `order_cancel` | `ADMIN`, `MANAGER`, `WAITER` |
| `table_read` | `ADMIN`, `MANAGER`, `WAITER`, `CASHIER` |
| `table_write` | `ADMIN`, `MANAGER` |
| `floor_operations` | `ADMIN`, `MANAGER`, `WAITER` |
| `settlement` | `ADMIN`, `MANAGER`, `WAITER`, `CASHIER` |
| `reports` | `ADMIN`, `MANAGER`, `CASHIER` |
| `wallet` | `ADMIN`, `MANAGER`, `CASHIER` |
| `bot_config` | `ADMIN`, `MANAGER` |

## Observacoes

- A visibilidade das telas no front e montada a partir de `buildFrontendPermissions`.
- A tela `Pagamentos` passou a ser incluida explicitamente quando o perfil possui acesso ao grupo `settlement`.
- A navegacao do KDS usa grupos diferentes:
  - `Atendimento (KDS)` depende de `floor_operations`
  - `KDS (Cozinha)` depende de `order_read_write`
