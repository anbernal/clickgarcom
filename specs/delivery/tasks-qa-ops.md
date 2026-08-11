# Tasks de Qualidade, Segurança e Operação — Delivery V2

## Escopo da trilha

Esta trilha valida contratos, migrações, integração entre componentes, falhas externas, segurança, carga, homologação iFood, observabilidade e piloto.

## DEL-V2-QA-001 — Criar matriz de rastreabilidade

- Status: [x] Concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seções 27 a 30

Implementação:

- Matriz versionada em `docs/delivery-qa-matrix.md`, separando testes automatizados, contrato, manual e homologação externa.

- mapear cada critério da especificação para task e teste;
- separar unitário, integração, contrato, E2E e manual;
- identificar cenários sem cobertura;
- definir evidência e ambiente;
- manter matriz versionada no repositório.

Critérios de aceite:

- nenhum requisito P0 fica sem dono/teste;
- IDs de tasks e casos são consistentes;
- remoções do MVP não aparecem como gate.

## DEL-V2-QA-002 — Validar migrations e contratos

- Status: [~] Em execução — smoke de OpenAPI, RBAC, envelope e máquina de estados implementado; validação em banco vazio/baseline ainda pendente
- Prioridade: P0
- Dependências: DEL-V2-BE-003, DEL-V2-BE-015
- Especificação: seções 17, 18 e 25.3

Implementação:

- `npm run test:delivery-contract` valida rotas críticas versionadas, fallback, relatório CSV, papéis e schema de eventos.

- subir banco vazio;
- migrar baseline com dados representativos;
- validar rollback documentado;
- testar constraints cross-tenant;
- validar OpenAPI/event schemas;
- executar contract tests Core/Frontend.

Critérios de aceite:

- dados anteriores preservados;
- schema e enums coincidem;
- clientes antigos toleram campos novos;
- FK/unique impedem corrupção concorrente.

## DEL-V2-QA-003 — Criar suíte integrada com fake providers

- Status: [~] Em execução — smoke suite determinística do provider fake adicionada; suíte com banco/worker ainda requer ambiente integrado
- Prioridade: P0
- Dependências: DEL-V2-BE-014 a DEL-V2-BE-021, DEL-V2-CORE-007
- Especificação: seções 14, 19, 20 e 28

Implementação:

- `npm run test:delivery-smoke` cobre tarifas avançadas, janela noturna, falhas `FAIL_FIRST_N`, idempotência e custo efetivo.

- testar quote, expiração, recotação e criação;
- testar timeout antes/depois do envio;
- testar cinco tentativas e restart;
- testar webhook duplicado/fora de ordem;
- testar tracking/código;
- testar fallback e conversão própria.

Critérios de aceite:

- suite é determinística e não depende da internet;
- criação ambígua não duplica entrega;
- preço do cliente permanece;
- histórico completo é verificável.

## DEL-V2-QA-004 — Criar E2E WhatsApp completo

- Status: [~] Em execução — fluxos Core e expiração cobertos por testes reproduzíveis; E2E com serviços reais ainda pendente
- Prioridade: P0
- Dependências: DEL-V2-CORE-013, DEL-V2-FE-013
- Especificação: seções 7, 9, 11, 21 e 28

Implementação:

- cliente novo e recorrente;
- CEP encontrado e manual;
- salvar/editar/excluir/default;
- OWN com hold/pagamento/conclusão;
- EXTERNAL com quote/pagamento/preparo;
- falha e mensagem ao cliente;
- tracking e conclusão.

Critérios de aceite:

- fluxo reproduzível ponta a ponta;
- mensagens sem códigos técnicos;
- nenhuma PII real em fixture/evidência;
- reenvio do webhook/mensagem não duplica marco.

## DEL-V2-QA-005 — Testar concorrência, restart e carga

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-V2-BE-029
- Especificação: seções 10, 11, 19 e 25.1

Implementação:

- disputar última vaga própria;
- confirmar/cancelar simultaneamente;
- executar dois workers de tentativa;
- reiniciar scheduler entre tentativas;
- simular 100 entregas ativas por tenant;
- medir CEP/quote/painel e filas.

Critérios de aceite:

- nenhuma capacidade negativa;
- nenhuma sexta tentativa;
- um fulfillment atual;
- SLOs documentados/aprovados;
- fila se recupera sem perda lógica.

## DEL-V2-QA-006 — Executar revisão de segurança e LGPD

- Status: [~] Em execução — HMAC, isolamento de notificação e ausência de telefone no corpo validados; scanner completo e revisão LGPD ainda pendentes
- Prioridade: P0
- Dependências: DEL-V2-BE-028, DEL-V2-CORE-012, DEL-V2-FE-012
- Especificação: seções 16, 23 e 24.2

Implementação:

- `npm run test:delivery-security` valida assinatura HMAC com corpo exato e garante que a notificação externa não expõe telefone no texto.

- testar tenant isolation e RBAC negativo;
- revisar criptografia/rotação;
- buscar segredo/PII em logs, banco, DOM e URLs;
- testar enumeração/rate limit;
- validar consentimento e exclusão lógica;
- revisar retenção e terceiros no aviso de privacidade.

Critérios de aceite:

- nenhum achado crítico/alto aberto;
- credencial nunca retorna ao browser;
- telefone/endereço são mascarados;
- webhook falso não altera estado;
- relatório de risco aprovado.

## DEL-V2-QA-007 — Preparar observabilidade e runbooks

- Status: [x] Concluída para o piloto local; alerta real em canal operacional permanece dependente da infraestrutura
- Prioridade: P0
- Dependências: DEL-V2-BE-028, DEL-V2-CORE-012
- Especificação: seção 24

Implementação:

- Dashboards e alertas versionados em `docs/delivery-pilot-alerts.md`, `docs/delivery-pilot-dashboard.json` e `infra/grafana/dashboards/clickgarcom-delivery-pilot.json`.
- Roteiro de manutenção/fallback e evidências em `docs/delivery-manual-test-plan.md`.

- dashboards de quote, attempt, exhausted, fallback e outbox;
- alertas de credencial, webhook, ambiguidade e capacidade;
- runbook de provider indisponível;
- runbook de criação ambígua;
- runbook de rotação de credencial;
- runbook de cancelamento/fallback/rollback;
- dry-run de manutenção.

Critérios de aceite:

- alerta de teste chega ao canal operacional;
- suporte encontra Delivery sem expor PII;
- runbook possui comandos seguros e rollback;
- dashboard diferencia erro técnico e falta de courier.

## DEL-V2-QA-008 — Homologar iFood em sandbox

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-V2-BE-018 a DEL-V2-BE-022
- Especificação: seção 15

Implementação:

- validar autenticação e merchant;
- executar quote válida/inválida;
- criar pedido off-platform;
- receber eventos e tracking;
- validar código de confirmação do operador;
- testar cancelamento e erro ambíguo;
- registrar versão/fixtures sanitizadas.

Critérios de aceite:

- checklist oficial aplicável concluído;
- fluxo sandbox completo;
- diferenças entre documentação/conta registradas;
- nenhum segredo em evidência.

## DEL-V2-QA-009 — Executar homologação integrada pré-piloto

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-V2-QA-004 a DEL-V2-QA-008
- Especificação: seções 27 a 30

Implementação:

- testar perfis reais Admin/Manager/Dispatcher/cliente;
- testar pagamento real controlado ou equivalente homologado;
- testar rede degradada e indisponibilidade de provider;
- testar fallback para própria;
- validar mensagens/templates;
- ensaiar rollback da feature flag.

Critérios de aceite:

- Gates A a D aprovados;
- pendências possuem severidade/dono;
- nenhum P0 crítico aberto;
- go/no-go documentado.

## DEL-V2-QA-010 — Executar piloto de um tenant em Osasco

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-V2-QA-009
- Especificação: seção 29, Fase 6

Implementação:

- habilitar somente tenant piloto;
- iniciar com limites/capacidade documentados;
- acompanhar almoço e jantar;
- medir quote, alocação, falha, fallback, custo e mensagens;
- registrar incidentes sem PII;
- decidir expansão, ajuste ou rollback.

Critérios de aceite:

- nenhuma mistura entre tenants;
- operação consegue resolver `NO_COURIER`;
- diferença financeira é compreendida pelo restaurante;
- relatório final e decisão de rollout aprovados.
