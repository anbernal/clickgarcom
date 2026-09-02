# Matriz de rastreabilidade — Delivery V2

Esta matriz separa o que pode ser validado localmente com o provider fake do que exige credencial, conta ou operação externa. Nenhum caso usa telefone/endereço real.

| Caso | Requisito | Evidência local | Gate externo |
|---|---|---|---|
| QA-DEL-001 | Tenant ativa/desativa Delivery e congela OWN/EXTERNAL | painel Admin + `GET/PUT /delivery/settings` | — |
| QA-DEL-002 | Cliente por telefone e até cinco endereços | Core WhatsApp + `delivery-manual-test-plan.md` | — |
| QA-DEL-003 | CEP encontrado, manual, confirmação e snapshot | fake CEP/geocode + checkout | disponibilidade do provider de CEP |
| QA-DEL-004 | Tarifa própria e capacidade concorrente | simulador, hold/reserva/liberação | carga com banco de teste |
| QA-DEL-005 | Quote externa antes do pagamento | fake quote + checkout key idempotente | quote real do operador |
| QA-DEL-006 | Pagamento confirmado e lote Delivery | webhook fake + reconciliação | sandbox de pagamento |
| QA-DEL-007 | Início do preparo dispara reconciliação assíncrona | `go test ./...` + cliente Node Admin | observabilidade de fila |
| QA-DEL-008 | Cinco tentativas em 15 minutos | `DELIVERY_FAKE_PROVIDER_MODE=FAIL_FIRST_N` | política real de rate limit |
| QA-DEL-009 | Tracking e código externo | outbox de notificação, sem código na API Admin | código/tracking real do operador |
| QA-DEL-010 | Fallback para OWN ou novo ciclo | board Admin + auditoria + versão otimista | decisão operacional do tenant |
| QA-DEL-011 | OWN sai sem motorista individual (por exemplo, retirada no local ou equipe própria) e só conclui com código pelo Admin ou cliente | `own/start`, `own/complete`, tracking autenticado e WhatsApp URL button | No modo de motoboys cadastrados, use **Continuar sem motoboy** na entrega pronta; a atribuição continua opcional para essa operação. |
| QA-DEL-012 | Financeiro e exportação | `/deliveries/reports/summary` e `.csv`, filtros por modalidade/operador/status | conciliação financeira real |
| QA-DEL-013 | Privacidade, RBAC, replay e idempotência | testes Core/Nest + Playwright Delivery (19/19) | scanner de segurança/infra |
| QA-DEL-014 | Regressão DINE_IN/TAKEOUT | `go test ./...` + KDS UX (9/9) | validação pré-piloto |

## Execução local

1. Executar `npm run test:delivery-smoke` no Tenant Admin; são quatro casos determinísticos sem banco.
2. Executar `npm run test:delivery-contract` e `npm run test:delivery-security`.
3. Aplicar migrations e iniciar Core, Tenant Admin, RabbitMQ e PostgreSQL de teste.
4. Manter o provider fake. Para testar falhas:
   - `DELIVERY_FAKE_PROVIDER_MODE=SUCCESS`
   - `DELIVERY_FAKE_PROVIDER_MODE=FAIL`
   - `DELIVERY_FAKE_PROVIDER_MODE=TIMEOUT`
   - `DELIVERY_FAKE_PROVIDER_MODE=FAIL_FIRST_N` e `DELIVERY_FAKE_PROVIDER_FAILURES=5`
   - `DELIVERY_FAKE_PROVIDER_MODE=DELIVERED`
5. Executar `docs/delivery-manual-test-plan.md` na ordem OWN, EXTERNAL, fallback e endereços.
6. Guardar evidências anonimizadas: status, event_id, tenant fictício, tempos e contadores; nunca guardar token, telefone, endereço completo ou credencial.

## Pendências que não são bloqueio do teste local

- Adapter iFood real e homologação sandbox.
- Ativação de dashboards/alertas na infraestrutura externa.
- Teste de carga com banco/worker dedicado e decisão de rollout do tenant piloto.
