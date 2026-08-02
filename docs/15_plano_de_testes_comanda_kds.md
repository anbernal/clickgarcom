# Plano de testes — Comanda, KDS e operação não fiscal

## 1. Objetivo

Validar que o garçom consegue operar uma comanda pelo KDS com segurança, rastreabilidade e consistência entre atendimento, produção, financeiro e comprovante operacional.

NFC-e, NF-e, SEFAZ e impressora fiscal não fazem parte deste plano.

## 2. Pré-condições

- PostgreSQL disponível e migration `000038_order_audit_snapshots_and_documents` aplicada.
- RabbitMQ/WebSocket disponíveis para validar atualização em tempo real.
- Cardápio com pelo menos:
  - um item destinado à cozinha;
  - um item destinado ao bar;
  - um item indisponível;
  - um item com opções/adicionais.
- Usuários de teste: administrador, gerente, garçom, caixa, cozinha e bar.
- Uma comanda aberta com mesa e outra sem mesa.
- Uma comanda com pagamento parcial.

## 3. Massa de dados sugerida

| Dado | Exemplo |
|---|---|
| Mesa | Mesa 10 |
| Comanda | Código público gerado pelo sistema |
| Item cozinha | Hambúrguer — R$ 30,00 |
| Item bar | Refrigerante — R$ 8,00 |
| Item com adicional | Hambúrguer + bacon |
| Quantidades | 1, 2 e 3 unidades |
| Pagamento parcial | R$ 10,00 de uma comanda de R$ 38,00 |

## 4. Criticidade

- **P0:** impede operação, gera cobrança incorreta ou perde auditoria.
- **P1:** operação funciona, mas há inconsistência visual, de evento ou documento.
- **P2:** melhoria de usabilidade ou mensagem.

## 5. Testes funcionais

### CT-01 — Abertura e visualização

1. Abrir uma comanda com mesa.
2. Abrir uma comanda sem mesa.
3. Acessar o KDS no painel Atendimento.

Resultado esperado: as duas comandas aparecem com código, mesa/local, total e ações disponíveis.

### CT-02 — Busca no KDS

Pesquisar por código, número da mesa, telefone e Instagram.

Resultado esperado: somente as comandas correspondentes são exibidas; limpar a busca restaura a lista.

### CT-03 — Lançamento para cozinha e bar

1. Selecionar itens da cozinha e do bar na mesma operação.
2. Confirmar o lançamento.
3. Verificar os painéis Cozinha e Bar.
4. Consultar o histórico da comanda.

Resultado esperado:

- um lote operacional é criado;
- pedidos são agrupados por destino;
- ambos aparecem no setor correto;
- o total da comanda é recalculado;
- há evento `TAB_ORDER_CREATED` com usuário, origem e quantidade de linhas.

### CT-04 — Opções, quantidade e observações

Lançar item com adicional, quantidade maior que 1 e observação.

Resultado esperado: preço, opções, observação e snapshot do nome aparecem corretamente no KDS, comanda e comprovante.

### CT-05 — Edição de pedido pendente

Alterar quantidade, observação do item e observação geral enquanto o pedido estiver `PENDING`.

Resultado esperado: alteração salva, total recalculado, evento `ORDER_ITEM_UPDATED` registrado e `order.updated` recebido no KDS.

### CT-06 — Bloqueio de edição após aceite

Aceitar o pedido e tentar editar quantidade/observação.

Resultado esperado: API bloqueia a edição. A correção deve ocorrer por anulação auditada.

### CT-07 — Anulação sem pagamento

Anular parte ou toda a quantidade de um item, informando motivo.

Resultado esperado:

- pedido original permanece preservado;
- quantidade efetiva é reduzida;
- item anulado não entra no total nem no comprovante;
- motivo, usuário e horário aparecem no histórico;
- evento `ORDER_ITEM_VOIDED` é publicado.

### CT-08 — Anulação com pagamento parcial

1. Alocar parte da quantidade em pagamento.
2. Tentar anular quantidade já alocada.
3. Tentar anular somente a quantidade ainda disponível.

Resultado esperado: a primeira tentativa é bloqueada; a segunda é permitida e recalcula apenas o saldo não comprometido.

### CT-09 — Fechamento da comanda

Fechar uma comanda sem saldo pendente e consultar seus detalhes.

Resultado esperado: status, usuário, horário, total e pagamentos permanecem consistentes no KDS e nas telas administrativas.

### CT-10 — Comprovante operacional

Emitir comprovante em comanda aberta e fechada.

Resultado esperado: documento mostra nome, CPF/CNPJ, endereço e contato cadastrados do restaurante; número operacional, comanda, mesa, emissão, atendente, itens efetivos com quantidade/valor unitário/total, subtotal, taxa, total e pagamentos; contém identificação clara de “documento não fiscal” e não apresenta NFC-e, chave de acesso ou protocolo fiscal.

Emitir pedidos com observação real, sem observação e com registros legados contendo `&lt;nil&gt;`.

Resultado esperado: somente a observação real é exibida; valores nulos ou equivalentes não geram rótulo `Obs.` no KDS, edição, resumo ou comprovante.

### CT-11 — Impressão e reimpressão

1. Imprimir pelo KDS.
2. Imprimir por Comandas, Mesas, Pagamentos e Consulta de Comanda.
3. Reimprimir o mesmo documento.
4. Salvar como PDF.

Resultado esperado: impressão funciona sem impressora fiscal; snapshot permanece igual; hash, origem, ator e contador de impressão são preservados; eventos `DOCUMENT_PRINTED` e `DOCUMENT_REPRINTED` aparecem no histórico.

5. Alterar os dados cadastrais do restaurante depois da emissão e reimprimir o documento anterior.

Resultado esperado: a reimpressão conserva os dados cadastrais que estavam no snapshot original; somente um novo comprovante usa o cadastro atualizado.

### CT-12 — Tempo real

Com o KDS aberto em duas sessões, lançar, editar e anular um pedido em uma sessão.

Resultado esperado: a outra sessão atualiza sem recarregar manualmente e sem duplicar eventos.

## 6. Testes de permissão

| Ação | Admin/Gerente | Garçom | Caixa | Cozinha/Bar |
|---|---:|---:|---:|---:|
| Consultar comanda | Sim | Sim | Sim | Não |
| Lançar pedido manual | Sim | Sim | Não | Não |
| Editar/anular item | Sim | Sim | Não | Não |
| Alterar status de preparo | Sim | Conforme regra existente | Não | Sim, no próprio setor |
| Emitir comprovante | Sim | Sim | Sim | Não |
| Reabrir comanda fechada | Sim | Não | Não | Não |

Cada tentativa não autorizada deve retornar erro, não alterar dados e não criar evento falso de sucesso.

## 7. Testes de auditoria

Para cada mutação, verificar `tab_events` e o log de auditoria:

- ator autenticado;
- perfil do ator;
- data/hora;
- origem (`KDS` ou tela administrativa);
- motivo, quando aplicável;
- estado anterior e posterior;
- pedido, item, lote e comanda relacionados.

Não deve existir exclusão física de pedido ou item como forma de correção operacional.

## 8. Testes de API e consistência

- Repetir requisição de lançamento com o mesmo payload e verificar comportamento sem duplicação acidental.
- Tentar lançar em comanda fechada.
- Tentar lançar item de outro tenant.
- Tentar usar item inexistente ou indisponível.
- Tentar quantidade zero, decimal, negativa e maior que 99.
- Tentar reduzir abaixo da quantidade paga ou anulada.
- Executar duas anulações concorrentes no mesmo item.
- Confirmar que o total da comanda nunca fica negativo.

## 9. Testes automatizados

Executar na raiz do projeto:

```bash
cd apps/tenant-admin/api && npm run build
cd ../../../platform/core-backend && go test ./...
cd ../.. && node --check apps/tenant-admin/web/public/js/kds.js
git diff --check
```

Também deve ser executado um teste de integração com PostgreSQL para CT-03, CT-08, CT-09 e CT-11.

## 10. Critérios de aprovação

A entrega é aprovada quando:

- todos os testes P0 passam;
- nenhum total financeiro diverge após edição/anulação;
- nenhuma ação sem permissão altera dados;
- toda mutação relevante possui ator e horário;
- impressão e PDF funcionam sem integração fiscal;
- eventos em tempo real chegam sem duplicação;
- migration e consultas funcionam em banco limpo e banco com dados existentes.

## 11. Registro de evidências

Para cada caso registrar:

```text
Caso:
Data/hora:
Usuário/perfil:
Ambiente:
Resultado: PASS / FAIL / BLOCKED
Evidência: screenshot, log, ID da comanda, ID do evento ou hash do documento
Observação:
```

## 12. Bloqueios conhecidos

Sem PostgreSQL, RabbitMQ e WebSocket disponíveis, é possível executar apenas build, testes unitários, validação estática e revisão de contrato. Os testes de transação, auditoria persistida, concorrência e impressão com snapshot dependem do ambiente integrado.

## 13. Testes automatizados de UX do KDS

Executar:

```bash
cd apps/tenant-admin/web
npm install
npm run test:kds-ux
```

A suíte cobre:

- modo estação automático para Cozinha/Bar;
- quatro contadores operacionais e remoção da navegação redundante;
- tamanho de quantidade, prato, observação e ação touch;
- navegação do Salão por perfil e preservação da aba ativa;
- estados de mesa e prioridade de conversas aguardando resposta;
- agregação por prato/opções, exclusão de item anulado e ausência de duplicação;
- cenário com `60` pedidos e verificação de rolagem horizontal.
- cenário com `300` comandas, paginação de `25` linhas, busca, filtro por local e responsividade.

## 14. Evidência de desempenho local — 02/08/2026

Ambiente: Chrome headless, viewport `1366×768`, seis itens por pedido.

| Pedidos ativos | Carga até cartões visíveis | 10 renderizações | Agregação local | Cards únicos | Overflow horizontal |
|---:|---:|---:|---:|---:|---:|
| 15 | 962 ms | 11,8 ms | 0,1 ms | 15/15 | Não |
| 30 | 959 ms | 9,6 ms | < 0,1 ms | 30/30 | Não |
| 60 | 1.085 ms | 19,5 ms | < 0,1 ms | 60/60 | Não |

Decisão: manter a agregação no navegador nesta etapa. O custo medido com `60` pedidos não justifica criar endpoint agregado; reavaliar somente se a carga real superar esse cenário ou se dispositivos de bancada apresentarem desempenho significativamente inferior.

Essas medições não substituem o teste em monitor físico a aproximadamente três metros nem o smoke test após publicação.
