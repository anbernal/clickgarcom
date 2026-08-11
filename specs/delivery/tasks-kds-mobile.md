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
