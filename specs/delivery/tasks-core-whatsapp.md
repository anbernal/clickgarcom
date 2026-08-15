# Tasks de Core Go e WhatsApp — Delivery V2

## Escopo da trilha

Esta trilha implementa a jornada conversacional do cliente, chamadas internas ao domínio NestJS, integração do frete ao checkout/pagamento, criação do lote Delivery, consumo de eventos e mensagens confiáveis.

O Core Go não altera tabelas de Delivery diretamente e não implementa regra financeira, capacidade ou seleção de operador.

## DEL-V2-CORE-001 — Congelar contratos internos e ownership

- Status: [x] Concluída — contratos internos, ownership e fakes versionados; validação Go aprovada
- Prioridade: P0
- Dependências: DEL-V2-BE-002
- Especificação: seções 3, 18.3, 19 e 26

Implementação:

- gerar/alinhar DTOs do client Node Admin;
- definir correlation ID, `X-Internal-Token` e timeouts;
- documentar que NestJS é dono de cliente/endereço/quote/fulfillment;
- versionar eventos consumidos;
- criar fakes para desenvolvimento do bot.

Critérios de aceite:

- Core compila contra contratos congelados;
- nenhuma escrita SQL direta no domínio Delivery;
- erros internos possuem mapeamento conversacional seguro;
- contrato inclui idempotency/checkout key.

## DEL-V2-CORE-002 — Modelar estados conversacionais de Delivery

- Status: [x] Concluída — estados conversacionais, retomada segura e expiração implementados e testados
- Prioridade: P0
- Dependências: DEL-V2-CORE-001
- Especificação: seções 6, 7 e 21

Implementação:

- adicionar estados para endereço salvo/novo, CEP, campos manuais, rótulo, confirmação, consentimento, endereço pronto e exclusão confirmada;
- persistir somente customer/address IDs, lista de IDs autorizados e rascunho mínimo no contexto da sessão;
- cancelar qualquer etapa limpa as referências do fluxo sem alterar pedido ou capacidade;
- retomar prompts de cada estado após entrada inesperada;
- checkout expirado agora limpa a sessão e retorna o cliente para recotação sem reutilizar token/hold; a execução final do hold continua no NestJS.

Critérios de aceite:

- conversa retoma após mensagem inesperada;
- sessão de tenant A não resolve dados em B;
- dados sensíveis não são logados;
- timeout conduz a estado recuperável.

## DEL-V2-CORE-003 — Resolver cliente e listar endereços

- Status: [x] Concluída — resolução tenant-scoped, lista, seleção e exclusão confirmada implementadas
- Prioridade: P0
- Dependências: DEL-V2-CORE-002, DEL-V2-BE-004, DEL-V2-BE-005
- Especificação: seções 6 e 7.1

Implementação:

- normalizar número recebido do WhatsApp;
- chamar resolve-or-create interno;
- listar endereços ativos com default primeiro;
- apresentar rótulo e resumo seguro;
- suportar escolher, cadastrar e excluir com confirmação destrutiva;
- validar que o índice escolhido pertence à lista tenant-scoped retornada na sessão;
- nunca aceitar address ID não devolvido para a sessão/tenant.

Critérios de aceite:

- cliente recorrente recebe endereços corretos;
- cliente novo segue para CEP;
- endereço excluído não é selecionável;
- lista de cinco cabe no fluxo interativo ou possui paginação adequada.

## DEL-V2-CORE-004 — Implementar cadastro de endereço por CEP

- Status: [x] Concluída — CEP, entrada manual, geocode fake e preservação em falha implementados
- Prioridade: P0
- Dependências: DEL-V2-CORE-003, DEL-V2-BE-006, DEL-V2-BE-007
- Especificação: seções 7.2, 7.3 e 8

Implementação:

- solicitar e validar CEP;
- consultar backend;
- preencher campos retornados e perguntar ausentes;
- coletar número, complemento, referência e rótulo;
- suportar entrada manual em `NOT_FOUND`/indisponibilidade;
- solicitar geocode/validação;
- preservar dados se provider falhar.

Critérios de aceite:

- CEP com máscara e sem máscara funciona;
- CEP inválido recebe orientação;
- entrada manual completa o fluxo;
- ambiguidade exige correção/confirmar novamente;
- número nunca é inferido pelo CEP.

## DEL-V2-CORE-005 — Confirmar, salvar, editar e excluir endereço

- Status: [x] Concluída — confirmação, consentimento, edição e exclusão implementados
- Prioridade: P0
- Dependências: DEL-V2-CORE-004, DEL-V2-BE-005
- Especificação: seções 7.4 a 7.6

Implementação:

- mostrar endereço completo antes de usar;
- perguntar consentimento de salvamento;
- interromper se cliente não quiser salvar;
- implementar edição estrutural com nova confirmação/geocode e exclusão confirmada;
- atualizar a lista/default após qualquer mutação;
- confirmar alteração destrutiva;
- reconsultar lista/default após mutação.

Critérios de aceite:

- nenhum endereço temporário segue ao checkout;
- sexto endereço orienta edição/exclusão;
- exclusão afeta apenas o selecionado;
- editar endereço exige nova confirmação;
- snapshots antigos não são apresentados como cadastro ativo.

## DEL-V2-CORE-006 — Integrar cotação ao carrinho

- Status: [x] Concluída — quote/hold, checkout key, expiração e total autoritativo integrados ao carrinho
- Prioridade: P0
- Dependências: DEL-V2-CORE-005, DEL-V2-BE-012, DEL-V2-BE-016
- Especificação: seção 9 e 18.6

Implementação:

- gerar checkout key estável no Core (`DeliveryCheckoutCoordinator`), variando com tenant, cliente, endereço, modalidade, total e fingerprint do carrinho;
- solicitar quote/hold conforme a modalidade configurada pelo tenant;
- para `EXTERNAL`, solicitar a cotação interna antes do checkout usando a mesma `checkout_key`;
- conectar `DELIVERY_READY` ao carrinho e criar checkout interno com subtotal, coordenadas e snapshot do endereço;
- chamar o contrato interno de checkout com retry/fake de desenvolvimento;
- consultar o checkout por `checkout_key` para reconciliar timeout sem criar novo hold/quote;
- validar escopo tenant/cliente/endereço, status pendente e expiração antes de liberar pagamento;
- manter os valores financeiros retornados pelo NestJS como fonte autoritativa;
- exibir frete separado e estimativa;
- guardar somente o confirmation token opaco no contexto da sessão, sem logs;
- usar o total retornado pelo backend, sem recalcular preço localmente;
- impedir confirmação com quote/hold expirado;
- manter retry lógico com a mesma chave e guardar somente chave, token, frete, total, modalidade e expiração.

Critérios de aceite:

- cliente vê itens, frete e total;
- payload local não altera preço retornado;
- externa indisponível não permite pagamento como Delivery;
- própria sem capacidade orienta indisponibilidade;
- quote repetida não duplica hold.

## DEL-V2-CORE-007 — Integrar pagamento, lote e confirmação do checkout

- Status: [x] Concluída — pagamento, lote, reconciliação e confirmação autoritativa implementados
- Prioridade: P0
- Dependências: DEL-V2-CORE-006
- Especificação: seções 9, 10.2 e 18.3

Implementação:

- incluir frete no total pago a partir do `total_amount` autoritativo;
- confirmar checkout pelo `DeliveryCheckoutCoordinator` após retorno financeiro;
- aceitar confirmação repetida somente para a mesma referência de pagamento;
- validar resposta `PAID` e referência antes de liberar a continuação do pedido;
- expor `ConfirmDeliveryPayment` como boundary para o reconciliador de pagamentos, sem aceitar referência digitada livremente pelo cliente;
- manter compatibilidade com meios de pagamento existentes;
- criar/reutilizar `order_batch` DELIVERY;
- persistir snapshot de endereço e taxa;
- reconciliar timeout pós-pagamento;
- consultar o estado autoritativo pelo mesmo `checkout_key` quando houver timeout entre pagamento e confirmação;
- não cobrar diferença posterior automaticamente;
- o reconciliador de pagamento lê somente `delivery_checkout_key` e o `order_batch` associado ao pedido, reconcilia o lote e confirma o endpoint interno `confirm-paid` com o valor aprovado;
- o checkout mantém `order_batch_id` tenant-scoped; confirmação com lote divergente é rejeitada;
- eventos repetidos reutilizam um `event_id` determinístico por pagamento;
- confirmação comum continua exigindo token opaco da sessão; o webhook usa apenas o endpoint interno autenticado por serviço;
- checkout expirado é rejeitado antes da confirmação de pagamento e o contexto opaco é limpo; permanece apenas a homologação do provider real/sandbox.

Critérios de aceite:

- pagamento duplicado não cria lote/Delivery duplicado;
- falha interna após pagamento pode ser reconciliada;
- total financeiro confere com quote confirmada;
- endereço usado vira default apenas após confirmação.

## DEL-V2-CORE-008 — Adaptar entrada em preparo e eventos de produção

- Status: [x] Concluída — disparo assíncrono idempotente implementado; retry permanece no reconciliador/outbox
- Prioridade: P0
- Dependências: DEL-V2-CORE-001, DEL-V2-BE-017
- Especificação: seções 11.1 e 13

Implementação:

- publicar/enviar evento de lote Delivery quando o agregado de pedidos chega a `ACCEPTED` (entrada lógica em preparo);
- garantir `event_id` determinístico por tenant, lote e pedido que fechou o agregado, além de `order_id` para correlação;
- não chamar operador diretamente;
- suportar reprocessamento e reconciliação pelo endpoint interno level-triggered;
- executar o envio de forma assíncrona para não bloquear a atualização da cozinha;
- manter cozinha/bar independentes da logística.

Critérios de aceite:

- PREPARING repetido gera um comando lógico idempotente;
- Core não bloqueia atualização da cozinha aguardando iFood;
- falha de integração entra em retry interno.

## DEL-V2-CORE-009 — Consumir eventos V2 de fulfillment

- Status: [x] Implementação local concluída — contrato, projeção, consumer e produtor Nest de quote/attempt/assigned/exhausted/changed/completed; publicação integrada será validada no gate QA-002/003
- Prioridade: P0
- Dependências: DEL-V2-BE-027
- Especificação: seções 21 e 26

Implementação:

- contrato Go versionado para `quote_created`, `provider_attempt_failed`, `provider_assigned`, `provider_cycle_exhausted`, `tracking_available`, `fulfillment_changed` e `completed`;
- consumer `delivery.fulfillment.events` valida versão, tenant, aggregate, tipo e `occurred_at`;
- projeção allowlist aceita apenas recipient/body/template/mode/display code/tracking URL/PIN;
- deduplicação por `event_id` em memória, sem marcar evento quando a publicação falha;
- eventos sem projeção de notificação são reconhecidos sem retry infinito;
- evento é convertido para o contrato existente `notifications.send`.

Critérios de aceite:

- replay não duplica mensagem;
- evento de tenant errado é recusado;
- payload sensível não é incluído em log;
- consumer recupera após RabbitMQ indisponível.

## DEL-V2-CORE-010 — Implementar templates e notificações de Delivery

- Status: [x] Implementação local concluída — templates fallback, adapter, deduplicação e projeções Nest; publicação/credenciais reais ficam nos gates de ambiente
- Prioridade: P0
- Dependências: DEL-V2-CORE-009, DEL-V2-BE-022
- Especificação: seção 21

Implementação:

- adicionar milestones Core para preparo, busca, falha de alocação, tracking, saída própria e conclusão;
- fornecer mensagens fallback neutras quando o produtor não enviar `body` renderizado;
- suprimir tracking para modalidade `OWN`;
- preservar `template_id`, `recipient`, tenant e delivery no contrato do outbox;
- adapter WhatsApp deduplica `event_id` antes de chamar o sender e não registra body/PIN;
- templates customizados por tenant continuam sendo resolvidos pelo serviço de notificações do NestJS antes do outbox.

Critérios de aceite:

- ciclo esgotado envia um aviso;
- tracking não é enviado em OWN;
- segredo/código não aparece em logs;
- retry de outbox não duplica marco.

## DEL-V2-CORE-011 — Implementar comandos e UX de fallback pelo canal autorizado

- Status: [x] Encerrada por decisão de escopo — fallback é exclusivamente administrativo
- Prioridade: P1
- Dependências: DEL-V2-BE-023, DEL-V2-CORE-009
- Especificação: seção 11.5

Implementação:

- Não há comando de cliente/WhatsApp para trocar operador ou modalidade.
- Reinício de ciclo e conversão para OWN são executados no painel Admin por Admin/Manager/Dispatcher autorizado, com auditoria, motivo e idempotência.
- O Core recebe somente os eventos resultantes e continua sem acesso direto a regras de provider/capacidade.

- manter fallback principal no Admin;
- se houver atalho WhatsApp operacional futuro, exigir usuário autenticado/papel;
- nunca aceitar comando do cliente para trocar operador;
- refletir nova estimativa sem alterar cobrança;
- notificar cliente após decisão do restaurante.

Critérios de aceite:

- cliente não executa override;
- mudança administrativa aparece na conversa correta;
- comando duplicado é idempotente.

## DEL-V2-CORE-012 — Hardening, métricas e privacidade do fluxo

- Status: [x] Implementação local concluída — validações de tenant, replay, deduplicação, rate limit e métricas; scanner/canal operacional ficam no gate QA-006/007
- Prioridade: P0
- Dependências: DEL-V2-CORE-002 a DEL-V2-CORE-010
- Especificação: seções 23 a 25

Implementação:

- mascarar telefone/endereço em logs;
- limitar consulta de CEP/quote por sessão;
- registrar métricas de abandono e falha;
- limpar referências de endereço/quote da sessão encerrada;
- testar payload malformado e replay;
- criar DLQ/alerta para evento e mensagem.

Critérios de aceite:

- scanner não encontra PII indevida;
- rate limit não quebra retomada legítima;
- sessão expirada não autoriza endereço anterior;
- métricas não usam telefone como label.

## DEL-V2-CORE-013 — Testes E2E e rollout controlado

- Status: [~] Em execução — jornadas Core possuem testes unitários reproduzíveis, incluindo expiração; E2E integrado e rollout ainda dependem do ambiente
- Prioridade: P0
- Dependências: DEL-V2-CORE-012
- Especificação: seções 27 a 30

Implementação:

- testar cliente novo e recorrente;
- testar CEP encontrado/manual;
- testar OWN e EXTERNAL;
- testar quote/hold expirado;
- testar pagamento e timeout de confirmação;
- testar ciclo esgotado/tracking/conclusão;
- validar feature flag e rollback.

Critérios de aceite:

- cenários críticos automatizados ou com roteiro reproduzível;
- DINE_IN/TAKEOUT continuam verdes;
- tenant piloto pode ser isoladamente habilitado;
- evidências de mensagens ficam anexadas sem PII real.

## DEL-V2-CORE-014 — Isolar comanda técnica por pedido Delivery

- Status: [x] Implementado — comanda técnica vinculada somente à sessão/jornada corrente
- Prioridade: P0
- Dependências: DEL-V2-CORE-007, DEL-V2-BE-030

Implementação:

- criar comanda técnica exclusivamente para a jornada Delivery atual;
- nunca procurar/reutilizar comandas técnicas Delivery abertas de outra sessão ou pedido;
- limpar a referência técnica ao cancelar, expirar ou encerrar a jornada, preservando a separação do atendimento presencial;
- manter `tab_id` apenas como contêiner interno de itens e usar `checkout_key`/`order_batch_id` como fonte financeira e de entrega.

Critérios de aceite:

- novo pedido Delivery não inclui itens cancelados ou anteriores;
- o mesmo telefone pode manter comanda presencial sem influenciar o Delivery;
- uma nova sessão Delivery não herda a comanda técnica anterior;
- links presenciais continuam inalterados.

Implementado em:

- Core usa `delivery_internal_tab_id` somente quando já pertence à sessão corrente;
- não há mais descoberta/reuso de comanda técnica Delivery aberta pelo telefone;
- saída/cancelamento limpa a referência técnica para que a próxima jornada crie outro contêiner, sem tocar na comanda presencial do mesmo número;
- teste cobre que uma comanda Delivery anterior não é herdada por nova jornada.

## DEL-V2-CORE-015 — Renovar checkout Delivery expirado

- Status: [x] Implementado — nova tentativa cancela o hold/lote anterior e usa chave de checkout nova
- Prioridade: P0
- Dependências: DEL-V2-CORE-007, DEL-V2-BE-030

Implementação:

- ao expirar a cotação, cancelar de forma idempotente o checkout e o lote Delivery pendentes;
- preservar um nonce somente para a tentativa de recotação corrente;
- gerar uma nova `checkout_key` quando um novo lote for criado após a expiração;
- manter idempotência se o cliente repetir a mesma tentativa de recotação antes de ela concluir;
- evitar o conflito `Checkout já vinculado a outro lote`.

Critérios de aceite:

- uma cotação expirada pode ser recalculada sem reiniciar manualmente o atendimento;
- nenhum novo checkout reaproveita a chave financeira de outro lote;
- o checkout antigo não permanece reservado para cobrança/capacidade;
- o fluxo presencial não é afetado.

## DEL-V2-CORE-016 — Manter navegação Delivery isolada durante personalização

- Status: [x] Implementado — retorno e recuperação de estado não exibem menu presencial
- Prioridade: P0
- Dependências: DEL-V2-CORE-002, DEL-V2-CORE-014

Implementação:

- `Voltar ao menu` durante a seleção de adicionais retorna ao menu Delivery;
- uma sessão marcada como Delivery que caia em estado legado `MainMenu` é recuperada para o menu Delivery;
- opções presenciais como comanda, garçom e mesa não são processadas nessa jornada;
- botões antigos enviados pelo WhatsApp não reabrem o menu presencial.

Critérios de aceite:

- Delivery nunca apresenta `Ver minha comanda` ou `Chamar garçom`;
- voltar durante adicionais não envia o cliente para o menu presencial;
- seleção de botão antigo não mistura os estados Delivery e presencial;
- o checkout Delivery continua acessível após a personalização correta do item.

## DEL-V2-CORE-017 — Vincular o checkout Delivery ao token público assinado

- Status: [x] Implementado — a chave congelada do checkout acompanha o JWT emitido pelo Core
- Prioridade: P0
- Dependências: DEL-V2-CORE-007, DEL-V2-BE-030

Implementação:

- incluir `delivery_checkout_key` somente no token público emitido para uma jornada Delivery;
- manter tokens de checkout presencial sem a claim de Delivery;
- usar a chave da sessão corrente e da mesma comanda técnica ao emitir um novo link;
- aceitar o parâmetro explícito da URL no servidor durante a transição, mas não incluí-lo em novos CTAs para evitar truncamento por clientes WhatsApp.

Critérios de aceite:

- o checkout abre mesmo quando o cliente do WhatsApp descarta o parâmetro separado da chave;
- a chave recuperada pela API passou antes pela verificação da assinatura e expiração do JWT;
- uma chave diferente enviada pelo navegador não substitui a chave assinada;
- checkout presencial permanece compatível com o contrato anterior.
