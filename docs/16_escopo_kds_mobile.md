# Escopo do KDS Mobile

O aplicativo mobile não replica o Tenant Admin inteiro. Ele é uma estação operacional responsiva para tablet e celular, que consome os mesmos contratos já usados pelo KDS web.

## Mantido na primeira versão

| Comportamento do KDS web | Aplicativo mobile |
|---|---|
| Login JWT e escopo do tenant | Mantido com sessão protegida no dispositivo |
| Perfis `KITCHEN` e `BAR` | Mantidos; abrem a estação correspondente |
| Estações Cozinha e Bar | Mantidas; Admin, Gerente e Garçom podem alternar quando permitido |
| Fila `PENDING`, `ACCEPTED` e `READY` | Mantida com abas e contadores |
| Itens, opções e observações | Mantidos no detalhe do pedido |
| SLA e priorização por tempo | Mantidos visualmente nos cards e em atualização por segundo |
| Aceitar, marcar pronto e confirmar entrega | Mantidos via `PATCH /admin/api/v1/orders/:id/status` |
| Atualização em tempo real | Mantida pelo WebSocket `/ws/kds` |
| Fallback em falha de conexão | Mantido por polling a cada 15 segundos |
| Estado da conexão | Mantido no cabeçalho |
| Painel do Salão (`ADMIN`, `MANAGER`, `WAITER`) | Mantido em uma área própria do app |
| Agora: entregas, novos atendimentos e contas | Mantido com as ações operacionais principais |
| Comandas abertas | Mantidas: abrir, lançar item simples e finalizar |
| Mesas | Mantidas com status e filtros: livres, ocupadas e limpeza |
| Conversas de garçom | Mantidas: ler, responder e encerrar |

## Fora do primeiro corte

| Área existente no KDS web | Decisão |
|---|---|
| Edição de cliente/mesa de uma comanda | Continua no Tenant Admin web |
| Edição/anulação de itens já lançados | Continua no Atendimento web |
| Documentos de consumo, reimpressão e acesso ao portal | Continua no Tenant Admin web; exige integração de impressão/compartilhamento do dispositivo |
| Métricas analíticas e resumo agregado de produção | Pode entrar em uma segunda aba do app após validação em operação |
| Navegação lateral, sincronização entre abas e preferências de densidade | Não se aplica ao aplicativo nativo de estação única |

## Contratos utilizados

- API HTTP versionada: `/admin/api/v1/auth/login`, `/orders`, `/menu`, `/orders/:id/status`, `/orders/manual` e `/tables/*`.
- Eventos: `order.created`, `order.updated`, `order.item_voided` e `order.status_changed`.
- WebSocket: `/ws/kds?tenant_id=<tenant>&token=<jwt>`.

O NestJS continua sendo o dono de permissões, transições de pedido, auditoria e notificações. O Core Go continua sendo o dono do canal WebSocket e do broadcast em tempo real.
