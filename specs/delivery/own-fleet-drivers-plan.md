# Plano de evolução — Frota própria com motoboys identificados

| Campo | Definição |
|---|---|
| Produto | ClickGarçom Delivery |
| Evolução | Frota própria com cadastro, atribuição e portal web do motoboy |
| Data | 20/08/2026 |
| Status | Estudo de viabilidade e plano para aprovação |
| Compatibilidade | Preserva o modo V2 de capacidade numérica por feature flag |

## 1. Decisão recomendada

A evolução é viável e pode reutilizar parte relevante do backend atual. O
ClickGarçom já possui papel `DRIVER`, `deliveries.assigned_driver_id`, estados de
atribuição/coleta/rota, código hexadecimal de confirmação, localização,
tracking, auditoria, relatórios e endpoints do entregador.

O trabalho principal será:

1. criar um perfil cadastral próprio para o motoboy;
2. reativar a atribuição individual somente para tenants que habilitarem a
   nova modalidade;
3. criar um portal web responsivo e seguro para o motoboy;
4. adaptar Admin/KDS para distribuir e acompanhar as filas;
5. reconciliar os documentos V2 que hoje proíbem entregador individual no
   fluxo próprio.

Não é recomendado expor uma lista pública de entregas. A URL pode ser pública
e personalizada por tenant, mas os dados devem aparecer somente depois da
autenticação do motoboy e sempre limitados ao próprio entregador.

## 2. Proposta de produto

### 2.1 Modos de frota própria

Adicionar à configuração do tenant:

- `CAPACITY_ONLY`: comportamento atual, apenas quantidade de entregadores;
- `IDENTIFIED_DRIVERS`: cadastro, atribuição e fila individual.

O modo atual permanece como padrão na migração. Nenhum tenant existente passa
a exigir cadastro de motoboy automaticamente.

### 2.2 Cadastro básico

Campos obrigatórios solicitados:

- nome completo;
- CPF;
- placa da motocicleta;
- situação `ATIVO` ou `INATIVO`.

Campos recomendados, mas opcionais no primeiro marco:

- telefone para envio/reemissão do acesso;
- apelido operacional;
- limite de entregas simultâneas;
- observação interna;
- modelo/cor da motocicleta.

Não incluir upload de documentos no primeiro marco. CNH, EAR, CRLV e datas de
validade podem entrar depois como controles de conformidade configuráveis. As
exigências de motofrete podem variar e sofrer alterações federais, estaduais e
municipais; o sistema deve auxiliar a gestão, sem afirmar que realizou
validação oficial do profissional ou do veículo.

### 2.3 Tratamento do CPF

O CPF é dado pessoal e não deve funcionar como identificador exposto do
sistema.

- validar dígitos verificadores no backend;
- normalizar somente os 11 dígitos;
- criptografar o valor completo em repouso;
- manter HMAC separado para impedir CPF duplicado por tenant;
- guardar os quatro últimos dígitos para exibição mascarada;
- nunca retornar CPF completo em listagens, eventos, logs ou websocket;
- registrar auditoria de criação, edição, consulta autorizada e inativação;
- definir política de retenção e eliminação/anonimização após o fim da relação.

### 2.4 Portal do motoboy

URL sugerida:

```text
https://clickgarcom.servicoswebia.com.br/entregador/{tenant-slug}
```

Identidade visual:

- logo, nome e cores do tenant;
- interface mobile-first;
- instalável como PWA, sem depender de loja de aplicativos;
- suporte a tela pequena, conexão lenta e retomada de sessão.

Acesso recomendado:

1. o Admin cria o motoboy;
2. o sistema gera link/QR de ativação de uso único;
3. o motoboy define um PIN pessoal de acesso;
4. o link é trocado por cookie `HttpOnly`, `Secure` e limitado ao tenant;
5. o Admin pode revogar sessões ou reemitir o acesso.

CPF nunca deve aparecer na URL. Login por CPF + PIN pode existir como fallback,
com rate limit e bloqueio progressivo, mas o link de ativação é a experiência
preferida.

### 2.5 Fila individual

Cada motoboy vê somente:

- `A retirar`: entregas atribuídas e prontas para saída;
- `Em rota`: entregas que ele iniciou;
- `Concluídas hoje`: histórico resumido sem dados pessoais desnecessários;
- `Problema`: entregas com ocorrência aberta.

Cada cartão deve mostrar:

- número curto do pedido;
- horário e prioridade;
- nome do cliente;
- endereço e referência;
- botão para abrir Waze/Google Maps/Apple Maps;
- telefone mascarado ou ação controlada de contato;
- quantidade de volumes/itens, sem detalhes financeiros desnecessários;
- situação e ação principal adequada à etapa.

### 2.6 Fluxo operacional

```text
Pedido pronto
  -> Admin/KDS atribui motoboy
  -> entra em "A retirar" na fila do motoboy
  -> motoboy confirma retirada/inicia rota
  -> cliente recebe nome do motoboy, atualização e código de 4 caracteres
  -> motoboy chega ao endereço
  -> cliente informa o código
  -> motoboy digita o código
  -> entrega é concluída e sai da fila ativa
  -> capacidade, tracking, KDS, Admin e histórico são atualizados
```

O código atual de quatro caracteres deve continuar armazenado somente como
HMAC, possuir limite de tentativas, expiração, idempotência e auditoria. Ele
não deve ser retornado pela API do motoboy.

### 2.7 Múltiplas entregas por saída

Restaurantes frequentemente enviam mais de um pedido na mesma saída. A
recomendação é:

- permitir várias entregas em `A retirar` por motoboy;
- configurar `max_assigned_deliveries`, inicialmente entre 1 e 5;
- permitir várias entregas em rota quando o tenant optar por lote;
- ordenar manualmente no primeiro marco;
- deixar otimização automática de rota para uma etapa posterior.

Se o tenant preferir simplicidade, poderá configurar limite 1 e manter o
comportamento de uma entrega ativa por motoboy.

### 2.8 Ocorrências

O motoboy deve conseguir informar sem concluir:

- cliente ausente;
- endereço não localizado;
- cliente recusou;
- veículo com problema;
- pedido avariado;
- outro, com observação curta.

A ocorrência congela a ação de conclusão quando necessário, alerta o Admin e
mantém o pedido na fila de exceções. Somente Admin/Manager pode forçar
conclusão ou retorno, sempre com justificativa auditada.

## 3. Reutilização da stack atual

| Recurso existente | Reutilização |
|---|---|
| `users.role = DRIVER` | identidade operacional e RBAC do entregador |
| `deliveries.assigned_driver_id` | vínculo atual entre entrega e motoboy |
| `DeliveryDriverController` | base das APIs de fila, retirada, chegada, código e ocorrência |
| `DeliveryPinService` | código hexadecimal, HMAC, expiração e bloqueio |
| `DeliveryLocationService` | localização opcional em uma fase posterior |
| tracking público | acompanhamento do cliente e eventos em tempo real |
| `delivery_events` e outbox | auditoria, WhatsApp, websocket e sincronização |
| relatórios por driver | produtividade e entregas concluídas |
| Admin/KDS web atuais | atribuição, badges e atualização ao vivo |
| PostgreSQL/Redis/RabbitMQ | persistência, sessão/cache e eventos |

O perfil civil e veicular não deve ser colocado diretamente em `deliveries`.
Cada entrega mantém apenas o vínculo e snapshots mínimos necessários ao
histórico.

## 4. Modelo de dados proposto

### 4.1 `delivery_driver_profiles`

- `id` UUID;
- `tenant_id` UUID;
- `user_id` UUID, vínculo 1:1 com usuário `DRIVER`;
- `cpf_ciphertext`;
- `cpf_hmac`;
- `cpf_last4`;
- `vehicle_plate` normalizada;
- `vehicle_type`, inicialmente `MOTORCYCLE`;
- `operational_status`: `ACTIVE`, `INACTIVE`, `BLOCKED`;
- `availability`: `OFF_DUTY`, `AVAILABLE`, `BUSY`;
- `max_assigned_deliveries`;
- `access_version` para revogar todas as sessões;
- timestamps e exclusão lógica.

Índices:

- unique ativo `(tenant_id, cpf_hmac)`;
- índice `(tenant_id, operational_status, availability)`;
- placa ativa única por tenant como regra configurável, porque uma moto pode
  ser compartilhada em turnos diferentes.

### 4.2 `delivery_driver_sessions`

- token armazenado apenas como hash;
- `tenant_id`, `driver_profile_id`, expiração e revogação;
- `last_seen_at`, IP resumido/hasheado e user-agent limitado;
- escopo `DRIVER_PORTAL`;
- rotação e encerramento remoto pelo Admin.

### 4.3 `delivery_assignments`

Manter `deliveries.assigned_driver_id` como projeção atual e criar histórico:

- entrega, tenant e motoboy;
- quem atribuiu;
- posição manual na fila;
- atribuído, aceito, iniciado e encerrado em;
- motivo de reatribuição/cancelamento;
- estado atual do vínculo.

Isso evita perder o histórico quando uma entrega muda de motoboy.

### 4.4 Compatibilidade de usuário

O cadastro unificado deve criar a identidade `DRIVER` e o perfil em uma única
transação. Para motoboy não deve ser obrigatório inventar e-mail. A migration
deve permitir autenticação exclusiva pelo portal, mantendo login por e-mail
para os demais perfis administrativos.

## 5. APIs propostas

### 5.1 Admin/Dispatcher

- `GET /admin/api/delivery/drivers`
- `POST /admin/api/delivery/drivers`
- `PATCH /admin/api/delivery/drivers/:id`
- `POST /admin/api/delivery/drivers/:id/activate`
- `POST /admin/api/delivery/drivers/:id/deactivate`
- `POST /admin/api/delivery/drivers/:id/access-link`
- `POST /admin/api/delivery/drivers/:id/revoke-sessions`
- `GET /admin/api/delivery/drivers/:id/queue`
- `POST /admin/api/deliveries/:id/assign`
- `POST /admin/api/deliveries/:id/reassign`
- `PATCH /admin/api/delivery/drivers/:id/queue-order`

Cadastro e CPF completo: somente `ADMIN` e `MANAGER`. Atribuição: `ADMIN`,
`MANAGER` e `DISPATCHER`.

### 5.2 Portal do motoboy

- `POST /admin/api/public/driver/:tenantSlug/access/exchange`
- `POST /admin/api/public/driver/:tenantSlug/session`
- `GET /admin/api/public/driver/:tenantSlug/me`
- `GET /admin/api/public/driver/:tenantSlug/deliveries`
- `POST /admin/api/public/driver/:tenantSlug/deliveries/:id/pickup`
- `POST /admin/api/public/driver/:tenantSlug/deliveries/:id/start`
- `POST /admin/api/public/driver/:tenantSlug/deliveries/:id/complete`
- `POST /admin/api/public/driver/:tenantSlug/deliveries/:id/exception`
- `POST /admin/api/public/driver/:tenantSlug/logout`

Todos os endpoints derivam tenant e driver da sessão. Nenhum aceita
`tenant_id` ou `driver_id` enviados pelo navegador como fonte de autorização.

## 6. Telas

### 6.1 Admin — Frota própria

- resumo: ativos, disponíveis, em rota e com ocorrência;
- lista de motoboys com nome, CPF mascarado, placa, disponibilidade e fila;
- cadastro/edição;
- ativar/inativar;
- gerar acesso/QR;
- revogar sessões;
- abrir fila individual;
- histórico e produtividade.

### 6.2 KDS/Expedição

- badge do motoboy no cartão;
- seletor de motoboy disponível;
- quantidade já atribuída e limite;
- reatribuição com justificativa;
- estados visuais `sem motoboy`, `atribuído`, `retirado`, `em rota` e
  `ocorrência`;
- atualização por websocket sem refresh.

### 6.3 Portal do motoboy

- acesso/ativação;
- início/fim de turno;
- fila ativa;
- detalhe com mapa;
- confirmar retirada/início de rota;
- digitar o código de entrega;
- registrar ocorrência;
- histórico do dia;
- estado offline e tentativa segura de reenvio.

## 7. Pesquisa de mercado e aprendizados

### Onfleet

O Onfleet usa tarefas atribuídas ao motorista, navegação, histórico e prova de
entrega. A conclusão pode exigir foto, assinatura, código de barras ou outras
evidências; o histórico também pode ocultar PII depois da conclusão.

Aplicar no ClickGarçom:

- fila clara e ação primária por etapa;
- histórico curto do dia;
- redução de dados pessoais após concluir;
- arquitetura preparada para foto/assinatura, sem colocá-las no MVP.

Fontes: [Proof of Delivery](https://support.onfleet.com/hc/en-us/articles/10348848090644-Proof-of-Delivery),
[Complete a Task](https://support.onfleet.com/hc/en-us/articles/10373142665364-Complete-a-Task) e
[Task History](https://support.onfleet.com/hc/en-us/articles/360023910851-Task-History).

### Tookan

O Tookan trabalha com agentes, atribuição manual ou automática, disponibilidade
`on duty`, marcos de início/chegada/sucesso/falha e provas obrigatórias. Também
permite múltiplos tipos de evidência e campos configuráveis.

Aplicar no ClickGarçom:

- disponibilidade do motoboy;
- motivos estruturados de falha;
- prova obrigatória configurável no futuro;
- atribuição manual no MVP e automática depois;
- limite/fila por entregador.

Fontes: [Agent app](https://help.jungleworks.com/knowledge-base/agent-on-tookan-jungleworks/),
[Proof of Delivery](https://help.jungleworks.com/knowledge-base/proof-of-delivery-tookan-jungleworks/) e
[Tookan](https://tookan.ai/).

### iFood

O iFood diferencia entrega própria e logística parceira. Na entrega própria, o
restaurante mantém autonomia sobre área, taxa, prazo e execução; operações
híbridas podem combinar frota própria e operador conforme alcance/capacidade.

Aplicar no ClickGarçom:

- preservar `OWN` e `EXTERNAL` como fulfillments separados;
- permitir frota identificada somente em `OWN`;
- manter fallback manual para operador externo;
- apresentar tempo, status e comunicação ao cliente no mesmo fluxo.

Fontes: [Entregas para restaurantes](https://parceiros.ifood.com.br/restaurante/como-funciona/entregas) e
[Como funciona](https://parceiros.ifood.com.br/restaurante/como-funciona).

### Diferencial proposto para o ClickGarçom

- portal PWA sem instalação;
- identidade visual de cada tenant;
- integração nativa com pedido, PIX/cartão, WhatsApp, KDS e tracking já
  existentes;
- código hexadecimal compartilhado somente com o cliente;
- opção simples de capacidade numérica ou frota identificada;
- operação própria e externa no mesmo painel;
- custo de adoção menor para pequenos restaurantes que não precisam de uma
  suíte logística completa.

## 8. Privacidade e conformidade

Nome, CPF e geolocalização são dados pessoais. A LGPD exige finalidade,
necessidade, segurança, transparência e prestação de contas. O cadastro deve
informar por que os dados são usados e por quanto tempo serão mantidos.

Fontes oficiais: [LGPD e exemplos de dados pessoais](https://www.gov.br/mcti/pt-br/acesso-a-informacao/lei-geral-de-protecao-de-dados-pessoais-lgpd),
[princípios da LGPD](https://www.gov.br/saude/pt-br/acesso-a-informacao/lgpd/principios) e
[Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).

A Lei nº 12.009/2009 regula motofrete e atribui responsabilidades a quem
contrata serviço continuado. Como houve alteração normativa em 2026 e podem
existir regras estaduais/municipais, os campos de conformidade devem ser
configuráveis e revisados juridicamente antes de bloquear motoboys em produção.

Fonte oficial: [Lei nº 12.009/2009 consolidada](https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12009.htm).

## 9. Plano de execução

### Marco 0 — Rebaseline e feature flag

- aprovar `CAPACITY_ONLY` e `IDENTIFIED_DRIVERS`;
- atualizar requisitos/design que hoje excluem driver individual;
- congelar estados, APIs e eventos;
- definir política de CPF, sessão e retenção;
- manter todos os tenants atuais em `CAPACITY_ONLY`.

### Marco 1 — Cadastro e acesso

- migrations de perfil, sessão e histórico de atribuição;
- CRUD com CPF criptografado/HMAC e placa;
- RBAC e auditoria;
- ativação, PIN pessoal, revogação e expiração de sessão;
- tela Admin de frota;
- testes de isolamento multi-tenant e segurança.

### Marco 2 — Atribuição e portal operacional

- habilitar atribuição individual apenas para `IDENTIFIED_DRIVERS`;
- fila individual e ordenação;
- portal PWA com retirada, início de rota, código e ocorrência;
- atualizar fulfillment próprio e capacidade;
- idempotência e concorrência;
- impedir que um motoboy consulte ou conclua entrega de outro.

### Marco 3 — Integrações e experiência em tempo real

- atribuição no KDS/Expedição;
- websocket por motoboy e por tenant;
- WhatsApp com nome do motoboy e tracking;
- notificações do portal;
- relatórios por motoboy e exportação;
- observabilidade, alertas e runbook.

### Marco 4 — Otimização posterior

- GPS em tempo real sob consentimento/base legal definida;
- geofence de retirada/chegada;
- lote e roteirização multi-parada;
- autoatribuição por disponibilidade, carga e proximidade;
- foto/assinatura como prova adicional;
- documentos e alertas de validade;
- cálculo de diária, taxa por entrega ou incentivos.

## 10. Backlog inicial por frente

### Backend

- `DEL-FLEET-BE-001`: feature flag e compatibilidade V2;
- `DEL-FLEET-BE-002`: migrations e entidades de perfil/sessão/atribuição;
- `DEL-FLEET-BE-003`: criptografia, HMAC e validação de CPF/placa;
- `DEL-FLEET-BE-004`: CRUD, RBAC e auditoria;
- `DEL-FLEET-BE-005`: autenticação do portal;
- `DEL-FLEET-BE-006`: fila e atribuição concorrente;
- `DEL-FLEET-BE-007`: retirada, rota, código e ocorrência;
- `DEL-FLEET-BE-008`: capacidade por motoboy e por tenant;
- `DEL-FLEET-BE-009`: websocket/eventos e relatórios;
- `DEL-FLEET-BE-010`: manutenção, expiração e observabilidade.

### Frontend Admin/KDS

- `DEL-FLEET-FE-001`: configuração do modo de frota;
- `DEL-FLEET-FE-002`: cadastro/listagem de motoboys;
- `DEL-FLEET-FE-003`: acesso, QR e revogação;
- `DEL-FLEET-FE-004`: fila por motoboy;
- `DEL-FLEET-FE-005`: atribuição/reatribuição no KDS;
- `DEL-FLEET-FE-006`: estados, ocorrências e histórico;
- `DEL-FLEET-FE-007`: acessibilidade e responsividade.

### Portal do motoboy

- `DEL-FLEET-DRV-001`: shell PWA personalizado por tenant;
- `DEL-FLEET-DRV-002`: ativação e sessão;
- `DEL-FLEET-DRV-003`: fila e detalhe;
- `DEL-FLEET-DRV-004`: mapa/navegação;
- `DEL-FLEET-DRV-005`: retirada e início da rota;
- `DEL-FLEET-DRV-006`: confirmação por código;
- `DEL-FLEET-DRV-007`: ocorrência e retorno;
- `DEL-FLEET-DRV-008`: realtime, offline e histórico.

### Core/WhatsApp

- `DEL-FLEET-CORE-001`: eventos de atribuição/retirada;
- `DEL-FLEET-CORE-002`: mensagem com nome do motoboy;
- `DEL-FLEET-CORE-003`: preservar código e tracking seguros;
- `DEL-FLEET-CORE-004`: mensagens de ocorrência/reatribuição;
- `DEL-FLEET-CORE-005`: idempotência e ordenação de mensagens.

### QA e operação

- `DEL-FLEET-QA-001`: isolamento entre tenants e motoboys;
- `DEL-FLEET-QA-002`: concorrência de atribuição/conclusão;
- `DEL-FLEET-QA-003`: brute force, sessão e revogação;
- `DEL-FLEET-QA-004`: CPF/logs/websocket sem vazamento;
- `DEL-FLEET-QA-005`: PWA em Android/iPhone e conexão lenta;
- `DEL-FLEET-QA-006`: regressão `CAPACITY_ONLY` e `EXTERNAL`;
- `DEL-FLEET-QA-007`: piloto com um tenant e dois motoboys;
- `DEL-FLEET-QA-008`: backup, rollback e métricas.

## 11. Critérios de aceite do primeiro piloto

1. Tenant escolhe capacidade simples ou frota identificada.
2. Admin cadastra nome, CPF e placa sem expor CPF completo depois do cadastro.
3. Motoboy acessa pelo celular sem instalar aplicativo.
4. Motoboy vê somente entregas atribuídas a ele e ao tenant correto.
5. Admin/KDS atribui e reatribui com atualização em tempo real.
6. Motoboy inicia a rota e o cliente recebe as mensagens existentes.
7. Código correto conclui; código errado respeita limite e bloqueio.
8. Conclusão remove o cartão da fila ativa e libera capacidade uma única vez.
9. Ocorrência não finaliza a entrega e alerta a operação.
10. Modo atual por capacidade e operador externo continuam sem regressão.
11. Todas as mutações possuem auditoria e idempotência.
12. Nenhum CPF, código ou token aparece em log, evento ou websocket.

## 12. Ordem recomendada

Executar primeiro cadastro + acesso + atribuição manual + código. Não iniciar
GPS, autoatribuição ou otimização de rota antes do piloto. A maior vantagem
inicial vem de saber quem levou cada pedido, dar uma fila simples ao motoboy e
fechar a entrega com prova de recebimento — exatamente onde a operação atual
ainda depende do operador do restaurante.
