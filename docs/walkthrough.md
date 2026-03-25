# Walkthrough: Mapa da Documentação do ClickGarcom

## Objetivo

Centralizar a navegacao da documentacao do projeto com links e descricoes que batem com o estado atual do repositorio.

## Documentos principais

### 1. [README](../../README.md)

Ponto de entrada para subir a stack, entender as URLs locais e ver os servicos disponiveis.

Use quando:
- estiver começando no projeto
- precisar dos comandos principais
- quiser validar a stack local rapidamente

### 2. [project_architecture.md](project_architecture.md)

Visao de arquitetura do sistema, responsabilidades entre servicos, fluxos assincronos e padroes principais.

Use quando:
- precisar entender limites entre `go-core` e `node-admin`
- for mexer em webhook, worker, filas, KDS ou sessoes
- quiser revisar contratos e componentes principais

### 3. [quick_reference.md](quick_reference.md)

Guia operacional com comandos do `Makefile`, fluxos comuns, troubleshooting e URLs locais.

Use quando:
- estiver rodando o ambiente no dia a dia
- precisar criar migration, subir servicos ou abrir logs
- quiser lembrar portas, credenciais e atalhos

### 4. Documentacao funcional por area

- [01_visao_geral.md](01_visao_geral.md): contexto de produto e personas
- [02_regras_bot_whatsapp.md](02_regras_bot_whatsapp.md): regras do bot e comportamento esperado
- [03_gestao_mesas_comandas.md](03_gestao_mesas_comandas.md): fluxo de mesas, comandas e atendimento
- [04_pedidos_cardapio.md](04_pedidos_cardapio.md): pedidos, cardapio e operacao
- [05_painel_admin.md](05_painel_admin.md): visao do painel administrativo
- [06_bot_config_architecture.md](06_bot_config_architecture.md): configuracao de templates e conversation flows
- [07_whatsapp_interactive_menu_architecture.md](07_whatsapp_interactive_menu_architecture.md): proposta do cardapio interativo no WhatsApp
- [08_backlog_execucao_produto.md](08_backlog_execucao_produto.md): backlog de produto com 16 epics entregues
- [09_performance_hotspots.md](09_performance_hotspots.md): hotspots de performance e otimizacoes
- [10_roteiro_homologacao_e2e.md](10_roteiro_homologacao_e2e.md): roteiro de homologacao end-to-end

## Como usar esta documentacao

### Onboarding

1. Leia o [README](../../README.md).
2. Consulte [quick_reference.md](quick_reference.md) para subir o ambiente.
3. Leia [project_architecture.md](project_architecture.md) para entender a arquitetura.
4. Aprofunde nos documentos funcionais da area em que vai mexer.

### Desenvolvimento diario

1. Use [quick_reference.md](quick_reference.md) como referencia operacional.
2. Use [project_architecture.md](project_architecture.md) ao mexer em contratos, filas ou dominio.
3. Use os documentos `01` a `07` para regras de negocio e direcao de produto.

### Ao implementar mudancas

1. Verifique no codigo qual servico e dono da responsabilidade.
2. Confirme se a documentacao usada ainda bate com o codigo atual.
3. Se a mudanca alterar fluxo, endpoint, fila, status ou ownership, atualize a documentacao correspondente.

## Observacao

Arquivos antigos referenciados fora deste conjunto, como `implementation_phases.md` ou links absolutos gerados fora do repositorio, nao devem mais ser considerados fonte de verdade.
