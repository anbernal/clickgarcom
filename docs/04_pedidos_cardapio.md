# Gestão de Pedidos e Cardápio

A Gestão de Cardápios e o processamento dos pedidos representam o coração comercial do ClickGarçom, conectando o WhatsApp ao ecossistema do Go-Core e à visualização Web do Admin.

## 1. Estrutura de Cardápio (`MenuCategory` e `MenuItem`)
- O cardápio é hierárquico e vinculado diretamente a um `TenantID` (Restaurante).
- **Categorias (`MenuCategory`)**: Ex: Entradas, Pratos Principais, Bebidas, Sobremesas.
  - Possuem um campo booleano `Active` para ocultamento dinâmico no bot.
- **Itens (`MenuItem`)**: Ex: Hambúrguer, Coca-Cola 350ml.
  - Atrelados obrigatoriamente a uma Categoria.
  - Possuem Nome, Descrição, Preço (`Price`) e status de disponibilidade (`Available`).
  - Um item inativo (`Available = false`) não é listado no WhatsApp do cliente e não pode ser incluído em novas ordens, prevenindo furos no estoque de última hora.

## 2. A Jornada do Pedido (`Order` e `OrderItem`)
Como a plataforma não possui um "Carrinho de Compras" complexo no frontend típico de um iFood, o WhatsApp simplifica isso através do Estado e Sub-estado de "Pedidos em Rascunho".

1. **Seleção e Quantidade**: O usuário navega as Categorias, escolhe um Produto, define a Quantidade.
2. **Observações / Notes**: O sistema consulta se o usuário possui instruções especiais.
3. **Draft da Ordem**:
  - Uma vez confirmado, o Go-Core cria um `Order` com status `PENDING`.
  - Essa ação aciona indiretamente um alerta via RabbitMQ ou WebSocket se já possuir integração de KDS (Kitchen Display System) para alertar no Painel de Pedidos.
4. **Itens Separados (Atomicidade)**: Cada escolha entra como um `OrderItem`, contendo seu Preço Unitário congelado no momento da compra (evitando divergências caso o Cardápio altere de valor posteriormente), a quantidade e subtotal (`Unit Price * Quantity`).
5. **Comanda (`Tab`)**: 
  - Todo Pedido precisa estar contido de forma lógica em uma Comanda (Mesmo que o faturamento de Delivery simplifique isso futuramente através de Comandas Expressas de Checkout Único).

## 3. Máquina de Estados do Pedido (`OrderStatus`)
O ciclo de vida do pedido afeta duas telas críticas (A tela de Pedidos Atuais do Admin e o status enviado para o WhatsApp).
- `PENDING`: Aguardando aceite ou preparo (cai na fila do Painel Admin `Pedidos Pendentes`).
- `PREPARING`: O cozinheiro/gerente aceitou a comanda no Painel (KDS em ação).
- `READY`: O prato está pronto para retirada no balcão (Avisa o garçom ou o cliente).
- `DELIVERED`: Entregue na mesa do cliente (Subtotal do pedido é faturado na Comanda final da mesa `tab.AddOrderTotal(order.Total)`).
- `CANCELED`: Pedido recusado pela cozinha (Falta de estoque reportada tardiamente, desistência rápida, etc). O cliente é estornado.
