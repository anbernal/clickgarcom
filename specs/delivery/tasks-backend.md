# Tasks de Backend NestJS — Delivery V2

## Escopo da trilha

Esta trilha implementa domínio, persistência, contratos HTTP, configurações, clientes, endereços, preço, capacidade própria, operadores externos, iFood, tentativas, webhooks, fallback, segurança e observabilidade.

Fonte: `docs/especificacao_tecnica_logistica_delivery.md` v2.0.

## DEL-V2-BE-030 — Projetar marcos de expedição para o KDS Delivery

- Status: [x] Concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-024

Implementação:

- reconciliar `ACCEPTED` e `READY` do lote com `PREPARING` e `READY_FOR_DISPATCH` da entrega;
- expor projeção autorizada para a fila Delivery do KDS;
- registrar saída e confirmação da própria com RBAC, versão esperada, idempotência e auditoria;
- manter informações de expedição disponíveis apenas a perfis autorizados.

Critérios de aceite:

- preparar/pronto no KDS atualiza a entrega correspondente;
- operação própria não cria driver, PIN ou tracking próprio;
- concorrência não conclui a mesma entrega duas vezes.

## DEL-V2-BE-001 — Reconciliar requisitos e design legados

- Status: [x] Concluída
- Prioridade: P0
- Dependências: nenhuma
- Especificação: seções 2, 3, 12, 13 e 31

Implementação:

- revisar `requirements.md` e `design.md` atuais;
- marcar como removidos do MVP: driver individual, localização, tracking próprio e PIN;
- documentar o reaproveitamento do agregado `Delivery` e a inclusão de `DeliveryFulfillment`;
- registrar ADR para modalidade padrão por tenant e fallback manual;
- preservar histórico de decisões anteriores sem tratá-las como requisito V2.

Critérios de aceite:

- documentos não apresentam requisitos contraditórios como P0;
- toda task V2 referencia a mesma fonte normativa;
- arquitetura aprova NestJS como dono das mutações.

## DEL-V2-BE-002 — Congelar contratos, enums e erros V2

- Status: [x] Concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-001
- Especificação: seções 13, 14, 18, 19 e 26

Implementação:

- definir enums de modalidade, fulfillment, quote, tentativa, capacidade e erro;
- revisar transições de `Delivery` para fluxo próprio simplificado e externo;
- definir DTOs administrativos e internos;
- definir envelope de evento V1/V2 compatível;
- atualizar OpenAPI sem remover campos legados durante a transição;
- publicar exemplos e códigos de conflito `409`.

Critérios de aceite:

- contratos passam validação OpenAPI;
- enums persistidos e check constraints são idênticos;
- frontend/Core conseguem gerar mocks sem consultar implementação interna;
- erros externos nunca vazam payload bruto.

## DEL-V2-BE-003 — Criar estratégia de migrations e compatibilidade

- Status: [x] Implementação concluída; execução contra banco fica no gate QA-002
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seções 3, 17 e 25.3

Implementação:

- mapear migration `000040` e entidades existentes;
- definir migrations incrementais para V2 sem editar migration aplicada;
- manter `delivery_fee` como alias/compatibilidade de `customer_delivery_fee` durante rollout;
- adicionar estados/transições sem remover valores legados;
- documentar backfill de entregas existentes;
- validar banco vazio, baseline atual e rollback.

Critérios de aceite:

- migrations executam duas vezes sem efeito inesperado;
- nenhuma entrega existente é apagada;
- FKs compostas preservam tenant isolation;
- aplicação antiga tolera schema novo durante janela de deploy.

## DEL-V2-BE-004 — Criar entidade e serviço de clientes

- Status: [x] Implementação concluída no escopo tenant-scoped/fake
- Prioridade: P0
- Dependências: DEL-V2-BE-003
- Especificação: seções 6 e 17.1

Implementação:

- criar `customers`;
- normalizar telefone em formato E.164 somente dígitos;
- implementar resolve-or-create por `(tenant_id, phone_normalized)`;
- não persistir nome;
- mascarar projeções administrativas;
- adicionar endpoints internos e administrativos;
- proteger criação concorrente pela unique key.

Critérios de aceite:

- mesma requisição retorna o mesmo cliente;
- mesmo telefone em tenants distintos gera registros isolados;
- telefone inválido é rejeitado;
- nenhum nome é persistido no perfil;
- testes negativos cross-tenant passam.

## DEL-V2-BE-005 — Criar domínio e CRUD de endereços

- Status: [x] Implementação concluída no escopo tenant-scoped/fake
- Prioridade: P0
- Dependências: DEL-V2-BE-004
- Especificação: seções 7, 17.2 e 27.2

Implementação:

- criar `customer_addresses` com FK composta;
- implementar criação, leitura, edição e exclusão lógica;
- limitar a cinco endereços ativos dentro da transação;
- garantir um único default ativo;
- atualizar default após uso confirmado;
- invalidar seleção de endereço excluído;
- auditar mutações administrativas.

Critérios de aceite:

- sexto endereço é bloqueado sob concorrência;
- exclusão não altera snapshots históricos;
- exclusão do default promove o mais recente;
- mudança antes da confirmação não altera `last_used_at`;
- cliente/Admin não acessam endereço de outro tenant.

## DEL-V2-BE-006 — Implementar `PostalCodeProvider`

- Status: [x] Implementação concluída com provider fake
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seção 8.1

Implementação:

- criar contrato neutro e erros normalizados;
- criar fake provider determinístico;
- implementar adapter do provedor selecionado;
- configurar timeout, retry curto, rate limit e circuit breaker;
- cachear por CEP com TTL sem dados de cliente;
- validar CEP brasileiro, cidade e UF;
- instrumentar latência e resultado.

Critérios de aceite:

- CEP conhecido retorna projeção normalizada;
- `NOT_FOUND` permite continuação manual;
- timeout não apaga campos digitados;
- segredo não chega ao frontend;
- fake cobre sucesso, não encontrado, timeout e rate limit.

## DEL-V2-BE-007 — Adaptar geocodificação e validação de endereço

- Status: [x] Implementação concluída com geocode fake e contrato externo isolado
- Prioridade: P0
- Dependências: DEL-V2-BE-005, DEL-V2-BE-006
- Especificação: seções 7.3, 8.2 e 8.3

Implementação:

- reutilizar `DeliveryMapsProvider`;
- geocodificar endereço completo com número;
- persistir provider, provider ID e qualidade;
- bloquear automação para `AMBIGUOUS`;
- permitir confirmação/correção explícita;
- separar lookup de CEP, geocode e rota;
- não aceitar Haversine como preço rodoviário.

Critérios de aceite:

- alteração estrutural do endereço invalida geocode anterior;
- complemento/rótulo não força geocode sem necessidade;
- coordenadas inválidas são rejeitadas;
- endereço manual pode ser confirmado após geocode válido;
- métricas distinguem qualidade e falha.

## DEL-V2-BE-008 — Implementar snapshot imutável do endereço

- Status: [x] Implementação concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-005, DEL-V2-BE-007
- Especificação: seções 1.2, 7 e 17.3

Implementação:

- criar builder versionado do snapshot;
- copiar endereço confirmado para `order_batch` e `Delivery`;
- guardar `customer_id` e `customer_address_id` apenas para rastreabilidade;
- impedir leitura dinâmica do cadastro para entrega ativa/histórica;
- incluir versão, confirmação, CEP/geocode e coordenadas;
- sanitizar dados antes de eventos.

Critérios de aceite:

- editar/excluir cadastro não muda Delivery existente;
- snapshot contém dados suficientes para operador e auditoria;
- campos sensíveis não entram no outbox público;
- backfill legado continua legível.

## DEL-V2-BE-009 — Evoluir settings e ativação por tenant

- Status: [x] Implementação concluída; validação de schema fica no gate QA-002
- Prioridade: P0
- Dependências: DEL-V2-BE-002, DEL-V2-BE-003
- Especificação: seção 5

Implementação:

- versionar `settings.delivery`;
- suportar `default_fulfillment_mode`;
- validar pré-requisitos `OWN` e `EXTERNAL`;
- impedir credenciais no JSON;
- implementar endpoint de validação/simulação;
- auditar before/after;
- manter entregas ativas operáveis ao desativar módulo.

Critérios de aceite:

- tenant inválido não ativa;
- mudança afeta somente novos pedidos;
- tenant sem módulo não recebe regressão;
- segredo enviado no payload de settings é rejeitado;
- timezone e limites são validados no backend.

## DEL-V2-BE-010 — Implementar todos os modos de tarifa própria

- Status: [x] Implementação concluída com simulação autoritativa
- Prioridade: P0
- Dependências: DEL-V2-BE-007, DEL-V2-BE-009
- Especificação: seção 9.2

Implementação:

- adicionar `FIXED`, `DISTANCE_BANDS`, `PER_KM` e `HYBRID`;
- validar faixas, limites, mínimos, km incluído e arredondamento;
- implementar adicionais fixos/percentuais;
- usar decimal/centavos, nunca float como fonte financeira;
- gerar breakdown e snapshot versionado;
- criar simulador pelo mesmo serviço de produção.

Critérios de aceite:

- exemplos e bordas de faixa retornam valor correto;
- overlap/buraco inválido é rejeitado;
- mudança de regra não altera quote existente;
- distância fora da última faixa fica indisponível;
- frontend não replica fórmula de negócio.

## DEL-V2-BE-011 — Implementar capacidade, hold e reserva própria

- Status: [x] Implementação concluída com hold/reserva idempotentes
- Prioridade: P0
- Dependências: DEL-V2-BE-003, DEL-V2-BE-009
- Especificação: seção 10 e 17.9

Implementação:

- criar `delivery_own_capacity_reservations`;
- calcular capacidade declarada, reservada e disponível;
- implementar hold com TTL inicial de 15 minutos;
- confirmar hold após pagamento;
- liberar em expiração, cancelamento, entrega ou conversão;
- usar lock/CAS e idempotência;
- criar job de expiração e auditoria de capacidade.

Critérios de aceite:

- duas transações não consomem uma única vaga;
- confirmação duplicada não reserva duas vezes;
- liberação duplicada é inofensiva;
- reduzir capacidade não cancela reserva ativa;
- restart do processo não perde holds persistidos.

## DEL-V2-BE-012 — Criar checkout próprio transacional

- Status: [x] Implementação concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-008, DEL-V2-BE-010, DEL-V2-BE-011
- Especificação: seções 9 e 10

Implementação:

- validar módulo, modalidade, endereço, área e capacidade;
- calcular frete e obter hold;
- emitir confirmation token opaco;
- confirmar checkout com referência de pagamento;
- vincular hold, lote, Delivery e snapshot;
- congelar `customer_delivery_fee`;
- atualizar último endereço somente após confirmação.

Critérios de aceite:

- payload adulterado não muda preço/endereço;
- pagamento repetido retorna o mesmo Delivery;
- quote/hold expirado exige nova avaliação;
- falha após pagamento é reconciliável;
- taxa aparece separada no snapshot financeiro.

## DEL-V2-BE-013 — Implementar armazenamento seguro de credenciais

- Status: [x] Implementação concluída com credential refs e provider fake
- Prioridade: P0
- Dependências: DEL-V2-BE-003, DEL-V2-BE-009
- Especificação: seção 16 e 17.4/17.5

Implementação:

- criar provider configs e credential refs;
- integrar secret manager ou criptografia autenticada versionada;
- aceitar escrita somente por Admin;
- nunca retornar segredo;
- implementar rotação, revogação e ambientes separados;
- criar teste de conexão rate-limited;
- auditar sem payload sensível.

Critérios de aceite:

- banco/settings não contêm segredo aberto;
- resposta mostra somente máscara/status;
- tenant A não usa credencial de B;
- rotação não invalida referência de entrega existente;
- logs e exceptions não incluem authorization header.

## DEL-V2-BE-014 — Criar contrato neutro e fake provider

- Status: [x] Implementação concluída com provider fake determinístico
- Prioridade: P0
- Dependências: DEL-V2-BE-002, DEL-V2-BE-013
- Especificação: seção 14

Implementação:

- implementar `DeliveryProvider`;
- normalizar quote, criação, consulta, cancelamento e webhook;
- criar catálogo de erros;
- criar fake com preço, expiração, timeout, falha ambígua e eventos fora de ordem;
- impedir tipos externos fora do adapter;
- instrumentar chamadas.

Critérios de aceite:

- orquestrador troca fake por adapter real sem alterar regra;
- fake permite testes determinísticos de cinco tentativas;
- payload bruto não aparece em resposta de domínio;
- erros preservam `retryable` e código normalizado.

## DEL-V2-BE-015 — Criar quotes, fulfillments e attempts

- Status: [x] Implementação concluída com migrations e projeções sanitizadas
- Prioridade: P0
- Dependências: DEL-V2-BE-003, DEL-V2-BE-014
- Especificação: seções 13.2 e 17.6 a 17.8

Implementação:

- criar entidades, migrations, constraints e repositories;
- garantir uma quote usada uma vez;
- garantir um fulfillment atual por Delivery;
- numerar ciclos e tentativas;
- adicionar timestamps e custos;
- implementar projeções sanitizadas para painel/timeline.

Critérios de aceite:

- concorrência não cria dois fulfillments atuais;
- attempt number é único por ciclo;
- quote expirada não vira `USED`;
- histórico de fulfillment anterior permanece;
- todas as queries incluem tenant.

## DEL-V2-BE-016 — Criar checkout externo e congelamento financeiro

- Status: [x] Implementação concluída no fluxo externo fake
- Prioridade: P0
- Dependências: DEL-V2-BE-008, DEL-V2-BE-014, DEL-V2-BE-015
- Especificação: seções 9.1, 9.3 e 9.4

Implementação:

- consultar somente operador padrão configurado;
- persistir quote antes do pagamento;
- emitir token de confirmação;
- vincular quote ao lote/Delivery após pagamento;
- criar fulfillment `WAITING_PREPARATION`;
- separar customer fee, quoted cost, actual cost e adjustment;
- bloquear pedido externo sem quote válida.

Critérios de aceite:

- valor do cliente não muda após confirmar;
- provider não é escolhido por preço automaticamente;
- quote pertence ao tenant/endereço/checkout corretos;
- recotação posterior não altera total do cliente;
- diferença positiva/negativa pertence ao restaurante.

## DEL-V2-BE-017 — Integrar início do preparo ao fulfillment

- Status: [x] Implementação concluída; adapter iFood real é BE-018
- Prioridade: P0
- Dependências: DEL-V2-BE-015, DEL-V2-BE-016
- Especificação: seções 11.1 e 13

Implementação:

- consumir/reutilizar evento do `order_batch`;
- iniciar contratação ao primeiro `PREPARING` válido;
- verificar quote e recotar quando expirada;
- criar cycle 1 de modo idempotente;
- não bloquear transação de produção com HTTP externo;
- reconciliar eventos repetidos e fora de ordem.

Critérios de aceite:

- evento duplicado inicia um ciclo;
- pedido ainda aceito não contrata antes do preparo;
- recotação atualiza custo do restaurante;
- falha externa não desfaz `PREPARING`.

## DEL-V2-BE-018 — Implementar adapter iFood off-platform

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-V2-BE-013, DEL-V2-BE-014, DEL-V2-BE-016
- Especificação: seção 15

Implementação:

- manter `FakeDeliveryProvider` como provider ativo durante o desenvolvimento e testes internos;
- autenticar e cachear token com margem de expiração;
- mapear merchant do tenant;
- implementar disponibilidade/cotação;
- criar pedido/solicitar entregador com quote válida;
- consultar/reconciliar status;
- cancelar usando motivos válidos do operador;
- mapear tracking, código e eventos;
- manter compatibilidade com sandbox/produção.

Critérios de aceite:

- testes de contrato usam fixtures sanitizadas;
- conta errada não atravessa tenant;
- quote expirada é rejeitada antes da criação;
- erro iFood vira código normalizado;
- nenhum endpoint iFood aparece fora do adapter.

## DEL-V2-BE-019 — Implementar scheduler de cinco tentativas

- Status: [x] Implementação concluída com scheduler persistido de cinco tentativas
- Prioridade: P0
- Dependências: DEL-V2-BE-017, DEL-V2-BE-018
- Especificação: seção 11.2 a 11.4

Implementação:

- agendar T+0, T+3, T+6, T+9 e T+12;
- encerrar no máximo em T+15;
- persistir schedule antes de executar;
- usar idempotency key determinística;
- classificar falha e reconciliar ambiguidade;
- sobreviver a restart e execução concorrente;
- emitir `CYCLE_EXHAUSTED` e `NO_COURIER`.

Critérios de aceite:

- nunca executa sexta tentativa no ciclo;
- dois workers não executam a mesma tentativa lógica;
- sucesso cancela pendências futuras;
- restart retoma tentativas devidas;
- outro operador não é selecionado automaticamente.

## DEL-V2-BE-020 — Implementar webhook inbox de operadores

- Status: [x] Implementação concluída com inbox/HMAC e provider fake
- Prioridade: P0
- Dependências: DEL-V2-BE-015, DEL-V2-BE-018
- Especificação: seções 17.10 e 20

Implementação:

- capturar raw body;
- validar assinatura antes do parse de negócio;
- resolver tenant por mapping confiável;
- persistir/deduplicar inbox;
- responder rápido e processar async;
- sanitizar/criptografar payload retido;
- aplicar máquina de estados sem regressão terminal.

Critérios de aceite:

- assinatura inválida não altera estado;
- evento duplicado produz uma transição;
- evento de outro tenant é rejeitado;
- evento fora de ordem não regride entregue;
- falha de processamento pode ser repetida.

## DEL-V2-BE-021 — Implementar reconciliação externa

- Status: [x] Implementação concluída com reconciliação fake idempotente
- Prioridade: P0
- Dependências: DEL-V2-BE-018, DEL-V2-BE-019, DEL-V2-BE-020
- Especificação: seções 11.3, 19 e 20

Implementação:

- reconciliação stale agora reaplica tracking/código retornados pelo provider fake através do mesmo contrato seguro de notificação;
- webhook e consulta ativa compartilham a mesma máquina monotônica e idempotência de outbox.

- reconciliar criação ambígua antes de retry;
- consultar fulfillments externos estagnados;
- permitir atualização manual rate-limited;
- tratar webhook atrasado;
- persistir último status conhecido e timestamp;
- não sobrescrever terminal com snapshot antigo.

Critérios de aceite:

- timeout pós-envio não cria duas entregas;
- job repetido é idempotente;
- divergência vira evento/auditoria;
- falha do provider mantém estado recuperável.

## DEL-V2-BE-022 — Integrar tracking e código do operador

- Status: [x] Concluída com provider fake
- Prioridade: P0
- Dependências: DEL-V2-BE-018, DEL-V2-BE-020
- Especificação: seção 12.1

Implementação:

- [x] persistir tracking URL no fulfillment;
- [x] projetar evento `tracking_available`/`provider_assigned` sem código secreto;
- [x] transportar código somente pelo contrato seguro de notificação/outbox WhatsApp;
- [x] não criar desafio PIN interno;
- [x] mascarar link no painel/log;
- [x] mapear coleta, trânsito e conclusão por webhook/reconciliação.

Critérios de aceite:

- cliente correto recebe link correto;
- PIN/código não aparece na API administrativa;
- entrega própria nunca gera link;
- tracking ausente não inventa URL.

## DEL-V2-BE-023 — Implementar fallback manual

- Status: [x] Implementação concluída no escopo de fallback administrativo
- Prioridade: P0
- Dependências: DEL-V2-BE-011, DEL-V2-BE-015, DEL-V2-BE-019
- Especificação: seções 11.5 e 11.6

Implementação:

- reiniciar mesmo operador;
- trocar para outro operador habilitado;
- converter para própria com reserva atômica;
- exigir motivo, expected version e idempotency key;
- preservar histórico/custos;
- bloquear após coleta;
- não alterar default do tenant.

Critérios de aceite:

- novo operador começa cycle 1 attempt 1;
- conversão sem capacidade falha sem mutação parcial;
- dois admins concorrentes produzem um resultado;
- valor do cliente permanece;
- timeline mostra quem mudou e por quê.

## DEL-V2-BE-024 — Adaptar máquina de estados e operação própria

- Status: [x] Implementado
- Prioridade: P0
- Dependências: DEL-V2-BE-011, DEL-V2-BE-015
- Especificação: seção 13

Implementação:

- permitir fluxo próprio sem `assigned_driver_id`, pickup, arrived ou PIN;
- implementar start/complete para Admin/Manager/Dispatcher;
- liberar capacidade na transição terminal;
- mapear fulfillment externo para Delivery;
- preservar estados legados aceitos;
- atualizar constraints, events e OpenAPI.

Critérios de aceite:

- própria segue aguardando -> saiu -> entregue;
- conclusão duplicada libera uma vez;
- external assigned não exige driver interno;
- estado terminal não regride.

Implementado no Tenant Admin API:

- `POST /admin/api/deliveries/:id/own/start` transiciona `READY_FOR_DISPATCH -> IN_TRANSIT` e atualiza o fulfillment próprio sem entregador, pickup, PIN ou tracking dedicado;
- `POST /admin/api/deliveries/:id/own/complete` transiciona `IN_TRANSIT -> DELIVERED`, registra evento/outbox e libera a reserva de capacidade vinculada ao Delivery;
- ambas as ações exigem `expected_version`, aceitam `Idempotency-Key` e repetição de conclusão não libera capacidade novamente;
- tentativa de operar fulfillment externo ou atribuir motorista ao caminho próprio é rejeitada.

## DEL-V2-BE-025 — Implementar snapshots e relatório financeiro

- Status: [x] Concluída com relatório operacional/CSV
- Prioridade: P0
- Dependências: DEL-V2-BE-016, DEL-V2-BE-023
- Especificação: seções 9.1, 17.3 e 22.3

Implementação:

- [x] consolidar customer fee, quote cost, actual cost e adjustment;
- [x] registrar recotação, fallback e cancelamento cobrado na timeline/auditoria;
- [x] restringir visualização por perfil (`TENANT_DELIVERY_REPORT_ROLES`);
- [x] criar resumo e export CSV autorizado;
- [x] usar decimal/centavos e BRL;
- [x] manter compatibilidade com `delivery_fee`.

Critérios de aceite:

- aumento e redução não alteram cliente;
- sinal da diferença é consistente e testado;
- cancelamento externo aparece no custo;
- relatório não mistura tenants.

## DEL-V2-BE-026 — Criar papel `DISPATCHER` e revisar RBAC

- Status: [x] Implementado
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seção 4

Implementação:

- adicionar role em schema, aliases e guards;
- migration `000044` adiciona `DISPATCHER` ao constraint de usuários;
- permitir operação logística sem credenciais/configuração sensível;
- manter Admin/Manager conforme matriz;
- negar segredos a Waiter/Cashier/Kitchen/Bar;
- auditar overrides;
- atualizar testes negativos.

Critérios de aceite:

- Dispatcher opera entrega e fallback autorizado;
- somente Admin grava credencial;
- perfis sem permissão recebem resposta não enumerável;
- roles antigas continuam válidas.

## DEL-V2-BE-027 — Integrar eventos, outbox e notificações

- Status: [x] Implementado (relay NestJS com retry/backoff, publicação RabbitMQ e projeções de fulfillment para o Core)
- Prioridade: P0
- Dependências: DEL-V2-BE-019, DEL-V2-BE-022, DEL-V2-BE-024
- Especificação: seções 19.3, 21 e 26

Implementação:

- [x] publicar eventos V2 transacionais;
- [x] criar milestones idempotentes;
- [x] emitir aviso de ciclo esgotado;
- [x] transportar tracking/código apenas pelos contratos seguros;
- [x] evitar notificação duplicada por `event_id`/chave determinística;
- [x] manter Core Go como emissor Meta;
- [x] implementar relay/worker de `domain_outbox_events` para os consumidores assíncronos;
- [x] publicar eventos de fulfillment no exchange `clickgarcom.events` com `messageId=event_id`;
- [x] encaminhar eventos não destinados ao Core para fila durável `delivery.domain.events`;
- [x] aplicar lock `SKIP LOCKED`, retry exponencial até 15 minutos e persistir erro sanitizado.

Configuração operacional:

- `DELIVERY_OUTBOX_RELAY_ENABLED=false` desabilita o relay durante manutenção;
- `DELIVERY_OUTBOX_RELAY_INTERVAL_MS` controla o polling (padrão: 5 segundos);
- `DELIVERY_OUTBOX_RELAY_BATCH_SIZE` controla o lote (padrão: 50 eventos).

Critérios de aceite:

- [x] rollback de transação não publica evento;
- [x] repetição do mesmo evento não duplica mensagem lógica;
- [x] payload público é sanitizado;
- [x] falha WhatsApp não desfaz Delivery;
- [x] relay assíncrono com retry/backoff e logs operacionais sem payload sensível.

## DEL-V2-BE-028 — Hardening, auditoria, métricas e retenção

- Status: [x] Implementação concluída — hardening técnico, auditorias, métricas, retenção e dashboard provisionável; ativação/validação operacional ficam nos gates QA-005/006/007
- Prioridade: P0
- Dependências: DEL-V2-BE-004 a DEL-V2-BE-027
- Especificação: seções 23 a 25

Implementação:

- [x] auditar settings, alterações de endereço, credenciais e fallback sem registrar dados sensíveis;
- [x] auditar alterações de capacidade (configuração, hold/confirm/release e expiração em lote);
- [~] adicionar métricas sem cardinalidade indevida (Core já mede eventos de fulfillment; Admin agora expõe contagens agregadas internas, dashboards/Prometheus ainda pendentes);
- [x] aplicar rate limit em tracking público, checkout público e webhook de operador;
- [x] executar jobs de hold, quote, webhook, reconciliação e credencial expirada pelo maintenance runner;
- [x] aceitar `dry_run`, `tenant_id` e limite por execução;
- [x] purgar somente eventos outbox publicados fora da retenção, preservando eventos não publicados e timeline de negócio;
- [x] mascarar PII/segredos em logs de relay, webhook e manutenção;
- [ ] ampliar maintenance runbook com alertas e SLOs do piloto.

Critérios de aceite:

- [x] logs automatizados passam scanner de segredo/PII;
- [x] jobs aceitam dry-run e tenant scope;
- [x] eventos/timeline de negócio não são apagados;
- [x] métricas suportam alertas do piloto (consumer Core, outbox, endpoint interno agregado, regras em `docs/delivery-pilot-alerts.md` e dashboard provisionado em `infra/grafana/dashboards/clickgarcom-delivery-pilot.json`; ativação em infraestrutura externa depende do deploy).

## DEL-V2-BE-029 — Testes integrados, carga e release flag

- Status: [~] Em execução — suíte unitária/contrato, smoke fake e UX verdes; integração com banco, carga e gate de release ainda requerem ambiente de teste
- Prioridade: P0
- Dependências: DEL-V2-BE-028
- Especificação: seções 27 a 30

Implementação:

- cobrir matriz de casos mínimos;
- testar banco vazio/baseline;
- testar concorrência de capacidade/fallback;
- testar scheduler após restart;
- testar provider fake e sandbox;
- validar feature flag por tenant;
- documentar deploy/rollback.

Critérios de aceite:

- suites críticas verdes;
- nenhuma regressão em DINE_IN/TAKEOUT;
- carga alvo e segurança aprovadas;
- um tenant pode ser ativado sem ativação global;
- evidências anexadas ao gate do piloto.

## DEL-V2-BE-030 — Blindar checkout público híbrido e cobrança de Delivery

- Status: [x] Implementado — validação híbrida, vínculo checkout/lote/pedido, resumo público Delivery e bloqueio da liquidação genérica
- Prioridade: P0
- Dependências: DEL-V2-BE-016, DEL-V2-BE-029

Implementação:

- manter o contrato atual para links presenciais, sem `delivery_checkout_key`;
- resolver o checkout Delivery pelo par `(tenant, tab_id, checkout_key)` e validar lote, pedido, status e expiração antes de exibir ou cobrar;
- usar `delivery_checkouts` como fonte única de subtotal, frete e total no contexto Delivery;
- retornar ao checkout público itens do lote e snapshot imutável do endereço, sem expor total acumulado da comanda técnica;
- ignorar valor, pedido âncora e descrição enviados pelo navegador quando o contexto for Delivery;
- vincular criação de PIX/cartão ao pedido do lote do checkout, nunca ao primeiro pedido da comanda;
- impedir finalização genérica da comanda para pagamentos Delivery; a confirmação financeira deve liberar somente o checkout/lote/Delivery correspondente;
- cobrir tentativas de chave ausente, expirada, de outro lote, de outra comanda e de outro tenant.

Critérios de aceite:

- checkout presencial continua mostrando e liquidando a comanda presencial;
- checkout Delivery mostra itens, endereço, subtotal, frete e total congelados;
- valor exibido, valor enviado ao provider e valor confirmado são idênticos ao snapshot Delivery;
- nenhum pagamento Delivery pode quitar, fechar ou baixar pedidos de outro lote;
- chave Delivery não pode ser usada em uma comanda diferente.

Implementado em:

- `GET /admin/api/public/tables/tabs/:tabId` reconhece `delivery_checkout_key`; sem a chave, o contrato presencial é preservado;
- para Delivery, API valida tenant, tab técnico, lote Delivery, pedido, status e expiração antes de retornar itens, endereço e valores congelados;
- PIX/cartão obtêm `amount`, `order_id` e descrição do checkout validado, sem confiar nos campos do navegador ou no primeiro pedido da comanda;
- polling de pagamento valida que o pagamento pertence ao mesmo checkout/lote e não executa a finalização genérica da comanda;
- a liquidação interna também identifica `delivery_checkout_key` no pagamento e deixa a confirmação para o reconciliador do Delivery.

## DEL-V2-BE-031 — Resolver acesso Delivery por capacidade curta e token assinado

- Status: [x] Implementado — capacidade curta troca por JWT e GET, PIX, cartão e polling usam a chave validada do token
- Prioridade: P0
- Dependências: DEL-V2-BE-030, DEL-V2-CORE-017

Implementação:

- trocar a capacidade pública aleatória do checkout por JWT com escopo, `tab_id`, expiração e chave Delivery assinada;
- usar a chave assinada como fonte autoritativa depois da troca;
- rejeitar requisição que combine uma chave explícita diferente da chave assinada;
- aplicar a mesma resolução na abertura do resumo, criação de PIX/cartão e consulta de status;
- preservar o contrato legado para checkout presencial e links Delivery antigos; novos CTAs não carregam JWT nem chave financeira na URL.

Critérios de aceite:

- link Delivery curto abre mesmo em clientes WhatsApp que truncam queries longas;
- valor, itens, endereço e pedido continuam vindo do snapshot congelado do checkout assinado;
- adulteração da chave explícita retorna não autorizado;
- links presenciais não passam a exigir claim ou chave Delivery.

## Tasks P1/P2

### DEL-V2-BE-040 — Segundo operador externo

Adicionar novo adapter usando o mesmo contrato, sem alterar orquestrador ou checkout.

### DEL-V2-BE-041 — Polígonos e áreas avançadas

Adicionar PostGIS/polígonos/CEPs sem alterar snapshots existentes.

### DEL-V2-BE-042 — Conciliação financeira automática

Comparar cobranças/faturas do operador com `provider_actual_cost`.

### DEL-V2-BE-043 — Exclusão integral/LGPD assistida

Criar fluxo separado e autorizado de anonimização/purge conforme política legal.
