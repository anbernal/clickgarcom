# Tasks de Frontend Admin e KDS — Frota própria identificada

Fonte: [plano de frota própria](./own-fleet-drivers-plan.md). Esta trilha não
armazena CPF, código de entrega ou token no navegador além do necessário para a
sessão segura.

> Frontend concluído em modo `frontend-first`. As telas usam o adapter em
> `public/js/pages/fleet.js`; para ligar o backend, consulte o
> [mapa de integração](./own-fleet-frontend-integration.md).

## DEL-FLEET-FE-001 — Configurar o modo de frota identificada

- Status: [x] Frontend concluído — integração de API pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-001

Implementação:

- adicionar seletor `Capacidade simples` / `Motoboys cadastrados` nas
  configurações de Delivery;
- explicar impacto apenas para novos pedidos;
- mostrar pré-requisitos antes de ativar o modo identificado;
- preservar capacidade atual e entregas em curso;
- esconder recursos individuais quando o modo estiver desativado.

Critérios de aceite:

- tenant antigo não vê uma tela quebrada;
- mudança de modo exige confirmação e exibe última alteração;
- opção indisponível explica a ativação do módulo Delivery.

## DEL-FLEET-FE-002 — Criar central de motoboys

- Status: [x] Frontend concluído — integração de API pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-003

Implementação:

- criar rota/menu `Frota` ou `Motoboys` dentro de Entregas;
- listar nome, placa, disponibilidade, entregas atribuídas e estado;
- cadastrar/editar nome, CPF, placa, telefone opcional e limite;
- mascarar CPF depois do cadastro;
- ativar/inativar com confirmação e motivo;
- oferecer busca/filtros e estados vazios úteis.

Critérios de aceite:

- formulário valida CPF/placa antes do envio, sem assumir que validação local
  substitui o backend;
- usuário sem permissão não vê CPF nem ações administrativas;
- erros de conflito preservam dados digitados.

## DEL-FLEET-FE-003 — Gerar e gerenciar acesso do motoboy

- Status: [x] Frontend concluído — integração de API pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-004

Implementação:

- botão `Gerar acesso` com QR/link de ativação de uso único;
- aviso de validade e cópia/compartilhamento sem persistir o token no DOM;
- ação `Revogar acesso` e confirmação;
- indicador de primeira ativação e último acesso, quando autorizado.

Critérios de aceite:

- token some ao fechar/reabrir modal;
- revogação tem feedback em tempo real;
- captura de tela não exibe CPF completo ou código de cliente.

## DEL-FLEET-FE-004 — Atribuição e fila no painel Delivery

- Status: [x] Frontend concluído — integração de API pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-005

Implementação:

- exibir entregas sem motoboy e seletor de motoboys elegíveis;
- mostrar carga atual, limite e status antes de atribuir;
- permitir reatribuição com motivo;
- criar visão de fila por motoboy e ordenação manual acessível;
- adicionar badge com motoboy em cada card de expedição;
- reconciliar conflitos de versão sem perder contexto do operador.

Critérios de aceite:

- ação não é exibida para entrega externa ou tenant `CAPACITY_ONLY`;
- atualização de outro operador aparece sem refresh;
- cards refletem `atribuído`, `retirado`, `em rota` e `ocorrência`.

## DEL-FLEET-FE-005 — Integrar KDS/Expedição e relatórios

- Status: [x] Frontend concluído — integração de API/realtime pendente
- Prioridade: P1
- Dependências: DEL-FLEET-BE-007, DEL-FLEET-FE-004

Implementação:

- integrar atribuição no cartão de `Pronto para saída` do KDS;
- manter colunas zebrada, alerta e áudio atuais sem duplicação;
- criar resumo de frota: disponíveis, em rota, atrasadas e ocorrências;
- adicionar histórico/relatório por motoboy com filtro de período;
- aplicar layouts desktop/tablet e acessibilidade por teclado.

Critérios de aceite:

- KDS não cria pedido de Delivery na cozinha indevidamente;
- atualização realtime não reinicia áudio/alerta;
- dados pessoais aparecem somente no contexto operacional autorizado.
