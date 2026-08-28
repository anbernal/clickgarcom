# Design técnico — MVP Agenda & Serviços

## 1. Arquitetura

```text
Super Admin
  -> ativa capability APPOINTMENTS

Tenant Admin
  -> serviços, profissionais, disponibilidade e automações
  -> Node Admin API
  -> PostgreSQL + outbox

WhatsApp / Go Core
  -> ação estável open_appointments
  -> link autenticado

Página Agenda
  -> API pública com capability
  -> disponibilidade e hold
  -> confirmação do agendamento

Scheduler
  -> notification jobs vencidos
  -> notifications.send
  -> Go Core envia WhatsApp
```

O Node Admin continua como plano de autoria e domínio de agenda. O Go Core
continua dono da sessão do WhatsApp e do envio. PostgreSQL permanece fonte de
verdade; Redis pode acelerar leitura, mas não decide disponibilidade.

## 2. Reutilização da stack atual

| Capacidade existente | Reutilização |
| --- | --- |
| `customers` por tenant+telefone | identidade do cliente |
| capability/token do Cardápio/Loja | acesso à página de agenda |
| `bot_flow_definitions` | rascunho, versão, publicação e rollback |
| outbox/`notifications.send` | confirmação, lembrete e cancelamento |
| shell e design system do Admin | agenda, serviços e editor |
| Super Admin modular | ativação, validade e auditoria |
| Mercado Pago | sinal/pagamento em fase posterior |
| WebSocket/reconciliação | atualização da agenda em tempo real |

Não reutilizar `menu_items` para serviços. Duração, buffers e disponibilidade
são conceitos próprios e merecem tabelas próprias.

## 3. Modelo de dados

### `appointment_services`

- `id`, `tenant_id`, `category_id` opcional;
- `name`, `description`, `image_url`;
- `duration_minutes`, `buffer_before_minutes`, `buffer_after_minutes`;
- `price_cents` opcional;
- `confirmation_mode`;
- `min_notice_minutes`, `max_advance_days`, `daily_limit` opcional;
- `active`, `display_order`, `version`, timestamps.

### `appointment_professionals`

- `id`, `tenant_id`, `name`, `role_label`, `image_url`;
- `phone` opcional e nunca público por default;
- `concurrency_limit` default 1;
- `active`, `version`, timestamps.

### `appointment_service_professionals`

- `tenant_id`, `service_id`, `professional_id`;
- duração/preço customizável fica fora do primeiro MVP;
- unique tenant+service+professional.

### `appointment_availability_rules`

- tenant, profissional opcional;
- dia da semana, início/fim local;
- data inicial/final opcional;
- timezone snapshot;
- ativo e versão.

### `appointment_calendar_blocks`

- tenant, profissional opcional;
- início/fim UTC;
- tipo `TIME_OFF`, `BREAK`, `MANUAL_BLOCK`, `BUSINESS_CLOSED`;
- motivo interno e ator.

### `appointment_slot_holds`

- tenant, customer, service, professional;
- `start_at`, `end_at`, `expires_at`;
- status `HELD`, `CONSUMED`, `RELEASED`, `EXPIRED`;
- idempotency key e timestamps.

### `appointments`

- tenant, customer, service e profissional;
- início/fim UTC, timezone snapshot;
- status e confirmation mode snapshot;
- nome/preço/duração do serviço em snapshot;
- origem `WHATSAPP`, `ADMIN`, `PUBLIC_LINK`;
- versão e timestamps de cada marco.

### `appointment_events`

- appointment, tipo, estado anterior/novo;
- ator, motivo, metadata segura;
- correlation/idempotency key e timestamp;
- append-only.

### `appointment_notification_jobs`

- appointment, flow version, trigger, planned_at;
- template snapshot e destination;
- status `PENDING`, `PROCESSING`, `SENT`, `CANCELED`, `FAILED`;
- attempts, last_error, idempotency key.

### `appointment_access_credentials`

- tenant, customer, appointment opcional;
- escopo, token hash, expiração, revogação e último uso;
- token bruto nunca é persistido.

## 4. Disponibilidade e concorrência

O servidor gera slots, mas a confirmação sempre recalcula dentro de transação:

```text
BEGIN
  lock professional/day scheduling key
  expire stale holds
  validate business + professional availability
  validate service duration + buffers
  validate blocks + active appointments + holds
  create or refresh idempotent hold
COMMIT
```

Na confirmação, o hold é travado, revalidado e convertido em agendamento. Uma
constraint de exclusão por profissional e intervalo deve ser a última barreira
contra sobreposição. Todos os horários são persistidos em UTC e apresentados no
timezone snapshot do tenant.

`Qualquer profissional` é resolvido na transação entre elegíveis, priorizando
menor carga no dia e ordem estável para evitar resultados aleatórios.

## 5. Página pública

Nova rota sugerida:

```text
/agendar/:tenant-slug#access=<capability>
```

Etapas na mesma página:

1. catálogo visual de serviços;
2. profissional opcional;
3. calendário com primeiros horários disponíveis;
4. revisão e dados mínimos;
5. confirmação e acesso a `Meus agendamentos`.

A página usa o logo, cores e terminologia do tenant. Deve funcionar dentro do
navegador do WhatsApp, preservar a sessão após refresh e nunca mostrar horário
que não possa ser revalidado pelo servidor.

## 6. Editor visual de automações

O editor reutiliza o versionamento de `bot_flow_definitions` com uma definição
do tipo `event_workflow` e chave `appointments_lifecycle`.

### Nós permitidos

- `TRIGGER` — evento fixo do domínio;
- `WAIT` — atraso relativo ou horário antes do atendimento;
- `MESSAGE` — texto e botão editáveis;
- `EXPECT_ACTION` — ação estável permitida;
- `STOP` — encerra aquele ramo.

### Gatilhos iniciais

- `BOOKING_REQUESTED`;
- `BOOKING_CONFIRMED`;
- `BOOKING_REMINDER_DUE`;
- `BOOKING_RESCHEDULED`;
- `BOOKING_CANCELED`;
- `BOOKING_REJECTED`.

### Proteções

- não permitir ciclos;
- no máximo 10 nós por gatilho;
- no máximo três lembretes proativos por agendamento;
- variáveis apenas de uma whitelist;
- preview escapa HTML e nunca expõe dados internos;
- publicar exige validação e motivo;
- eventos críticos mantêm fallback padrão mesmo sem fluxo publicado.

### Layout do Admin

```text
[Paleta]       [Fluxo vertical arrastável]       [Propriedades]
Gatilhos       Confirmação criada                Texto
Mensagem   ->  Esperar até T-24h             -> Botão
Espera         Enviar lembrete                   Resposta esperada
Ação           Encerrar                          Preview
```

O tenant pode adicionar mensagens e reordenar ações dentro de um gatilho, mas
não pode inventar transições de estado ou chamadas externas.

## 7. APIs propostas

### Admin

- CRUD `/admin/api/appointments/services`;
- CRUD `/admin/api/appointments/professionals`;
- CRUD `/admin/api/appointments/availability` e `/blocks`;
- `GET /admin/api/appointments/calendar`;
- `POST /admin/api/appointments`;
- comandos `/confirm`, `/reschedule`, `/cancel`, `/check-in`, `/start`,
  `/complete`, `/no-show`;
- CRUD/publicação `/admin/api/appointments/automations`.

### Público autenticado

- `POST /public/appointments/access/exchange`;
- `GET /public/appointments/catalog`;
- `GET /public/appointments/availability`;
- `POST /public/appointments/holds`;
- `POST /public/appointments/book`;
- `GET /public/appointments/mine`;
- comandos autenticados `/confirm`, `/reschedule` e `/cancel`.

## 8. RBAC

Grupos sugeridos:

- `appointments_read` — agenda e detalhes mínimos;
- `appointments_operate` — criar, confirmar, reagendar e operar status;
- `appointments_config` — serviços, profissionais e disponibilidade;
- `appointments_cancel` — cancelamento administrativo;
- `appointments_automation_publish` — publicar/rollback de mensagens.

Admin e Manager recebem todos. Um futuro perfil `RECEPTIONIST` recebe leitura e
operação, sem configuração/publicação.

## 9. Integrações posteriores

- WhatsApp Flows como renderer alternativo da jornada;
- sincronização Google Calendar por profissional;
- sinal/pagamento via Mercado Pago;
- lista de espera e preenchimento de desistências;
- recursos físicos, grupos, pacotes e recorrência;
- ficha clínica em módulo separado e sujeito a revisão LGPD.

