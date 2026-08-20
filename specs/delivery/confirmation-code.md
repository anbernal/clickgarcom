# Confirmação de recebimento da entrega

Esta evolução substitui, para novas entregas, a conclusão administrativa sem
prova de recebimento descrita na primeira versão do Delivery V2.

## Contrato funcional

- Ao iniciar a rota, o backend gera um código aleatório hexadecimal de quatro
  caracteres (`0000` a `FFFF`) e armazena somente seu HMAC.
- A mensagem de saída usa o nome atual do cliente, envia o código e oferece um
  botão URL **Finalizar entrega** para o acompanhamento autenticado.
- O código nunca é retornado pela API, pelo websocket, pelo Admin ou pela página
  pública. O cliente o conhece exclusivamente pela mensagem do WhatsApp.
- O operador conclui a entrega própria pelo Admin e o cliente pode concluir pelo
  link autenticado; ambos precisam informar o código. O primeiro sucesso marca
  Delivery e fulfillment como `DELIVERED` e invalida o desafio.
- Desafios numéricos legados de seis dígitos permanecem aceitos até expirarem.
- Cinco tentativas inválidas bloqueiam o desafio. A conclusão assistida de
  Manager/Admin continua sendo a exceção auditada para incidentes operacionais.

## Segurança e auditoria

- O link carrega a credencial no fragmento e a troca por cookie `HttpOnly`.
- O endpoint público autoriza tenant e entrega pela credencial antes de validar
  o código, possui rate limit e não aceita conclusão antes de `IN_TRANSIT`.
- Logs e previews do outbox removem códigos numéricos legados e novos códigos
  hexadecimais; idempotência usa apenas uma impressão HMAC do valor.
- Eventos registram `PIN_OPERATOR`, `PIN_CUSTOMER` ou o override administrativo,
  sem persistir o código em metadata.

## Critérios de aceite

1. O texto não usa “Cliente” quando há nome no cadastro ou snapshot.
2. A saída cria um único desafio/link e uma única mensagem idempotente.
3. Código incorreto não conclui e incrementa a tentativa de forma transacional.
4. Admin e cliente conseguem concluir com o código correto.
5. O estado muda em tempo real no Admin/KDS/acompanhamento e a mensagem final já
   existente continua sendo enviada.
6. O KDS Mobile não faz parte desta entrega.
