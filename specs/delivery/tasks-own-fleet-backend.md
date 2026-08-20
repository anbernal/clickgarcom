# Tasks de Backend — Frota própria identificada

Fonte: [plano de frota própria](./own-fleet-drivers-plan.md). Estas tasks só
podem ser iniciadas após aprovar o Marco 0 do plano. O modo legado
`CAPACITY_ONLY` deve permanecer funcional durante todo o rollout.

## DEL-FLEET-BE-001 — Rebaseline de domínio, flag e contratos

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: nenhuma

Implementação:

- adicionar `own_fleet_mode` com `CAPACITY_ONLY` e `IDENTIFIED_DRIVERS` às
  configurações do tenant;
- congelar transições de `READY_FOR_DISPATCH`, `ASSIGNED`, `PICKED_UP`,
  `IN_TRANSIT`, `ARRIVED`, `DELIVERED` e exceções;
- definir os contratos HTTP, DTOs, eventos e erros versionados;
- atualizar OpenAPI e fixtures sem remover endpoints V2;
- rejeitar atribuição individual quando o tenant estiver em `CAPACITY_ONLY`;
- documentar a substituição da regra V2 que proibia driver individual.

Critérios de aceite:

- tenant existente permanece em `CAPACITY_ONLY` após migration;
- contrato não permite `tenant_id` ou `driver_id` como autorização do portal;
- Admin, Core e portal geram mocks a partir do mesmo contrato.

## DEL-FLEET-BE-002 — Persistir perfil de motoboy com proteção de CPF

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: DEL-FLEET-BE-001

Implementação:

- criar migration/entidade `delivery_driver_profiles` e índices tenant-scoped;
- criar perfil operacional independente (sem exigir e-mail/usuário de login),
  mantendo `created_by`/`updated_by` para auditoria administrativa;
- implementar CPF normalizado, validação dos dígitos, cifragem, HMAC e últimos
  quatro dígitos;
- normalizar placa antiga/Mercosul e validar formato de sete caracteres;
- suportar ativo/inativo, disponibilidade e limite por motoboy;
- criar exclusão lógica e auditoria;
- garantir transação para perfil, credenciais e auditoria quando o PIN for
  criado ou alterado.

Critérios de aceite:

- CPF completo não é retornado em listagem, logs ou eventos;
- mesmo CPF pode existir em tenants distintos, mas não duas vezes no mesmo
  tenant ativo;
- CPF/placa inválidos retornam 400 com mensagem orientativa;
- inativação não altera entregas históricas.

## DEL-FLEET-BE-003 — CRUD administrativo e RBAC de frota

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: DEL-FLEET-BE-002

Implementação:

- criar listar, criar, editar, ativar e inativar motoboy;
- limitar CPF completo a `ADMIN`/`MANAGER` e retornar apenas máscara aos demais;
- permitir `DISPATCHER` consultar disponibilidade e fila, sem editar CPF;
- suportar placa, limite de fila, telefone opcional e observação interna;
- registrar ator, antes/depois e motivo de inativação;
- aplicar paginação, busca por nome/placa e filtro de status.

Critérios de aceite:

- nenhum perfil de tenant A é consultável/modificável por tenant B;
- alteração concorrente usa versão/ETag ou versão esperada;
- uma tentativa de inativar motoboy em rota exige confirmação/reassign.

## DEL-FLEET-BE-004 — Criar acesso seguro ao portal do motoboy

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: DEL-FLEET-BE-002

Implementação:

- criar `delivery_driver_sessions` com token hash, expiração, revogação e
  `access_version`;
- gerar link/QR de ativação de uso único;
- permitir definição e troca de PIN sem armazenar valor puro;
- trocar capability por cookie `HttpOnly`, `Secure`, `SameSite=Lax`;
- adicionar login fallback CPF + PIN com rate limit, bloqueio e auditoria;
- criar revogação por sessão e por motoboy;
- limitar sessão ao tenant e ao escopo `DRIVER_PORTAL`.

Critérios de aceite:

- token não aparece em URL persistente, log ou resposta posterior;
- sessão revogada perde acesso imediatamente;
- brute force é bloqueado e auditado;
- link de um tenant não abre portal de outro.

## DEL-FLEET-BE-005 — Histórico de atribuição e fila concorrente

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: DEL-FLEET-BE-001, DEL-FLEET-BE-003

Implementação:

- criar `delivery_assignments` sem remover `deliveries.assigned_driver_id`;
- atribuir, reatribuir, cancelar vínculo e ordenar fila manualmente;
- proteger operação com lock, versão esperada e `Idempotency-Key`;
- validar driver ativo, limite de fila e modalidade `OWN`;
- registrar quem atribuiu e motivo de reatribuição;
- expor projeção da fila por driver e a fila de despacho sem motorista.

Critérios de aceite:

- duas pessoas não conseguem atribuir a mesma entrega para motoboys diferentes;
- reatribuição mantém histórico imutável;
- fila não ultrapassa limite configurado;
- entrega externa nunca entra na fila própria identificada.

## DEL-FLEET-BE-006 — Ações do motoboy e conclusão por código

- Status: [x] Implementado — aguarda migration/rollout controlado
- Prioridade: P0
- Dependências: DEL-FLEET-BE-004, DEL-FLEET-BE-005

Implementação:

- expor fila e detalhe somente para o motoboy da sessão;
- reutilizar `DeliveryPinService` para retirada, saída, chegada, código e
  conclusão;
- permitir múltiplas entregas atribuídas conforme limite do perfil;
- criar ocorrência estruturada e encaminhamento ao Admin;
- manter conclusão administrativa como override auditado;
- liberar capacidade uma única vez e atualizar fulfillment/tracking.

Critérios de aceite:

- motoboy não lê nem conclui entrega de outro;
- código correto conclui; erro respeita limite, lock e expiração;
- duplo envio/retry não cria dois eventos nem libera duas vagas;
- ocorrência não vira entrega concluída.

## DEL-FLEET-BE-007 — Eventos, realtime, relatório e manutenção

- Status: Em validação — relatórios/manutenção prontos; websocket específico usa reconciliação periódica
- Prioridade: P1
- Dependências: DEL-FLEET-BE-005, DEL-FLEET-BE-006

Implementação:

- publicar eventos de perfil, atribuição, retirada, rota, ocorrência e
  conclusão pela outbox;
- criar projeções websocket tenant/driver sem PII excessiva;
- completar relatórios por motoboy, tempo de ciclo e ocorrências;
- expirar capabilities/sessões e limpar dados de sessão;
- instrumentar tentativas de login, tamanho de fila e erros de código.

Critérios de aceite:

- dashboard, KDS e portal convergem sem refresh;
- métricas não usam CPF, endereço ou código como label;
- manutenção é idempotente e possui dry-run.
