# Arquitetura Proposta: Bot Config e Conversation Flows

## Decisao
Para a fase atual do ClickGarcom, o caminho mais seguro e coerente e **nao criar um servico separado** para templates, menus e conversation flows do bot.

A evolucao recomendada e:
- `node-admin` como plano de **autoria, configuracao e publicacao**
- `go-core` como plano de **execucao em runtime**
- PostgreSQL como **fonte de verdade**
- Redis apenas como **cache opcional**, nunca como fonte primaria

## Estado Atual
Hoje o projeto ja tem a base correta para isso:
- O `node-admin` ja gerencia mensagens customizaveis por tenant.
- O `go-core` ja le as mensagens e aplica a maquina de estados do WhatsApp.
- O contrato de mensagens ja existe dos dois lados.

Arquivos relevantes:
- `apps/tenant-admin/api/src/shared/message-templates.ts`
- `apps/tenant-admin/api/src/entities/tenant.entity.ts`
- `platform/core-backend/internal/domain/tenant/entity.go`
- `platform/core-backend/internal/application/handle_whatsapp_message.go`

Isso funciona bem para mensagens textuais simples, mas nao escala bem para:
- menu inicial com opcoes e acoes
- multiplos tipos de entrada por canal
- versionamento e publicacao
- fallback por capacidade do provider
- preview e rollback de definicoes

## Objetivo
Separar tres camadas sem quebrar a arquitetura atual:

1. **Conteudo editavel**
   - textos, placeholders, labels e estrutura de menus
2. **Definicao conversacional**
   - acoes, opcoes, proximos passos, degradacao para texto
3. **Regra de negocio**
   - associar mesa, abrir comanda, pedir item, fechar conta, aprovar entrada etc.

Regra central: o `node-admin` **nao executa** o bot. Ele apenas **configura**.
O `go-core` continua sendo o dono da sessao, dos estados e da orquestracao operacional.

## Responsabilidades

### 1. Node Admin
Responsavel por:
- CRUD de definicoes do bot
- preview do fluxo
- publicacao de versoes
- rollback para versao anterior
- validacao administrativa basica

Nao deve:
- decidir transicao de sessao em runtime
- receber chamada sincrona do `go-core` a cada mensagem
- virar engine de orquestracao

### 2. Go Core
Responsavel por:
- carregar a definicao publicada do tenant
- renderizar mensagem conforme o canal
- interpretar a acao escolhida pelo usuario
- executar a regra de negocio
- cair em fallback seguro se a definicao estiver ausente ou invalida

Nao deve:
- depender do `node-admin` online para responder uma mensagem
- armazenar a verdade da configuracao fora do banco

### 3. Banco de Dados
Responsavel por:
- armazenar versoes de definicoes
- marcar qual versao esta publicada
- permitir rollback auditavel

## Modelo Minimo de Dados
Nao recomendo crescer tudo dentro de `tenants.settings.messages`.
Para menus e flows, a evolucao mais segura e criar uma tabela propria.

### Tabela sugerida: `bot_flow_definitions`
Campos minimos:
- `id` UUID
- `tenant_id` UUID
- `key` VARCHAR(100)
- `channel` VARCHAR(30)
- `status` VARCHAR(20)
- `version` INT
- `definition` JSONB
- `created_by` UUID NULL
- `updated_by` UUID NULL
- `published_at` TIMESTAMP NULL
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

Restricoes recomendadas:
- `UNIQUE (tenant_id, key, channel, version)`
- apenas uma versao `PUBLISHED` por `(tenant_id, key, channel)`

Status sugeridos:
- `DRAFT`
- `PUBLISHED`
- `ARCHIVED`

## Estrutura Minima do JSONB
Exemplo de definicao inicial para o menu de boas-vindas:

```json
{
  "type": "menu",
  "key": "welcome_menu",
  "channel": "whatsapp",
  "title": "Boas-vindas",
  "body": "🍽️ Oi! Seja muito bem-vindo ao *{nome_restaurante}*! 😊\n\nComo podemos começar por aqui?\n\n*1* - 🙋 Solicitar mesa\n\n_Digite o número da opção_",
  "placeholders": ["{nome_restaurante}"],
  "actions": [
    {
      "id": "request_table",
      "label": "Solicitar mesa",
      "accepted_inputs": ["1", "sim", "quero mesa", "solicitar mesa"]
    }
  ],
  "fallback": {
    "invalid_message_key": "msg_invalid_option"
  }
}
```

## Contrato de Runtime
O contrato importante nao e o texto; e a **acao**.

Exemplo:
- `request_table`
- `view_menu`
- `view_tab`
- `call_waiter`
- `close_tab`

O `go-core` deve interpretar `action.id`, e nao depender do texto visivel para decidir negocio.

Isso evita acoplamento fraco como:
- regex improvisada em cima de labels
- dependencia de emoji
- quebra quando o admin muda o texto

## Onde Isso Encaixa no Codigo

### Node Admin
Criar um modulo novo, por exemplo:
- `apps/tenant-admin/api/src/modules/bot-config/`

Arquivos esperados:
- `bot-config.module.ts`
- `bot-config.controller.ts`
- `bot-config.service.ts`
- `entities/bot-flow-definition.entity.ts`

### Go Core
Criar um dominio novo, por exemplo:
- `platform/core-backend/internal/domain/botconfig/`

Arquivos esperados:
- `entity.go`
- `repository.go`

Infra:
- `platform/core-backend/internal/infrastructure/persistence/postgres/botconfig_repository.go`

Aplicacao:
- o `handle_whatsapp_message.go` continua dono da maquina de estados
- ele apenas passa a consultar o `botconfig.Repository` para renderizar/interpretar menus publicados

## Regra de Evolucao
E importante **nao migrar tudo de uma vez**.

### Fase 1
Manter o que ja existe:
- `tenant.settings.messages` continua para mensagens textuais simples
- aprovacao de mesa
- pedido confirmado
- pedido pronto
- resumo de comanda

### Fase 2
Introduzir `bot_flow_definitions` apenas para fluxos estruturados:
- `welcome_menu`
- `main_menu`
- `service_request_menu` se surgir

### Fase 3
Adicionar:
- draft/publicacao
- preview
- rollback
- cache Redis por tenant e versao publicada

## Fallback Obrigatorio
Mesmo depois da nova arquitetura, o `go-core` precisa manter fallback seguro:
- se nao existir definicao publicada
- se o JSON estiver invalido
- se o canal nao suportar componente interativo

Fallback recomendado:
- menu numerado em texto puro
- mensagens default hardcoded

## O Que Nao Fazer Agora
- Nao criar microservico novo para bot-config
- Nao fazer o `go-core` depender de HTTP do `node-admin`
- Nao crescer tudo em `tenants.settings.messages`
- Nao mover regra de sessao para o painel admin
- Nao modelar negocio a partir do texto visivel

## Quando Viraria um Servico Separado
So faz sentido separar quando houver, ao mesmo tempo:
- multiplos canais alem de WhatsApp
- editor visual complexo com workflow proprio
- analytics e publicacao independentes
- equipe ou ownership dedicado para conversation platform

Antes disso, separar por deploy tende a aumentar risco e custo operacional.

## Recomendacao Final
O passo correto para o projeto atual e:
- manter o runtime do bot no `go-core`
- criar um modulo `bot-config` no `node-admin`
- criar storage proprio em Postgres para definicoes estruturadas
- usar `tenant.settings.messages` apenas para mensagens textuais simples

Essa abordagem preserva a arquitetura atual, reduz risco de acoplamento ruim e permite crescer sem quebrar o fluxo operacional do restaurante.
