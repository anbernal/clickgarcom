# Tasks — Otimização de UX do KDS

## Objetivo

Transformar o KDS em uma interface adequada para dois contextos distintos:

- **Cozinha/Bar:** estação de produção com leitura rápida, inclusive à distância.
- **Salão:** central de ações operacionais organizada por responsabilidade, sem concentrar todos os fluxos na mesma visão.

O backend e os contratos atuais serão preservados na primeira entrega. Alterações de API só serão feitas se medições reais mostrarem necessidade.

## Escopo aprovado

- modo estação para Cozinha e Bar;
- quantidade, prato, mesa, observações e tempo com nova hierarquia visual;
- indicadores operacionais compactos;
- cartões e ações adequados para touch;
- Salão dividido em Agora, Comandas, Mesas e Conversas;
- resumo agregado de produção como evolução controlada;
- responsividade, acessibilidade e homologação com carga realista.

## Legenda

- **P0:** essencial para a primeira entrega.
- **P1:** ganho operacional importante após a base.
- **P2:** refinamento.
- **FE:** frontend.
- **BE:** backend.
- **QA:** qualidade/homologação.

## Progresso de execução

Atualizado em 02/08/2026.

- [x] KDS-UX-003 — tokens visuais e alvo touch de `48px`.
- [x] KDS-UX-010 — modo estação automático por perfil e opção de teste para gestão.
- [x] KDS-UX-011 — cabeçalho compacto com conexão, relógio e atrasados.
- [x] KDS-UX-012 — quatro contadores operacionais no modo estação.
- [x] KDS-UX-013 — nova hierarquia do cartão e timer/SLA consolidado.
- [x] KDS-UX-014 — prato, modificadores e observações separados.
- [x] KDS-UX-015 — ação principal por estágio, touch e trava contra transição duplicada.
- [x] KDS-UX-016 — proporção `32/48/20`, cabeçalhos fixos e prioridade por urgência/tempo.
- [x] KDS-UX-017 — estados de atenção/atraso reforçados e atualização ao cruzar o SLA.
- [x] KDS-UX-041 (Cozinha/Bar) — validado em `1366×768`, `1920×1080` e largura de tablet.
- [x] KDS-UX-001 — massa reproduzível incorporada à suíte Playwright, incluindo `60` pedidos.
- [ ] KDS-UX-002 — baseline anterior versionado; evidências locais posteriores foram geradas nas duas resoluções.
- [x] KDS-UX-020 a KDS-UX-027 — Salão separado em Agora, Comandas, Mesas e Conversas.
- [x] KDS-UX-030/031 — resumo local da bancada com opções separadas e itens anulados ignorados.
- [x] KDS-UX-032 — medição documentada; endpoint não se justifica para até `60` pedidos.
- [x] KDS-UX-040/042/043 — densidade persistida, foco/semântica e controle de tela cheia.
- [x] KDS-UX-050/051/052 — suíte automatizada de cartões, acesso, navegação e carga visual.
- [x] KDS-UX-060 — Comandas paginadas, filtráveis e alinhadas ao design system; validado com `300` registros.
- [ ] KDS-UX-053/054/055 — homologação física, fluxo integrado e comparação final com operadores.
- [x] KDS-UX-056 — smoke pós-deploy aprovado em 02/08/2026; KDS, JavaScript, configuração e healthchecks responderam `200`.

## Épico 1 — Fundação e linha de base

### KDS-UX-001 — Criar massa visual de homologação

- Prioridade: P0
- Tipo: QA/FE
- Dependências: nenhuma
- Criar cenário reproduzível com pedidos novos, em preparo, prontos e atrasados.
- Incluir pedidos com uma e várias unidades, combos, adicionais e observações críticas.
- Incluir pelo menos 15 pedidos ativos simultâneos.

Critérios de aceite:

- cenário pode ser reproduzido sem alterar dados de produção;
- inclui itens de cozinha e bar;
- inclui mesas, comandas sem mesa e tempos diferentes de SLA.

### KDS-UX-002 — Registrar baseline visual

- Prioridade: P0
- Tipo: QA
- Dependências: KDS-UX-001
- Registrar telas atuais em `1366×768` e `1920×1080`.
- Registrar Cozinha, Bar e todas as áreas do Salão.
- Usar as imagens para comparação antes/depois.

Critérios de aceite:

- cada resolução possui evidência da tela completa;
- problemas de corte, rolagem e densidade estão identificados.

### KDS-UX-003 — Criar tokens de interface para KDS

- Prioridade: P0
- Tipo: FE
- Dependências: nenhuma
- Centralizar tamanhos de texto, espaçamento, altura de ação, cores de estágio e contraste.
- Definir tokens específicos para modo estação e modo operacional.

Critérios de aceite:

- quantidade, prato, observação, mesa e timer não usam valores dispersos pelo CSS;
- altura mínima de ação é `48px` no modo touch/estação;
- cores mantêm significado consistente entre Cozinha, Bar e Salão.

## Épico 2 — Modo Estação para Cozinha e Bar

### KDS-UX-010 — Implementar Modo Estação por perfil

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-003
- Ativar automaticamente para perfis `KITCHEN` e `BAR`.
- Ocultar sidebar e navegação duplicada quando o usuário possui somente uma estação.
- Permitir `?mode=station` para administrador/gerente testar o modo.
- Manter uma saída clara para o modo completo quando permitida.

Critérios de aceite:

- perfil Cozinha abre diretamente na Cozinha;
- perfil Bar abre diretamente no Bar;
- não há espaço vazio reservado para navegação oculta;
- recarregar a página mantém o modo correto.

### KDS-UX-011 — Criar cabeçalho operacional compacto

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-010
- Exibir nome da estação, conexão, relógio e quantidade de atrasados.
- Remover subtítulos e elementos sem ação operacional.

Critérios de aceite:

- cabeçalho não ultrapassa aproximadamente `56px`;
- estado offline continua evidente;
- atrasos são identificáveis sem procurar nas colunas.

### KDS-UX-012 — Reduzir métricas para contadores operacionais

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-011
- Substituir sete cards por: Novos, Em preparo, Prontos e Atrasados.
- Retirar média de preparo e gargalo da visão de bancada.
- Manter métricas gerenciais disponíveis no painel administrativo existente.

Critérios de aceite:

- contadores ocupam uma única linha em `1366×768`;
- pedidos aparecem acima da dobra;
- valores atualizam em tempo real.

### KDS-UX-013 — Redesenhar cartão de pedido

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-003
- Reordenar o cartão para: mesa/tempo, quantidade/prato, modificadores, observação, código e ação.
- Remover destino redundante dentro da própria estação.
- Consolidar badge de SLA e timer em um único componente.

Critérios de aceite:

- quantidade usa pelo menos `30px` no modo estação;
- prato usa pelo menos `20px` e peso visual forte;
- mesa é identificável antes do código do pedido;
- cartão mantém leitura correta com seis ou mais itens.

### KDS-UX-014 — Separar prato, modificadores e observações

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-013
- Renderizar adicionais e componentes de combo abaixo do prato.
- Destacar observação crítica em bloco próprio.
- Preservar textos longos sem sobrepor quantidade ou ação.

Critérios de aceite:

- adicionais não aparecem na mesma linha do nome do prato;
- observações longas quebram linha de forma previsível;
- “sem”, “alergia” e outras observações não ficam visualmente confundidas com adicionais.

### KDS-UX-015 — Aumentar e simplificar ações

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-013
- Garantir uma ação principal por estágio: Aceitar, Pronto ou Entregar.
- Manter recusa/edição como ações secundárias sem competir com a principal.
- Criar alvos de toque com no mínimo `48px` de altura.

Critérios de aceite:

- ação principal ocupa largura suficiente para toque rápido;
- nenhuma ação crítica depende apenas de ícone;
- duplo clique não cria duas transições.

### KDS-UX-016 — Ajustar proporção e rolagem das colunas

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-012, KDS-UX-013
- Usar proporção aproximada de 32% Novos, 48% Em preparo e 20% Prontos.
- Manter cabeçalho de coluna visível.
- Ordenar pedidos por urgência e tempo dentro do estágio.

Critérios de aceite:

- pedido mais antigo/urgente aparece primeiro;
- cabeçalhos e contadores continuam visíveis durante rolagem;
- nenhuma coluna invade outra em `1366×768`.

### KDS-UX-017 — Implementar estados de atenção e atraso

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-013
- Reforçar visual do cartão em atenção e atrasado.
- Não depender somente de cor: incluir texto/ícone e tempo.
- Evitar animação contínua em todos os elementos; animar apenas atrasos críticos.

Critérios de aceite:

- atraso é reconhecido em menos de dois segundos;
- estados continuam compreensíveis em escala de cinza;
- cartão normal não compete visualmente com cartão crítico.

## Épico 3 — Reorganização do Salão

### KDS-UX-020 — Criar subnavegação do Salão

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-003
- Criar as visões Agora, Comandas, Mesas e Conversas.
- Exibir contadores de pendências diretamente nas abas.
- Preservar estado da aba durante atualizações em tempo real.

Critérios de aceite:

- somente uma responsabilidade principal é exibida por vez;
- atualização de dados não retorna o usuário para a primeira aba;
- navegação funciona por mouse, touch e teclado.

### KDS-UX-021 — Criar visão “Agora”

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-020
- Consolidar pedidos prontos, primeiro contato, chamadas e fechamento.
- Ordenar por urgência e tempo de espera.
- Diferenciar claramente entrega, atendimento e fechamento.

Critérios de aceite:

- nenhuma ação urgente fica abaixo de Mesas ou Conversas;
- itens mais antigos aparecem primeiro;
- cada cartão possui apenas uma ação principal.

### KDS-UX-022 — Redesenhar cartão de entrega

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-021
- Destacar mesa/local antes do número do pedido.
- Mostrar quantidade e pratos em linhas legíveis.
- Exibir “pronto há” e ação Entregar.

Critérios de aceite:

- garçom identifica onde entregar sem abrir detalhes;
- itens não aparecem como uma única frase separada por vírgulas;
- comanda sem mesa possui identificação operacional suficiente.

### KDS-UX-023 — Migrar gerenciamento para visão “Comandas”

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-020
- Reutilizar busca e lançamento manual existentes.
- Manter edição, anulação, histórico e impressão.
- Reduzir quantidade de botões visíveis por linha usando detalhe/menu secundário.

Critérios de aceite:

- busca por código, mesa e cliente continua funcionando;
- lançamento manual não disputa espaço com ações urgentes;
- ações auditáveis existentes continuam intactas.

### KDS-UX-024 — Criar visão “Mesas”

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-020
- Mover disponibilidade e filtros de capacidade para uma visão própria.
- Preparar apresentação para livres, ocupadas e aguardando limpeza, conforme os estados disponíveis.

Critérios de aceite:

- mesas não aparecem na visão Agora;
- filtros não provocam rolagem horizontal;
- estado e capacidade podem ser lidos sem abrir modal.

### KDS-UX-025 — Criar visão “Conversas”

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-020
- Transformar conversas WhatsApp em uma caixa de entrada própria.
- Priorizar não lidas/aguardando resposta.
- Manter thread, resposta e encerramento existentes.

Critérios de aceite:

- conversas não ocupam o final da visão operacional;
- contador de pendências aparece na aba;
- abertura e resposta não perdem mensagens durante atualização.

### KDS-UX-026 — Remover cards estatísticos redundantes do Salão

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-020
- Substituir cinco cards grandes por badges/contadores nas abas.
- Manter somente alertas realmente operacionais no cabeçalho.

Critérios de aceite:

- conteúdo acionável começa no primeiro bloco da tela;
- o mesmo número não aparece simultaneamente em card, seção e navegação.

### KDS-UX-027 — Aplicar comportamento por perfil

- Prioridade: P1
- Tipo: FE
- Dependências: KDS-UX-020
- Garçom inicia em Agora.
- Gerente/admin mantêm acesso às quatro áreas.
- Ações continuam respeitando permissões do backend.

Critérios de aceite:

- esconder botão não substitui validação de permissão da API;
- perfil sem acesso não consegue abrir a visão por parâmetro de URL.

## Épico 4 — Resumo de produção

### KDS-UX-030 — Criar agregação local de pratos

- Prioridade: P1
- Tipo: FE
- Dependências: KDS-UX-013
- Agregar quantidade efetiva por prato no estágio selecionado.
- Não misturar itens com opções incompatíveis.
- Ignorar itens anulados.

Critérios de aceite:

- totais batem com os cartões visíveis;
- atualização e anulação recalculam o resumo em tempo real;
- opções distintas não são somadas como se fossem iguais.

### KDS-UX-031 — Criar alternância “Pedidos / Resumo da bancada”

- Prioridade: P1
- Tipo: FE
- Dependências: KDS-UX-030
- Manter cartões como visão padrão.
- Permitir ao operador consultar quantidades consolidadas.

Critérios de aceite:

- alternância não altera status de pedidos;
- voltar para Pedidos mantém posição e estágio;
- resumo nunca substitui detalhes auditáveis do pedido.

### KDS-UX-032 — Avaliar endpoint agregado

- Prioridade: P2
- Tipo: BE/Performance
- Dependências: KDS-UX-030, KDS-UX-052
- Medir custo da agregação no navegador.
- Criar endpoint somente se o volume real justificar.

Critérios de aceite:

- decisão baseada em medição com carga;
- eventual endpoint respeita tenant, destino e status;
- contrato é documentado e testado.

## Épico 5 — Responsividade e acessibilidade

### KDS-UX-040 — Criar presets de densidade

- Prioridade: P1
- Tipo: FE
- Dependências: KDS-UX-013
- Disponibilizar confortável e compacto.
- Modo estação inicia em confortável.
- Preferência pode ser persistida por dispositivo.

### KDS-UX-041 — Revisar breakpoints

- Prioridade: P0
- Tipo: FE
- Dependências: KDS-UX-016, KDS-UX-020
- Homologar `1366×768`, `1920×1080` e tablet.
- Evitar três colunas ilegíveis em larguras pequenas.
- Impedir rolagem horizontal da página.

### KDS-UX-042 — Revisar contraste, foco e semântica

- Prioridade: P1
- Tipo: FE/QA
- Dependências: KDS-UX-003
- Adicionar foco visível e estados para teclado.
- Revisar contraste de textos secundários.
- Adicionar rótulos acessíveis em ações e navegação.
- Reduzir uso de emoji como único identificador.

### KDS-UX-043 — Criar modo tela cheia

- Prioridade: P1
- Tipo: FE
- Dependências: KDS-UX-010
- Adicionar ação explícita para entrar/sair da tela cheia.
- Tratar indisponibilidade da API Fullscreen.

## Épico 6 — Testes e homologação

### KDS-UX-050 — Testes de renderização dos cartões

- Prioridade: P0
- Tipo: QA/FE
- Dependências: KDS-UX-013, KDS-UX-014, KDS-UX-022
- Cobrir quantidade, combo, opções, observação, com/sem mesa e atraso.
- Validar conteúdo escapado e ausência de HTML injetado.

### KDS-UX-051 — Testes de navegação e permissões

- Prioridade: P0
- Tipo: QA
- Dependências: KDS-UX-010, KDS-UX-020, KDS-UX-027
- Cobrir Cozinha, Bar, Garçom, Gerente e Admin.
- Validar parâmetros `panel` e `mode`.

### KDS-UX-052 — Teste de carga visual

- Prioridade: P0
- Tipo: QA/Performance
- Dependências: KDS-UX-001, KDS-UX-016, KDS-UX-041
- Testar 15, 30 e 60 pedidos ativos.
- Medir tempo de renderização e estabilidade das atualizações WebSocket.
- Confirmar ausência de duplicação visual.

### KDS-UX-053 — Teste em distância real

- Prioridade: P0
- Tipo: UX/QA
- Dependências: KDS-UX-013, KDS-UX-022
- Testar leitura a aproximadamente três metros em monitor Full HD.
- Pedir ao usuário para identificar mesa, quantidade, prato, observação e atraso.

Critérios de aceite:

- quantidade, prato e mesa identificados em até dois segundos;
- observação crítica não é ignorada;
- operador não precisa aproximar-se do monitor para leitura normal.

### KDS-UX-054 — Teste operacional ponta a ponta

- Prioridade: P0
- Tipo: QA
- Dependências: conclusão dos épicos 2 e 3
- Lançar pedido manual no Salão.
- Receber na Cozinha/Bar.
- Aceitar, preparar, marcar pronto e entregar.
- Editar/anular quando permitido.
- Confirmar auditoria e atualização em tempo real.

### KDS-UX-055 — Comparação visual antes/depois

- Prioridade: P0
- Tipo: UX/QA
- Dependências: KDS-UX-002, KDS-UX-054
- Repetir as capturas do baseline nas mesmas resoluções e massa.
- Documentar ganhos e problemas restantes.

### KDS-UX-056 — Smoke test pós-deploy

- Prioridade: P0
- Tipo: QA/Deploy
- Dependências: todas as tasks P0
- Validar login, Cozinha, Bar, Salão, WebSocket e transições.
- Validar que as demais telas administrativas continuam operacionais.
- Monitorar logs durante a primeira janela de operação.

## Épico 7 — Escalabilidade da visão de Comandas

### KDS-UX-060 — Otimizar gerenciamento de alto volume

- Prioridade: P0
- Tipo: FE/UX/QA
- Paginar localmente as comandas retornadas pela API, mantendo no DOM apenas a página atual.
- Permitir busca por código, mesa, telefone ou cliente.
- Permitir filtro por atendimento com/sem mesa, ordenação e tamanho da página.
- Aplicar campos, tipografia, cores, botões e tabela do design system do painel administrativo.
- Preservar lançamento, edição/anulação, histórico e impressão.

Critérios de aceite:

- `300` comandas geram no máximo `50` linhas simultâneas no DOM;
- busca mantém foco durante digitação;
- filtros e troca de página não recarregam a aplicação;
- tabela não produz rolagem horizontal em desktop ou tablet;
- ações permanecem associadas à comanda correta;
- campos dos modais do KDS usam o mesmo padrão visual da área administrativa.

## Épico 8 — Comprovante operacional identificado

### KDS-DOC-070 — Aplicar cadastro do restaurante na impressão

- Prioridade: P0
- Tipo: BE/FE/QA
- Status: concluída
- Incluir nome, CPF/CNPJ, endereço e contato do restaurante no snapshot da emissão.
- Gerar número próprio para o comprovante operacional.
- Exibir comanda, mesa, emissão, atendente, quantidade, descrição, valor unitário, total e pagamentos.
- Compartilhar o mesmo modelo térmico entre KDS e consulta administrativa.
- Identificar o documento como não fiscal, sem NFC-e, chave de acesso ou protocolo fiscal.

Critérios de aceite:

- uma reimpressão conserva os dados cadastrais do snapshot original;
- o comprovante funciona em impressão comum, térmica de 80 mm ou PDF;
- campos ausentes não deixam rótulos vazios ou quebram o layout;
- conteúdo dinâmico é escapado antes de entrar na janela de impressão;
- a emissão continua registrada com usuário, hash e contador de impressão.

### KDS-DOC-071 — Ocultar observações nulas em todo o fluxo

- Prioridade: P0
- Tipo: Core/BE/FE/QA
- Status: concluída
- Normalizar valores nulos antes de criar pedidos no Core e no tenant-admin.
- Limpar registros legados com `&lt;nil&gt;`, `nil`, `null` ou `undefined`.
- Impedir novas persistências dessas representações por constraint.
- Omitir a linha de observação no KDS, edição e comprovante quando não houver conteúdo real.

## Execução paralela recomendada

Após KDS-UX-001, KDS-UX-002 e KDS-UX-003, o trabalho pode seguir em paralelo:

### Trilha A — Cozinha/Bar

KDS-UX-010 → 011 → 012

KDS-UX-013 → 014 → 015 → 016 → 017

### Trilha B — Salão

KDS-UX-020 → 021 → 022

KDS-UX-020 → 023 / 024 / 025 → 026 → 027

### Trilha C — Qualidade

KDS-UX-001 → 002

KDS-UX-050 e 051 podem acompanhar as entregas das trilhas A e B.

### Trilha D — Evolução de produção

KDS-UX-030 → 031 → medição → 032, após o P0 estar estável.

## Ordem de entrega

### Entrega 1 — P0 Cozinha/Bar

- modo estação;
- cabeçalho e contadores compactos;
- novo cartão;
- observações e ações;
- colunas, responsividade e estados de atraso.

### Entrega 2 — P0 Salão

- subnavegação;
- Agora;
- novo cartão de entrega;
- Comandas, Mesas e Conversas separadas;
- remoção das métricas redundantes.

### Entrega 3 — Homologação e produção

- testes de perfil;
- carga visual;
- distância real;
- fluxo ponta a ponta;
- comparação visual;
- deploy e smoke test.

### Entrega 4 — P1/P2

- resumo da bancada;
- densidade;
- tela cheia;
- acessibilidade refinada;
- eventual endpoint agregado.

## Definition of Done

Uma task é concluída somente quando:

- implementação está integrada sem quebrar contratos existentes;
- validação JavaScript e builds passam;
- comportamento é testado nos perfis afetados;
- evidência visual está registrada quando houver mudança de layout;
- estados vazio, carregando, erro e offline estão tratados;
- WebSocket e polling não duplicam itens;
- critérios de aceite da task foram verificados.

O épico P0 é concluído quando o fluxo completo Salão → Cozinha/Bar → Entrega funciona, quantidade/prato/mesa podem ser identificados em até dois segundos e o Salão não exibe responsabilidades concorrentes na mesma visão.
