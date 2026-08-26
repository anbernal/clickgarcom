# Implementação frontend — MVP RETAIL

## 1. Estado

As tarefas `RET-FE-001` a `RET-FE-009` e a apresentação de `RET-SA-001` foram
implementadas como frontend-first. O protótipo é navegável, responsivo e possui
uma fronteira explícita de API, mas não persiste dados no backend do produto.

O modo de demonstração somente é ativado por query string. Um tenant restaurante
não recebe dados RETAIL nem perde o comportamento atual por ausência do novo
campo de perfil.

## 2. Telas entregues

### 2.1 Admin do tenant

- visão geral da loja com indicadores de operação e estoque;
- produtos, busca, filtros, cadastro e edição;
- organização de categorias;
- estoque físico, reservado e disponível;
- entrada e ajuste com motivo;
- lotes, validade e alertas visuais;
- Compras online com operação e histórico;
- Central de Separação com `NEW`, `PICKING`, `PACKING` e `READY`;
- feedback de loading, bloqueio contra clique duplicado e versão esperada;
- menu por perfil que oculta Dashboard/Pedidos/KDS/Cardápio/Mesas de restaurante.

### 2.2 Loja do cliente

- identidade do tenant e estado aberto/fechado;
- busca como ação principal;
- categorias circulares;
- trilhos “Compre de novo” e “Ofertas do dia”;
- catálogo responsivo, detalhe, quantidade rápida e sacola persistente;
- seleção de entrega/retirada;
- apresentação de PIX e cartão;
- confirmação do pagamento antes da separação;
- acompanhamento, histórico e repetição;
- variações visuais de mercado e farmácia comercial.

### 2.3 Super Admin

- seleção de `RESTAURANT`, `MARKET` ou `PHARMACY`;
- prévia do perfil operacional e das capacidades compatíveis;
- armazenamento local temporário do tipo enquanto a API estiver desabilitada;
- envio do campo ao backend somente com a feature flag
  `SUPER_ADMIN_RETAIL_API_ENABLED=true`.

## 3. Como abrir o protótipo

No diretório `apps/tenant-admin/web`:

```bash
npm start
```

Rotas de demonstração:

- Admin mercado: `/?retail-preview=market&retail-reset=1`;
- Admin farmácia: `/?retail-preview=pharmacy&retail-reset=1`;
- Loja mercado: `/loja/mercado-modelo?preview=market`;
- Loja farmácia: `/loja/farmacia-modelo?preview=pharmacy`.

O parâmetro `retail-reset=1` recria os dados administrativos uma vez no
carregamento. A loja persiste a sacola por slug no `localStorage`.

## 4. Fronteira de integração

Quando não existe query de preview, o frontend espera os contratos definidos em
`design.md`, incluindo:

- `GET /admin/api/retail/workspace`;
- CRUD de `/admin/api/catalog/products` e `/admin/api/catalog/categories`;
- comandos de `/admin/api/inventory/adjustments` e `/inventory/lots`;
- transição versionada em `/admin/api/retail/fulfillments/:id/transition`;
- `GET /admin/api/public/stores/:slug/catalog`.

O backend deverá manter tenant scope, RBAC, idempotência, auditoria, cálculo de
preços, estoque e confirmação de pagamento. Dados do navegador nunca serão fonte
de verdade quando a integração for habilitada.

## 5. Base QA RETAIL

Foi criada uma base local de demonstração, independente de qualquer tenant
existente:

- tenant: `Mercado Modelo QA`;
- slug: `mercado-modelo-qa`;
- perfil: `MARKET`;
- 6 categorias, 17 produtos, estoque físico e um item indisponível;
- 3 lotes com validade;
- todos os produtos usam destino `PICKING`, sem cair em cozinha ou bar.

O seed é idempotente e atualiza somente esse tenant:

```bash
cd apps/tenant-admin/api
npm run seed:retail-demo
```

Credenciais exclusivas de QA:

- login: `admin.mercado.qa@clickgarcom.local`;
- senha: `Teste@123`.

O seed exige a migration `000053_create_retail_catalog_foundation`. Ela cria o
tipo de estabelecimento, detalhes neutros de produto, saldo de estoque e lotes,
sem alterar os dados de restaurante existentes.

O endpoint autenticado `GET /admin/api/retail/workspace` já lê deste tenant as
categorias, os produtos, os saldos e os lotes. Nesta primeira conexão ele é
propositalmente somente leitura: cadastro, ajuste e checkout entram junto dos
fluxos transacionais de estoque.

## 6. Verificação

- suíte RETAIL cobre perfil, catálogo, categorias, estoque, lotes, histórico,
  separação, checkout mobile e farmácia;
- suíte do cardápio atual continua validando o perfil restaurante;
- suíte Delivery continua validando o fluxo existente; o teste de tracking foi
  atualizado para o rótulo atual “Confirmar recebimento”.

## 7. Revisão contra requisitos e design

A implementação respeita a separação entre `FOOD_SERVICE` e `RETAIL`, não usa a
fila de cozinha, mantém pagamento confirmado como mensagem de gate e evita
ativar mocks em tenants reais. Catálogo, estoque e fulfillment ainda não têm as
garantias transacionais descritas no design porque pertencem à próxima etapa de
backend.

Conclusão da etapa frontend: **APPROVED**.
