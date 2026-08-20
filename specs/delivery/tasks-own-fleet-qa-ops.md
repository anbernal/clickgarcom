# Tasks de QA, segurança e operação — Frota própria identificada

Fonte: [plano de frota própria](./own-fleet-drivers-plan.md).

## DEL-FLEET-QA-001 — Validar migration, compatibilidade e rollback

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-001 a DEL-FLEET-BE-003

Implementação:

- testar banco vazio e baseline produtivo com tenant em `CAPACITY_ONLY`;
- confirmar que perfil/índices não afetam entregas existentes;
- validar migração incremental e rollback documentado;
- verificar tenant identificado sem drivers e driver inativado em rota.

Critérios de aceite:

- nenhum tenant vira modo identificado automaticamente;
- dados históricos permanecem íntegros;
- backup e plano de reversão são reproduzíveis.

## DEL-FLEET-QA-002 — Segurança, LGPD e isolamento

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-002 a DEL-FLEET-BE-004

Implementação:

- testar CPF em API, logs, eventos, websocket, exportação e DOM;
- testar link expirado, revogado, reutilizado e de tenant errado;
- executar brute force de CPF/PIN e verificar rate limit/lock;
- validar RBAC Admin/Manager/Dispatcher/Driver;
- revisar retenção, exclusão lógica e auditoria.

Critérios de aceite:

- CPF completo só aparece na mutação autorizada;
- motorista A não enxerga entrega do motorista B;
- nenhum segredo aparece em observabilidade ou captura de erro.

## DEL-FLEET-QA-003 — Concorrência e máquina de estados

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-BE-005, DEL-FLEET-BE-006

Implementação:

- disputar atribuição e reatribuição simultâneas;
- testar limite de fila e múltiplas entregas por motoboy;
- reenviar retirada/rota/conclusão com a mesma idempotency key;
- competir conclusão do cliente, motoboy e Admin;
- testar ocorrência, retorno e liberação de capacidade.

Critérios de aceite:

- somente uma transição final vence;
- não há liberação dupla de capacidade;
- timeline e relatório explicam o vencedor e o ator.

## DEL-FLEET-QA-004 — E2E visual e canais

- Status: [ ] Pendente
- Prioridade: P0
- Dependências: DEL-FLEET-FE-004, DEL-FLEET-DRV-004, DEL-FLEET-CORE-002

Implementação:

- cadastrar dois motoboys;
- atribuir, reatribuir, retirar, iniciar rota e concluir;
- validar WhatsApp, tracking, Admin, KDS e portal ao vivo;
- testar iPhone/Android, fonte ampliada e conexão lenta;
- garantir regressão de `CAPACITY_ONLY` e `EXTERNAL`.

Critérios de aceite:

- cliente recebe mensagens na ordem correta;
- cartão some/atualiza em todas as superfícies;
- portal mantém clareza sem instalação de app.

## DEL-FLEET-QA-005 — Piloto, métricas e runbook

- Status: [ ] Pendente
- Prioridade: P1
- Dependências: DEL-FLEET-QA-001 a DEL-FLEET-QA-004

Implementação:

- piloto com um tenant e dois motoboys reais;
- definir métricas: tempo até atribuição, retirada, rota, conclusão, ocorrência
  e falha de código;
- criar dashboard e alertas sem PII;
- registrar suporte, reemissão de acesso, perda de aparelho e fallback manual;
- definir critérios de expansão/rollback.

Critérios de aceite:

- operação resolve motoboy sem acesso e entrega com exceção por runbook;
- dados do piloto podem ser auditados sem expor CPF;
- decisão de expandir possui evidência de tempo, falhas e satisfação.

