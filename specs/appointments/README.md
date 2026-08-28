# Agenda & Serviços — visão do módulo

Este diretório especifica o módulo genérico de agendamentos do ClickGarçom.
Ele atende inicialmente clínicas, spas, salões de beleza e profissionais de
serviço, sem herdar regras de mesa, cozinha, produtos ou Delivery.

Documentos:

- [Estudo de mercado](./market-study.md)
- [Requisitos do MVP](./requirements.md)
- [Design técnico](./design.md)
- [Plano de implementação](./tasks.md)

## Decisão principal

O WhatsApp será a porta de entrada e o canal de notificações. A escolha de
serviço, profissional, dia e horário acontecerá em uma página autenticada,
inspirada na experiência do Cardápio/Loja já existente.

O fluxo padrão envia poucas mensagens:

1. link para agendar;
2. confirmação ou aviso de solicitação recebida;
3. um lembrete configurável;
4. aviso somente quando houver alteração ou cancelamento.

O nome técnico da capability será `APPOINTMENTS`. Na interface, o nome será
`Agenda & Serviços`.
# Agenda & Serviços

Módulo independente para clínicas, spas, salões e operações de serviço. Ele não depende de Atendimento, Cardápio, Loja ou Delivery.

## Entrega do MVP

- ativação, expiração e perfil do segmento pelo Super Admin;
- catálogo de serviços, profissionais, disponibilidade e buffers;
- agenda operacional com confirmação, chegada, início, conclusão, falta e cancelamento;
- proteção contra sobreposição de horários no banco de dados;
- página pública de agendamento, por capability curta e vinculada ao telefone do WhatsApp;
- confirmação com poucas mensagens e automações versionadas;
- link de agendamento no WhatsApp ao tocar em `Agendar`/`Agenda`.

## Operação

1. Ative **Agenda & Serviços** para o tenant no Super Admin e escolha o perfil.
2. O administrador entra em **Agenda & Serviços**, cria serviços e profissionais e associa os serviços à equipe.
3. Configure a disponibilidade de cada profissional. Sem janela cadastrada, o MVP oferece o padrão de segunda a sábado, 09:00–18:00.
4. Com o estabelecimento aberto, o cliente envia `Agendar` no WhatsApp e recebe um botão com link válido por 30 minutos.

O capability não é persistido em texto; somente seu SHA-256 é armazenado. Um horário é validado novamente dentro de transação, e o banco mantém uma restrição de intervalo para impedir dupla reserva.

## Publicação

Execute a migração `000056_create_appointments_module` antes de subir as APIs e o worker. O Node Admin e o Core devem compartilhar `INTERNAL_SERVICE_TOKEN` para a emissão do link pelo WhatsApp.
