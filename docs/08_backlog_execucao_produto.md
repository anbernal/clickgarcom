# Backlog de Execucao de Produto

Este documento transforma as sugestoes de melhoria em tasks executaveis, alinhadas com a arquitetura atual do projeto.

## Ordem de Execucao Recomendada

1. Transparencia financeira completa
2. Gestao operacional de pedidos e KDS
3. Gestao de usuarios e permissoes
4. Exposicao das configuracoes ja existentes do tenant
5. Relatorios gerenciais
6. Conciliacao de pagamentos e trilha de auditoria
7. Evolucao do cardapio
8. Super-admin operacional
9. Evolucao do bot e fluxos
10. Hardening tecnico global

## Epic 01 - Carteira e Cobranca Transparente

Status: Concluido

Objetivo:
Deixar evidente para o tenant o que foi consumido, o que foi cobrado, qual o ritmo de uso e qual o risco de saldo.

Tasks:
- [x] Expor previsao de consumo na API da carteira com media diaria, projecao do mes e projecao dos proximos 30 dias.
- [x] Expor alerta de saldo baixo com nivel `warning` e `critical`, dias estimados restantes e sugestao de recarga.
- [x] Expor fechamento mensal atual e anterior com mensagens `IN`, `OUT`, total e valor.
- [x] Implementar exportacao CSV do extrato de mensagens com os filtros ja existentes.
- [x] Adicionar CTA de exportacao no extrato.
- [x] Adicionar bloco de fechamento mensal na tela da carteira.
- [x] Adicionar bloco de previsao/alerta de saldo na tela da carteira.
- [x] Implementar exportacao PDF do extrato via janela de impressao do navegador, respeitando os filtros ativos.
- [x] Entregar painel financeiro mensal com `cobrado x cobertura financeira` para pre-pago e `cobrado x fechamento` para pos-pago.
- [ ] Evoluir para fechamento `faturado x recebido` quando existir entidade de invoice/competencia explicita.

Criterios de pronto:
- Tenant consegue entender consumo passado, previsao futura e risco atual sem precisar abrir suporte.
- Extrato exporta o recorte filtrado em CSV.
- Carteira mostra resumo mensal e alerta visivel quando o saldo estiver em risco.

## Epic 02 - Operacao e Pedidos com SLA

Status: Concluido

Objetivo:
Transformar o KDS de fila operacional em ferramenta de gestao com tempo, atraso e gargalo por etapa.

Tasks:
- [x] Registrar e expor tempo por etapa do pedido: criado, aceito, pronto, entregue.
- [x] Configurar SLA por estacao: cozinha, bar e atendimento.
- [x] Destacar pedidos atrasados visualmente no KDS.
- [x] Criar cards de gargalo por estacao com quantidade e tempo medio.
- [x] Adicionar relatorio de atraso por faixa de tempo.
- [x] Padronizar motivos de cancelamento no admin.
- [x] Separar cancelamento operacional, cancelamento de estoque e cancelamento por cliente.
- [x] Registrar usuario responsavel por cancelamento.
- [x] Criar visao de volume por turno.

Criterios de pronto:
- Operacao consegue ver backlog, atraso e gargalo sem depender de interpretacao manual.
- Cancelamentos viram dado gerencial.

## Epic 03 - Mesas e Comandas Assistidas

Status: Concluido

Objetivo:
Evoluir o fluxo de mesa/comanda para fechamento assistido e auditavel.

Tasks:
- [x] Implementar split por pessoa.
- [x] Implementar split por item.
- [x] Exibir total original, total rateado e diferenca pendente.
- [x] Permitir reabertura controlada de comanda fechada.
- [x] Criar historico de eventos da comanda.
- [x] Registrar quem abriu, fechou, reabriu ou alterou uma comanda.
- [x] Exibir divergencias entre total da comanda, pagamentos aprovados e valor ainda devido.
- [x] Criar bloqueios para reabertura com pagamento finalizado, com permissao especial.

Criterios de pronto:
- Caixa ou garcom consegue fechar conta com suporte visual, sem calculo manual.
- Qualquer divergencia fica explicita.

## Epic 04 - Relatorios Gerenciais

Status: Concluido

Objetivo:
Sair do relatorio basico e entregar visao gerencial de venda, operacao e perda.

Tasks:
- [x] Adicionar margem por item e por categoria.
- [x] Adicionar taxa de cancelamento e valor perdido.
- [x] Adicionar tempo medio de preparo e tempo medio ate aceite.
- [x] Adicionar ticket medio por faixa horaria.
- [x] Adicionar pico por hora e por dia.
- [x] Adicionar comparativo de periodo contra periodo anterior.
- [x] Adicionar itens com baixa conversao no cardapio.
- [x] Adicionar ranking de categorias.

Observacao:
- A margem depende do custo base configurado no cardapio. O painel agora explicita a cobertura de custo para evitar leitura enganosa.

Criterios de pronto:
- Gestor consegue responder o que vende mais, o que atrasa mais e o que perde dinheiro.

## Epic 05 - Configuracoes Operacionais do Restaurante

Status: Concluido

Objetivo:
Dar autonomia ao tenant para ajustar regras do negocio que hoje estao escondidas no modelo.

Tasks:
- [x] Expor `service_fee_percent` na tela de configuracoes.
- [x] Expor `auto_accept_orders`.
- [x] Expor `split_enabled`.
- [x] Expor `nps_enabled`.
- [x] Expor `voucher_enabled`.
- [x] Criar validacoes e ajuda contextual para cada flag.
- [x] Registrar historico de alteracao de configuracoes sensiveis.

Criterios de pronto:
- Tenant consegue ajustar regras basicas sem acionar o super-admin ou mexer direto no banco.

## Epic 06 - Bot e Fluxos Publicados

Status: Em andamento

Objetivo:
Transformar o versionamento de flow em funcionalidade usavel de produto.

Tasks:
- [ ] Criar listagem de versoes publicadas por `key`.
- [ ] Criar diff entre versao atual e versao anterior.
- [ ] Criar preview do JSON/definicao formatada.
- [ ] Criar botao de rollback com 1 clique.
- [ ] Criar ambiente de teste/sandbox para fluxo antes de publicar.
- [ ] Registrar ator da publicacao e motivo da alteracao.

Criterios de pronto:
- Tenant consegue publicar com seguranca e desfazer publicacoes ruins rapidamente.

## Epic 07 - Cardapio Avancado

Status: Planejado

Objetivo:
Sair do cardapio flat e aumentar flexibilidade comercial.

Tasks:
- [x] Adicionar opcionais/complementos por item.
- [x] Adicionar combos.
- [x] Adicionar imagens.
- [x] Adicionar disponibilidade por horario.
- [x] Adicionar estoque simples.
- [x] Bloquear venda de item indisponivel por regra de estoque/horario.
- [x] Exibir disponibilidade no bot e no admin.

Criterios de pronto:
- Gestor consegue modelar cardapio real de restaurante sem gambiarras.

Observacao:
- A selecao estruturada de opcionais dentro do fluxo de pedido fica como proximo lote operacional do cardapio.

## Epic 08 - Usuarios e Permissoes

Status: Concluido

Objetivo:
Transformar a matriz de papeis em controle real de equipe.

Tasks:
- [x] Criar CRUD de usuarios internos do tenant.
- [x] Permitir trocar senha.
- [x] Permitir desativar usuario.
- [x] Restringir paginas do frontend por papel.
- [x] Restringir acoes sensiveis por papel.
- [x] Criar tela de auditoria de acessos e acoes.
- [x] Criar fluxo de reset assistido de senha.

Criterios de pronto:
- O tenant opera com equipe multiusuario sem compartilhar login de admin.

## Epic 09 - Super Admin Operacional

Status: Planejado

Objetivo:
Tirar o super-admin do papel apenas cadastral e levar para monitoramento ativo da base.

Tasks:
- [ ] Criar health score por tenant.
- [ ] Criar checklist de onboarding.
- [ ] Detectar tenant sem token Meta ou configuracao essencial.
- [ ] Detectar saldo em risco.
- [ ] Detectar consumo anormal.
- [ ] Detectar fila travada, webhook falhando e outbox acumulado.
- [ ] Registrar trilha de acao do operador do super-admin.

Criterios de pronto:
- Operacao central identifica risco de tenant antes do cliente reclamar.

## Epic 10 - Pagamentos e Conciliacao

Status: Concluido

Objetivo:
Dar visibilidade operacional e financeira ao fluxo de pagamentos.

Tasks:
- [x] Criar painel de pagamentos por status.
- [x] Exibir tentativas, rejeicoes e pendencias.
- [x] Exibir conciliacao entre pagamento local e webhook do provedor.
- [x] Criar retentativa manual assistida.
- [x] Criar baixa manual assistida com auditoria.
- [x] Preparar fluxo de estorno.
- [x] Exibir divergencia entre comanda, pagamento aprovado e saldo restante.

Criterios de pronto:
- Financeiro e operacao conseguem investigar pagamentos sem abrir o banco.

## Epic 11 - Performance

Status: Planejado

Objetivo:
Reduzir N+1 e preparar o sistema para crescimento de tenants e eventos.

Tasks:
- [ ] Revisar N+1 de categorias.
- [ ] Revisar N+1 de mesas/comandas.
- [ ] Revisar agregacoes em memoria de relatorios.
- [ ] Consolidar consultas analiticas em SQL.
- [ ] Mapear necessidade de materialized views.
- [ ] Criar benchmark simples para relatorios e telas criticas.

Criterios de pronto:
- Relatorios e telas operacionais mantem tempo de resposta previsivel sob carga maior.

## Epic 12 - Auditoria

Status: Planejado

Objetivo:
Registrar trilha clara de alteracoes criticas do sistema.

Tasks:
- [ ] Auditar cancelamento de pedido.
- [ ] Auditar fechamento/reabertura de comanda.
- [ ] Auditar mudanca de status de pedido.
- [ ] Auditar ajuste de carteira.
- [ ] Auditar edicao de configuracao sensivel.
- [ ] Auditar mudancas no super-admin.

Criterios de pronto:
- Toda acao financeira ou operacional critica fica rastreavel por usuario, data e contexto.

## Epic 13 - Observabilidade de Negocio

Status: Planejado

Objetivo:
Complementar a observabilidade tecnica com metricas de negocio por tenant.

Tasks:
- [ ] Criar metricas por tenant para falha de webhook.
- [ ] Criar metricas de fila atrasada.
- [ ] Criar metricas de outbox represado.
- [ ] Criar metricas de tempo medio ate aceite.
- [ ] Criar metricas de taxa de cancelamento.
- [ ] Criar metricas de conversao de pagamento.
- [ ] Criar dashboard de negocio por tenant.

Criterios de pronto:
- O time consegue detectar degradacao operacional e financeira com telemetria objetiva.

## Epic 14 - Seguranca

Status: Planejado

Objetivo:
Endurecer acesso administrativo e reduzir superficie de risco.

Tasks:
- [ ] Substituir chave estatica simples do super-admin por autenticacao forte.
- [ ] Permitir rotacao de segredo.
- [ ] Adicionar allowlist de IP para operacao sensivel.
- [ ] Criar log de acesso e falha de autenticacao.
- [ ] Revisar exposicao de segredos e configuracoes em respostas.

Criterios de pronto:
- Super-admin deixa de depender de um unico header estatico para acesso.

## Epic 15 - Confiabilidade e Suporte

Status: Planejado

Objetivo:
Melhorar recuperacao operacional e investigacao de incidentes.

Tasks:
- [ ] Criar dashboard de DLQ.
- [ ] Criar retentativa manual para fluxos criticos.
- [ ] Criar correlacao por `tenant_id`, `message_id` e `payment_id`.
- [ ] Criar visao de incidentes recentes.
- [ ] Criar ferramentas internas para suporte sem acesso direto ao banco.

Criterios de pronto:
- Suporte consegue investigar e resolver incidente com menos tempo e menos SQL manual.

## Lote Atual em Execucao

Escopo desta rodada:
- [x] Documentar backlog detalhado no repositorio.
- [x] Implementar previsao de consumo na carteira.
- [x] Implementar alerta de saldo baixo na carteira.
- [x] Implementar fechamento mensal resumido.
- [x] Implementar exportacao CSV do extrato filtrado.
