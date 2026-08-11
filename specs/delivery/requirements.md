# Requisitos — Delivery V2

Este documento resume os requisitos testáveis do módulo. A especificação detalhada e normativa é [especificacao_tecnica_logistica_delivery.md](../../docs/especificacao_tecnica_logistica_delivery.md). As tasks devem referenciar ambos quando precisarem de regra, contrato ou critério de aceite.

## 1. Visão do produto

O Delivery V2 permite que cada tenant do ClickGarçom habilite pedidos para entrega, escolha entrega própria ou externa, cadastre endereços de clientes, calcule o frete antes do pagamento e opere a entrega pelo Admin.

Cada filial é um tenant independente. O ClickGarçom integra tecnicamente operadores externos, mas não é responsável pelo contrato, execução física ou repasse financeiro do operador.

## 2. Modalidades

### `OWN`

Entrega própria do restaurante. O tenant informa apenas uma quantidade de entregadores disponíveis. O MVP não cadastra pessoa, não coleta localização, não oferece tracking próprio e não gera PIN.

### `EXTERNAL`

Entrega contratada pelo tenant com um operador externo. O primeiro operador é iFood Sob Demanda. A cotação ocorre antes do pagamento; a contratação começa quando o lote entra em preparo. O link e o código de confirmação são os fornecidos pelo operador.

## 3. Perfis

| Perfil | Permissões |
|---|---|
| `ADMIN` | Configuração completa, credenciais, clientes, endereços, operação e override. |
| `MANAGER` | Operação, clientes, endereços e fallback; sem gravação de segredo por padrão. |
| `DISPATCHER` | Operação, saída/conclusão própria e fallback autorizado. |
| `WAITER` | Criar/consultar pedido e confirmar endereço. |
| `KITCHEN`/`BAR` | Produção; não operam fulfillment. |
| `CASHIER` | Consulta financeira conforme permissão. |
| Cliente | Próprios endereços e confirmação pelo WhatsApp. |

## 4. Requisitos funcionais

### RF-V2-001 — Ativação por tenant

O tenant deve ativar/desativar o módulo no Admin.

Critérios:

- `enabled=false` não oferece Delivery no WhatsApp;
- DINE_IN/TAKEOUT permanecem inalterados;
- entregas ativas continuam operáveis ao desativar;
- ativação exige pré-requisitos da modalidade;
- mudanças valem para novos pedidos, salvo override auditado.

### RF-V2-002 — Modalidade padrão

O tenant deve escolher `OWN` ou `EXTERNAL` antes de receber novos pedidos.

Critérios:

- a modalidade é snapshotada no checkout/Delivery;
- não há comparação automática de opções;
- troca posterior só ocorre por fallback manual em uma entrega com falha;
- troca não altera a configuração padrão do tenant.

### RF-V2-003 — Cliente por telefone

O sistema deve resolver cliente pela chave `(tenant_id, phone_normalized)`.

Critérios:

- telefone é normalizado;
- mesma chave é idempotente;
- telefone igual em tenants diferentes fica isolado;
- nome não é persistido no perfil;
- nome exigido pelo operador pode existir somente no snapshot do pedido.

### RF-V2-004 — Endereços reutilizáveis

O cliente pode manter até cinco endereços ativos.

Critérios:

- cada endereço possui rótulo;
- cliente/Admin podem criar, editar e excluir;
- exclusão é lógica e remove apenas aquele endereço;
- um endereço ativo é default;
- endereço mais recentemente usado torna-se default;
- todo endereço utilizado precisa ser salvo e confirmado;
- endereço temporário não é permitido;
- pedido antigo mantém seu snapshot.

### RF-V2-005 — Consulta de CEP

O sistema deve consultar CEP por provider abstrato.

Critérios:

- CEP encontrado preenche logradouro, bairro, cidade e UF;
- CEP não encontrado permite preenchimento manual;
- falha/timeout não apaga campos;
- chaves privadas ficam no backend;
- resposta possui provider e status normalizados.

### RF-V2-006 — Geocodificação

O endereço completo deve ser geocodificado antes da cotação externa.

Critérios:

- lat/lng, provider, provider ID e qualidade são persistidos;
- qualidade ambígua exige correção/confirmação;
- alteração estrutural invalida geocode anterior;
- coordenadas não são aceitas fora dos limites.

### RF-V2-007 — Área de atendimento

O tenant deve configurar origem e raio para o MVP.

Critérios:

- rota é usada para cobrança própria;
- Haversine é somente pré-validação/fallback visual;
- endereço fora do raio é indisponível na modalidade própria;
- operador externo valida sua própria cobertura.

### RF-V2-008 — Tarifa própria

O tenant deve escolher `FIXED`, `DISTANCE_BANDS`, `PER_KM` ou `HYBRID`.

Critérios:

- valores usam decimal/centavos;
- km incluído, preço/km, mínimo, faixas, arredondamento e adicionais são snapshotados;
- faixas não se sobrepõem nem deixam buraco involuntário;
- simulador e checkout usam o mesmo serviço de negócio;
- mudança posterior não altera quote ou entrega anterior.

### RF-V2-009 — Capacidade própria

O tenant deve informar quantidade disponível de entregadores, sem cadastro individual.

Critérios:

- capacidade possui hold temporário durante checkout;
- pagamento converte hold em reserva;
- expiração, cancelamento, conclusão e conversão liberam a reserva;
- concorrência não consome a mesma vaga;
- capacidade zero bloqueia novo checkout próprio.

### RF-V2-010 — Cotação externa

No modo externo, o sistema deve obter cotação antes do pagamento.

Critérios:

- cotação inclui custo, prazo, provider, ID e expiração;
- frete é acrescido ao total do cliente;
- quote expirada exige recotação;
- pedido externo sem quote válida não é confirmado;
- preço do cliente fica congelado após pagamento.

### RF-V2-011 — Valores financeiros

O sistema deve separar:

- `customer_delivery_fee`;
- `provider_quoted_cost`;
- `provider_actual_cost`;
- `restaurant_adjustment`.

Critérios:

- diferença posterior pertence ao restaurante;
- cliente não é recobrado automaticamente;
- custo menor não gera devolução automática;
- cancelamento cobrado é auditado;
- ClickGarçom não movimenta o dinheiro do operador.

### RF-V2-012 — Início da contratação

A contratação externa inicia quando o lote entra em `PREPARING`.

Critérios:

- evento repetido não cria mais de um ciclo;
- chamada externa não bloqueia transação de produção;
- quote expirada é recotada;
- falha mantém pedido operável.

### RF-V2-013 — Tentativas

Cada ciclo usa o mesmo operador e possui cinco tentativas em 15 minutos.

Critérios:

- tentativas em T+0, aproximadamente T+3, T+6, T+9 e T+12;
- nenhum ciclo executa sexta tentativa;
- worker reiniciado retoma estado persistido;
- tentativa possui idempotency key;
- sucesso cancela pendências futuras.

### RF-V2-014 — Esgotamento e alerta

Após falhas do ciclo, o sistema deve marcar `CYCLE_EXHAUSTED`/`NO_COURIER`.

Critérios:

- painel destaca exceção;
- cliente recebe mensagem não técnica;
- pedido permanece válido;
- nenhum operador novo é escolhido automaticamente;
- novo ciclo depende de comando autorizado.

### RF-V2-015 — Fallback manual

Admin, Manager ou Dispatcher podem reiniciar, trocar operador ou converter para própria.

Critérios:

- ação exige motivo, versão esperada e idempotência;
- trocar operador inicia novo ciclo 1/5;
- conversão exige capacidade;
- histórico anterior é preservado;
- valor do cliente permanece;
- após coleta não há troca de modalidade/operador.

### RF-V2-016 — Entrega própria operacional

O fluxo próprio deve suportar `AGUARDANDO_ENTREGADOR`, `SAIU_PARA_ENTREGA` e `ENTREGUE`.

Critérios:

- ação é administrativa;
- não requer assigned driver;
- não requer localização, tracking ou PIN;
- conclusão idempotente libera capacidade.

### RF-V2-017 — iFood off-platform

O adapter deve usar a API oficial para pedidos fora da plataforma iFood.

Critérios:

- merchant e credencial pertencem ao tenant;
- quote ID é usado dentro da validade;
- criação ambígua é reconciliada;
- tracking e código vêm do iFood;
- eventos duplicados não duplicam transição;
- sandbox/homologação precedem produção.

### RF-V2-018 — Credenciais

Admin deve informar credenciais no painel.

Critérios:

- segredo é enviado apenas por HTTPS ao backend;
- persistência é criptografada ou usa secret manager;
- frontend recebe somente máscara/status;
- rotação e revogação são auditadas;
- credencial inválida gera alerta sanitizado.

### RF-V2-019 — Snapshots

Pedido e Delivery devem guardar endereço, modalidade, regras e valores usados.

Critérios:

- alteração de cadastro não altera histórico;
- quote usada é identificável;
- custo/requote/fallback ficam na timeline;
- dados públicos são projetados e sanitizados.

### RF-V2-020 — Webhooks e reconciliação

O sistema deve receber webhooks, deduplicar e reconciliar estados.

Critérios:

- assinatura é validada sobre raw body;
- inbox é persistida antes de processar;
- evento sem ID usa hash estável;
- evento fora de ordem não regride terminal;
- criação sem resposta consulta o operador antes de repetir.

### RF-V2-021 — Notificações

WhatsApp deve notificar marcos relevantes por outbox.

Critérios:

- frete/estimativa antes da confirmação;
- confirmação e preparo;
- busca de entregador;
- tracking/código externo quando disponíveis;
- saída/conclusão própria;
- falha e fallback;
- uma mensagem lógica por milestone.

### RF-V2-022 — RBAC e tenant scope

Toda leitura/mutação deve aplicar tenant derivado da credencial e papel autorizado.

Critérios:

- segredo somente Admin;
- operação conforme matriz de perfis;
- cross-tenant retorna erro sem enumerar recurso;
- Dispatcher não acessa configuração sensível.

### RF-V2-023 — Auditoria

Registrar configuração, cliente/endereço administrativo, cotação, capacidade, attempts, fallback, custo e cancelamento.

Critérios:

- ator, tenant, timestamp, motivo e correlation ID;
- eventos append-only;
- metadados sem payload sensível completo;
- timeline acessível somente a perfis autorizados.

### RF-V2-024 — Privacidade

O módulo deve tratar telefone, endereço, coordenadas, tracking e credenciais como dados sensíveis.

Critérios:

- logs mascarados;
- consentimento para salvar endereço;
- exclusão lógica no fluxo comum;
- retenção documentada;
- fornecedores listados no aviso de privacidade.

### RF-V2-025 — Compatibilidade

Tenants sem Delivery e fluxos DINE_IN/TAKEOUT devem continuar funcionando.

Critérios:

- migrations preservam dados;
- APIs antigas têm compatibilidade durante rollout;
- feature flag permite ativação individual;
- KDS Mobile não é dependência do V2.

## 5. Requisitos não funcionais

### RNF-V2-001 — Desempenho

- busca local de endereço: p95 inferior a 300 ms;
- comando sem chamada externa: p95 inferior a 500 ms;
- quote possui timeout por provider;
- painel suporta ao menos 100 entregas ativas por tenant;
- scheduler não mantém conexão aberta por 15 minutos.

### RNF-V2-002 — Degradação

- CEP indisponível permite entrada manual;
- mapa indisponível não inventa preço;
- provider indisponível gera estado/alerta;
- WebSocket não é fonte única;
- retry não duplica contratação.

### RNF-V2-003 — Observabilidade

Medir quote, latência, expiração, attempts, esgotamento, fallback, capacidade, CEP, geocode, webhooks e outbox sem labels de alta cardinalidade indevida.

### RNF-V2-004 — Acessibilidade

Admin deve funcionar em teclado, touch e telas pequenas, sem depender somente de cor.

## 6. Estados resumidos

O Delivery preserva o agregado existente:

```text
PENDING_RESTAURANT_ACCEPTANCE
  -> ACCEPTED
  -> PREPARING
  -> READY_FOR_DISPATCH
  -> ASSIGNED (externa, quando aplicável)
  -> IN_TRANSIT
  -> DELIVERED
```

Exceções permitidas incluem `DELIVERY_FAILED`, `CANCELED`, `RETURNING` e `RETURNED` conforme regra do domínio.

O fulfillment possui estado próprio para `CAPACITY_RESERVED`, `QUOTED`, `REQUESTING`, `COURIER_ASSIGNED`, `CYCLE_EXHAUSTED`, `FAILED`, `IN_TRANSIT` e `DELIVERED`.

## 7. Fora do MVP

- entregador individual;
- app de entregador;
- GPS/tracking próprio;
- PIN ClickGarçom;
- geofence/foto;
- comparação automática de providers;
- troca automática de provider;
- múltiplas paradas;
- multiunidade dentro de tenant.
