# Roteiro de Homologacao End-to-End

## Objetivo

Validar os fluxos principais do produto ponta a ponta, cobrindo operacao do tenant, cobranca, pagamentos, KDS, super-admin e suporte.

## Escopo

Este roteiro parte do principio de que:

- `tenant-admin/api`, `tenant-admin/web`, `super-admin/api`, `super-admin/web` e `platform/core-backend` estao atualizados.
- as migrations foram aplicadas
- o ambiente local ou de homologacao esta com banco, RabbitMQ e servicos ativos
- existe ao menos 1 tenant operacional configurado

## Ambientes e URLs

- Tenant Admin Web: `http://localhost:3004/login.html`
- Tenant Admin API: `http://localhost:3002`
- Super Admin Web: `http://localhost:3003/login.html`
- Super Admin API: `http://localhost:3005`
- Core Backend: `http://localhost:8080`

## Massa Minima Recomendada

- 1 tenant com WhatsApp e cardapio configurados
- 1 usuario `ADMIN` do tenant
- 1 usuario operacional do tenant, por exemplo `MANAGER` ou `WAITER`
- 3 itens no cardapio:
  - 1 item simples
  - 1 item com opcionais
  - 1 combo
- 1 mesa/comanda ativa
- 1 pedido pendente
- 1 pagamento PIX pendente
- saldo ou plano suficiente para testar carteira

## Evidencias Esperadas

Ao final da homologacao, salvar:

- prints das telas principais
- exportacao CSV do extrato de mensagens
- exportacao PDF do extrato de mensagens
- 1 print do KDS com SLA e atraso
- 1 print do painel de pagamentos com conciliacao
- 1 print do super-admin em `Operacao`
- 1 print do super-admin em `Confiabilidade`
- ids usados nos testes: `tenant_id`, `tab_id`, `order_id`, `payment_id`, `message_id`

## Ordem Recomendada

1. Setup e login
2. Cardapio e configuracoes
3. Fluxo operacional de mesas e pedidos
4. KDS e SLA
5. Pagamentos e comandas
6. Carteira e extrato
7. Relatorios
8. Equipe e permissoes
9. Bot e flows
10. Super-admin operacional
11. Confiabilidade e suporte
12. Regressao rapida final

## 1. Setup e Login

### Caso 1.1 - Login do tenant-admin

Passos:

- abrir `tenant-admin`
- autenticar com usuario valido
- validar carregamento da home

Esperado:

- login concluido sem erro
- menu lateral renderizado
- sessao persistida ao navegar entre telas

### Caso 1.2 - Login do super-admin

Passos:

- abrir `super-admin`
- autenticar com credencial valida
- acessar menu principal

Esperado:

- sessao autenticada com bearer token valido
- telas `Operacao` e `Confiabilidade` acessiveis

## 2. Cardapio e Configuracoes

### Caso 2.1 - Configuracoes operacionais

Passos:

- abrir `Configuracoes`
- alterar `service_fee_percent`
- alternar `auto_accept_orders`
- alternar `split_enabled`
- salvar

Esperado:

- configuracoes persistidas
- recarregar a pagina e confirmar os valores
- evento auditavel disponivel no tenant

### Caso 2.2 - Item com disponibilidade e estoque

Passos:

- criar ou editar item com horario especifico
- definir estoque simples
- deixar item indisponivel por horario ou estoque

Esperado:

- item refletir disponibilidade correta no admin
- item indisponivel nao ser aceito para novo pedido

### Caso 2.3 - Opcionais e combo

Passos:

- criar grupo de opcionais
- vincular opcionais a item
- criar combo com composicao visivel

Esperado:

- estrutura salva sem erro
- leitura correta no admin
- composicao exibida no fluxo operacional

## 3. Fluxo Operacional de Mesas e Pedidos

### Caso 3.1 - Abertura e uso de comanda

Passos:

- abrir mesa/comanda
- adicionar itens
- confirmar que a comanda mostra totais e historico

Esperado:

- comanda ativa com total consistente
- eventos de abertura e alteracao registrados

### Caso 3.2 - Criacao de pedido

Passos:

- criar pedido com item simples
- criar pedido com item que tenha opcional
- criar pedido com combo

Esperado:

- pedidos aparecem em `Pedidos`
- itens, opcionais e composicao do combo aparecem corretamente

### Caso 3.3 - Cancelamento gerencial

Passos:

- cancelar um pedido usando motivo padronizado

Esperado:

- motivo e categoria persistidos
- pedido some do fluxo ativo
- resumo gerencial reflete o cancelamento

## 4. KDS e SLA

### Caso 4.1 - Entrada do pedido no KDS

Passos:

- abrir o KDS
- gerar novo pedido de cozinha ou bar

Esperado:

- card aparece sem refresh manual pesado
- etapa inicial exibida corretamente

### Caso 4.2 - Transicao de status

Passos:

- mover pedido para `ACCEPTED`
- mover para `READY`
- concluir `DELIVERED` quando aplicavel

Esperado:

- tempos por etapa atualizados
- pedido removido ao finalizar
- resumo operacional acompanha o fluxo

### Caso 4.3 - SLA e atraso

Passos:

- deixar pelo menos 1 pedido passar do tempo esperado

Esperado:

- card muda de estado visual
- atraso aparece no resumo
- gargalo por estacao reflete o caso

## 5. Pagamentos e Comandas

### Caso 5.1 - Geracao de PIX

Passos:

- abrir a comanda
- iniciar pagamento PIX

Esperado:

- QR code ou status pendente exibido
- pagamento aparece no painel `Pagamentos`

### Caso 5.2 - Atualizacao e conciliacao

Passos:

- consultar status do pagamento
- validar tela `Pagamentos`

Esperado:

- painel mostra conciliacao entre pagamento local e provedor
- totais da comanda e pagamentos aprovados ficam coerentes

### Caso 5.3 - Retentativa assistida

Passos:

- usar um pagamento expirado ou falho
- acionar `Gerar novo PIX`

Esperado:

- novo fluxo de cobranca gerado apenas quando permitido
- sem duplicacao incorreta de cobranca ativa

### Caso 5.4 - Preparacao de estorno

Passos:

- abrir detalhe de um pagamento elegivel
- acionar `Preparar estorno`

Esperado:

- valor sugerido e risco operacional exibidos
- evento aparece na trilha da comanda

### Caso 5.5 - Split e reabertura

Passos:

- testar split por pessoa
- testar split por item
- tentar reabrir comanda conforme regra de permissao

Esperado:

- rateio coerente com itens/pessoas
- divergencias financeiras ficam explicitas
- bloqueios de reabertura funcionam

## 6. Carteira e Extrato

### Caso 6.1 - Painel da carteira

Passos:

- abrir `Carteira`
- validar saldo, custo por mensagem, consumidas, restantes

Esperado:

- cards carregam sem erro
- previsao, alerta e fechamento mensal aparecem

### Caso 6.2 - Cobrado x cobertura financeira

Passos:

- validar bloco financeiro do mes
- conferir `equacao do mes`

Esperado:

- leitura coerente para `pre_paid` ou `post_paid`
- valores do mes atual consistentes com consumo

### Caso 6.3 - Competencias faturado x recebido

Passos:

- validar os cards por competencia mensal

Esperado:

- cada competencia mostra `faturado`, `recebido` e status
- se `pre_paid`, mostrar cobertura por saldo e saldos estimados
- se `post_paid`, mostrar aberto/parcial/recebido

### Caso 6.4 - Extrato de mensagens

Passos:

- abrir `Extrato de Mensagens`
- filtrar por origem, telefone e periodo
- exportar CSV
- exportar PDF

Esperado:

- listagem paginada correta
- cada linha mostra telefone, origem, data/hora, descricao e valor
- exportacoes respeitam filtros

## 7. Relatorios

### Caso 7.1 - Indicadores de venda

Passos:

- abrir `Vendas` ou tela equivalente de relatorios
- testar periodo atual e comparativo

Esperado:

- ticket medio, pico por hora e comparativo renderizados
- nenhum erro JS no carregamento

### Caso 7.2 - Margem e cancelamento

Passos:

- validar itens/categorias com custo base configurado
- validar taxa de cancelamento

Esperado:

- margem coerente com custo base
- cancelamentos refletem dados reais do periodo

## 8. Equipe e Permissoes

### Caso 8.1 - CRUD de usuario

Passos:

- criar novo usuario
- editar nome ou papel
- desativar usuario

Esperado:

- operacoes persistidas
- usuario desativado nao acessa mais

### Caso 8.2 - Restricao por papel

Passos:

- autenticar com perfil nao-admin
- tentar acessar telas ou acoes sensiveis

Esperado:

- menus ocultos ou restritos conforme papel
- backend protege mesmo que a rota seja chamada manualmente

### Caso 8.3 - Troca e reset de senha

Passos:

- trocar senha do usuario logado
- testar reset assistido em outro usuario

Esperado:

- ambas as operacoes funcionam
- auditoria registra os eventos

## 9. Bot e Flows

### Caso 9.1 - Flows publicados

Passos:

- abrir a tela de configuracao do bot
- listar flows publicados
- abrir versoes

Esperado:

- versoes renderizadas corretamente
- preview JSON abre sem erro

### Caso 9.2 - Diff, sandbox e rollback

Passos:

- comparar versao atual com anterior
- testar sandbox
- executar rollback controlado

Esperado:

- diff inteligivel
- rollback publica a versao esperada
- historico mantem ator e motivo

## 10. Super Admin Operacional

### Caso 10.1 - Painel Operacao

Passos:

- abrir `Operacao`
- revisar health score, onboarding e riscos

Esperado:

- tenants com problema aparecem sinalizados
- saldo em risco, consumo anormal, falha de webhook e fila travada aparecem quando houver dados

### Caso 10.2 - Auditoria do operador

Passos:

- executar ao menos 1 acao auditavel no super-admin
- abrir trilha do operador

Esperado:

- acao aparece com identificacao e contexto corretos

## 11. Confiabilidade e Suporte

### Caso 11.1 - Painel de incidentes

Passos:

- abrir `Confiabilidade`
- revisar cards e incidentes recentes

Esperado:

- incidentes carregam sem consulta manual em banco
- acoes disponiveis aparecem por tipo de incidente

### Caso 11.2 - Correlacao

Passos:

- pesquisar por `tenant_id`
- pesquisar por `message_id`
- pesquisar por `payment_id`

Esperado:

- resultados correlacionados retornam com contexto suficiente para suporte

### Caso 11.3 - DLQ e filas

Passos:

- validar painel de filas e DLQ

Esperado:

- filas sem consumidor ou DLQ aparecem destacadas
- peek da DLQ funciona quando existir mensagem

### Caso 11.4 - Retentativa manual

Passos:

- executar retry de outbox ou inbox em incidente elegivel

Esperado:

- acao concluida sem SQL manual
- log de auditoria do super-admin registra a tentativa

## 12. Regressao Rapida Final

Executar ao final:

- abrir `Carteira`, `Extrato`, `Pedidos`, `Mesas`, `Pagamentos`, `Cardapio`, `Relatorios`, `Equipe`
- abrir `Operacao` e `Confiabilidade` no super-admin
- validar ausencia de erro visivel no browser
- validar que as paginas principais carregam apos refresh completo

## Critero de Aprovacao

Homologacao aprovada quando:

- todos os fluxos criticos acima passam
- nao existe bloqueio funcional em `pedido`, `pagamento`, `carteira` ou `login`
- auditoria e telas operacionais refletem as acoes realizadas
- suporte consegue investigar um incidente sem acessar o banco manualmente

## Registro de Resultado

Usar este formato por caso:

```text
Caso:
Responsavel:
Data:
Resultado: Aprovado | Aprovado com ressalva | Reprovado
Evidencia:
Observacoes:
```
