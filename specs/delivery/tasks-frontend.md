# Tasks de Frontend Admin — Delivery V2

## Escopo da trilha

Esta trilha adapta o Tenant Admin Web para configuração do módulo, entrega própria simplificada, operadores externos, clientes/endereços e painel operacional.

O frontend não calcula tarifa como fonte de verdade, não guarda credenciais e não implementa tracking/PIN próprio.

## DEL-V2-FE-001 — Atualizar contratos, rotas e feature flag

- Status: [x] Implementação local concluída — grupos de acesso, `DISPATCHER`, navegação, cliente API V2 e fixtures fake
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seções 4, 5 e 18

Implementação:

- atualizar tipos/enums/client API V2;
- adicionar `DISPATCHER` e grupos de permissão;
- condicionar menus a `delivery.enabled`;
- preservar acesso à configuração para Admin autorizado;
- normalizar erros e conflitos;
- criar fixtures OWN/EXTERNAL/falha.

Critérios de aceite:

- tenant sem módulo não vê navegação quebrada;
- papel sem permissão não recebe dados no DOM;
- frontend antigo tolera respostas durante rollout;
- nenhum código depende de driver individual/PIN.

## DEL-V2-FE-002 — Criar shell de configuração V2

- Status: [x] Implementação local concluída — ativação, modalidade, capacidade própria, área, agenda, taxas, confirmação de desativação e versão da última alteração
- Prioridade: P0
- Dependências: DEL-V2-FE-001, DEL-V2-BE-009
- Especificação: seções 5 e 22.1

Implementação:

- painel já expõe modalidade padrão, capacidade própria e regras do operador;
- criar seções ativação, modalidade, origem, endereços, própria e externa;
- mostrar pré-requisitos e validações bloqueantes;
- exigir confirmação para ativar/desativar;
- exibir versão/última alteração;
- preservar formulário em erro parcial;
- salvar settings sem credenciais.

Critérios de aceite:

- ativação inválida explica campos faltantes;
- mudança de modalidade alerta que só afeta novos pedidos;
- desativação não oculta entregas ativas;
- reload renderiza exatamente o snapshot salvo.

## DEL-V2-FE-003 — Criar gestão administrativa de clientes e endereços

- Status: [x] Implementação local concluída — busca por telefone, cinco endereços, CRUD, default, CEP, geocode assistido e auditoria
- Prioridade: P0
- Dependências: DEL-V2-FE-001, DEL-V2-BE-004 a DEL-V2-BE-007
- Especificação: seções 6, 7 e 22.4

Implementação:

- buscar cliente por telefone dentro do tenant;
- mascarar telefone em resultados;
- listar cinco endereços, default e último uso;
- cadastrar via CEP ou manual;
- geocodificar e confirmar;
- editar e excluir com confirmação;
- indicar que histórico não será alterado;
- auditar ator.

Critérios de aceite:

- sexto endereço não é enviado;
- endereço de outro tenant nunca aparece;
- CEP indisponível não apaga formulário;
- excluir default atualiza lista;
- acessibilidade de formulário e erros aprovada.

## DEL-V2-FE-004 — Configurar e simular tarifa própria

- Status: [x] Implementação local concluída — `NONE`, `FIXED`, `DISTANCE_BANDS`, `PER_KM` e `HYBRID` com simulador autoritativo
- Prioridade: P0
- Dependências: DEL-V2-FE-002, DEL-V2-BE-010
- Especificação: seções 5.2, 9.2 e 22.1

Implementação:

- suportar FIXED, DISTANCE_BANDS, PER_KM e HYBRID;
- editar base, km incluído, por km, mínimo e arredondamento;
- editar faixas e adicionais;
- validar overlap/buraco antes de enviar;
- usar endpoint de simulação autoritativo;
- mostrar breakdown e fora de área.

Critérios de aceite:

- troca de modo não perde configuração sem aviso;
- simulador não replica fórmula local;
- centavos e locale pt-BR são consistentes;
- configuração inválida aponta linha/campo.

## DEL-V2-FE-005 — Configurar e operar capacidade própria

- Status: [x] Implementação local concluída — quantidade própria, aviso persistente abaixo das reservas, consulta detalhada e ações saiu/entregue
- Prioridade: P0
- Dependências: DEL-V2-FE-002, DEL-V2-BE-011, DEL-V2-BE-024
- Especificação: seção 10

Implementação:

- editar capacidade declarada;
- exibir reservada e disponível;
- alertar ao reduzir abaixo de reservas e manter o aviso visível no painel de configuração;
- mostrar holds próximos de expirar para diagnóstico autorizado;
- implementar ações saiu/entregue;
- eliminar seletor de driver do fluxo V2.

Critérios de aceite:

- atualização concorrente reconcilia versão;
- usuário entende por que disponibilidade é zero;
- conclusão remove card e atualiza capacidade;
- duplo clique não duplica transição.

## DEL-V2-FE-006 — Criar configuração de operadores e credenciais

- Status: [x] Implementação local concluída com provider fake — iFood, ambiente, merchant ID, prioridade, credenciais write-only e teste de conexão sem chamada externa; cotação real fica no adapter iFood
- Prioridade: P0
- Dependências: DEL-V2-FE-002, DEL-V2-BE-013, DEL-V2-BE-014
- Especificação: seções 5.2, 16 e 22.1

Implementação:

- configuração iFood possui ambiente, merchant ID, prioridade e credenciais write-only sem persistência no DOM após envio;
- listar operadores e ordem fixa;
- configurar ambiente e IDs não secretos;
- criar formulário write-only de credenciais;
- mascarar valores salvos;
- implementar testar conexão e cotação;
- testar conexão no adapter fake e refletir status sem retornar credencial;
- exibir último teste/status;
- restringir edição a Admin.

Critérios de aceite:

- segredo não permanece no DOM/storage após envio;
- API nunca devolve segredo;
- trocar ambiente exige nova validação;
- erro técnico é sanitizado e acionável;
- Manager enxerga status sem editar segredo.

## DEL-V2-FE-007 — Adaptar board operacional ao fulfillment

- Status: [x] Implementação local concluída
- Prioridade: P0
- Dependências: DEL-V2-FE-001, DEL-V2-BE-015, DEL-V2-BE-024
- Especificação: seções 13 e 22.2

Implementação:

- mostrar modalidade e operador;
- entrega própria não exibe entregador individual, atribuição ou tracking próprio;
- entrega própria oferece ações `Marcar como saiu` e `Marcar entregue` com `expected_version` e idempotency key;
- separar status de produção e fulfillment;
- exibir attempt n/5 e tempo da janela;
- destacar `NO_COURIER`/`CYCLE_EXHAUSTED`;
- remover dependência visual de driver interno;
- manter filtros/paginação/polling;
- preservar privacidade do endereço.

Critérios de aceite:

- própria mostra aguardando/saiu/entregue;
- externa mostra busca/atribuído/em rota;
- card crítico é compreensível sem depender de cor;
- atualização concorrente não duplica cards.

## DEL-V2-FE-008 — Adaptar detalhe, timeline, tracking e financeiro

- Status: [x] Implementação local concluída — detalhe/timeline, privacidade, link externo, quote/ciclos, custos e ações próprias
- Prioridade: P0
- Dependências: DEL-V2-FE-007, DEL-V2-BE-022, DEL-V2-BE-025
- Especificação: seção 22.3

Implementação:

- mostrar snapshot do endereço conforme permissão;
- renderizar quote, ciclos e tentativas;
- exibir tracking externo com ação segura de copiar;
- mostrar customer fee, quoted/actual cost e adjustment;
- não exibir PIN/código;
- mostrar recotação, cancelamento e fallback;
- atualizar detalhe por polling/reconciliação.

Critérios de aceite:

- link não aparece em listagem/DOM desnecessário;
- custo fica restrito a perfis autorizados;
- timeline é cronológica e sanitizada;
- estado atualizado durante modal gera aviso de versão.

## DEL-V2-FE-009 — Implementar fallback manual e reinício de ciclo

- Status: [x] Implementação local concluída — reinício de ciclo e conversão para própria com confirmação e papel de override; segundo operador é evolução P1
- Prioridade: P0
- Dependências: DEL-V2-FE-007, DEL-V2-BE-023
- Especificação: seção 11.5

Implementação:

- modal para reiniciar mesmo operador;
- modal para selecionar outro operador habilitado;
- modal para converter para própria;
- mostrar capacidade antes de converter;
- explicar que preço do cliente não muda;
- exigir motivo, confirmação, idempotency key e expected version;
- bloquear após coleta.

Critérios de aceite:

- novo operador aparece como cycle 1/5;
- conflito 409 recarrega estado;
- conversão sem capacidade não fecha como sucesso;
- duplo envio produz um comando;
- usuário sem papel não vê ação ativa.

## DEL-V2-FE-010 — Criar alertas e centro de exceções

- Status: [x] Implementação local concluída — centro de exceções, reconhecimento persistido no navegador (sem PII), alerta de conexão e atualização automática ao reconectar
- Prioridade: P0
- Dependências: DEL-V2-FE-007, DEL-V2-BE-019
- Especificação: seções 11.4, 22 e 24.3

Implementação:

- [x] centro de exceções filtrado por `DELIVERY_FAILED`, `RETURNING` e `RETURNED`;
- [x] atalho para detalhe, timeline e ações autorizadas;
- [x] atualização manual sem expor PII.
- [x] estado offline preserva a fila carregada, exibe aviso acionável e retoma o polling ao voltar a conexão;

- destacar cinco tentativas esgotadas;
- mostrar credencial/configuração inválida sem segredo;
- ordenar por urgência e tempo;
- [x] permitir reconhecer alerta sem encerrar problema (reconhecimento local, sem ocultar a exceção);
- incluir link para detalhe/configuração;
- polling de segurança e estado offline.

Critérios de aceite:

- alerta não desaparece apenas ao atualizar página;
- mensagem diferencia falha logística/configuração;
- resolução real remove alerta;
- interface funciona em desktop e tablet.

## DEL-V2-FE-011 — Implementar auditoria e relatórios básicos

- Status: [x] Implementação local concluída — resumo financeiro/operacional, filtros por modalidade/operador/status, falhas/retornos, alerta de volume alto e CSV sem PII
- Prioridade: P1
- Dependências: DEL-V2-FE-008, DEL-V2-BE-025, DEL-V2-BE-028
- Especificação: seções 22.3, 22.4 e 24

Implementação:

- [x] modal de relatório com KPIs, financeiro BRL e distribuição por status;
- [x] exportação CSV disponível no endpoint autorizado;
- [x] filtros por período, modalidade, operador e status são enviados ao backend e preservados no CSV;
- [x] timeline do detalhe exibe auditoria de mutações.

- [x] filtros por modalidade, provider, falha/status e período;
- [x] mostrar taxa de alocação/fallback;
- [x] relatório de diferença financeira e variação do operador;
- [x] auditoria de settings, capacidade, endereço e credencial;
- [x] export restrito e mascarado;
- [x] estados de volume alto.

Critérios de aceite:

- relatório não mistura tenant;
- endereço/telefone não vazam na exportação padrão;
- valores conciliam com detalhe;
- paginação evita carga integral.

## DEL-V2-FE-012 — Hardening, acessibilidade e responsividade

- Status: [x] Implementação local concluída — foco visível/restaurável, estados parciais, segredo write-only, viewport tablet/360px e alvos touch; auditoria axe fica no gate QA-006
- Prioridade: P0
- Dependências: DEL-V2-FE-002 a DEL-V2-FE-010
- Especificação: seções 23 e 25

Implementação:

- revisar teclado, foco, labels e contraste;
- garantir alvos touch de 48 px;
- testar 360 px, tablet e 1920 px;
- impedir PII em DOM oculto/localStorage/URL;
- tratar loading, vazio, offline, parcial, 403, 409 e 429;
- cancelar timers/listeners ao sair da página.
- aplicar semântica `role=dialog`, `aria-modal` e foco inicial/restaurável aos modais administrativos.

Critérios de aceite:

- axe/teste equivalente sem violações críticas;
- refresh não repete mutação;
- segredo nunca é persistido pelo browser;
- fallback funciona por teclado/touch.

## DEL-V2-FE-013 — Testes E2E e rollout do frontend

- Status: [x] Implementação local concluída — suíte Playwright Delivery UX verde (17/17); rollout controlado fica no gate QA-009/010
- Prioridade: P0
- Dependências: DEL-V2-FE-012
- Especificação: seções 27 a 30

Implementação:

- cobrir ativação/settings;
- cobrir cliente/endereço/CEP manual;
- cobrir preço/capacidade própria;
- cobrir credenciais mascaradas;
- cobrir board externo, tentativas e fallback;
- cobrir RBAC e tenant disabled;
- validar deploy compatível com backend anterior/novo.

Critérios de aceite:

- Playwright crítico verde;
- fixtures não contêm PII real;
- tenant sem módulo mantém navegação anterior;
- evidências visuais do piloto anexadas.

## Tasks P1/P2

### DEL-V2-FE-020 — Dashboard financeiro avançado

Gráficos e conciliação por provider, horário e modalidade.

### DEL-V2-FE-021 — Configuração de segundo operador

Aprimorar UX de ordem de providers quando o segundo adapter existir.

### DEL-V2-FE-022 — Áreas avançadas no mapa

Editor de polígono/CEP/bairro após suporte backend.
