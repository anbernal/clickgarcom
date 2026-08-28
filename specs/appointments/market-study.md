# Estudo de mercado — Agenda & Serviços

Pesquisa realizada em 27/08/2026, priorizando documentação oficial dos
fornecedores e orientações da ANPD.

## 1. Padrões atuais

### Página de agendamento como experiência principal

Google Calendar e Fresha usam uma página de reserva com disponibilidade real.
O cliente seleciona serviço, profissional quando aplicável, data e horário, e
confirma em uma única jornada. O Google também trata conflitos, janela de
antecedência, intervalos entre atendimentos e limite diário. A Fresha usa o
fluxo serviço -> profissional -> horário -> revisão.

Conclusão para o ClickGarçom: não negociar cada etapa por mensagens. O WhatsApp
envia um botão para uma página autenticada e o agendamento é concluído nela.

### Notificações por evento e com limite

Square e Fresha concentram comunicação em confirmação, lembretes, alteração e
cancelamento. A Fresha limita a quantidade de lembretes por agendamento e envia
um único lembrete quando há vários serviços no mesmo agendamento. Square permite
configurar confirmações e lembretes no painel.

Conclusão: o default será um lembrete em T-24h. O tenant poderá configurar até
três lembretes proativos, mas alteração e cancelamento continuam sendo eventos
transacionais separados.

### Agenda considera pessoas, regras e recursos

Soluções maduras cruzam horário do estabelecimento, escala do profissional,
duração do serviço, bloqueios, folgas e recursos necessários. Também oferecem
buffer e limite diário para evitar agendas inviáveis.

Conclusão: o MVP precisa de profissionais, serviços, regras semanais, exceções,
buffer e trava contra sobreposição. Sala/equipamento fica preparado no modelo,
mas pode entrar depois do primeiro piloto.

### Cancelamento, ausência e lista de espera

Square e Fresha tratam cancelamento, `no-show`, política de antecedência e lista
de espera. Pagamento antecipado ou sinal é usado como proteção adicional.

Conclusão: cancelamento e `no-show` entram no MVP. Lista de espera, sinal e
políticas financeiras entram na evolução seguinte, reutilizando Mercado Pago.

### WhatsApp Flows

A Meta oferece WhatsApp Flows para formulários ricos, navegação de produtos e
agendamento sem sair da conversa. É uma opção válida depois do MVP.

Conclusão: a primeira versão usa o link autenticado que o projeto já domina.
Isso reduz prazo, mantém a grade de horários sob controle do backend e evita
manter duas interfaces. O domínio será desenhado para futuramente publicar a
mesma jornada em WhatsApp Flows.

## 2. Diferencial recomendado

O diferencial do ClickGarçom não deve ser apenas uma agenda. Deve ser uma
jornada unificada:

- entrada pelo número de WhatsApp já conhecido;
- catálogo visual de serviços;
- agendamento em poucos toques;
- confirmação, alteração e cancelamento pelo mesmo ambiente;
- painel operacional em tempo real;
- automações editáveis com preview, versão e rollback;
- possibilidade de coexistir com Loja, Delivery e Atendimento no mesmo tenant.

## 3. Recorte por segmento

| Perfil | Defaults de linguagem | Regras iniciais |
| --- | --- | --- |
| Clínica | consulta, profissional, paciente | aprovação manual opcional; sem prontuário |
| Spa | tratamento, terapeuta, cliente | buffers maiores; múltiplos serviços futuros |
| Salão | serviço, profissional, cliente | confirmação automática; duração e preço |
| Genérico | serviço, responsável, cliente | textos neutros e personalizáveis |

O perfil muda textos e defaults, não permissões nem estrutura do banco.

## 4. Privacidade para clínicas

Dados relativos à saúde são dados pessoais sensíveis segundo a LGPD. Por isso,
o MVP de Clínica será estritamente comercial e operacional: nome, telefone,
serviço, profissional, data e horário. Não haverá prontuário, diagnóstico,
sintomas, exames, anexos ou campo livre pedindo informação clínica.

## 5. Fontes oficiais

- Meta — [WhatsApp Flows](https://whatsappbusiness.com/products/whatsapp-flows/)
- Meta — [WhatsApp Business Platform](https://whatsappbusiness.com/products/business-platform/)
- Google — [Appointment schedules](https://support.google.com/calendar/answer/11608416)
- Google — [Configuração, buffers e disponibilidade](https://support.google.com/calendar/answer/10729749)
- Fresha — [Jornada de agendamento online](https://www.fresha.com/help-center/knowledge-base/online-profile/101646-learn-how-clients-book-appointments-online)
- Fresha — [Agenda e operação](https://www.fresha.com/help-center/knowledge-base/calendar)
- Fresha — [Lembretes](https://www.fresha.com/help-center/knowledge-base/calendar/167-send-appointment-reminders)
- Square — [Confirmações e lembretes](https://squareup.com/help/us/en/article/6729-customer-confirmations-with-square-appointments)
- Square — [Lista de espera](https://squareup.com/help/us/en/article/7923-waitlist-with-square-appointments)
- ANPD — [Perguntas frequentes sobre dados pessoais e sensíveis](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes)

