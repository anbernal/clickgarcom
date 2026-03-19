# Arquitetura Proposta: Cardapio Interativo WhatsApp

## Decisao
Para a proxima evolucao do ClickGarcom, o caminho mais seguro e:

- manter o `node-admin` como dono do **conteudo do cardapio**
- manter o `go-core` como dono da **conversa, carrinho e criacao de pedidos**
- usar **mensagens interativas nativas do WhatsApp** como base
- **nao** depender de Catalog da Meta na primeira versao
- tratar um pedido do cliente como **1 carrinho logico**
- desdobrar esse carrinho em **N pedidos operacionais por destino** para KDS

## Por Que Essa Decisao
O projeto ja tem a base de menu correta:

- categorias em `services/node-admin/src/entities/menu-category.entity.ts`
- itens com `image_url` e `destination` em `services/node-admin/src/entities/menu-item.entity.ts`
- dominio do menu em `services/go-core/internal/domain/menu/entity.go`
- criacao de pedidos com varios itens em `services/go-core/internal/application/create_order.go`
- KDS separado por `destination` em `services/node-admin/public/js/kds.js`

O problema atual e que o `Order` ainda tem um `destination` unico em `services/go-core/internal/domain/order/entity.go`.
Hoje isso funciona para pedido simples, mas fica incoerente para um carrinho misto com:

- comida para `KITCHEN`
- bebida para `BAR`

Se o cliente confirmar um pedido completo nesse formato, o sistema precisa manter:

- **1 confirmacao unica** para o cliente
- **tickets operacionais separados** para cozinha e bar

## Objetivo
Permitir um cardapio conversacional com boa aderencia ao WhatsApp, incluindo:

- categorias como `Comida`, `Bebida`, `Pratos do dia`, `Sugestao do chefe`
- itens com imagem
- selecao de quantidade
- carrinho editavel
- confirmacao de pedido completo
- roteamento correto no KDS

## Restricoes do WhatsApp Que Importam
Pelo suporte oficial de mensagens interativas da plataforma:

- `reply buttons`: ate 3 opcoes
- `list`: lista com secoes e itens selecionaveis
- `product` e `product_list`: exigem Catalog da Meta
- imagem pode ser enviada como mensagem propria

Fontes oficiais:

- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/image/

### Consequencia Pratica
Se quisermos que o restaurante monte o proprio cardapio apenas no `node-admin`, sem depender de Commerce Manager, a melhor V1 e:

- lista interativa para categorias e itens
- imagem separada para detalhe do item
- botoes para quantidade e acoes
- carrinho em rascunho no `go-core`

Se quisermos um cardapio mais proximo de vitrine nativa da Meta, isso vira fase posterior com `product` / `product_list`.

## Proposta de UX Conversacional

### Etapa 1: Abrir Cardapio
No `Main Menu`, a opcao `Fazer pedido` abre o menu conversacional.

Mensagem sugerida:

```text
🍽️ Cardapio do Anderson's

Escolha por onde voce quer comecar:
```

Com `list` contendo:

- Comida
- Bebida
- Pratos do dia
- Sugestao do chefe

### Etapa 2: Escolher Categoria
Ao tocar em uma categoria, o usuario recebe uma `list` com os itens daquela secao.

Cada linha deve conter:

- `title`: nome curto do item
- `description`: preco + resumo curto

Exemplo:

- `Picanha na Brasa`
  - `R$ 119,00 · Grelhada e servida com acompanhamentos`

### Etapa 3: Ver Detalhe do Item
Ao escolher um item:

1. enviar imagem do item, se houver `image_url`
2. enviar texto com:
   - nome
   - descricao
   - preco
   - destino operacional opcional nao visivel ao cliente
3. enviar botoes de quantidade

Botoes sugeridos:

- `1`
- `2`
- `3`

Se precisar de quantidade maior:

- botao `Mais`
- ou lista secundaria `4`, `5`, `6`, `8`, `10`

### Etapa 4: Montar Carrinho
Depois da quantidade escolhida, o item entra num carrinho em rascunho.

Mensagem sugerida:

```text
✅ Item adicionado

Picanha na Brasa
Quantidade: 2
Subtotal: R$ 238,00
```

Botoes:

- `Adicionar mais itens`
- `Ver carrinho`
- `Enviar pedido`

### Etapa 5: Revisar Carrinho
O carrinho deve mostrar:

- itens agregados
- quantidades
- subtotal parcial
- observacoes, se houver

Exemplo:

```text
🛒 Seu pedido

2x Picanha na Brasa      R$ 238,00
1x Agua com Gas          R$ 9,00

Subtotal parcial         R$ 247,00
```

Acoes:

- `Adicionar mais`
- `Remover item`
- `Limpar carrinho`
- `Enviar pedido`

### Etapa 6: Confirmar Pedido
Na confirmacao, o usuario envia o carrinho completo de uma vez.

Mensagem:

```text
✅ Pedido enviado!

Seu pedido foi recebido e vai ser encaminhado para preparo.
Te avisamos aqui conforme o status avancar.
```

## Quantidade: Regra Recomendada
Para WhatsApp, a regra mais segura e simples e:

1. primeiro clique escolhe o item
2. segunda tela escolhe quantidade
3. quantidade entra no carrinho
4. confirmacao final envia tudo

Nao recomendo V1 com texto livre do tipo:

- `2 picanha e 1 agua`

Isso aumenta muito a ambiguidade e torna o parser fragil.

### Quantidade Recomendada na V1
- botoes `1`, `2`, `3`
- opcao `Mais`
- opcao `Cancelar`

### Quantidade Recomendada na V2
- tela secundaria com:
  - `4`
  - `5`
  - `6`
  - `8`
  - `10`
- ou input numerico validado

## Imagens: Como Fazer Sem Quebrar a UX
O WhatsApp nao resolve isso bem apenas com `list`.
Por isso a melhor estrategia e:

- lista para navegar
- imagem separada para detalhe

### Regra sugerida
- categoria: opcionalmente pode ter imagem ilustrativa
- item: pode ter imagem principal
- ao entrar no item, enviar a imagem antes dos botoes de quantidade

### Evolucao no Modelo
Hoje `MenuItem` ja tem `image_url`.
Para categorias e vitrines, a evolucao recomendada e adicionar:

#### `menu_categories`
- `image_url` NULL

#### `menu_items`
- manter `image_url`
- adicionar opcionalmente `whatsapp_short_name`
- adicionar opcionalmente `whatsapp_short_description`

Esses campos curtos ajudam porque a UX do WhatsApp exige titulos mais compactos que a web.

## Categorias vs Colecoes
`Comida` e `Bebida` sao categorias naturais.
Mas `Pratos do dia` e `Sugestao do chefe` sao mais proximos de **colecoes editoriais**.

Por isso a modelagem recomendada e:

### V1
Usar so categorias, para acelerar.

### V2
Adicionar uma entidade de colecao curada, por exemplo:

- `menu_collections`
- `menu_collection_items`

Casos de uso:

- Pratos do dia
- Sugestao do chefe
- Promocoes
- Mais vendidos

Assim o restaurante pode destacar itens sem mexer na taxonomia principal.

## Node Admin: O Que Precisa Evoluir
O usuario do `node-admin` precisa conseguir montar o cardapio sem depender de deploy.

### CRUD de Categorias
Adicionar:

- nome
- descricao curta
- ordem
- ativo
- imagem
- visivel no WhatsApp

### CRUD de Itens
Ja existe boa parte disso.
Adicionar ou reforcar:

- nome
- descricao curta
- preco
- imagem
- destino (`KITCHEN` ou `BAR`)
- tempo de preparo
- ordem
- ativo
- visivel no WhatsApp

### Configuracao de Exibicao WhatsApp
Sugestao de flags por tenant:

- `menu_whatsapp_enabled`
- `menu_whatsapp_show_images`
- `menu_whatsapp_max_items_per_screen`
- `menu_whatsapp_allow_notes`
- `menu_whatsapp_allow_quantity_above_3`

## Runtime no Go Core
O `go-core` deve ser dono de:

- sessao conversacional
- estado do menu
- carrinho em rascunho
- validacao de quantidade
- confirmacao final
- split operacional por destino

### Novo estado sugerido na sessao
Adicionar contexto de carrinho temporario, por exemplo:

```json
{
  "cart": [
    {
      "menu_item_id": "uuid",
      "quantity": 2,
      "observations": ""
    }
  ],
  "selected_category_id": "uuid",
  "selected_item_id": "uuid"
}
```

Isso pode viver inicialmente no Redis junto da sessao WhatsApp.

## Regra Central: Carrinho Logico, Tickets Operacionais Separados
Essa e a parte mais importante.

### O que o cliente enxerga
Um pedido unico:

- ele escolhe varios itens
- confirma uma vez
- recebe uma confirmacao unica

### O que a operacao precisa
Pedidos separados por destino:

- itens de cozinha vao para `KITCHEN`
- itens de bar vao para `BAR`

### Problema do modelo atual
Hoje `order.destination` e unico.
Isso faz sentido para um pedido simples, mas nao para um carrinho misto.

### Solucao recomendada
Introduzir o conceito de **batch de pedido**.

#### Nova entidade sugerida: `order_batches`
Campos minimos:

- `id`
- `tenant_id`
- `tab_id`
- `customer_phone`
- `status`
- `created_at`

#### Evolucao de `orders`
Adicionar:

- `batch_id`
- manter `destination`

### Fluxo de criacao
1. usuario confirma carrinho
2. `go-core` cria `order_batch`
3. agrupa os itens por `destination`
4. cria um `order` para cada destino
5. cada `order` recebe apenas os itens da sua estacao
6. cliente recebe confirmacao unica do batch

Exemplo:

Carrinho:
- 1 picanha
- 2 aguas
- 1 caipirinha

Resultado operacional:
- `order A` -> `KITCHEN`
  - picanha
- `order B` -> `BAR`
  - aguas
  - caipirinha

## Como Isso Entra no KDS
Hoje o KDS ja separa por `destination` em `services/node-admin/public/js/kds.js`.
Isso e bom e deve ser preservado.

### Recomendacao
O KDS continua recebendo **orders por destino**, nao batches.

Mas cada `order` deve expor:

- `batch_id`
- `batch_display_code`
- `table`
- `customer_phone` opcional

Assim cozinha e bar conseguem correlacionar os tickets do mesmo pedido.

### UX recomendada no KDS
No card do pedido:

- destino
- mesa
- codigo do batch
- itens daquele destino

Exemplo:

- `Batch #1042 · Mesa 05`
- `Cozinha`
- itens da cozinha

e em outro painel:

- `Batch #1042 · Mesa 05`
- `Bar`
- itens do bar

## Status do Pedido Completo
Se houver `order_batch`, o status percebido pelo cliente deve ser derivado dos pedidos filhos.

### Regra sugerida
- `PENDING`: existe pelo menos um pedido filho pendente
- `ACCEPTED`: todos os filhos ja sairam de pendente
- `READY_PARTIAL`: algum filho pronto, mas nao todos
- `READY`: todos os filhos prontos
- `DELIVERED`: todos entregues

### V1 simplificada
Se quiser acelerar:
- nao expor `READY_PARTIAL` ainda
- avisar o cliente apenas quando todos os pedidos do batch estiverem `READY`

## Observacoes do Item
Observacao por item deve continuar no nivel de `OrderItem`.

Fluxo recomendado:

1. cliente escolhe item
2. cliente escolhe quantidade
3. sistema pergunta:
   - `Deseja adicionar observacao?`
4. botoes:
   - `Sem observacao`
   - `Adicionar observacao`

Na V1, tambem da para pular observacao para reduzir complexidade.

## Fases Recomendadas

### Fase 1
Objetivo: colocar cardapio conversacional confiavel no ar

- categoria em `list`
- item em `list`
- imagem separada do item
- quantidade com botoes
- carrinho em rascunho
- confirmacao unica
- split interno por destino
- KDS continua igual, recebendo orders separados

### Fase 2
- colecoes editoriais (`Pratos do dia`, `Sugestao do chefe`)
- observacoes por item
- remocao/edicao de itens do carrinho mais rica
- mais opcoes de quantidade

### Fase 3
- integracao com Catalog da Meta
- `product` / `product_list`
- experiencia mais parecida com vitrine nativa

## O Que Nao Recomendo Agora
- nao comecar por parser de texto livre
- nao tentar mandar todas as imagens dentro de um unico componente interativo
- nao manter pedido misto em um unico `order.destination`
- nao acoplar o KDS a um carrinho cru do WhatsApp

## Recomendacao Final
Para comecar certo, a ordem ideal e:

1. fechar o desenho de `order_batch` + split por `destination`
2. evoluir `node-admin` para imagens e apresentacao WhatsApp
3. criar o carrinho conversacional no `go-core`
4. publicar V1 com `list + image + buttons`
5. deixar Catalog da Meta como segunda etapa

Essa abordagem preserva a arquitetura atual, usa melhor o que ja existe no projeto e evita quebrar cozinha, bar e KDS quando o pedido ficar mais rico.
