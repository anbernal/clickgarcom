# Manual operacional — Agenda & Serviços

Este manual orienta a configuração e a operação do módulo **Agenda & Serviços** do ClickGarçom. Ele foi pensado para salões, clínicas, spas e negócios de serviços em geral que desejam receber agendamentos pelo WhatsApp sem transformar a conversa em uma sequência longa de mensagens.

> **Regra de ouro:** primeiro configure `Serviços` → `Profissionais` → `Disponibilidade`. Só então abra a agenda para clientes. Essa ordem evita horários que parecem disponíveis, mas não têm ninguém habilitado para atendê-los.

## 1. O que o módulo faz

O módulo separa a conversa do WhatsApp da escolha detalhada. O WhatsApp funciona como porta de entrada e para avisos importantes; o cliente escolhe serviço, profissional, dia e horário em uma página segura.

Fluxo padrão:

```text
Cliente envia “Agendar” no WhatsApp
        ↓
Recebe um único link seguro para a agenda
        ↓
Escolhe serviço → profissional → data/hora → confirma dados
        ↓
Agenda registra o horário e envia apenas a mensagem necessária
        ↓
Equipe opera o atendimento no painel
```

O módulo é independente de Atendimento, Loja, Cardápio e Delivery. Uma conta pode usar somente Agenda & Serviços ou combinar os módulos que fizerem sentido para o negócio.

## 2. Perfis de linguagem

Na ativação, o Super Admin escolhe um perfil. Ele muda apenas os textos da experiência; a operação é a mesma.

| Perfil | Como o sistema chama o serviço | Como chama a equipe | Uso típico |
| --- | --- | --- | --- |
| Salão | Serviço | Profissional | Cabeleireiro, barbearia, estética |
| Spa | Tratamento | Terapeuta | Massagem, bem-estar, terapias |
| Clínica | Consulta | Profissional | Consultório e clínica sem prontuário |
| Genérico | Serviço | Responsável | Qualquer negócio com horário marcado |

Para clínicas, não use a agenda para coletar sintomas, exames, receitas, diagnósticos ou outros dados de saúde. O MVP foi desenhado apenas para dados de contato e agendamento.

## 3. Pré-requisitos e permissões

Antes de criar a agenda, confirme:

1. No **Super Admin**, o módulo **Agenda & Serviços** está ativo para o tenant, com data de início e validade (ou como permanente).
2. O usuário que fará a configuração tem permissão para configurar Agenda & Serviços.
3. O usuário da recepção/operação tem permissão para operar a agenda.
4. O WhatsApp do estabelecimento está conectado, se os clientes forem iniciar por esse canal.

Quando o módulo está desativado, ele não deve aceitar novos agendamentos. O histórico permanece preservado para consulta operacional.

### Como conferir se está ativo

- **Super Admin:** abra o tenant e veja o cartão/controle de `Agenda & Serviços`.
- **Admin do estabelecimento:** o item `Agenda & Serviços` aparece no menu lateral e o painel mostra o módulo como ativo.
- **WhatsApp:** após o cliente pedir `Agendar` ou `Agenda`, o menu deve oferecer a opção de agendamento ou encaminhá-lo ao link seguro.

Se o item não aparece para um usuário do tenant, primeiro valide a ativação no Super Admin e depois a permissão do perfil desse usuário.

## 4. Configuração inicial passo a passo

Abra **Agenda & Serviços** no menu lateral do painel administrativo. A tela possui quatro áreas: `Agenda`, `Serviços`, `Profissionais` e `Automações`.

### 4.1 Criar categorias

As categorias deixam o catálogo mais fácil de entender para o cliente. Exemplos:

- salão: `Cabelo`, `Unhas`, `Tratamentos`, `Sobrancelhas`;
- spa: `Massagens`, `Rosto`, `Bem-estar`, `Experiências`;
- clínica: `Consultas`, `Avaliações`, `Retornos`.

Na aba **Serviços**, clique em **Organizar categorias**. Cadastre o nome da categoria e use nomes curtos. Uma categoria só deve ser removida depois que nenhum serviço estiver associado a ela.

### 4.2 Criar um serviço

Na aba **Serviços**, clique em **+ Novo serviço**. Preencha:

| Campo | Como preencher | Efeito na agenda |
| --- | --- | --- |
| Nome do serviço * | Nome que o cliente entenderá, por exemplo `Corte e finalização` | Aparece no catálogo e nas confirmações |
| Categoria * | Agrupamento do serviço | Organiza a escolha no link do cliente |
| Preço | Valor cobrado ou `0` quando não houver valor | Mostrado como valor do serviço; não substitui uma regra de pagamento própria |
| Duração * | Tempo real de atendimento, em minutos | Define quanto tempo o horário ocupa |
| Intervalo antes | Tempo de preparação anterior ao serviço | Campo de planejamento; mantenha em `0` no piloto atual e concentre a folga operacional no intervalo depois |
| Intervalo depois | Tempo para limpeza, caixa, troca de sala ou descanso | É o intervalo considerado pelo cálculo de vagas do MVP atual |
| Confirmação | `Automática` ou `Aceite da equipe` | Define se nasce confirmado ou aguardando decisão |
| Cor | Cor visual do serviço na agenda | Facilita leitura da grade |
| Descrição | Explicação simples do que está incluído | Ajuda o cliente a escolher corretamente |
| Disponível para agendamento | Deixe marcado para publicar | Se desmarcado, some apenas dos novos agendamentos |

**Como escolher a confirmação**

- Use **Automática** quando a disponibilidade já for confiável e o horário puder ser reservado na hora.
- Use **Aceite da equipe** quando houver avaliação prévia, preparação especial, confirmação de recurso ou necessidade de aprovação humana.

Não desative um serviço para tentar cancelar um horário já marcado. A pausa impede novos agendamentos; o horário existente deve ser tratado na aba **Agenda**.

### 4.3 Cadastrar profissionais

Na aba **Profissionais**, clique em **+ Novo profissional**. Para cada pessoa da equipe, informe:

- `Nome *`;
- `Função *`, por exemplo “Colorista”, “Massoterapeuta” ou “Recepção clínica”;
- cor para identificação visual na agenda;
- os serviços que essa pessoa pode realizar;
- status `Profissional ativo`.

Um profissional ativo, mas sem serviço marcado, não receberá horários. Um serviço ativo, mas sem profissional habilitado, também não terá vaga para o cliente. Essa é a validação mais importante da configuração.

### 4.4 Configurar disponibilidade da equipe

Em cada cartão de profissional, clique em **Disponibilidade**. Marque os dias de trabalho e informe início e fim da jornada daquele dia.

Exemplo para uma cabeleireira:

| Dia | Jornada |
| --- | --- |
| Segunda | 09:00–18:00 |
| Terça | 09:00–18:00 |
| Quarta | 09:00–18:00 |
| Quinta | 10:00–19:00 |
| Sexta | 09:00–18:00 |
| Sábado | 09:00–16:00 |
| Domingo | desmarcado |

Clique em **Salvar disponibilidade**. A grade pública leva em conta a duração e os intervalos de cada serviço dentro dessas janelas.

> Recomenda-se cadastrar explicitamente a jornada de todos os profissionais, mesmo que ela siga o horário padrão do estabelecimento. Isso evita disponibilidade indevida quando a equipe muda de turno.

> **Nota do piloto atual:** configure toda a folga entre atendimentos em **Intervalo depois**. O campo `Intervalo antes` já está na experiência de cadastro, mas não deve ser usado como única proteção operacional até que a regra de disponibilidade pré-atendimento seja ativada no cálculo do servidor.

### 4.5 Bloquear uma folga, pausa ou compromisso

Na aba **Agenda**, clique em **Bloquear horário** e informe:

1. profissional específico ou todo o estabelecimento;
2. data;
3. hora de início e fim;
4. motivo interno, como `Almoço`, `Feriado`, `Treinamento` ou `Manutenção`.

O período bloqueado deixa de ser oferecido para novos clientes. Use bloqueio para exceções pontuais; use **Disponibilidade** para a jornada recorrente semanal.

## 5. Personalizar mensagens sem aumentar o volume de WhatsApp

Abra a aba **Automações**. Ela mostra uma lista de eventos à esquerda, o fluxo no centro e os detalhes do cartão selecionado à direita.

Os eventos disponíveis são:

| Evento | Quando usar |
| --- | --- |
| Solicitação recebida | Serviço com aceite manual foi solicitado |
| Agendamento confirmado | Horário foi confirmado automaticamente ou pela equipe |
| Lembrete | Antes do horário, normalmente 24 horas antes |
| Agendamento reagendado | Data, horário ou profissional foi alterado |
| Agendamento cancelado | Cliente ou equipe cancelou |
| Horário indisponível | Solicitação manual não foi aprovada |

### Boas práticas para o fluxo

1. Selecione o evento desejado.
2. Adicione ou reorganize cartões de **Mensagem**, **Espera** e **Resposta esperada**.
3. Edite o texto usando informações claras, como `{cliente}`, `{serviço}`, `{data}`, `{hora}` e `{profissional}`.
4. Defina um botão com uma ação segura, por exemplo `Abrir gerenciamento`, `Confirmar presença`, `Solicitar reagendamento` ou `Falar com atendente`.
5. Use **Salvar rascunho** enquanto estiver editando.
6. Revise o preview e clique em **Publicar fluxo** quando estiver pronto.

Um rascunho não deve alterar a comunicação em produção. O fluxo publicado vira a versão operacional; o botão **Histórico** permite consultar versões anteriores e retornar a uma versão conhecida. Antes de liberar textos novos, faça um envio completo em número de teste e confirme a entrega pelo worker de notificações.

### Política recomendada de mensagens

Para reduzir ruído, mantenha o padrão abaixo:

1. um link de agendamento, quando o cliente pedir para agendar;
2. uma confirmação ou aviso de solicitação recebida;
3. um lembrete, normalmente 24 horas antes;
4. uma mensagem apenas se ocorrer reagendamento, cancelamento ou indisponibilidade.

Evite mensagem para cada clique do cliente. Serviço, profissional, data e hora são escolhidos no link, sem conversa passo a passo.

### Exemplos de texto

**Confirmação automática**

> Olá, {cliente}! Seu {serviço} está confirmado para {data}, às {hora}, com {profissional}. Use o botão abaixo se precisar consultar o agendamento.

**Solicitação sob aceite**

> Olá, {cliente}! Recebemos sua solicitação para {data}, às {hora}. Vamos conferir a agenda e avisar você por aqui.

**Lembrete**

> Oi, {cliente}! Passando para lembrar do seu horário amanhã, às {hora}. Se precisar alterar, use o botão abaixo.

## 6. Jornada do cliente pelo WhatsApp

1. O cliente envia `Agendar` ou escolhe a opção `Agenda` no menu inicial.
2. O estabelecimento envia um único botão/link seguro.
3. O cliente abre o link e escolhe, na mesma página:
   - categoria e serviço;
   - profissional específico ou `Primeiro horário disponível`;
   - dia;
   - horário;
   - nome e WhatsApp para revisão final.
4. O cliente confirma a reserva.
5. A equipe vê o novo item na agenda. Se o serviço for automático, ele aparece como **Confirmado**. Se exigir aceite, aparece como **Aguardando confirmação**.

O link de entrada é individual e temporário. Se expirar, o cliente deve pedir um novo acesso pelo WhatsApp em vez de reutilizar um link antigo.

## 7. Operação diária da agenda

Na aba **Agenda**, use as visualizações:

- **Dia** para a recepção acompanhar o turno atual;
- **Semana** para distribuir equipe e prever conflitos;
- **Lista** para encontrar próximos horários rapidamente.

Use os filtros de profissional e serviço para reduzir a grade. Clique em qualquer cartão para abrir os detalhes do agendamento.

### Estados e ações

| Estado atual | Ação operacional esperada | Próximo estado |
| --- | --- | --- |
| Aguardando confirmação | Confirmar horário, reagendar ou recusar | Confirmado ou Cancelado pela equipe |
| Confirmado | Registrar chegada, reagendar, cancelar ou marcar ausência | Cliente chegou, Cancelado ou Não compareceu |
| Cliente chegou | Iniciar atendimento | Em atendimento |
| Em atendimento | Concluir atendimento | Concluído |
| Concluído | Consulta de histórico | Encerrado |

Ao cancelar ou marcar ausência, use a confirmação exibida pelo sistema. Cancelamentos liberam a vaga para nova reserva conforme a regra de disponibilidade.

### Criar um agendamento pela recepção

Clique em **+ Novo agendamento** e preencha:

- nome do cliente;
- telefone/WhatsApp;
- serviço;
- profissional elegível;
- data e horário;
- opção de enviar confirmação pelo WhatsApp.

A recepção deve usar essa opção para telefonemas, balcão e encaixes. O sistema aplica a mesma verificação de conflito do agendamento online.

### Reagendar

Abra o agendamento e clique em **Reagendar**. Escolha nova data, horário e profissional elegível. Confirme somente depois de validar a nova opção com o cliente, quando necessário. A comunicação deve informar apenas o novo horário, sem repetir todo o fluxo.

## 8. Simulações completas para treinamento

Os nomes e dados abaixo são fictícios. Eles podem ser usados como roteiro de homologação.

### Caso A — Salão com confirmação automática

**Cenário:** Studio Bela ativa o serviço `Corte e finalização`, 60 minutos, intervalo posterior de 10 minutos, confirmação automática. A profissional Camila atende esse serviço de terça a sábado, das 09:00 às 18:00.

1. Em **Serviços**, a gerente cria `Corte e finalização` na categoria `Cabelo` por R$ 95,00.
2. Em **Profissionais**, cadastra Camila, função `Hair stylist`, marca o serviço e registra sua disponibilidade.
3. A cliente Júlia manda `Agendar` pelo WhatsApp.
4. Júlia abre o link, seleciona o serviço, Camila, sexta-feira e 14:00.
5. Na revisão, informa nome e WhatsApp e confirma.
6. O painel mostra Júlia como **Confirmado**, de 14:00 a 15:00; o intervalo posterior impede outro horário imediatamente em seguida.
7. A mensagem enviada é apenas a confirmação com data, hora, profissional e link de gerenciamento.
8. No dia, a recepção abre o cartão, clica em **Registrar chegada**, depois em **Iniciar atendimento** e, ao final, **Concluir atendimento**.

**Resultado esperado:** nenhuma aprovação manual, nenhuma dupla reserva e somente confirmação + lembrete configurado.

### Caso B — Clínica com aceite da equipe

**Cenário:** Clínica Horizonte oferece `Consulta inicial`, 50 minutos, com `Aceite da equipe`.

1. A secretária cria o serviço e vincula a Dra. Marina.
2. O paciente Rafael escolhe terça-feira, 10:30, pelo link do WhatsApp.
3. A agenda mostra o item como **Aguardando confirmação**.
4. A secretária abre o cartão, confere a agenda interna e clica em **Confirmar horário**.
5. Rafael recebe a confirmação final uma única vez.
6. Se a médica precisar alterar o horário, a secretária usa **Reagendar**, escolhe uma vaga válida e confirma.

**Resultado esperado:** o paciente não recebe promessa de consulta confirmada antes da decisão da clínica. A agenda não coleta motivo da consulta nem dados clínicos.

### Caso C — Spa com pausa bloqueada

**Cenário:** Serena Spa tem a terapeuta Luiza com agenda das 09:00 às 18:00, mas ela não atende das 12:00 às 13:30.

1. Na aba **Agenda**, a gestora clica em **Bloquear horário**.
2. Seleciona Luiza, quarta-feira, 12:00–13:30 e motivo `Pausa de almoço`.
3. Uma cliente escolhe `Massagem relaxante`, com duração de 60 minutos e buffer de 20 minutos.
4. A grade pública não deve oferecer horários que invadam o bloqueio ou o buffer.
5. A cliente escolhe 14:00 e recebe confirmação automática.

**Resultado esperado:** não há encaixe às 11:30 se ele ultrapassar a pausa; o sistema só oferece vagas completas.

### Caso D — Conflito de horário

**Cenário:** duas clientes tentam reservar o mesmo profissional, serviço e horário.

1. Abra a página de agendamento em dois navegadores ou aparelhos.
2. Selecione o mesmo serviço, profissional, data e 16:00 em ambos.
3. Confirme primeiro no navegador A.
4. Confirme depois no navegador B.

**Resultado esperado:** o navegador A cria o horário. O navegador B recebe aviso de que o horário não está mais disponível e deve escolher outro. Nunca crie dois atendimentos sobrepostos para o mesmo profissional.

### Caso E — Cancelamento e ausência

**Cenário:** cliente confirmada não comparece.

1. Abra o cartão ainda em **Confirmado**.
2. Se a cliente avisar que não irá, clique em **Cancelar**; a vaga volta a ficar livre e a comunicação de cancelamento é enviada.
3. Se ela não avisar nem comparecer, clique em **Não compareceu**.
4. Não use `Não compareceu` antes do horário; é um registro operacional/histórico, não uma forma de liberar agenda antecipadamente.

## 9. Roteiro de teste antes de abrir para clientes

Execute este checklist em uma conta de teste:

- [ ] criar duas categorias;
- [ ] criar um serviço automático e um com aceite manual;
- [ ] cadastrar pelo menos dois profissionais, com serviços diferentes;
- [ ] definir disponibilidade explícita para todos os dias de trabalho;
- [ ] bloquear um intervalo de almoço;
- [ ] abrir a experiência do cliente por **Ver experiência do cliente**;
- [ ] simular uma reserva automática;
- [ ] simular uma solicitação com aceite manual e confirmá-la pela agenda;
- [ ] tentar reservar o mesmo horário em duas abas;
- [ ] reagendar uma reserva;
- [ ] cancelar outra reserva;
- [ ] verificar o texto de confirmação e o lembrete no WhatsApp;
- [ ] conferir se os módulos não relacionados permanecem sem alteração.

## 10. Diagnóstico rápido

| Sintoma | O que verificar primeiro |
| --- | --- |
| `Agenda & Serviços` não aparece no menu | Ativação do módulo no Super Admin e permissões do usuário |
| Cliente não recebe opção de agendar | Módulo ativo, WhatsApp conectado e menu/capability atualizado |
| Link mostra agenda indisponível | Link expirado, agenda fechada ou módulo desativado; gere novo acesso pelo WhatsApp |
| Serviço não aparece para o cliente | Serviço pausado, sem categoria ou sem profissional ativo vinculado |
| Não há horários | Jornada do profissional, bloqueios, duração + buffers, conflitos existentes e antecedência mínima |
| Horário fica aguardando | O serviço foi configurado com `Aceite da equipe`; abra o cartão e confirme ou recuse |
| Cliente recebeu texto antigo | O fluxo foi salvo como rascunho, mas ainda não foi publicado; confira o Histórico e publique a versão desejada |
| Dois operadores veem situação diferente | Atualize a tela antes de confirmar; o sistema valida novamente a versão e a vaga ao salvar |

## 11. Rotina recomendada para a equipe

**Na abertura do dia**

1. conferir horários, bloqueios e profissionais ausentes;
2. tratar pendências de aceite;
3. verificar os atendimentos que exigem preparação;
4. revisar o próximo horário de cada profissional.

**Durante o atendimento**

1. registrar chegada somente quando o cliente estiver presente;
2. iniciar atendimento quando ele de fato começar;
3. concluir ao terminar;
4. reagendar/cancelar pelo cartão, sem criar horário duplicado manualmente.

**No fim do dia**

1. conferir pendências e ausências;
2. bloquear excepcionalidades do dia seguinte;
3. revisar se algum profissional ou serviço precisa ser pausado;
4. manter as automações curtas e atualizadas.

## 12. Limites do MVP atual

O módulo cobre agenda, serviços, equipe, disponibilidade, bloqueios, confirmações e operação básica. Ele não substitui prontuário, prescrição, telemedicina, gestão de comissões, recorrência, pacotes, lista de espera automática ou integração bidirecional com Google Calendar.

Em especial para clínicas: não registre informações de saúde nos campos livres. Esses recursos exigem uma etapa própria de segurança, governança e conformidade.

---

**Sugestão para o primeiro piloto:** comece com 3 a 5 serviços, 2 profissionais e uma semana de disponibilidade. Depois de validar os casos acima, aumente o catálogo e refine os textos das automações.
