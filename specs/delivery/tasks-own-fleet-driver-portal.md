# Tasks do Portal PWA do Motoboy

Fonte: [plano de frota própria](./own-fleet-drivers-plan.md). O portal é uma
interface web pública no sentido de ser acessível por URL, mas privada após
autenticação: cada motoboy só acessa a própria fila.

> Interface responsiva/PWA concluída em `public/driver.html`, com adapter
> isolado em `public/js/driver.js`. Sessão HttpOnly, dados reais e realtime
> dependem do [mapa de integração](./own-fleet-frontend-integration.md).

## DEL-FLEET-DRV-001 — Shell PWA e identidade do tenant

- Status: [x] Frontend concluído — endpoints reais implementados; ativação controlada por `ADMIN_FLEET_API_ENABLED`
- Prioridade: P0
- Dependências: DEL-FLEET-BE-004

Implementação:

- criar página mobile-first em `/entregador/{tenant-slug}`;
- aplicar logo, nome e cores seguras do tenant;
- criar manifest, ícones e cache mínimo de assets;
- implementar estados de carregamento, sessão expirada, tenant inativo e
  conexão indisponível;
- não cachear endereço, telefone, código ou dados de pedido em storage
  persistente.

Critérios de aceite:

- tela funciona em Android/iPhone moderno sem instalação;
- tenant incorreto ou sessão ausente não revela dados;
- experiência mantém o padrão visual do cardápio/portal existentes.

## DEL-FLEET-DRV-002 — Ativação, login e turno

- Status: [x] Frontend concluído — ativação, sessão HttpOnly e login fallback implementados
- Prioridade: P0
- Dependências: DEL-FLEET-BE-004, DEL-FLEET-DRV-001

Implementação:

- trocar link/QR por sessão segura;
- criar definição e troca de PIN;
- oferecer fallback CPF + PIN com limites do backend;
- mostrar nome do motoboy e botão início/fim de turno;
- encerrar sessão no dispositivo e tratar acesso revogado.

Critérios de aceite:

- não há token em `localStorage`, URL ou logs do navegador;
- voltar à tela após revogação exige novo acesso;
- falha de login não confirma se CPF existe.

## DEL-FLEET-DRV-003 — Fila, detalhe e navegação

- Status: [x] Frontend concluído — fila/histórico reais implementados
- Prioridade: P0
- Dependências: DEL-FLEET-BE-006, DEL-FLEET-DRV-002

Implementação:

- renderizar `A retirar`, `Em rota`, `Ocorrências` e `Concluídas hoje`;
- mostrar endereço, referência, prioridade e resumo útil do pedido;
- abrir Waze, Google Maps ou Apple Maps com coordenadas/endereço;
- aplicar ordenação recebida do backend;
- esconder dados desnecessários no histórico.

Critérios de aceite:

- nenhuma entrega de outro motoboy é visível, mesmo por manipulação de URL;
- o cartão se adapta a tela pequena e fonte ampliada;
- endereço indisponível mostra fallback claro sem travar a fila.

## DEL-FLEET-DRV-004 — Retirada, rota, código e ocorrências

- Status: [x] Frontend concluído — comandos idempotentes reais implementados
- Prioridade: P0
- Dependências: DEL-FLEET-BE-006, DEL-FLEET-DRV-003

Implementação:

- ações idempotentes `Confirmar retirada`, `Iniciar rota`, `Cheguei` e
  `Concluir entrega`;
- campo de código hexadecimal de quatro caracteres com máscara/normalização;
- exibir erro de código sem expor tentativas restantes indevidamente;
- formulário de ocorrência com motivo e observação curta;
- desabilitar duplo clique e reconciliar atualização do servidor.

Critérios de aceite:

- entrega concluída some da fila ativa;
- erro de código mantém entrega em rota;
- ocorrência chega ao Admin/KDS sem concluir o pedido;
- retry de rede não duplica a transição.

## DEL-FLEET-DRV-005 — Realtime, conexão e acessibilidade

- Status: [x] Frontend concluído — reconciliação periódica real; websocket dedicado fica para próxima iteração
- Prioridade: P1
- Dependências: DEL-FLEET-BE-007, DEL-FLEET-DRV-004

Implementação:

- assinar canal websocket autorizado do motoboy;
- atualizar fila, reatribuição e cancelamento ao vivo;
- indicar conexão/reconexão e revalidar dados após retorno;
- implementar fila local apenas para comandos idempotentes e sem PII;
- validar contraste, foco, leitor de tela e feedback sonoro/vibratório opcional.

Critérios de aceite:

- reatribuição remove cartão sem refresh;
- sessão não recebe evento de outro motoboy;
- modo offline não revela pedidos antigos a outro usuário do mesmo aparelho.
