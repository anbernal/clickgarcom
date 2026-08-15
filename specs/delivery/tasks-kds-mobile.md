# Tasks de KDS Mobile e compatibilidade — Delivery V2

## Decisão de escopo

O Delivery V2 não depende de aplicativo para entregador próprio, localização, tracking público ou PIN do ClickGarçom.

O KDS Mobile continua responsável por cozinha, bar e salão conforme o produto atual. A entrada do lote em preparo/pronto pode produzir eventos consumidos pelo backend de Delivery, mas o app não contrata operador e não executa regra logística.

## DEL-V2-MOB-001 — Remover dependência do Mobile no caminho crítico

- Status: [x] Concluída — Delivery V2 não introduz dependência de app de entregador; contratos e escopo foram revisados
- Prioridade: P0
- Dependências: DEL-V2-BE-001, DEL-V2-BE-002
- Especificação: seções 2.2, 3.2, 10.4 e 12.3

Implementação:

- revisar tasks Mobile anteriores;
- marcar driver, Expo Location, fila GPS, PIN, geofence e foto como fora do MVP V2;
- garantir que contratos backend não exijam versão nova do app;
- documentar que `PREPARING`/pronto continuam pelos contratos de produção atuais;
- manter código experimental anterior atrás de flag, se existir;
- não excluir dados/código legado sem task específica.

Critérios de aceite:

- piloto Delivery V2 funciona sem instalar/atualizar KDS Mobile;
- cozinha/bar continuam publicando estados necessários;
- app atual não recebe rota/tela quebrada para DRIVER;
- nenhuma dependência P0 aponta para Expo Location ou PIN.

## DEL-V2-MOB-002 — Executar regressão de produção e salão

- Status: [x] Concluída — regressão KDS UX validada (9/9), incluindo roles, cozinha, salão, comandas e lote misto
- Prioridade: P0
- Dependências: DEL-V2-MOB-001, DEL-V2-BE-024
- Especificação: seção 25.3

Implementação:

- testar login e roles existentes;
- testar aceitar/preparar/pronto em cozinha e bar;
- testar lote misto cozinha+bar;
- testar WebSocket/polling;
- validar que campos V2 adicionais são ignorados com segurança;
- registrar matriz de versões suportadas.

Critérios de aceite:

- app atual compila e abre;
- produção não bloqueia por ausência de fulfillment;
- evento repetido não inicia contratação duplicada;
- tenants sem Delivery permanecem sem alteração.

## Evoluções fora do escopo

Somente uma nova decisão de produto poderá reabrir:

- cadastro individual de entregador;
- disponibilidade individual;
- localização foreground/background;
- tracking próprio;
- PIN ClickGarçom;
- geofence/foto;
- múltiplas entregas por rota.

## DEL-V2-MOB-003 — Criar fila operacional Delivery no KDS

- Status: [x] Concluída
- Prioridade: P0
- Dependências: DEL-V2-BE-024, DEL-V2-CORE-008

Implementação:

- adicionar a visão `Delivery` ao KDS para `ADMIN`, `MANAGER`, `WAITER` e `DISPATCHER`;
- separar pedidos pagos/aceitos, em preparo, prontos para saída e em rota dos cartões presenciais;
- permitir aceite para preparo, impressão do ticket de expedição, saída própria e confirmação manual de entrega;
- imprimir itens, endereço, telefone, referência, valor/frete e código do pedido;
- manter a cozinha/bar responsáveis somente pelo preparo dos itens.

Critérios de aceite:

- pedido Delivery não aparece como ação de mesa/comanda/salão;
- ação de saída/entrega só é aceita na máquina de estados própria;
- o usuário que confirma a entrega fica registrado na linha do tempo;
- KDS presencial continua funcionando sem o módulo Delivery.
