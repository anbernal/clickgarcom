# Homologação — comanda manual e documento operacional

## Escopo

Este roteiro valida a operação sem NFC-e, NF-e ou impressora fiscal. A impressão usa o diálogo comum do navegador e pode ser direcionada para impressora térmica, A4 ou PDF.

## Validações automatizadas executadas

- `npm run build` em `apps/tenant-admin/api` — aprovado.
- `node --check` nos scripts do KDS e telas administrativas — aprovado.
- `go test ./...` em `platform/core-backend` — aprovado.
- `git diff --check` — aprovado.

## Cenários funcionais

1. Abrir uma comanda e, no KDS, buscar por código, mesa ou cliente.
2. Lançar simultaneamente itens destinados à cozinha e ao bar. O backend cria um lote comum e pedidos separados por destino.
3. Editar observação/quantidade enquanto o pedido estiver `PENDING`; confirmar o evento `ORDER_ITEM_UPDATED` no histórico.
4. Tentar editar um pedido `ACCEPTED`, `READY` ou `DELIVERED`; a API deve bloquear a edição. Usar anulação auditada para correção após aceite.
5. Anular quantidade antes de pagamento parcial e confirmar que ela sai do total e do comprovante.
6. Tentar anular quantidade já alocada em pagamento; a API deve impedir a redução abaixo do valor alocado.
7. Fechar a comanda, emitir o comprovante operacional, imprimir ou salvar em PDF e reimprimir. Conferir `contentHash`, usuário, origem e contador de impressão.
8. Abrir o histórico no KDS, Comandas, Mesas e Pagamentos e confirmar ator, horário, motivo, alterações antes/depois e eventos de documento.

## Dependência de ambiente

A migração `000038_order_audit_snapshots_and_documents` está pronta, mas não foi aplicada nesta execução porque o PostgreSQL local está parado (`clickgarcom-postgres exited`). Assim que o banco estiver disponível, executar o comando de migração do ambiente e repetir os cenários 1–8 com dados de teste.

## Fora do aceite atual

NFC-e, NF-e, certificado digital, SEFAZ, SAT/MFE e impressora fiscal permanecem backlog e não são necessários para nenhum fluxo acima.
