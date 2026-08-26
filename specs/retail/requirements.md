# Requisitos — MVP RETAIL

## 1. Objetivo

O MVP RETAIL permite que um tenant do ClickGarçom opere uma loja digital de
produtos com ciclo completo, reutilizando autenticação por WhatsApp, clientes,
endereços, pagamentos, Delivery, frota própria, rastreamento e histórico.

O primeiro recorte atende:

- mercados;
- farmácias comerciais sem dispensação sujeita a receita;
- futura reutilização por outras lojas de produtos unitários.

O MVP não altera o comportamento de tenants `RESTAURANT`.

## 2. Perfis e estabelecimentos

O perfil operacional é `RETAIL`. No primeiro rollout, ele admite os tipos de
estabelecimento:

- `MARKET`;
- `PHARMACY`.

`RESTAURANT` permanece o valor default para tenants existentes. O tipo do
estabelecimento seleciona terminologia e defaults, mas não bloqueia módulos:
Atendimento, Delivery e RETAIL são capabilities independentes que podem
coexistir no mesmo tenant. O tipo não é fonte de autorização de tela ou rota.

## 3. Ciclo completo do MVP

```text
WhatsApp envia link autenticado
  -> cliente acessa o catálogo
  -> seleciona produtos unitários
  -> sistema valida preço e disponibilidade
  -> estoque é reservado por tempo limitado
  -> checkout PIX ou cartão
  -> pagamento confirmado
  -> pedido entra na Central de Separação
  -> separação
  -> conferência e embalagem
  -> retirada ou expedição Delivery
  -> entrega/retirada concluída
  -> histórico, repetição e auditoria
```

Um pedido com pagamento obrigatório nunca pode entrar em separação enquanto o
pagamento estiver pendente, recusado, cancelado ou expirado.

## 4. Escopo incluído

### 4.1 Produtos

- produto simples vendido por unidade;
- preço fixo em reais;
- nome, descrição, imagem, categoria e marca;
- SKU e código de barras opcionais;
- fabricante e apresentação/embalagem opcionais;
- preço de custo opcional;
- produto ativo/inativo;
- ordem de exibição;
- limite mínimo e máximo por pedido;
- estoque controlado ou produto sem controle de estoque;
- lote e validade opcionais;
- dados farmacêuticos informativos opcionais para `PHARMACY`;
- `requires_prescription=false` obrigatório no MVP.

Cada variação com estoque próprio deve ser cadastrada como SKU separado. O MVP
não controla estoque por complemento ou opção.

### 4.2 Loja digital

- identidade visual e logo do tenant;
- sessão autenticada originada no WhatsApp;
- busca por nome, marca, SKU ou código de barras;
- categorias;
- listagem e detalhe do produto;
- quantidade rápida;
- carrinho persistente durante a sessão;
- endereço salvo e seleção da modalidade;
- checkout PIX/cartão;
- histórico de compras;
- repetir compra com revalidação de preço e estoque;
- acompanhamento do pedido e da entrega.

### 4.3 Estoque

- saldo físico, reservado e disponível;
- reserva concorrente no checkout;
- expiração e liberação automática;
- baixa após pagamento confirmado;
- devolução por cancelamento autorizado;
- entrada, ajuste, perda e devolução;
- histórico imutável de movimentações;
- alerta de estoque mínimo;
- lote e validade opcionais, sem controle de temperatura ou armazenamento.

### 4.4 Operação

- Central de Separação independente de cozinha/bar;
- estados `NEW`, `PICKING`, `PACKING`, `READY`, `COMPLETED` e `CANCELED`;
- itens, quantidades, observações e localização textual opcional;
- confirmação de item separado;
- conferência e embalagem;
- transição para retirada ou Delivery;
- atualização em tempo real;
- auditoria de todas as ações.

### 4.5 Logística e pagamento

- retirada no estabelecimento usando o modo existente equivalente a `TAKEOUT`;
- Delivery próprio ou externo usando o domínio Delivery existente;
- cálculo de área, taxa e capacidade já existentes;
- motoboy próprio, GPS, rastreamento e código de entrega existentes;
- PIX e cartão existentes;
- reconciliação e notificações de pagamento existentes.

## 5. Fora do MVP

- produtos vendidos por peso ou quantidade fracionada;
- alteração do valor depois do pagamento;
- substituição automática ou assistida de produto;
- promoções compostas, kits com baixa múltipla e clube de fidelidade;
- múltiplos depósitos ou filiais compartilhando estoque;
- monitoramento de temperatura, refrigeração ou sensores;
- venda de medicamentos sujeitos a receita ou controle especial;
- upload, retenção ou validação de receita;
- dispensação farmacêutica e integrações SNGPC/SNCR;
- prontuário ou qualquer dado clínico;
- integração fiscal, ERP, balança ou leitor físico no primeiro piloto.

## 6. Requisitos funcionais

### RET-RF-000 — Separação entre catálogo, canais e logística

Os módulos são independentes e devem ser avaliados separadamente no tenant:

| Configuração | Experiência no WhatsApp | Pode concluir pedido? |
| --- | --- | --- |
| Atendimento ativo | Fluxo presencial/comanda | Conforme regras do Atendimento |
| Loja de comidas ativa | Link autenticado para o Cardápio | Sim, se Delivery estiver ativo |
| Loja de produtos ativa | Link autenticado para a Loja/Catálogo | Sim, se Delivery estiver ativo |
| Loja de comidas e Loja de produtos ativas | Cliente escolhe `Comidas` ou `Produtos` antes do link | Sim, no fluxo escolhido |
| Delivery ativo sem loja ativa | Sem catálogo para iniciar um pedido | Não |
| Atendimento e lojas inativos | Mensagem de canal indisponível | Não |

Delivery é o domínio de logística, capacidade, endereço, pagamento e
rastreamento. Ele não define se o tenant vende refeições ou mercadorias. A
Loja de comidas controla o Cardápio e a Loja de produtos controla RETAIL,
catálogo e estoque. `establishment_type` fornece apenas defaults e linguagem;
não escolhe a rota comercial.

Assim, ativar Delivery em um mercado não coloca produtos na Cozinha, e ativar
RETAIL não cria um canal presencial nem altera Atendimento. Um tenant pode ter
os módulos ativos de forma híbrida, mas cada pedido deve seguir apenas a loja
escolhida e o respectivo `service_type`. Carrinhos de comidas e produtos não
se misturam no MVP.

No WhatsApp, o link é sempre autenticado e de uso controlado. A opção de
entrega só é exibida quando o tenant está aberto, Delivery está ativo e
`whatsapp_order_enabled` está habilitado.

### RET-RF-001 — Ativação segura

O Super Admin deve habilitar ou desabilitar RETAIL como módulo independente.
`MARKET` e `PHARMACY` apenas ajustam linguagem e defaults; um `RESTAURANT`
também pode ter RETAIL ativo sem perder Atendimento ou Delivery.

Critérios:

- tenant existente continua `RESTAURANT` por default;
- ativação RETAIL não altera o estado de Atendimento ou Delivery;
- produtos `PICKING` não aparecem no Cardápio, Cozinha ou Bar;
- itens de alimentação não aparecem na Central de Separação;
- mudança é auditada;
- dados históricos não são removidos ao desativar.

### RET-RF-002 — Terminologia centralizada

Admin, loja e WhatsApp devem usar termos do perfil:

- `Catálogo de produtos`/`Produtos`, não `Cardápio`;
- `Loja`, `Mercado` ou `Farmácia`, conforme o estabelecimento;
- `Em separação`, não `Em preparo`;
- `Central de Separação`, não `Cozinha`.

As APIs e ações internas usam chaves estáveis e não interpretam labels.

### RET-RF-003 — Catálogo compatível

O catálogo RETAIL deve reutilizar a fonte atual de categorias e itens por meio
de uma fachada de catálogo, preservando endpoints e dados de restaurante.

Critérios:

- nenhuma tabela existente é renomeada no MVP;
- preço exibido nunca é aceito como verdade do cliente;
- produto inativo ou sem estoque não entra em novo checkout;
- alterações posteriores não mudam o snapshot de uma compra confirmada.

### RET-RF-004 — Busca

A loja deve buscar por texto normalizado em nome, descrição, marca, SKU e código
de barras, sempre limitada ao tenant e apenas em produtos publicáveis.

### RET-RF-005 — Carrinho

O carrinho aceita somente produtos simples, quantidade inteira positiva e até o
limite configurado. Repetir compra recria um carrinho, não duplica o pedido
anterior.

### RET-RF-006 — Cotação e total

O servidor recalcula produtos, frete e total antes de criar a tentativa de
pagamento. Valores são snapshotados no pedido.

### RET-RF-007 — Reserva de estoque

Ao iniciar checkout, o sistema deve reservar estoque de forma atômica.

Critérios:

- disponível = físico - reservado;
- duas transações não reservam a mesma última unidade;
- reserva possui TTL e idempotency key;
- expiração/falha/cancelamento pré-pagamento libera a reserva;
- repetição do mesmo comando não altera o saldo duas vezes.

### RET-RF-008 — Confirmação do pagamento

Somente pagamento confirmado converte reserva em venda e cria/libera o trabalho
na Central de Separação.

Critérios:

- webhook, polling e reconciliação convergem idempotentemente;
- evento duplicado não baixa estoque duas vezes;
- `PENDING_PAYMENT` não aparece como novo pedido operacional;
- falha depois do commit é recuperável por outbox/reconciliação.

### RET-RF-009 — Movimentações

Toda alteração de saldo gera movimento com tenant, produto, quantidade, motivo,
referência, ator, idempotency key e data.

Motivos mínimos:

- `PURCHASE_ENTRY`;
- `SALE`;
- `CANCEL_RETURN`;
- `MANUAL_ADJUSTMENT`;
- `LOSS`;
- `CUSTOMER_RETURN`.

### RET-RF-010 — Lote e validade opcionais

Produtos podem operar sem lote. Quando controlados por lote, entradas devem
informar lote, validade e quantidade. O MVP apenas registra, alerta e permite a
seleção operacional do lote; não controla temperatura.

### RET-RF-011 — Central de Separação

Pedido pago cria um fulfillment RETAIL único por lote de pedido. A operação deve
ser idempotente e em tempo real.

Critérios:

- `NEW -> PICKING -> PACKING -> READY`;
- cancelamento exige motivo e permissão;
- estado terminal não regride;
- cada transição guarda ator, horário e versão esperada;
- pedido RETAIL nunca aparece em cozinha/bar.

### RET-RF-012 — Retirada

Pedido `TAKEOUT` concluído na Central de Separação fica pronto para retirada e é
encerrado por operador autorizado, mantendo pagamento e histórico.

### RET-RF-013 — Delivery

Pedido `DELIVERY` em `READY` aciona o fluxo Delivery existente, preservando as
regras de pagamento, capacidade, atribuição, rastreamento e conclusão.

### RET-RF-014 — Notificações

O cliente recebe somente marcos relevantes:

- pagamento confirmado;
- compra em separação;
- pronta para retirada ou saiu para entrega;
- exceção que exige ação;
- concluída.

### RET-RF-015 — Histórico e repetição

O cliente deve consultar compras do tenant e repetir uma compra. Produtos
inativos, preços alterados, limites e estoque são revalidados.

### RET-RF-016 — Farmácia comercial

`PHARMACY` usa o mesmo fluxo RETAIL, com campos informativos opcionais. O backend
deve rejeitar checkout de produto com `requires_prescription=true` enquanto o
módulo regulatório não existir.

### RET-RF-017 — Auditoria e isolamento

Todas as consultas e mutações são limitadas por `tenant_id`. Alterações de
produto, estoque, pedido, pagamento e separação devem ser auditáveis.

### RET-RF-018 — Compatibilidade

- `RESTAURANT` mantém cardápio, destinos `KITCHEN/BAR` e KDS atual;
- RETAIL usa destino `PICKING` e não cria pedido na cozinha;
- tabelas/rotas legadas permanecem válidas;
- ausência do novo campo em payload legado assume comportamento de restaurante;
- o rollout é reversível por tenant.

## 7. Cenário de aceite ponta a ponta

1. Super Admin cria tenant `MARKET` ou `PHARMACY` e habilita RETAIL.
2. Admin cadastra categoria, produto unitário, preço e estoque 10.
3. Cliente recebe o link pelo WhatsApp, entra e adiciona duas unidades.
4. Checkout reserva duas unidades; disponível passa a 8.
5. Pagamento é confirmado; a venda baixa o físico para 8 e zera aquela reserva.
6. Um card aparece uma única vez em `NEW` na Central de Separação.
7. Operador move por `PICKING`, `PACKING` e `READY`.
8. Em retirada, operador conclui; em Delivery, o fluxo existente assume.
9. Cliente acompanha e recebe as mensagens de marcos.
10. A compra aparece no histórico e pode ser repetida com nova validação.
