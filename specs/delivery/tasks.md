# Plano mestre de tasks — Delivery V2

## 1. Fonte de verdade

Este backlog deriva da [especificação técnica de logística e Delivery](../../docs/especificacao_tecnica_logistica_delivery.md), versão 2.0.

No escopo Delivery V2:

- cada filial é um tenant;
- o tenant ativa o módulo e escolhe `OWN` ou `EXTERNAL` como modalidade padrão;
- entrega própria usa capacidade numérica, sem entregador individual, localização ou PIN;
- entrega externa usa cotação antes do pagamento e contratação ao iniciar preparo;
- iFood Sob Demanda é o primeiro operador;
- cada ciclo executa cinco tentativas no mesmo operador em até 15 minutos;
- fallback de operador/modalidade é manual;
- clientes são identificados por telefone e podem manter até cinco endereços;
- CEP, geocodificação, preço, endereço e configuração são confirmados/snapshotados.

> Evolução em estudo: o plano [Frota própria com motoboys identificados](./own-fleet-drivers-plan.md)
> propõe um modo opcional por feature flag. Até sua aprovação e rebaseline, as
> restrições de capacidade numérica deste V2 continuam sendo a fonte de verdade.

Documentos anteriores em `specs/delivery/requirements.md` e `specs/delivery/design.md` contêm decisões do fluxo antigo. A implementação local do MVP fake está concluída; os gates que dependem de serviços/contas externas permanecem separados na seção de dependências.

## 2. Backlogs detalhados

- [Backend NestJS e persistência](./tasks-backend.md)
- [Core Go e WhatsApp](./tasks-core-whatsapp.md)
- [Frontend Admin](./tasks-frontend.md)
- [KDS Mobile e compatibilidade](./tasks-kds-mobile.md)
- [Qualidade, segurança, operação e piloto](./tasks-qa-ops.md)

### Progresso atual

- **Pronto para teste manual sem serviços externos:** domínio/persistência V2, clientes e endereços, CEP/geocode fake, snapshots, tarifa própria, capacidade/hold, checkout próprio e externo fake, scheduler de cinco tentativas, webhook/reconciliação fake, fallback manual, operação própria, RBAC `DISPATCHER`, eventos/outbox/relay, Core/WhatsApp, painel Admin, relatórios/CSV e regressão KDS.
- **Validação local executada:** `go build ./...`, `go test ./...`, `npm run build`, `npx tsc --noEmit` e `npx expo export --platform web` no KDS mobile, smoke fake (4/4), contrato (4/4), segurança (2/2), Delivery UX (17/17), KDS UX (9/9) e `git diff --check`.
- **Roteiro de execução manual:** `docs/delivery-manual-test-plan.md` cobre ativação do tenant, endereço/CEP, quote/checkout, capacidade própria, ciclo externo fake, fallback, operação própria, notificações e relatórios.

### Fechamento local e gates remanescentes

As tasks de implementação que estavam marcadas como “em execução” por falta de evidência foram fechadas no escopo determinístico/fake. Restam somente gates que exigem infraestrutura, ferramenta ou conta fora do repositório:

- banco PostgreSQL/RabbitMQ para executar migrations, workers e concorrência em ambiente integrado (`DEL-V2-QA-002`, `003`, `005`);
- scanner axe/LGPD e canal de alertas operacional (`DEL-V2-QA-006`, parte de `DEL-V2-FE-012`);
- credenciais, merchant e sandbox iFood para o adapter real (`DEL-V2-BE-018`, `DEL-V2-QA-008`);
- homologação com pagamento/provedor reais e piloto (`DEL-V2-QA-009`, `010`), além do rollout controlado.

Nesta sessão o código local foi validado sem Docker; `docker compose ps` não conseguiu conectar ao Docker Engine. Por isso não classificamos a ausência do PostgreSQL/RabbitMQ como falha de implementação.

Os itens P1 (segundo operador, polígonos e conciliação automática) continuam fora do gate do MVP e não impedem o teste manual fake.
- Validação executada: `go test ./...` em `platform/core-backend`, `npm run build` em `apps/tenant-admin/api`, `npm run test:delivery-smoke` (4/4), `npm run test:delivery-contract` (4/4), `npm run test:delivery-security` (2/2), `npm run test:delivery-ux` (17/17), `npm run test:kds-ux` (9/9) em `apps/tenant-admin/web` e `git diff --check`.

## 3. Convenções

- `P0`: necessário para o primeiro piloto controlado.
- `P1`: necessário antes de expansão para vários tenants.
- `P2`: evolução posterior.
- `[ ] Pendente`, `[~] Em execução`, `[x] Concluída`.
- IDs V2 não reutilizam IDs do plano antigo.
- Dependência de contrato significa que schema/OpenAPI/evento deve estar congelado; mocks podem ser usados depois disso.
- Uma task não está concluída apenas porque o caminho feliz funciona.
- Toda mutação deve declarar tenant scope, RBAC, idempotência, auditoria e comportamento concorrente.
- Toda integração externa deve possuir fake adapter e erro normalizado antes do adapter real.
- O provider ativo nesta fase é o fake determinístico; sandbox iFood só será habilitado na etapa de homologação, sem alterar as regras do domínio.
- Nenhuma task pode reintroduzir tracking/PIN próprio ou entregador individual no caminho crítico do V2.

## 4. Trilhas e responsáveis técnicos

| Trilha | Prefixo | Responsabilidade |
|---|---|---|
| Contratos/backend | `DEL-V2-BE` | Domínio, banco, APIs, provider adapters, scheduler, webhooks e financeiro. |
| Core/WhatsApp | `DEL-V2-CORE` | Conversa, checkout, pagamento, comandos internos, eventos e mensagens. |
| Frontend | `DEL-V2-FE` | Configuração, clientes, endereços e operação administrativa. |
| Mobile | `DEL-V2-MOB` | Garantir que o novo MVP não dependa do app e preservar regressão do KDS. |
| QA/Operação | `DEL-V2-QA` | Contratos, E2E, carga, segurança, homologação, runbooks e piloto. |

## 5. Marcos de execução

### M0 — Rebaseline e contratos V2

Tasks:

- `DEL-V2-BE-001` a `DEL-V2-BE-003`;
- `DEL-V2-CORE-001`;
- `DEL-V2-FE-001`;
- `DEL-V2-MOB-001`.

Saída:

- requisitos/design antigos reconciliados;
- enums, schemas, endpoints e eventos V2 congelados;
- estratégia de compatibilidade das tabelas existentes aprovada;
- nenhum consumidor novo depende de driver individual, tracking próprio ou PIN.

### M1 — Clientes, endereços e infraestrutura de localização

Tasks:

- `DEL-V2-BE-004` a `DEL-V2-BE-008`;
- `DEL-V2-CORE-002` a `DEL-V2-CORE-005`;
- `DEL-V2-FE-002` e `DEL-V2-FE-003`.

Saída:

- cliente resolvido por tenant+telefone;
- até cinco endereços ativos;
- CEP, entrada manual, geocode, confirmação, default e exclusão lógica;
- fluxo WhatsApp e Admin funcionais;
- snapshot imutável no pedido.

### M2 — Entrega própria simplificada

Tasks:

- `DEL-V2-BE-009` a `DEL-V2-BE-012`;
- `DEL-V2-CORE-006` e `DEL-V2-CORE-007`;
- `DEL-V2-FE-004` e `DEL-V2-FE-005`.

Saída:

- todos os modos de preço próprio;
- simulador;
- hold e reserva concorrentes;
- checkout com frete;
- painel com aguardando, saiu e entregue;
- capacidade liberada de forma idempotente.

### M3 — Fundação de operadores externos

Tasks:

- `DEL-V2-BE-013` a `DEL-V2-BE-017`;
- `DEL-V2-CORE-008`;
- `DEL-V2-FE-006`;
- `DEL-V2-QA-001` e `DEL-V2-QA-002`.

Saída:

- credenciais seguras;
- contrato neutro e fake provider;
- cotação externa antes do pagamento;
- fulfillment e custos separados;
- UI de conexão e teste.

### M4 — iFood e alocação

Tasks:

- `DEL-V2-BE-018` a `DEL-V2-BE-022`;
- `DEL-V2-CORE-009` e `DEL-V2-CORE-010`;
- `DEL-V2-FE-007` e `DEL-V2-FE-008`;
- `DEL-V2-QA-003`.

Saída:

- cotação iFood off-platform;
- contratação em `PREPARING`;
- cinco tentativas/15 minutos;
- webhook, polling/reconciliação, tracking e código do operador;
- alerta de ciclo esgotado.

### M5 — Fallback, financeiro e hardening

Tasks:

- `DEL-V2-BE-023` a `DEL-V2-BE-028`;
- `DEL-V2-CORE-011` e `DEL-V2-CORE-012`;
- `DEL-V2-FE-009` a `DEL-V2-FE-012`;
- `DEL-V2-QA-004` a `DEL-V2-QA-007`.

Saída:

- troca manual de operador;
- conversão para própria;
- preço do cliente imutável e diferença do restaurante;
- RBAC `DISPATCHER`;
- auditoria, métricas, retenção e segurança aprovadas.

### M6 — Homologação e piloto

Tasks:

- `DEL-V2-BE-029`;
- `DEL-V2-CORE-013`;
- `DEL-V2-FE-013`;
- `DEL-V2-QA-008` a `DEL-V2-QA-010`.

Saída:

- sandbox/homologação iFood concluídos;
- fluxo completo em ambiente semelhante à produção;
- piloto de um tenant em Osasco;
- rollback e suporte validados.

## 6. Caminho crítico

```text
BE-001 Rebaseline
  -> BE-002 Contratos V2
  -> BE-003 Migração/compatibilidade
  -> BE-004 Clientes
  -> BE-005 Endereços
  -> BE-006 CEP
  -> BE-007 Geocode
  -> BE-009 Settings V2
  -> BE-010 Preço próprio
  -> BE-011 Capacidade
  -> BE-012 Checkout próprio
  -> BE-013 Credenciais
  -> BE-014 Provider neutro
  -> BE-015 Quotes/Fulfillments
  -> BE-016 Checkout externo
  -> BE-018 iFood
  -> BE-019 Scheduler
  -> BE-020 Webhooks
  -> BE-021 Reconciliação
  -> BE-023 Fallback
  -> QA-008 Homologação
  -> QA-010 Piloto
```

Core e Frontend avançam com mocks depois de `BE-002`. O adapter iFood não começa antes de `BE-014` e `BE-015`.

## 7. Dependências externas

- conta iFood Sob Demanda e merchant de teste;
- credenciais de sandbox/homologação;
- provedor de CEP selecionado;
- provedor de geocodificação/rotas selecionado;
- chave mestra/secret manager;
- HTTPS e webhook público;
- templates WhatsApp aprovados quando aplicável;
- definição de retenção/LGPD;
- tenant e equipe do piloto.

O desenvolvimento não deve ficar bloqueado por conta externa: fake providers são obrigatórios.

## 8. Gates de qualidade

### Gate A — Contratos e migração

- migrations sobem em banco vazio e baseline atual;
- rollback preserva dados conforme estratégia documentada;
- enums e OpenAPI V2 congelados;
- consumidores legados continuam compilando;
- tenant sem módulo não sofre regressão.

### Gate B — Endereço e checkout próprio

- isolamento por tenant testado negativamente;
- limite de cinco endereços é transacional;
- CEP fora do ar permite entrada manual;
- snapshots antigos não mudam;
- concorrência de capacidade não vende a mesma vaga.

### Gate C — Operador externo

- segredo não retorna ao browser/log;
- quote expirada recota sem mudar preço do cliente;
- criação ambígua reconcilia antes de retry;
- cinco tentativas são determinísticas e recuperáveis após restart;
- webhook duplicado/fora de ordem não corrompe estado.

### Gate D — Fallback e financeiro

- troca exige papel, motivo, idempotency key e expected version;
- novo operador começa novo ciclo 1/5;
- conversão própria exige capacidade;
- após coleta, troca é bloqueada;
- diferença financeira pertence ao restaurante e é auditada.

### Gate E — Piloto

- E2E WhatsApp -> endereço -> cotação -> pagamento -> preparo -> entrega;
- sandbox iFood homologado;
- dashboards e alertas ativos;
- runbooks de credencial, falha, cancelamento e rollback;
- piloto habilitado em um tenant, sem ativação global.

## 9. Definition of Done geral

Toda task deve:

- referenciar seções da especificação V2;
- possuir critérios de aceite verificáveis;
- incluir testes proporcionais ao risco;
- preservar tenant scope e RBAC;
- definir idempotência/concorrência nas mutações;
- não registrar segredo, telefone ou endereço completo em logs comuns;
- atualizar OpenAPI/eventos quando alterar contrato;
- documentar migrations e variáveis de ambiente;
- preservar `DINE_IN`, `TAKEOUT` e tenants sem Delivery;
- incluir evidência manual quando envolver UI, WhatsApp ou operador externo.

## 10. Itens explicitamente removidos do caminho crítico

- atualização do Expo para localização;
- perfil de entregador próprio no KDS Mobile;
- envio de GPS;
- tracking público próprio;
- PIN do ClickGarçom;
- geofence e foto;
- atribuição individual de motoboy.

Esses itens só podem retornar por nova decisão de produto e nova especificação.
