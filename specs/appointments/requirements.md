# Requisitos — MVP Agenda & Serviços

## 1. Objetivo

Criar um módulo genérico de catálogo de serviços e agendamento para clínicas,
spas, salões e prestadores, reutilizando a stack existente sem acoplar o domínio
a mesas, cozinha, produtos ou Delivery.

## 2. Ativação e perfis

A capability é independente:

```json
{
  "appointments": {
    "enabled": true,
    "industry_profile": "SALON",
    "public_booking_enabled": true
  }
}
```

Perfis de linguagem iniciais:

- `CLINIC`;
- `SPA`;
- `SALON`;
- `GENERIC`.

O Super Admin ativa/desativa o módulo. O tenant configura serviços, equipe,
agenda, textos e automações. Módulos ativos podem coexistir e o menu inicial do
WhatsApp mostra apenas as capacidades liberadas.

## 3. Jornada mínima do cliente

```text
WhatsApp
  -> botão "Agendar horário"
  -> página autenticada
  -> escolher serviço
  -> escolher profissional ou "qualquer disponível"
  -> escolher dia e horário
  -> revisar dados
  -> confirmar
  -> receber uma confirmação
  -> gerenciar, reagendar ou cancelar pelo link seguro
```

Nenhuma mensagem é enviada para cada escolha intermediária.

## 4. Política de mensagens

Default do MVP:

- mensagem inicial com link somente quando o cliente escolher Agendamentos;
- confirmação imediata ou aviso de solicitação recebida;
- um lembrete em T-24h, com link `Gerenciar agendamento`;
- confirmação de reagendamento;
- notificação de cancelamento;
- nenhuma mensagem de progresso sem evento real.

O tenant pode editar textos e horários, desativar lembretes ou criar até três
lembretes proativos. O sistema bloqueia loops e mensagens duplicadas.

## 5. Requisitos funcionais

### AGD-RF-001 — Módulo independente

Ativar Agenda & Serviços não altera Atendimento, Loja, Cardápio ou Delivery.
Desativar impede novos agendamentos, preserva histórico e mantém os futuros
visíveis para cancelamento/operação.

### AGD-RF-002 — Catálogo de serviços

Cada serviço possui categoria, nome, descrição, imagem opcional, duração,
buffers antes/depois, preço opcional, modo de confirmação, profissionais
habilitados, antecedência mínima/máxima e estado ativo.

Modos:

- `AUTO_CONFIRM` — reserva válida já nasce confirmada;
- `MANUAL_APPROVAL` — nasce aguardando aceite do estabelecimento.

### AGD-RF-003 — Profissionais

Cadastrar nome, função, foto opcional, contato interno opcional, serviços,
limite de atendimentos simultâneos e estado ativo. O cliente pode selecionar um
profissional ou permitir alocação automática entre os elegíveis.

### AGD-RF-004 — Disponibilidade

Calcular horários usando:

- fuso do tenant;
- horário semanal do estabelecimento;
- agenda semanal do profissional;
- exceções, feriados, folgas e bloqueios;
- duração e buffers do serviço;
- atendimentos existentes e holds ativos;
- antecedência mínima/máxima e limite diário.

### AGD-RF-005 — Reserva concorrente

Ao selecionar um horário, criar hold com TTL curto. Duas pessoas não podem
confirmar a mesma vaga. Retry do mesmo comando deve ser idempotente.

### AGD-RF-006 — Acesso seguro pelo WhatsApp

O link inicial deve ter capability `APPOINTMENT_BOOKING`, tenant, cliente e
expiração. O token é trocado por sessão segura e não expõe telefone na URL.

Links de gerenciamento são revogáveis, limitados ao próprio agendamento e
expiram após seu encerramento.

### AGD-RF-007 — Confirmação

Em confirmação automática, o cliente recebe data, hora, serviço, profissional,
endereço e link para gerenciar. Em aceite manual, recebe primeiro `Solicitação
recebida` e somente depois `Agendamento confirmado` ou `Horário indisponível`.

### AGD-RF-008 — Reagendamento e cancelamento

Cliente e operador podem reagendar ou cancelar respeitando a política do
tenant. Toda mudança exige versão esperada, motivo quando administrativo e
gera evento auditável. O horário liberado volta imediatamente à grade.

### AGD-RF-009 — Agenda operacional

O Admin possui visão dia, semana e lista, filtros por profissional/serviço,
criação manual, bloqueio de horário e ações de confirmar, reagendar, cancelar,
registrar chegada, iniciar, concluir e marcar ausência.

### AGD-RF-010 — Estados

Estados mínimos:

- `PENDING_APPROVAL`;
- `CONFIRMED`;
- `CHECKED_IN`;
- `IN_SERVICE`;
- `COMPLETED`;
- `CANCELED_BY_CUSTOMER`;
- `CANCELED_BY_TENANT`;
- `NO_SHOW`.

### AGD-RF-011 — Editor de automações

O Admin oferece editor visual simples com:

- gatilhos de negócio fixos;
- cartões de mensagem arrastáveis;
- tempo de espera configurável;
- texto, botão e placeholders editáveis;
- resposta esperada selecionada entre ações seguras;
- preview de celular;
- validação, rascunho, publicação, histórico e rollback.

O MVP não permite código, chamadas HTTP arbitrárias, loops ou criação de
estados de negócio pelo texto.

### AGD-RF-012 — Respostas esperadas

Tipos permitidos:

- nenhuma resposta;
- abrir/gerenciar agendamento;
- confirmar presença;
- solicitar reagendamento;
- solicitar cancelamento;
- falar com atendente.

A regra usa IDs estáveis, nunca o texto personalizado.

### AGD-RF-013 — Notificações idempotentes

Cada envio possui chave única por tenant, agendamento, gatilho, versão do fluxo
e horário planejado. Reprocessamento não duplica mensagem. Cancelamento remove
lembretes ainda pendentes.

### AGD-RF-014 — Histórico do cliente

A página mostra próximos e anteriores. O cliente pode gerenciar os futuros e
repetir um serviço anterior escolhendo nova data e horário.

### AGD-RF-015 — Privacidade de clínica

O MVP não coleta prontuário, sintomas, diagnóstico, exames, receita ou anexos.
Campos livres devem orientar o cliente a não informar dados médicos. Dados de
saúde exigirão uma fase própria de segurança, base legal e governança.

### AGD-RF-016 — Auditoria e isolamento

Toda consulta/mutação é limitada por tenant. Alterações de agenda, publicação
de automação, mensagens, cancelamentos e overrides registram ator e data.

## 6. Fora do MVP

- prontuário eletrônico e telemedicina;
- ficha clínica, anamnese, exames e prescrição;
- classes/grupos e reservas coletivas;
- salas/equipamentos como recursos obrigatórios;
- lista de espera automática;
- pacotes, recorrência e assinatura;
- comissão e folha do profissional;
- sinal, multa por ausência e reembolso automático;
- sincronização bidirecional com Google Calendar;
- WhatsApp Flows nativo;
- inteligência artificial para negociar horários.

