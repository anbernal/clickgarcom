# Plano de implementação — MVP Agenda & Serviços

## Convenções

- `P0`: obrigatório para piloto.
- `P1`: obrigatório antes de expansão.
- `P2`: evolução.
- Todas as tarefas começam pendentes.
- Cada mutação exige tenant scope, RBAC, versão e idempotência.

Fontes de verdade:

- [Requisitos](./requirements.md)
- [Design técnico](./design.md)
- [Estudo de mercado](./market-study.md)

## M0 — Capability, contratos e linguagem

- [ ] `AGD-SA-001` P0 — Adicionar ativação `APPOINTMENTS` no Super Admin com
  início, validade/permanente, auditoria e sem alterar outros módulos.
- [ ] `AGD-BE-001` P0 — Expor capability, `industry_profile` e permissões na
  autenticação/OpenAPI.
- [ ] `AGD-CORE-001` P0 — Adicionar ação estável `open_appointments` ao menu
  dinâmico do WhatsApp.
- [x] `AGD-FE-001` P0 — Resolver menu e terminologia por capability/perfil. *(frontend e gateway de integração prontos)*
- [ ] `AGD-QA-001` P0 — Matriz híbrida com Atendimento, Loja, Cardápio e
  Delivery ativos/inativos.

Saída: módulo pode ser ativado isoladamente e aparece apenas para usuários com
permissão.

## M1 — Domínio e persistência

- [ ] `AGD-BE-002` P0 — Criar migrations de serviços, profissionais, vínculos,
  disponibilidade, bloqueios, holds, agendamentos, eventos e credenciais.
- [ ] `AGD-BE-003` P0 — Criar aggregate de agendamento e máquina de estados.
- [ ] `AGD-BE-004` P0 — Criar cálculo de disponibilidade com timezone, buffers,
  exceções e limites.
- [ ] `AGD-BE-005` P0 — Implementar hold/confirm transacional, constraint de
  sobreposição e expiração.
- [ ] `AGD-BE-006` P0 — Reutilizar `customers` por tenant+telefone por meio de
  uma fachada neutra, preservando APIs Delivery.
- [ ] `AGD-QA-002` P0 — Testar corrida pelo mesmo slot, retry, timezone, virada
  de dia, horário de verão, inativação e isolamento de tenant.

Saída: agenda consistente e impossível de duplicar para o mesmo profissional.

## M2 — Admin operacional

- [x] `AGD-FE-002` P0 — Criar dashboard Agenda com visões dia, semana e lista.
- [x] `AGD-FE-003` P0 — Criar CRUD visual de serviços e categorias.
- [x] `AGD-FE-004` P0 — Criar CRUD de profissionais, serviços e disponibilidade.
- [x] `AGD-FE-005` P0 — Criar bloqueios/folgas e edição rápida da agenda.
- [x] `AGD-FE-006` P0 — Criar modal operacional com confirmar, reagendar,
  cancelar, chegada, início, conclusão e ausência.
- [ ] `AGD-BE-007` P0 — Implementar endpoints, RBAC, auditoria e eventos realtime.
- [ ] `AGD-QA-003` P0 — Cobrir responsividade, acessibilidade, concorrência de
  operadores e atualização sem refresh.

Saída: recepção administra o dia completo pelo painel.

## M3 — Página de agendamento

- [ ] `AGD-BE-008` P0 — Criar capability, troca por sessão e credencial de
  gerenciamento revogável.
- [ ] `AGD-BE-009` P0 — Criar APIs públicas de catálogo, disponibilidade, hold,
  confirmação e histórico próprio.
- [x] `AGD-FE-007` P0 — Criar `/agendar/:slug` com identidade visual do tenant.
- [x] `AGD-FE-008` P0 — Implementar serviço -> profissional -> data/hora ->
  revisão em uma única página.
- [x] `AGD-FE-009` P0 — Implementar Meus agendamentos, reagendar, cancelar e
  repetir serviço.
- [ ] `AGD-QA-004` P0 — Testar navegador interno do WhatsApp, refresh, expiração,
  token trocado, deep link e dispositivo móvel.

Saída: cliente agenda sem conversa passo a passo.

## M4 — WhatsApp e notificações

- [ ] `AGD-CORE-002` P0 — Enviar botão autenticado para Agenda & Serviços.
- [ ] `AGD-BE-010` P0 — Criar jobs de confirmação, lembrete, alteração,
  cancelamento e rejeição com outbox.
- [ ] `AGD-CORE-003` P0 — Consumir projeção de notificação e enviar templates
  transacionais com link de gerenciamento.
- [ ] `AGD-BE-011` P0 — Cancelar lembretes pendentes ao cancelar/concluir e
  reconciliar jobs presos.
- [ ] `AGD-QA-005` P0 — Provar ordem, idempotência, retry, falha do provider e
  limite de mensagens.

Saída: confirmação e cancelamento chegam uma vez; o default envia somente um
lembrete.

## M5 — Editor visual de automações

- [ ] `AGD-BE-012` P0 — Estender contrato de `bot_flow_definitions` com
  `event_workflow`, whitelist de nós e validação de grafo acíclico.
- [x] `AGD-FE-010` P0 — Criar editor com paleta, drag-and-drop, propriedades e
  preview de celular.
- [x] `AGD-FE-011` P0 — Permitir adicionar mensagem, espera e resposta esperada
  entre ações autorizadas.
- [ ] `AGD-BE-013` P0 — Compilar versão publicada em regras de notification job,
  preservando snapshot por agendamento.
- [x] `AGD-FE-012` P0 — Implementar rascunho, validação, publicar, histórico,
  comparação e rollback.
- [ ] `AGD-QA-006` P0 — Testar fluxo inválido, loop, placeholder proibido,
  publicação concorrente, rollback e fallback sem definição.

Saída: tenant personaliza automações sem poder quebrar regras da agenda.

## M6 — Hardening e piloto

- [ ] `AGD-BE-014` P1 — Métricas de ocupação, cancelamento, ausência, falha de
  notificação e jobs atrasados.
- [ ] `AGD-BE-015` P1 — Rotina de retenção e anonimização conforme política.
- [ ] `AGD-QA-007` P0 — Segurança: RBAC, tenant isolation, token hash, rate limit,
  enumeração de horários e dados pessoais.
- [ ] `AGD-QA-008` P0 — Backup, migration, smoke, rollback e runbook.
- [ ] `AGD-QA-009` P0 — Piloto `SALON` com confirmação automática.
- [ ] `AGD-QA-010` P0 — Piloto `CLINIC` com aceite manual e sem dado clínico.

## Paralelização após M0

Depois de congelar contratos e estados:

- backend executa migrations, disponibilidade e holds;
- frontend cria shell da agenda e página pública com fixtures contratuais;
- Core implementa `open_appointments` e adapter de notificações;
- QA prepara matriz de módulos, concorrência e segurança.

M3 depende do cálculo/hold de M1. M4 depende dos eventos do aggregate. M5 pode
começar pelo editor visual, mas publicação real depende do scheduler de M4.

## Gate do MVP

O piloto só é liberado quando:

- dois clientes não confirmam o mesmo horário;
- refresh não perde a sessão do cliente;
- somente o próprio cliente gerencia seu agendamento;
- confirmação, reagendamento e cancelamento chegam uma única vez;
- lembrete cancelado não é enviado;
- textos customizados não mudam IDs de negócio;
- módulo desativado não aparece no WhatsApp nem cria novas reservas;
- Agenda coexistir com os módulos atuais sem alterar seus fluxos;
- Clínica não coletar dados de saúde no recorte inicial.
