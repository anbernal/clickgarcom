# Comandas, operação manual, auditoria e documentos

## Objetivo

Permitir que o garçom opere uma comanda diretamente no KDS, mantendo pedidos, financeiro, produção, histórico e comprovantes consistentes e rastreáveis.

## Decisões de arquitetura

- A `Tab` continua sendo a raiz do atendimento.
- O lançamento manual usa `order_batches`, `orders` e `order_items` existentes.
- Itens de um mesmo lançamento são agrupados por destino (`KITCHEN`/`BAR`) e compartilham o mesmo `batch_id`.
- Eventos de negócio da comanda permanecem em `tab_events`.
- Eventos são imutáveis; exclusão operacional é registrada como anulação compensatória.
- Toda mutação recebe o ator autenticado (`user_id`, nome, perfil), origem e detalhes antes/depois.
- O histórico da comanda é exibido como uma linha do tempo operacional, sem ser confundido com mensagens do WhatsApp.
- Comprovantes de consumo e pagamentos são separados de documentos fiscais.
- Uma emissão/reimpressão deve preservar o snapshot original do documento.

## Regras de operação

1. Somente comandas abertas podem receber novos lançamentos.
2. `PENDING` pode ser editado enquanto não houver aceite da produção.
3. Depois de `ACCEPTED`, `READY` ou `DELIVERED`, a correção deve ser uma anulação/ajuste auditado, sem apagar o pedido original.
4. Item com quantidade já alocada em pagamento ou parcialmente anulada não pode ser reduzido abaixo do comprometido.
5. Item anulado não entra no subtotal nem no comprovante final.
6. Alterações não podem mudar o preço histórico já congelado.
7. Garçom opera consumo; cozinha/bar operam produção. A permissão de lançamento manual é separada da permissão de mudar status.

## Contratos previstos

```text
POST  /admin/api/orders/manual
PATCH /admin/api/orders/:orderId/manual
PATCH /admin/api/orders/:orderId/items/:itemId/manual
POST  /admin/api/orders/:orderId/items/:itemId/void
GET   /admin/api/tables/tabs/:tabId/documents
POST  /admin/api/tables/tabs/:tabId/documents/consumption
POST  /admin/api/tables/tabs/:tabId/documents/:documentId/reprint
```

## Eventos previstos

```text
TAB_ORDER_CREATED
ORDER_ITEM_UPDATED
ORDER_ITEM_VOIDED
ORDER_STATUS_UPDATED
ORDER_CANCELED
PAYMENT_RECORDED
TAB_FINALIZED
DOCUMENT_PRINTED
DOCUMENT_REPRINTED
```

## Escopo atual: operação não fiscal

O produto deve funcionar integralmente sem integração fiscal e sem impressora fiscal. A entrega atual considera:

- comprovante operacional de consumo;
- comprovante de pagamento;
- impressão comum pelo navegador em impressora térmica ou A4;
- salvar como PDF;
- envio do recibo pelo WhatsApp;
- registro de impressão e reimpressão;
- histórico completo da comanda e auditoria de usuário.

Nenhum fluxo de abertura, lançamento, edição, anulação, pagamento ou fechamento pode depender de NFC-e/NF-e.

## Documento operacional x fiscal

- `CONSUMPTION_STATEMENT`: prévia/extrato da comanda.
- `PAYMENT_RECEIPT`: comprovante de pagamento recebido.
- `FISCAL_NFCE` e `FISCAL_NFE`: backlog futuro, fora do escopo atual.

O comprovante interno deve ser identificado como documento operacional não fiscal. A integração fiscal será uma etapa própria, dependente do provedor, certificado e informações tributárias do restaurante.

### Critérios de aceite sem fiscal

1. Um garçom consegue operar a comanda do início ao fim sem NFC-e/NF-e.
2. O cliente consegue receber ou imprimir o consumo sem documento fiscal.
3. O comprovante mostra itens válidos, anulados, subtotal, taxa, total e pagamentos.
4. Toda impressão e reimpressão fica associada ao usuário e ao snapshot emitido.
5. A ausência de impressora fiscal não impede nenhuma operação do restaurante.

## Tasks

### Backend

- [x] Criar migration para snapshot de nome/opções e quantidade anulada em `order_items`.
- [x] Criar migration para documentos emitidos da comanda.
- [x] Centralizar gravação de eventos com ator, origem e antes/depois.
- [x] Implementar lançamento manual transacional agrupado por destino.
- [x] Implementar edição de pedido pendente.
- [x] Implementar anulação de item/pedido com motivo e auditoria.
- [x] Recalcular snapshot financeiro da comanda após cada mutação.
- [x] Emitir eventos `order.created`, `order.updated` e `order.item_voided` para o KDS.
- [x] Implementar geração de comprovante operacional autenticado.
- [x] Implementar registro de impressão e reimpressão.
- [x] Cobrir cálculo após anulação e cenários de validação no checklist de homologação; testes de concorrência dependem de banco de integração disponível.

### Frontend KDS

- [x] Adicionar gestão de comandas no painel Atendimento.
- [x] Adicionar busca por código, mesa e cliente.
- [x] Adicionar modal de lançamento com cardápio, quantidade e observação.
- [x] Adicionar edição/anulação respeitando o status do pedido.
- [x] Adicionar timeline de auditoria com usuário e horário no KDS.
- [x] Adicionar impressão de prévia e comprovante operacional.
- [x] Consumir eventos de pedido atualizado em tempo real.

### Frontend administrativo

- [x] Reutilizar histórico e documentos na consulta de comanda.
- [x] Exibir origem, ator, hash e contagem de impressão do comprovante.
- [x] Permitir consulta e impressão em Comandas, Mesas e Pagamentos.

### Homologação

- [x] Lançar item para cozinha e bar na mesma operação — coberto pelo agrupamento transacional por destino.
- [x] Editar pedido pendente e confirmar atualização no KDS — coberto por `order.updated`.
- [x] Tentar editar pedido aceito e validar bloqueio/ajuste — regra aplicada no backend.
- [x] Anular item antes e depois de pagamento parcial — regra de alocação aplicada no backend.
- [x] Fechar comanda, imprimir e reimprimir comprovante — impressão comum/PDF, sem fiscal.
- [x] Confirmar que nenhum evento perde usuário, horário ou motivo — `tab_events` + auditoria de usuário.
