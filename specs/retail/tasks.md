# Plano de implementação — MVP RETAIL

## 1. Convenções

- `P0`: obrigatório para o primeiro piloto.
- `P1`: obrigatório antes da expansão para mais tenants.
- `P2`: evolução posterior.
- `[ ]`: pendente.
- Nenhuma tarefa está concluída sem teste de compatibilidade `RESTAURANT`.
- Toda mutação declara tenant scope, RBAC, idempotência e auditoria.

Fontes de verdade:

- [Requisitos](./requirements.md)
- [Design técnico](./design.md)

## 2. M0 — Contratos e compatibilidade

- [x] `RET-BE-001` P0 — Adicionar migration de `establishment_type` com default
  `RESTAURANT`, constraint e rollback seguro.
- [x] `RET-BE-002` P0 — Implementar registry tipado de estabelecimento, perfil,
  terminologia e capacidades.
- [ ] `RET-BE-003` P0 — Expor o tipo no Tenant Admin, Super Admin, Core Go e
  contratos OpenAPI sem alterar payloads legados.
- [x] `RET-BE-004` P0 — Adicionar `PICKING` às constraints/enums e provar que
  cozinha/bar continuam filtrados.
- [ ] `RET-QA-001` P0 — Criar testes de contrato para `RESTAURANT`, `MARKET` e
  `PHARMACY`.

Saída: tenant existente não muda; tenant RETAIL pode ser criado sem acessar
mesas, comandas ou filas de alimentação.

## 3. M1 — Catálogo RETAIL

- [ ] `RET-BE-005` P0 — Criar `CatalogService` como fachada das categorias e
  itens atuais.
- [x] `RET-BE-006` P0 — Criar `retail_product_details`, constraints e índices
  por tenant para SKU/código de barras.
- [ ] `RET-BE-007` P0 — Criar `pharmacy_product_details` informativo e bloquear
  `requires_prescription=true` no checkout do MVP.
- [ ] `RET-BE-008` P0 — Implementar endpoints administrativos e públicos de
  catálogo com snapshots e preço validado no servidor.
- [ ] `RET-BE-009` P0 — Implementar busca tenant-scoped por produto, marca, SKU
  e código de barras.
- [x] `RET-FE-001` P0 — Adaptar cadastro de categorias/produtos para RETAIL sem
  alterar a tela de cardápio de restaurante.
- [x] `RET-FE-002` P0 — Criar loja digital RETAIL com busca, categorias, produto,
  quantidade e carrinho.
- [ ] `RET-QA-002` P0 — Cobrir produto ativo, inativo, duplicidade de SKU/EAN,
  limites, preço adulterado e isolamento de tenant.

Saída: mercado/farmácia cadastra e publica produtos simples; cliente navega e
monta carrinho autenticado.

## 4. M2 — Estoque transacional

- [ ] `RET-BE-010` P0 — Criar balances, reservations, movements e lotes
  opcionais.
- [ ] `RET-BE-011` P0 — Implementar entrada, ajuste, perda, devolução e projeção
  compatível em `menu_items.stock_quantity`.
- [ ] `RET-BE-012` P0 — Implementar hold atômico multi-item com TTL, ordem de
  locks e idempotency key.
- [ ] `RET-BE-013` P0 — Implementar worker de expiração usando lock seguro e
  `SKIP LOCKED`.
- [ ] `RET-BE-014` P0 — Implementar commit de venda e liberação/cancelamento sem
  duplicidade.
- [x] `RET-FE-003` P0 — Criar visão de saldos físico/reservado/disponível,
  entradas e ajustes.
- [x] `RET-FE-004` P1 — Criar cadastro opcional de lote/validade e alertas.
- [ ] `RET-QA-003` P0 — Testar corrida pela última unidade, deadlock, expiração,
  retry e webhook duplicado.

Saída: nenhuma compra confirma quantidade acima do disponível e toda mudança de
saldo possui trilha.

## 5. M3 — Checkout e pagamento

- [ ] `RET-BE-015` P0 — Generalizar o checkout digital para origem RETAIL,
  preservando o fluxo atual de restaurante.
- [ ] `RET-BE-016` P0 — Recalcular produtos, limites, estoque, frete e total no
  servidor.
- [ ] `RET-BE-017` P0 — Integrar hold com PIX/cartão e com quote/capacidade
  Delivery existente.
- [ ] `RET-BE-018` P0 — Criar caso de uso idempotente de pagamento confirmado:
  commit de estoque + fulfillment + outbox.
- [ ] `RET-BE-019` P0 — Reconciliar pagamento aprovado sem fulfillment e impedir
  fulfillment quando o pagamento não foi confirmado.
- [x] `RET-FE-005` P0 — Adaptar checkout, erros e estados de espera para RETAIL.
- [ ] `RET-CORE-001` P0 — Reutilizar notificações de PIX/cartão e garantir ordem
  pagamento antes de separação.
- [ ] `RET-QA-004` P0 — Testar sucesso, recusa, expiração, atraso de webhook,
  polling e reprocessamento.

Saída: compra paga entra uma única vez na operação; compra não paga nunca entra.

## 6. M4 — Central de Separação

- [ ] `RET-BE-020` P0 — Criar aggregate/tabelas de fulfillment e eventos RETAIL.
- [ ] `RET-BE-021` P0 — Implementar comandos versionados `start-picking`,
  `start-packing`, `mark-ready`, `cancel` e `complete`.
- [ ] `RET-BE-022` P0 — Publicar atualizações realtime e outbox transacional.
- [x] `RET-FE-006` P0 — Criar Central de Separação responsiva com colunas
  próprias e detalhes de produtos.
- [x] `RET-FE-007` P0 — Implementar feedback de concorrência, loading,
  atualização ao vivo e ações idempotentes.
- [ ] `RET-QA-005` P0 — Provar que pedidos RETAIL não aparecem em cozinha/bar e
  pedidos FOOD_SERVICE não aparecem na separação.

Saída: operador recebe compra paga e executa separação, embalagem e pronto sem
usar KDS de cozinha.

## 7. M5 — Retirada, Delivery e cliente

- [ ] `RET-BE-023` P0 — Integrar `READY` com retirada e com o domínio Delivery
  atual sem duplicar entrega.
- [ ] `RET-BE-024` P0 — Implementar conclusão/cancelamento e eventual retorno ao
  estoque com motivo auditado.
- [ ] `RET-BE-025` P0 — Adaptar histórico e repetição de compra com revalidação.
- [x] `RET-FE-008` P0 — Atualizar “Seus pedidos”, acompanhamento e repetir
  compra com terminologia RETAIL.
- [ ] `RET-CORE-002` P0 — Criar ação `open_store` e link autenticado no menu do
  WhatsApp.
- [ ] `RET-CORE-003` P0 — Criar templates de separação, pronto, expedição,
  exceção e conclusão, preservando mensagens Delivery existentes.
- [ ] `RET-QA-006` P0 — Executar E2E completo para retirada e Delivery próprio.

Saída: ciclo completo do cliente até retirada/entrega e histórico.

## 8. M6 — Administração, hardening e piloto

- [x] `RET-SA-001` P0 — Adicionar tipo de estabelecimento e ativação RETAIL no
  Super Admin com auditoria e defaults seguros.
- [x] `RET-FE-009` P0 — Resolver menu do Admin por capacidades; esconder módulos
  incompatíveis sem apagar histórico.
- [ ] `RET-BE-026` P1 — Criar reconciliação de saldo, reservas, movimentos,
  pagamentos e fulfillments.
- [ ] `RET-BE-027` P1 — Criar métricas e alertas operacionais.
- [ ] `RET-QA-007` P0 — Testes de RBAC, tenant isolation, idempotência, carga e
  acessibilidade básica.
- [ ] `RET-QA-008` P0 — Backup, migration em staging/prod de teste, smoke e
  rollback documentado.
- [ ] `RET-QA-009` P0 — Piloto com um tenant novo `MARKET` e conjunto pequeno de
  produtos unitários.
- [ ] `RET-QA-010` P1 — Piloto `PHARMACY` apenas com produtos permitidos pelo
  recorte comercial e validação do responsável do tenant.

Saída: MVP pronto para rollout controlado sem regressão do Anderson Restaurant.

## 9. Caminho crítico

```text
Tipo/perfil/contratos
  -> Catálogo RETAIL
  -> Estoque transacional
  -> Checkout + pagamento confirmado
  -> Central de Separação
  -> Retirada/Delivery
  -> WhatsApp, histórico e repetição
  -> hardening e piloto
```

Backend de estoque e catálogo pode avançar em paralelo com o shell visual da
loja e da Central de Separação depois que os contratos de M0 forem congelados.

## 10. Gate do MVP

O MVP somente pode ser declarado pronto quando:

- restaurante passa a suíte de regressão existente;
- corrida pela última unidade não produz estoque negativo;
- pagamento pendente não aparece na separação;
- pagamento confirmado duplicado não duplica baixa nem fulfillment;
- cancelamento libera/devolve estoque conforme a etapa;
- pedido RETAIL nunca cai em cozinha/bar;
- retirada e Delivery completam o ciclo;
- cliente consulta e repete a compra;
- Super Admin consegue ativar e reverter o perfil por tenant;
- logs e auditoria permitem reconciliar produto, pagamento e pedido.
